"""Unit and Integration Tests for ORCA Synthetic Demo Data Seeding Foundation.

Verifies:
- 3-tier provider schema fidelity and normalization
- Exact seed record counts across all 14 entity models
- Determinism and reproducibility
- Referential integrity (no orphaned foreign keys)
- Quality and edge case representations (missing != 0, stale != current, degraded QC, expired/distant PFZ)
- Spatial and topological validity via Shapely
- Seeder idempotency, namespace reset, and isolation
- Repository query methods
- DataService synthetic routing
- FastAPI REST /api/v1/demo/* endpoints
"""

from __future__ import annotations

import json
import pathlib
from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from shapely.geometry import shape
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.connectors.normalizers.imd import ImdHazardNormalizer, ImdWeatherNormalizer
from backend.app.connectors.normalizers.incois import IncoisOSFNormalizer, IncoisPFZNormalizer
from backend.app.connectors.normalizers.mosdac import MosdacEONormalizer
from backend.app.core.config import settings
from backend.app.db.models import (
    Base,
    DemoEOGridCell,
    DemoFisher,
    DemoGeofence,
    DemoHarbor,
    DemoHazardEvent,
    DemoMarineObservation,
    DemoNotification,
    DemoPFZCandidate,
    DemoRouteEdge,
    DemoRouteNode,
    DemoStakeholder,
    DemoTrip,
    DemoVessel,
    DemoVesselReplayPosition,
)
from backend.app.db.repositories import SyntheticDemoRepository
from backend.app.domain.synthetic.generator import (
    DATASET_VERSION,
    REFERENCE_TIME,
    SYNTHETIC_NAMESPACE,
    generate_synthetic_demo_dataset,
)
from backend.app.domain.synthetic.seeder import reset_synthetic_demo, seed_synthetic_demo
from backend.app.domain.synthetic.validator import validate_synthetic_dataset
from backend.app.main import app
from backend.app.services.data_service import DataService


# ---------------------------------------------------------------------------
# In-Memory SQLite Fixture for Isolated DB Testing
# ---------------------------------------------------------------------------
@pytest.fixture
def sqlite_session():
    """Provides a fresh SQLite in-memory database session with demo tables."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Create tables for demo models
    DemoStakeholder.__table__.create(bind=engine)
    DemoHarbor.__table__.create(bind=engine)
    DemoFisher.__table__.create(bind=engine)
    DemoVessel.__table__.create(bind=engine)
    DemoTrip.__table__.create(bind=engine)
    DemoMarineObservation.__table__.create(bind=engine)
    DemoEOGridCell.__table__.create(bind=engine)
    DemoPFZCandidate.__table__.create(bind=engine)
    DemoGeofence.__table__.create(bind=engine)
    DemoRouteNode.__table__.create(bind=engine)
    DemoRouteEdge.__table__.create(bind=engine)
    DemoHazardEvent.__table__.create(bind=engine)
    DemoNotification.__table__.create(bind=engine)
    DemoVesselReplayPosition.__table__.create(bind=engine)

    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


# ---------------------------------------------------------------------------
# 1. Dataset Generation and Count Verification Tests
# ---------------------------------------------------------------------------
def test_dataset_generation_counts():
    """Verify that generate_synthetic_demo_dataset produces exact target record counts."""
    dataset = generate_synthetic_demo_dataset()

    expected_counts = {
        "stakeholders": 5,
        "harbors": 5,
        "fishers": 8,
        "vessels": 14,
        "trips": 18,
        "marine_observations": 194,
        "eo_grid_cells": 350,
        "pfz_candidates": 12,
        "geofences": 5,
        "route_nodes": 24,
        "route_edges": 32,
        "hazards": 10,
        "notifications": 20,
        "replay_positions": 420,
        "sectors": 5,
    }

    assert len(dataset) == len(expected_counts)
    for key, expected_count in expected_counts.items():
        assert len(dataset[key]) == expected_count, (
            f"Mismatch for '{key}': expected {expected_count}, got {len(dataset[key])}"
        )

    total_records = sum(len(v) for v in dataset.values())
    assert total_records == 1122


def test_dataset_determinism():
    """Verify that two independent generation runs produce identical outputs."""
    run1 = generate_synthetic_demo_dataset()
    run2 = generate_synthetic_demo_dataset()

    assert json.dumps(run1, default=str) == json.dumps(run2, default=str)


# ---------------------------------------------------------------------------
# 2. Source Adapter / Normalizer Unit Tests
# ---------------------------------------------------------------------------
def test_incois_osf_normalizer():
    """Verify INCOIS OSF normalization logic and -999.0 missing value handling."""
    raw_osf = {
        "harbor": "Ratnagiri",
        "swh": 1.8,
        "swell_height": 1.1,
        "swell_period": 7.2,
        "current_speed": 1.1,
        "sst": -999.0,  # Missing sensor
        "observed_at": "2026-09-12T06:00:00Z",
        "valid_to": "2026-09-13T06:00:00Z",
        "qc_flag": 0,
    }
    payload = IncoisOSFNormalizer.normalize(raw_osf)

    assert payload.harbor == "Ratnagiri"
    assert payload.significant_wave_height_m == 1.8
    assert payload.swell_height_m == 1.1
    assert payload.swell_period_sec == 7.2
    assert payload.surface_current_knots == 1.1
    # Missing SST (-999.0) must be normalized to None
    assert payload.sea_surface_temp_c is None
    assert "INCOIS Ocean State Forecast (SYNTHETIC)" in payload.source_name


def test_incois_pfz_normalizer():
    """Verify INCOIS PFZ advisory normalization logic."""
    raw_pfz = {
        "features": [
            {
                "id": "PFZ-INCOIS-01",
                "lat": 16.85,
                "lon": 73.10,
                "sst_grad": 0.35,
                "chlorophyll": 1.85,
                "confidence": "HIGH",
                "depth_m": 45.0,
                "bearing_deg": 260.0,
                "distance_km": 16.5,
                "qc_status": "VALID",
            }
        ],
        "bulletin_date": "2026-09-12T00:00:00Z",
        "valid_to": "2026-09-13T23:59:59Z",
    }
    payload = IncoisPFZNormalizer.normalize(raw_pfz)

    assert len(payload.features) == 1
    assert payload.features[0]["id"] == "PFZ-INCOIS-01"
    assert payload.features[0]["lat"] == 16.85
    assert payload.features[0]["confidence"] == "HIGH"
    assert "INCOIS PFZ Mission (SYNTHETIC)" in payload.source_name


def test_imd_weather_and_hazard_normalizers():
    """Verify IMD weather and marine hazard normalizers."""
    raw_weather = {
        "harbor": "Ratnagiri",
        "wind_speed_knots": 15.0,
        "gust_speed_knots": -999.0,  # Missing sensor
        "wind_direction_deg": 230.0,
        "visibility_km": 10.0,
        "observed_at": "2026-09-12T06:00:00Z",
        "valid_to": "2026-09-12T18:00:00Z",
    }
    payload_w = ImdWeatherNormalizer.normalize(raw_weather)
    assert payload_w.harbor == "Ratnagiri"
    assert payload_w.wind_speed_knots == 15.0
    assert payload_w.wind_gust_knots is None
    assert payload_w.wind_direction_deg == 230.0
    assert "IMD Coastal Weather Bulletin (SYNTHETIC)" in payload_w.source_name

    raw_hazard = {
        "bulletin_id": "IMD-CWB-2026-09-12-01",
        "severity": "WARNING",
        "event_type": "SQUALLY_WEATHER",
        "headline": "Squally weather with wind speed 45-55 kmph",
        "valid_from": "2026-09-12T04:00:00Z",
        "valid_to": "2026-09-12T16:00:00Z",
        "status": "ACTIVE",
    }
    payload_h = ImdHazardNormalizer.normalize(raw_hazard)
    assert payload_h.severity == "WARNING"
    assert payload_h.squall_alert is True
    assert payload_h.bulletin_id == "IMD-CWB-2026-09-12-01"
    assert "IMD Cyclone Warning Division (SYNTHETIC)" in payload_h.source_name


def test_mosdac_eo_normalizer():
    """Verify MOSDAC Earth Observation normalizer with QA_FLAGS and missing handling."""
    raw_eo = {
        "cell_id": "CELL-02-02",
        "latitude": 16.5,
        "longitude": 73.0,
        "observation_time": "2026-09-12T06:00:00Z",
        "sst_c": 28.5,
        "chlorophyll_mg_m3": 1.45,
        "uncertainty": 0.12,
        "QA_FLAGS": 0,
        "qc_status": "VALID",
    }
    norm_eo = MosdacEONormalizer.normalize(raw_eo)
    assert norm_eo["cell_id"] == "CELL-02-02"
    assert norm_eo["sst_c"] == 28.5
    assert norm_eo["chlorophyll_mg_m3"] == 1.45
    assert "MOSDAC / ISRO" in norm_eo["source_name"]


# ---------------------------------------------------------------------------
# 3. Referential Integrity & No Orphans Test
# ---------------------------------------------------------------------------
def test_referential_integrity():
    """Verify that all foreign key references in synthetic dataset resolve to valid parents."""
    dataset = generate_synthetic_demo_dataset()

    harbor_ids = {h["public_id"] for h in dataset["harbors"]}
    fisher_ids = {f["public_id"] for f in dataset["fishers"]}
    vessel_ids = {v["public_id"] for v in dataset["vessels"]}
    node_ids = {n["public_id"] for n in dataset["route_nodes"]}
    hazard_ids = {h["public_id"] for h in dataset["hazards"]}
    geofence_ids = {g["public_id"] for g in dataset["geofences"]}
    trip_ids = {t["public_id"] for t in dataset["trips"]}

    # Fishers -> Harbors
    for f in dataset["fishers"]:
        assert f["home_harbor_id"] in harbor_ids

    # Vessels -> Fishers & Harbors
    for v in dataset["vessels"]:
        assert v["owner_fisher_id"] in fisher_ids
        assert v["home_harbor_id"] in harbor_ids

    # Trips -> Fishers, Vessels, Harbors
    for t in dataset["trips"]:
        assert t["fisher_id"] in fisher_ids
        assert t["vessel_id"] in vessel_ids
        assert t["origin_harbor_id"] in harbor_ids

    # Marine Observations -> Harbors
    for obs in dataset["marine_observations"]:
        assert obs["harbor_id"] in harbor_ids

    # Route Edges -> Route Nodes
    for e in dataset["route_edges"]:
        assert e["from_node_id"] in node_ids
        assert e["to_node_id"] in node_ids

    # Notifications -> Fishers, Vessels, Trips, Hazards, Geofences
    for n in dataset["notifications"]:
        if n["fisher_id"]:
            assert n["fisher_id"] in fisher_ids
        if n["vessel_id"]:
            assert n["vessel_id"] in vessel_ids
        if n["trip_id"]:
            assert n["trip_id"] in trip_ids
        if n["hazard_id"]:
            assert n["hazard_id"] in hazard_ids
        if n["geofence_id"]:
            assert n["geofence_id"] in geofence_ids

    # Replay Positions -> Vessels & Trips
    for rp in dataset["replay_positions"]:
        assert rp["vessel_id"] in vessel_ids
        if rp["trip_id"]:
            assert rp["trip_id"] in trip_ids


# ---------------------------------------------------------------------------
# 4. Quality and Edge Cases Tests
# ---------------------------------------------------------------------------
def test_quality_and_edge_cases():
    """Verify presence of missing!=0, stale!=current, degraded QC, and expired/distant PFZs."""
    dataset = generate_synthetic_demo_dataset()

    # 1. Missing Data != 0
    missing_gust_count = sum(1 for o in dataset["marine_observations"] if o["wind_gust_knots"] is None)
    assert missing_gust_count > 0, "Expected some marine observations to have missing gust readings (None, not 0)"

    # 2. Stale Data != Current
    stale_count = sum(1 for o in dataset["marine_observations"] if o["is_stale"] is True)
    assert stale_count > 0, "Expected some marine observations to be flagged as is_stale=True"

    # 3. Degraded Quality Observations
    degraded_obs = [o for o in dataset["marine_observations"] if "DEGRADED" in o["qc_status"]]
    assert len(degraded_obs) > 0, "Expected degraded QC status marine observations"

    # 4. Cloud Obscured Satellite Cells
    obscured_cells = [c for c in dataset["eo_grid_cells"] if c["qc_status"] == "CLOUD_OBSCURED"]
    assert len(obscured_cells) > 0, "Expected cloud-obscured EO grid cells"
    for c in obscured_cells:
        assert c["cloud_fraction"] > 0.5
        assert c["sst_c"] is None

    # 5. Expired PFZ Candidates
    expired_pfz = [p for p in dataset["pfz_candidates"] if p["qc_status"] == "EXPIRED"]
    assert len(expired_pfz) > 0, "Expected expired PFZ candidates"
    for p in expired_pfz:
        assert p["valid_to"] < REFERENCE_TIME

    # 6. Out-of-radius PFZ Candidates
    distant_pfz = [p for p in dataset["pfz_candidates"] if p["distance_km"] > 30.0]
    assert len(distant_pfz) > 0, "Expected out-of-radius PFZ candidates (> 30 km)"

    # 7. Active Hazard Events
    active_hazards = [h for h in dataset["hazards"] if h["status"] == "ACTIVE"]
    assert len(active_hazards) > 0, "Expected active marine hazard events"


# ---------------------------------------------------------------------------
# 5. Spatial & Topological Validity Tests (Shapely)
# ---------------------------------------------------------------------------
def test_spatial_validity():
    """Verify all geometries and coordinate boundaries using Shapely."""
    dataset = generate_synthetic_demo_dataset()
    val_report = validate_synthetic_dataset(dataset)

    assert val_report["status"] == "VALID"
    assert val_report["geometries_validated"] == 15  # 5 geofences + 10 hazards
    assert val_report["coordinates_validated"] > 400

    # Geofences geometry check
    for gf in dataset["geofences"]:
        geom = shape(gf["geometry_geojson"])
        assert geom.is_valid
        assert not geom.is_empty
        assert geom.geom_type in ("Polygon", "MultiPolygon")

    # Hazard events geometry check
    for hz in dataset["hazards"]:
        geom = shape(hz["geometry_geojson"])
        assert geom.is_valid
        assert not geom.is_empty


# ---------------------------------------------------------------------------
# 6. Seeder Database Upsert, Reset, and Idempotency Tests
# ---------------------------------------------------------------------------
def test_seeder_db_lifecycle(sqlite_session):
    """Test full database lifecycle: initial seed, idempotency, and isolated reset."""
    repo = SyntheticDemoRepository(sqlite_session)

    # 1. Initial Seed
    res1 = seed_synthetic_demo(session=sqlite_session, reset_first=False, dry_run=False)
    assert res1["status"] == "SUCCESS"
    assert res1["seeded_counts"]["stakeholders"] == 5
    assert res1["seeded_counts"]["marine_observations"] == 194

    counts1 = repo.get_counts_by_namespace(SYNTHETIC_NAMESPACE)
    assert counts1["stakeholders"] == 5
    assert counts1["vessels"] == 14
    assert counts1["eo_grid_cells"] == 350

    # 2. Idempotent Second Seed (no duplicates)
    res2 = seed_synthetic_demo(session=sqlite_session, reset_first=False, dry_run=False)
    assert res2["status"] == "SUCCESS"
    counts2 = repo.get_counts_by_namespace(SYNTHETIC_NAMESPACE)
    assert counts2 == counts1, "Repeated seeding must not duplicate records"

    # 3. Seed into a separate namespace
    custom_ns = "CUSTOM_TEST_NS"
    seed_synthetic_demo(session=sqlite_session, namespace=custom_ns)
    custom_counts = repo.get_counts_by_namespace(custom_ns)
    assert custom_counts["stakeholders"] == 5

    # 4. Reset only the default namespace
    reset_res = reset_synthetic_demo(session=sqlite_session, namespace=SYNTHETIC_NAMESPACE)
    assert reset_res["stakeholders"] == 5
    after_reset_counts = repo.get_counts_by_namespace(SYNTHETIC_NAMESPACE)
    assert sum(after_reset_counts.values()) == 0

    # Verify custom namespace is preserved
    preserved_counts = repo.get_counts_by_namespace(custom_ns)
    assert preserved_counts["stakeholders"] == 5


# ---------------------------------------------------------------------------
# 7. Repository Query Method Tests
# ---------------------------------------------------------------------------
def test_repository_query_helpers(sqlite_session):
    """Test specialized query helper methods on SyntheticDemoRepository."""
    seed_synthetic_demo(session=sqlite_session)
    repo = SyntheticDemoRepository(sqlite_session)

    # Marine observations by harbor
    ratnagiri_obs = repo.get_marine_observations(harbor_id="harbor-ratnagiri")
    assert len(ratnagiri_obs) == 97
    assert all(o.harbor_id == "harbor-ratnagiri" for o in ratnagiri_obs)

    # PFZ candidates valid filter
    valid_pfz = repo.get_pfz_candidates(valid_only=True, as_of=REFERENCE_TIME)
    assert len(valid_pfz) < 12  # Filters out expired ones
    assert all(p.qc_status == "VALID" for p in valid_pfz)

    # Hazards by status
    active_hz = repo.get_hazards(status="ACTIVE")
    assert len(active_hz) > 0
    assert all(h.status == "ACTIVE" for h in active_hz)

    # Vessel replay
    track = repo.get_vessel_replay(vessel_id="vessel-01")
    assert len(track) == 30
    assert all(p.vessel_id == "vessel-01" for p in track)


# ---------------------------------------------------------------------------
# 8. DataService Synthetic Handler Tests
# ---------------------------------------------------------------------------
def test_data_service_synthetic_routing():
    """Verify that DataService returns synthetic demo records when mode is SYNTHETIC."""
    service = DataService(data_mode="SYNTHETIC")

    marine_data = service._get_synthetic_marine(lat=16.99, lon=73.28)
    assert marine_data["mode"] == "SYNTHETIC"
    assert marine_data["data_source"] == "INCOIS-OSF"
    assert "hourly_forecast" in marine_data
    assert len(marine_data["hourly_forecast"]) == 97

    weather_data = service._get_synthetic_weather(lat=16.99, lon=73.28)
    assert weather_data["mode"] == "SYNTHETIC"
    assert weather_data["data_source"] == "IMD"
    assert "current" in weather_data

    hazard_data = service._get_synthetic_hazard(lat=16.99, lon=73.28)
    assert hazard_data["mode"] == "SYNTHETIC"
    assert hazard_data["data_source"] == "IMD-Hazard-Bulletin"
    assert "advisories" in hazard_data

    pfz_data = service._get_synthetic_pfz(lat=16.99, lon=73.28)
    assert pfz_data["mode"] == "SYNTHETIC"
    assert pfz_data["data_source"] == "INCOIS-PFZ"
    assert "candidates" in pfz_data


# ---------------------------------------------------------------------------
# 9. FastAPI REST Demo Endpoints Tests
# ---------------------------------------------------------------------------
def test_demo_api_endpoints(sqlite_session):
    """Verify REST endpoints under /api/v1/demo/* using FastAPI TestClient."""
    # Seed the session
    seed_synthetic_demo(session=sqlite_session)

    # Context manager factory returning sqlite_session
    class SessionContext:
        def __enter__(self):
            return sqlite_session

        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("backend.app.api.v1.routes.SessionLocal", side_effect=SessionContext):
        with TestClient(app) as test_client:
            # 1. Manifest
            res = test_client.get("/api/v1/demo/manifest")
            assert res.status_code == 200
            data = res.json()
            assert data["dataset_name"] == "ORCA_DEMO_V1"

            # 2. Stakeholders
            res = test_client.get("/api/v1/demo/stakeholders")
            assert res.status_code == 200
            assert len(res.json()) == 5

            # 3. Harbors
            res = test_client.get("/api/v1/demo/harbors")
            assert res.status_code == 200
            assert len(res.json()) == 5

            # 4. Fishers
            res = test_client.get("/api/v1/demo/fishers")
            assert res.status_code == 200
            assert len(res.json()) == 8

            # 5. Vessels
            res = test_client.get("/api/v1/demo/vessels")
            assert res.status_code == 200
            assert len(res.json()) == 14

            # 6. Trips
            res = test_client.get("/api/v1/demo/trips")
            assert res.status_code == 200
            assert len(res.json()) == 18

            # 7. Marine observations
            res = test_client.get("/api/v1/demo/marine-observations?harbor_id=harbor-ratnagiri")
            assert res.status_code == 200
            assert len(res.json()) == 97

            # 8. EO grid cells
            res = test_client.get("/api/v1/demo/eo-grid-cells?cell_id=CELL-00-00")
            assert res.status_code == 200
            assert len(res.json()) == 14

            # 9. PFZ candidates
            res = test_client.get("/api/v1/demo/pfz-candidates")
            assert res.status_code == 200
            assert len(res.json()) == 12

            # 10. Geofences
            res = test_client.get("/api/v1/demo/geofences")
            assert res.status_code == 200
            assert len(res.json()) == 5

            # 11. Routes
            res = test_client.get("/api/v1/demo/routes")
            assert res.status_code == 200
            routes_data = res.json()
            assert len(routes_data["nodes"]) == 24
            assert len(routes_data["edges"]) == 32

            # 12. Hazards
            res = test_client.get("/api/v1/demo/hazards")
            assert res.status_code == 200
            assert len(res.json()) == 10

            # 13. Notifications
            res = test_client.get("/api/v1/demo/notifications")
            assert res.status_code == 200
            assert len(res.json()) == 20

            # 14. Vessel replay
            res = test_client.get("/api/v1/demo/vessels/vessel-01/replay")
            assert res.status_code == 200
            assert len(res.json()) == 30


# ---------------------------------------------------------------------------
# 10. Authority Fleet Surveillance Synthetic Sector Expansion Tests
# ---------------------------------------------------------------------------
def test_authority_fleet_surveillance_sectors(sqlite_session):
    """Exhaustively verify all 20+ acceptance criteria for the Authority fleet surveillance expansion.

    Validates:
    1. Exactly 14 monitored vessels exist.
    2. Exactly 2 vessels belong to Goa (vessel-09, vessel-10).
    3. Exactly 2 vessels belong to Mumbai (vessel-11, vessel-12).
    4. Exactly 2 vessels belong to Veraval (vessel-13, vessel-14).
    5. Existing Ratnagiri vessels (vessel-01 to vessel-04) remain intact & structurally identical.
    6. Existing Malvan vessels (vessel-05 to vessel-08) remain intact & structurally identical.
    7. Exactly 420 replay positions exist after generation.
    8. Every vessel has exactly 30 replay positions.
    9. vessel-09 and vessel-10 coordinates are geographically strictly inside Goa sector polygon.
    10. vessel-11 and vessel-12 coordinates are geographically strictly inside Mumbai sector polygon.
    11. vessel-13 and vessel-14 coordinates are geographically strictly inside Veraval sector polygon.
    12. No new vessel accidentally uses a Ratnagiri/Malvan harbor ID (uses harbor-panaji, harbor-mumbai, harbor-veraval).
    13. All coordinates use valid EPSG:4326 [lon, lat] GeoJSON ordering.
    14. Replay timestamps are chronologically strictly ordered.
    15. Speed values are positive synthetic telemetry.
    16. Heading values are within 0–360 degrees.
    17. No replay track contains an implausible geographic jump (< 0.1 deg between successive points).
    18. All replay records reference valid vessel IDs.
    19. All replay records reference valid trip IDs.
    20. Existing 240 replay records are unchanged and structurally identical to baseline.
    21. Harbors derived programmatically: harbor-panaji, harbor-mumbai, harbor-veraval exist exactly once,
        and pre-existing harbors are preserved.
    22. Sector-to-harbor mapping: sector-goa->harbor-panaji, sector-mumbai->harbor-mumbai, sector-veraval->harbor-veraval.
    23. REST API verification:
        GET /api/v1/demo/vessels?sector=Goa -> 2 vessels
        GET /api/v1/demo/vessels?sector=Mumbai -> 2 vessels
        GET /api/v1/demo/vessels?sector=Veraval -> 2 vessels
        GET /api/v1/demo/vessels?sector=Ratnagiri -> 4 vessels
        GET /api/v1/demo/vessels?sector=Malvan -> 4 vessels
        GET /api/v1/demo/vessels/{vessel_id}/replay -> 30 replay points for all 14 vessels.
    """
    from shapely.geometry import Point, Polygon

    dataset = generate_synthetic_demo_dataset()
    val_report = validate_synthetic_dataset(dataset)
    assert val_report["status"] == "VALID"

    # 1. Total vessels == 14
    vessels = dataset["vessels"]
    assert len(vessels) == 14
    vessel_map = {v["public_id"]: v for v in vessels}

    # 2, 3, 4. Sector breakdown
    goa_vessels = [v for v in vessels if v["home_harbor_id"] == "harbor-panaji"]
    mumbai_vessels = [v for v in vessels if v["home_harbor_id"] == "harbor-mumbai"]
    veraval_vessels = [v for v in vessels if v["home_harbor_id"] == "harbor-veraval"]
    ratnagiri_vessels = [v for v in vessels if v["home_harbor_id"] == "harbor-ratnagiri"]
    malvan_vessels = [v for v in vessels if v["home_harbor_id"] == "harbor-malvan"]

    assert len(goa_vessels) == 2
    assert {v["public_id"] for v in goa_vessels} == {"vessel-09", "vessel-10"}
    assert len(mumbai_vessels) == 2
    assert {v["public_id"] for v in mumbai_vessels} == {"vessel-11", "vessel-12"}
    assert len(veraval_vessels) == 2
    assert {v["public_id"] for v in veraval_vessels} == {"vessel-13", "vessel-14"}
    assert len(ratnagiri_vessels) == 4
    assert {v["public_id"] for v in ratnagiri_vessels} == {"vessel-01", "vessel-02", "vessel-03", "vessel-04"}
    assert len(malvan_vessels) == 4
    assert {v["public_id"] for v in malvan_vessels} == {"vessel-05", "vessel-06", "vessel-07", "vessel-08"}

    # 5, 6, 20. Immutability check against existing fixture baseline
    fixture_path = pathlib.Path(__file__).resolve().parent.parent / "data" / "fixtures" / "synthetic" / "orca"
    with open(fixture_path / "vessels.json", "r", encoding="utf-8") as f:
        fixture_vessels = json.load(f)
    for i in range(8):
        # Assert first 8 vessels match fixture exactly
        for k in ("public_id", "name", "owner_fisher_id", "vessel_type", "length_m", "capacity_tons", "home_harbor_id", "status", "metadata_json"):
            assert vessels[i][k] == fixture_vessels[i][k]

    # 7, 8. Total replay positions == 420, 30 per vessel
    replays = dataset["replay_positions"]
    assert len(replays) == 420
    replays_by_vessel = {}
    for r in replays:
        replays_by_vessel.setdefault(r["vessel_id"], []).append(r)

    assert len(replays_by_vessel) == 14
    for vid, pts in replays_by_vessel.items():
        assert len(pts) == 30, f"Vessel {vid} has {len(pts)} replay positions, expected 30"

    # 20. Immutability of first 240 replay positions
    with open(fixture_path / "replay_positions.json", "r", encoding="utf-8") as f:
        fixture_replays = json.load(f)
    for i in range(240):
        for k in ("public_id", "vessel_id", "trip_id", "latitude", "longitude", "speed_knots", "heading_deg"):
            assert replays[i][k] == fixture_replays[i][k], f"Replay pos {i} mismatch on {k}"

    # 9, 10, 11. Geographic validation against sector polygons via Shapely
    sectors = {s["public_id"]: s for s in dataset["sectors"]}
    poly_ratnagiri = Polygon(sectors["sector-ratnagiri"]["polygon"])
    poly_malvan = Polygon(sectors["sector-malvan"]["polygon"])
    poly_goa = Polygon(sectors["sector-goa"]["polygon"])
    poly_mumbai = Polygon(sectors["sector-mumbai"]["polygon"])
    poly_veraval = Polygon(sectors["sector-veraval"]["polygon"])

    for vid in ("vessel-01", "vessel-02", "vessel-03", "vessel-04"):
        for p in replays_by_vessel[vid]:
            pt = Point(p["longitude"], p["latitude"])
            assert poly_ratnagiri.contains(pt), f"Ratnagiri vessel {vid} point ({p['longitude']}, {p['latitude']}) outside Ratnagiri sector polygon"

    for vid in ("vessel-05", "vessel-06", "vessel-07", "vessel-08"):
        for p in replays_by_vessel[vid]:
            pt = Point(p["longitude"], p["latitude"])
            assert poly_malvan.contains(pt), f"Malvan vessel {vid} point ({p['longitude']}, {p['latitude']}) outside Malvan sector polygon"

    for vid in ("vessel-09", "vessel-10"):
        for p in replays_by_vessel[vid]:
            pt = Point(p["longitude"], p["latitude"])
            assert poly_goa.contains(pt), f"Goa vessel {vid} point ({p['longitude']}, {p['latitude']}) outside Goa sector polygon"

    for vid in ("vessel-11", "vessel-12"):
        for p in replays_by_vessel[vid]:
            pt = Point(p["longitude"], p["latitude"])
            assert poly_mumbai.contains(pt), f"Mumbai vessel {vid} point ({p['longitude']}, {p['latitude']}) outside Mumbai sector polygon"

    for vid in ("vessel-13", "vessel-14"):
        for p in replays_by_vessel[vid]:
            pt = Point(p["longitude"], p["latitude"])
            assert poly_veraval.contains(pt), f"Veraval vessel {vid} point ({p['longitude']}, {p['latitude']}) outside Veraval sector polygon"

    # 12. No new vessel uses Ratnagiri/Malvan harbors
    for v in (vessel_map["vessel-09"], vessel_map["vessel-10"]):
        assert v["home_harbor_id"] == "harbor-panaji"
    for v in (vessel_map["vessel-11"], vessel_map["vessel-12"]):
        assert v["home_harbor_id"] == "harbor-mumbai"
    for v in (vessel_map["vessel-13"], vessel_map["vessel-14"]):
        assert v["home_harbor_id"] == "harbor-veraval"

    # 13, 14, 15, 16, 17, 18, 19. Telemetry integrity
    vessel_ids = {v["public_id"] for v in vessels}
    trip_ids = {t["public_id"] for t in dataset["trips"]}

    for vid, pts in replays_by_vessel.items():
        prev_time = None
        prev_lat, prev_lon = None, None
        for p in pts:
            # 13. [lon, lat] bounds
            assert -180.0 <= p["longitude"] <= 180.0
            assert -90.0 <= p["latitude"] <= 90.0
            # 14. Timestamps ordered
            t = p["timestamp"]
            if prev_time is not None:
                assert t > prev_time
            prev_time = t
            # 15. Speed positive
            assert p["speed_knots"] > 0.0
            # 16. Heading 0-360
            assert 0.0 <= p["heading_deg"] <= 360.0
            # 17. No jump (< 0.1 degree ~ 11 km in 12 min step)
            if prev_lat is not None:
                step_dist = ((p["latitude"] - prev_lat) ** 2 + (p["longitude"] - prev_lon) ** 2) ** 0.5
                assert step_dist < 0.1, f"Implausible jump for {vid}: {step_dist} deg"
            prev_lat, prev_lon = p["latitude"], p["longitude"]
            # 18. References valid vessel
            assert p["vessel_id"] in vessel_ids
            # 19. References valid trip
            assert p["trip_id"] in trip_ids

    # 21. Harbors validation
    harbor_ids = [h["public_id"] for h in dataset["harbors"]]
    assert harbor_ids.count("harbor-panaji") == 1
    assert harbor_ids.count("harbor-mumbai") == 1
    assert harbor_ids.count("harbor-veraval") == 1
    assert "harbor-ratnagiri" in harbor_ids
    assert "harbor-malvan" in harbor_ids

    # 22. Sector-to-harbor mapping
    assert sectors["sector-ratnagiri"]["harbor_id"] == "harbor-ratnagiri"
    assert sectors["sector-malvan"]["harbor_id"] == "harbor-malvan"
    assert sectors["sector-goa"]["harbor_id"] == "harbor-panaji"
    assert sectors["sector-mumbai"]["harbor_id"] == "harbor-mumbai"
    assert sectors["sector-veraval"]["harbor_id"] == "harbor-veraval"

    # 23. REST API validation
    seed_synthetic_demo(session=sqlite_session)

    class SessionContext:
        def __enter__(self):
            return sqlite_session
        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("backend.app.api.v1.routes.SessionLocal", side_effect=SessionContext):
        with TestClient(app) as client:
            # Sector queries
            res_goa = client.get("/api/v1/demo/vessels?sector=Goa")
            assert res_goa.status_code == 200
            assert len(res_goa.json()) == 2
            assert {v["public_id"] for v in res_goa.json()} == {"vessel-09", "vessel-10"}

            res_mum = client.get("/api/v1/demo/vessels?sector=Mumbai")
            assert res_mum.status_code == 200
            assert len(res_mum.json()) == 2
            assert {v["public_id"] for v in res_mum.json()} == {"vessel-11", "vessel-12"}

            res_ver = client.get("/api/v1/demo/vessels?sector=Veraval")
            assert res_ver.status_code == 200
            assert len(res_ver.json()) == 2
            assert {v["public_id"] for v in res_ver.json()} == {"vessel-13", "vessel-14"}

            res_rat = client.get("/api/v1/demo/vessels?sector=Ratnagiri")
            assert res_rat.status_code == 200
            assert len(res_rat.json()) == 4
            assert {v["public_id"] for v in res_rat.json()} == {"vessel-01", "vessel-02", "vessel-03", "vessel-04"}

            res_mal = client.get("/api/v1/demo/vessels?sector=Malvan")
            assert res_mal.status_code == 200
            assert len(res_mal.json()) == 4
            assert {v["public_id"] for v in res_mal.json()} == {"vessel-05", "vessel-06", "vessel-07", "vessel-08"}

            # Replay queries for all vessels
            for vid in [f"vessel-{i:02d}" for i in range(1, 15)]:
                res_replay = client.get(f"/api/v1/demo/vessels/{vid}/replay")
                assert res_replay.status_code == 200
                pts = res_replay.json()
                assert len(pts) == 30
                assert all(p["vessel_id"] == vid for p in pts)
