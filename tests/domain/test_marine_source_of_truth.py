"""Authoritative Marine Observation Source-of-Truth Consistency Tests.

Verifies that for SNAPSHOT / SYNTHETIC modes:
1. The deterministic synthetic OSF fixture (osf_hourly_observations.json) is the single source of truth.
2. The SnapshotConnector / DataService returns the normalized observation from this fixture.
3. The resulting ObservationBundle preserves these exact normalized values.
4. The agent and domain reasoning paths (DeterministicRiskEngine, Situation assessment) evaluate the same values.
5. The static legacy marine_dataset.py values cannot silently override fixture-backed observations.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.connectors.normalizers.incois import IncoisOSFNormalizer
from backend.app.connectors.snapshot import SnapshotConnector
from backend.app.contracts.chat import RecommendationStatus
from backend.app.domain.marine_dataset import IN_MEMORY_MARINE_DATASET, get_marine_record
from backend.app.domain.risk_engine import DeterministicRiskEngine
from backend.app.domain.situation import evaluate_sector_situation
from backend.app.services.data_service import DataService
from backend.app.domain.synthetic.generator import REFERENCE_TIME


FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "data"
    / "fixtures"
    / "synthetic"
    / "incois"
    / "osf_hourly_observations.json"
)


@pytest.fixture
def osf_fixture_records() -> list[dict]:
    assert FIXTURE_PATH.exists(), f"OSF fixture missing at {FIXTURE_PATH}"
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_1_fixture_backed_marine_observation_contains_expected_values(osf_fixture_records):
    """Assertion 1: The fixture contains deterministic values for Ratnagiri & Malvan at reference time."""
    ratnagiri_ref = next(
        r for r in osf_fixture_records
        if r.get("harbor_id") == "harbor-ratnagiri" and r.get("provenance_json", {}).get("hour_offset") == 0
    )
    assert ratnagiri_ref["swh"] == 1.2
    assert ratnagiri_ref["swell_height"] == 0.78
    assert ratnagiri_ref["swell_period"] == 8.0
    assert ratnagiri_ref["current_speed"] == 1.0
    assert ratnagiri_ref["sst"] == 28.2
    assert ratnagiri_ref["observation_time"] == REFERENCE_TIME.isoformat()
    assert ratnagiri_ref["qc_status"] == "VALID"

    malvan_ref = next(
        r for r in osf_fixture_records
        if r.get("harbor_id") == "harbor-malvan" and r.get("provenance_json", {}).get("hour_offset") == 0
    )
    assert malvan_ref["swh"] == 1.1
    assert malvan_ref["swell_height"] == 0.72
    assert malvan_ref["sst"] == 28.2


def test_2_snapshot_dataservice_and_connector_return_fixture_observation():
    """Assertion 2: SNAPSHOT DataService and SnapshotConnector return normalized fixture observations."""
    connector = SnapshotConnector()
    ds = DataService(data_mode="SNAPSHOT")

    ctx_ratnagiri = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    conn_payload = connector.get_marine_conditions(ctx_ratnagiri)
    ds_payload = ds.get_marine_conditions(ctx_ratnagiri)

    assert conn_payload.harbor == "Ratnagiri"
    assert conn_payload.significant_wave_height_m == 1.2
    assert conn_payload.swell_height_m == 0.78
    assert conn_payload.swell_period_sec == 8.0
    assert conn_payload.sea_surface_temp_c == 28.2
    assert conn_payload.surface_current_knots == 1.0
    assert "INCOIS Ocean State Forecast" in conn_payload.source_name

    # DataService must return the exact same normalized values as SnapshotConnector
    assert ds_payload.significant_wave_height_m == conn_payload.significant_wave_height_m
    assert ds_payload.swell_height_m == conn_payload.swell_height_m
    assert ds_payload.sea_surface_temp_c == conn_payload.sea_surface_temp_c


def test_3_observation_bundle_uses_fixture_values():
    """Assertion 3: ObservationBundle constructed in SNAPSHOT/SYNTHETIC mode preserves fixture values."""
    for mode in ("SNAPSHOT", "SYNTHETIC"):
        ds = DataService(data_mode=mode)
        ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
        bundle = ds.get_observation_bundle(ctx)

        assert bundle.marine is not None
        assert bundle.marine.harbor == "Ratnagiri"
        assert bundle.marine.significant_wave_height_m == 1.2
        assert bundle.marine.swell_height_m == 0.78
        assert bundle.marine.swell_period_sec == 8.0
        assert bundle.marine.sea_surface_temp_c == 28.2


def test_4_domain_reasoning_and_risk_evaluation_see_fixture_values():
    """Assertion 4: DeterministicRiskEngine and Situation assessment evaluate against fixture values."""
    ds = DataService(data_mode="SNAPSHOT")
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    bundle = ds.get_observation_bundle(ctx)

    reference_time = REFERENCE_TIME.isoformat()
    risk = DeterministicRiskEngine.evaluate(ctx, bundle=bundle, reference_time=reference_time)

    assert risk.status == RecommendationStatus.GO
    # Verify wave evaluation factor reflects the fixture's 1.2m significant wave height
    all_factors = risk.decisive_factors + risk.non_decisive_factors
    assert any("1.2m" in f for f in all_factors)
    demo_provenance = [p for p in risk.provenance if "ORCA deterministic demo" in p.source_name]
    assert len(demo_provenance) == 3
    assert all("deterministic_demo" in p.quality_flags for p in demo_provenance)
    assert all("official_source" not in p.quality_flags for p in demo_provenance)

    # Test Situation Assessment sector evaluation
    assessment = evaluate_sector_situation(
        sector_id="sector-ratnagiri",
        craft_profile="motorized_boat",
        data_service=ds,
        reference_time=reference_time,
    )
    assert assessment is not None
    assert assessment.situation_status == RecommendationStatus.GO
    # Evidence item must link to the fixture wave observation
    marine_evidence = next((e for e in assessment.evidence if "significant_wave_height_m" in e.metric_name), None)
    assert marine_evidence is not None
    assert marine_evidence.metric_value == 1.2


def test_5_static_dataset_cannot_silently_override_fixture():
    """Assertion 5: Legacy marine_dataset.py values (e.g. Malvan swh=1.3m, SST=28.0C) cannot override fixture.

    Proves divergence:
    - marine_dataset.py has Malvan wave=1.3m, Ratnagiri SST=28.0C, swell=0.8m.
    - OSF fixture has Malvan wave=1.1m, Ratnagiri SST=28.2C, swell=0.78m.
    - DataService / SnapshotConnector must yield the OSF fixture values, not marine_dataset.py values.
    """
    ds = DataService(data_mode="SNAPSHOT")
    ctx_malvan = ToolInvocationContext(origin_harbor="Malvan", craft_profile="motorized_boat")
    malvan_payload = ds.get_marine_conditions(ctx_malvan)

    # Fixture value is 1.1m; static dataset value is 1.3m
    static_malvan = get_marine_record("Malvan")
    assert static_malvan["significant_wave_height_m"] == 1.3
    assert malvan_payload.significant_wave_height_m == 1.1
    assert malvan_payload.swell_height_m == 0.72

    # Ratnagiri SST: fixture is 28.2C; static dataset is 28.0C
    ctx_ratnagiri = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    ratnagiri_payload = ds.get_marine_conditions(ctx_ratnagiri)
    static_ratnagiri = get_marine_record("Ratnagiri")
    assert static_ratnagiri["sea_surface_temp_c"] == 28.0
    assert ratnagiri_payload.sea_surface_temp_c == 28.2
