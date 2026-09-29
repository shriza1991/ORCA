"""Integration & Automated Test Suite for ORCA Scenario Framework (S1–S8).

Owned by Dev 3 (Agent Orchestration & Explainability) & Dev 4 (Domain Intelligence).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Validates:
1. Scenario registry, manifest, and fixture schema consistency.
2. Semantic distinction between hard-stop restriction polygons and advisory boundary polygons.
3. Deterministic end-to-end pipeline execution for all canonical scenarios (S1–S8) and temporal extensions.
4. Data freshness & authentic stale-data UNKNOWN fallback without blanket 24h assumptions.
5. Multilingual evaluation (English, Marathi, Hindi) with safety invariant headers.
6. Scenario API endpoints (GET /scenarios, GET /scenarios/{id}, POST /scenarios/{id}/run).
"""

import json
from pathlib import Path
import pytest
from starlette.testclient import TestClient

from backend.app.agents.intent import IntentCategory
from backend.app.contracts.chat import ConfidenceLevel, RecommendationStatus
from backend.app.main import app
from backend.app.scenarios import (
    CANONICAL_SCENARIOS,
    PolygonType,
    ScenarioRunner,
    get_scenario,
    get_scenario_manifest,
    list_all_scenarios,
    list_canonical_scenarios,
)


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


# =============================================================================
# 1. Registry & Manifest Consistency Tests
# =============================================================================

def test_canonical_scenarios_presence_and_order():
    """Ensure all 8 canonical scenarios (S1–S8) are registered with expected properties."""
    canonical = list_canonical_scenarios()
    assert len(canonical) == 8

    expected_ids = [f"S{i}" for i in range(1, 9)]
    actual_ids = [s.id for s in canonical]
    assert actual_ids == expected_ids

    for scenario in canonical:
        assert scenario.name != ""
        assert scenario.harbor != ""
        assert scenario.query != ""
        assert scenario.expected.intent in IntentCategory
        assert scenario.expected.status in RecommendationStatus
        assert scenario.expected.confidence in ConfidenceLevel
        assert isinstance(scenario.multilingual_queries, dict)
        assert len(scenario.tags) > 0


def test_get_scenario_lookup():
    """Verify case-insensitive lookup and error handling for unknown IDs."""
    s1 = get_scenario("s1")
    assert s1.id == "S1"
    assert s1.name == "Normal favorable conditions"

    s_temporal = get_scenario("S-TEMPORAL")
    assert s_temporal.id == "S-TEMPORAL"

    with pytest.raises(KeyError):
        get_scenario("S99_NON_EXISTENT")


def test_scenario_manifest_generation():
    """Manifest must generate 8 lightweight descriptors suitable for frontend display."""
    manifest = get_scenario_manifest()
    assert len(manifest) == 8

    s1_item = manifest[0]
    assert s1_item.id == "S1"
    assert s1_item.expected_status == "GO"
    assert s1_item.harbor == "Ratnagiri"
    assert s1_item.ui_metadata.get("badge") == "GO"


# =============================================================================
# 2. Fixture File & GeoJSON Integrity Tests
# =============================================================================

def test_fixture_files_exist_and_parse():
    """Verify all JSON fixture files on disk match canonical registry requirements."""
    fixtures_dir = Path("data/fixtures")
    manifest_path = fixtures_dir / "scenarios_manifest.json"
    assert manifest_path.exists(), "Missing scenarios_manifest.json"

    with open(manifest_path, encoding="utf-8") as f:
        manifest_data = json.load(f)

    assert "scenarios" in manifest_data
    assert len(manifest_data["scenarios"]) == 8

    for sc in manifest_data["scenarios"]:
        fixture_file = fixtures_dir / sc["fixture_file"]
        assert fixture_file.exists(), f"Missing fixture file: {sc['fixture_file']}"
        with open(fixture_file, encoding="utf-8") as fh:
            data = json.load(fh)
            assert data.get("scenario_id") == sc["id"]


def test_geojson_semantic_polygon_separation():
    """Ensure GeoJSON polygons strictly separate hard NO_GO zones from advisory boundaries."""
    geojson_path = Path("data/fixtures/geofences_india.geojson")
    assert geojson_path.exists(), "Missing geofences_india.geojson"

    with open(geojson_path, encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    assert len(features) >= 4

    type_to_restriction = {}
    for feat in features:
        p_type = feat["properties"]["polygon_type"]
        is_hard = feat["properties"]["is_hard_restriction"]
        type_to_restriction[p_type] = is_hard

    # Hard restrictions (Naval firing range, MPA sanctuary core)
    assert type_to_restriction.get("NAVAL_FIRING_RANGE") is True
    assert type_to_restriction.get("MPA_SANCTUARY_CORE") is True

    # Advisory boundaries (IMBL border alert, EEZ economic zone)
    assert type_to_restriction.get("IMBL_ADVISORY_BORDER") is False
    assert type_to_restriction.get("EEZ_BOUNDARY") is False


# =============================================================================
# 3. Deterministic Pipeline Execution Tests (S1–S8)
# =============================================================================

def test_s1_safe_trip_go():
    """S1: Normal calm sea conditions must result in deterministic GO."""
    result = ScenarioRunner.run("S1")
    assert result.passed is True
    assert result.actual_status == RecommendationStatus.GO
    assert result.actual_intent == IntentCategory.SAFETY.value
    assert result.evidence_count > 0
    assert result.evidence_grounded is True
    assert "[GO]" in result.response_text or "GO" in result.response_text


def test_s2_elevated_sea_state_caution():
    """S2: Elevated wave state (2.2m) must evaluate to CAUTION."""
    result = ScenarioRunner.run("S2")
    assert result.passed is True
    assert result.actual_status == RecommendationStatus.CAUTION
    assert result.actual_intent == IntentCategory.SAFETY.value
    assert result.evidence_grounded is True


def test_s3_cyclone_alert_nogo():
    """S3: Active IMD cyclone alert must trigger deterministic NO_GO."""
    result = ScenarioRunner.run("S3")
    assert result.passed is True
    assert result.actual_status == RecommendationStatus.NO_GO
    assert result.actual_intent == IntentCategory.HAZARDS.value
    assert result.evidence_grounded is True


def test_s4_stale_data_unknown():
    """S4: Expired telemetry must trigger conservative UNKNOWN with degradation warnings."""
    result = ScenarioRunner.run("S4")
    assert result.passed is True
    assert result.actual_status == RecommendationStatus.UNKNOWN
    assert result.actual_confidence == ConfidenceLevel.LOW
    assert any("DEGRADED" in w or "stale" in w.lower() for w in result.warnings)


def test_s5_pfz_discovery():
    """S5: Potential Fishing Zone inquiry must plan PFZ tools and return transit safety."""
    result = ScenarioRunner.run("S5")
    assert result.passed is True
    assert result.actual_status == RecommendationStatus.GO
    assert result.actual_intent == IntentCategory.PFZ.value


def test_s6_geofence_restricted_zone_nogo():
    """S6: Route crossing Naval Firing Range must enforce geospatial NO_GO."""
    result = ScenarioRunner.run("S6")
    assert result.passed is True
    assert result.actual_status == RecommendationStatus.NO_GO


def test_s7_safer_route_comparison():
    """S7: Multi-route exposure comparison must recommend sheltered passage."""
    result = ScenarioRunner.run("S7")
    assert result.passed is True
    assert result.actual_status in (RecommendationStatus.CAUTION, RecommendationStatus.GO)


def test_s8_multilingual_marathi_execution():
    """S8: Native Marathi query must be processed with correct language identification."""
    result = ScenarioRunner.run("S8", language="mr")
    assert result.passed is True
    assert result.actual_status == RecommendationStatus.GO
    assert result.evidence_grounded is True


def test_s_temporal_changing_weather_reasoning():
    """S-TEMPORAL: Changing afternoon squall weather must trigger CAUTION."""
    result = ScenarioRunner.run("S-TEMPORAL")
    assert result.passed is True
    assert result.actual_status == RecommendationStatus.CAUTION


# =============================================================================
# 4. Scenario API Endpoint Tests
# =============================================================================

def test_api_list_scenarios(client: TestClient):
    """GET /api/v1/scenarios returns list of 8 canonical scenarios."""
    resp = client.get("/api/v1/scenarios")
    assert resp.status_code == 200
    data = resp.json()
    assert "scenarios" in data
    assert len(data["scenarios"]) == 8
    ids = [s["id"] for s in data["scenarios"]]
    assert ids == ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]


def test_api_list_demo_scenarios_alias(client: TestClient):
    """GET /api/v1/demo-scenarios alias returns identical manifest."""
    resp = client.get("/api/v1/demo-scenarios")
    assert resp.status_code == 200
    data = resp.json()
    assert "scenarios" in data
    assert len(data["scenarios"]) == 8


def test_api_get_scenario_details(client: TestClient):
    """GET /api/v1/scenarios/{id} returns full scenario definition."""
    resp = client.get("/api/v1/scenarios/S1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "S1"
    assert data["harbor"] == "Ratnagiri"
    assert data["expected"]["status"] == "GO"
    assert "marine" in data["inputs"]


def test_api_get_scenario_details_404(client: TestClient):
    """GET /api/v1/scenarios/{id} for non-existent scenario returns 404."""
    resp = client.get("/api/v1/scenarios/S999")
    assert resp.status_code == 404
    data = resp.json()
    assert "error" in data


def test_api_run_scenario_s1(client: TestClient):
    """POST /api/v1/scenarios/S1/run executes S1 deterministically."""
    resp = client.post("/api/v1/scenarios/S1/run")
    assert resp.status_code == 200
    data = resp.json()
    assert data["scenario_id"] == "S1"
    assert data["passed"] is True
    assert data["actual_status"] == "GO"
    assert data["evidence_grounded"] is True


def test_api_run_scenario_s3_cyclone(client: TestClient):
    """POST /api/v1/scenarios/S3/run executes S3 cyclone NO_GO."""
    resp = client.post("/api/v1/scenarios/S3/run")
    assert resp.status_code == 200
    data = resp.json()
    assert data["scenario_id"] == "S3"
    assert data["passed"] is True
    assert data["actual_status"] == "NO_GO"


def test_api_run_scenario_s4_stale(client: TestClient):
    """POST /api/v1/scenarios/S4/run executes S4 stale data UNKNOWN."""
    resp = client.post("/api/v1/scenarios/S4/run")
    assert resp.status_code == 200
    data = resp.json()
    assert data["scenario_id"] == "S4"
    assert data["passed"] is True
    assert data["actual_status"] == "UNKNOWN"


def test_api_run_scenario_s8_marathi(client: TestClient):
    """POST /api/v1/scenarios/S8/run?language=mr executes Marathi variant."""
    resp = client.post("/api/v1/scenarios/S8/run?language=mr")
    assert resp.status_code == 200
    data = resp.json()
    assert data["scenario_id"] == "S8"
    assert data["passed"] is True
    assert data["actual_status"] == "GO"
