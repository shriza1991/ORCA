"""Regression test suite for Task 2: Hazard validity, provenance, and safety confidence.

Verifies acceptance requirements A through L:
A. Expired cached IMD bulletin retains its original validity after loading.
B. Repeated retrieval does not extend that validity.
C. Missing credentials/provider failure cannot become verified NORMAL conditions or support GO/HIGH.
D. Calm marine/weather inputs plus simulated or expired hazard evidence cannot produce a real-world GO/HIGH.
E. Valid, geographically applicable severe hazard still produces the expected restrictive decision.
F. Historical severe hazard is identified as historical, rather than treated as an active warning.
G. Assessment inside versus outside a source validity interval is evaluated correctly, including timezone offsets.
H. Geographic fallback metadata survives typed payloads and adapters and still blocks GO/HIGH with fresh inputs.
I. PFZ-only requests remain INFORMATIONAL and grant no voyage clearance.
J. Demo/simulation identity survives every layer used for the assessment.
K. Real snapshot PFZ request via /api/v1/chat returns candidate MH-PFZ-51 (~13.1 nm, ~241.3 deg) not contract mock.
L. Container-equivalent isolated filesystem layout verifies snapshot discovery without repository borrowing.
"""

from datetime import datetime, timezone, timedelta
import os
from pathlib import Path
import tempfile
import pytest
from fastapi.testclient import TestClient

from backend.app.agents.integrations.adapters import ProviderToolAdapter
from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    WeatherConditionsPayload,
)
from backend.app.connectors.errors import ConnectorAuthenticationError
from backend.app.connectors.imd_hazard import ImdHazardConnector
from backend.app.connectors.snapshot import SnapshotConnector
from backend.app.contracts.chat import ConfidenceLevel, RecommendationStatus
from backend.app.contracts.observation import ObservationBundle
from backend.app.core.config import settings
from backend.app.connectors.manager import ConnectorManager
from backend.app.agents.integrations.dev2 import PFZSourceDataPayload
from backend.app.domain.risk_engine import DeterministicRiskEngine
from backend.app.main import create_app


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


@pytest.fixture(autouse=True)
def restore_registry_and_settings(monkeypatch):
    """Ensure tool registry and settings are fully restored after each test."""
    from backend.app.agents.tools import tool_registry
    orig_registry = {k: v.model_copy(deep=True) for k, v in tool_registry._registry.items()}
    orig_handlers = dict(tool_registry._handlers)
    orig_data_mode = settings.DATA_MODE
    orig_llm_mode = settings.LLM_MODE
    orig_imd_key = settings.IMD_API_KEY
    orig_incois_key = settings.INCOIS_API_KEY
    yield
    tool_registry._registry = orig_registry
    tool_registry._handlers = orig_handlers
    settings.DATA_MODE = orig_data_mode
    settings.LLM_MODE = orig_llm_mode
    settings.IMD_API_KEY = orig_imd_key
    settings.INCOIS_API_KEY = orig_incois_key


# ---------------------------------------------------------------------------
# Test A: Expired cached IMD bulletin retains its original validity after loading
# ---------------------------------------------------------------------------

def test_a_expired_cached_imd_bulletin_retains_original_validity(monkeypatch):
    monkeypatch.setattr(settings, "DATA_MODE", "HYBRID")
    monkeypatch.setattr(settings, "IMD_API_KEY", "")

    connector = ImdHazardConnector()
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = connector.get_hazard_bulletin(ctx)

    assert payload.valid_from is not None, "valid_from must not be None for cached bulletin"
    assert payload.valid_to is not None, "valid_to must not be None for cached bulletin"

    # Must preserve authentic 2026-09-12 dates from the real snapshot file
    assert payload.valid_from.startswith("2026-09-12"), f"Expected 2026-09-12 start, got {payload.valid_from}"
    assert payload.valid_to.startswith("2026-09-13"), f"Expected 2026-09-13 expiration, got {payload.valid_to}"

    # Must NOT have been rewritten to now - 24h or now + 7d
    now_utc = datetime.now(timezone.utc)
    vt_dt = datetime.fromisoformat(payload.valid_to.replace("Z", "+00:00"))
    assert vt_dt < now_utc, "Cached bulletin from 2026-09-12 must remain historically expired"


# ---------------------------------------------------------------------------
# Test B: Repeated retrieval does not extend that validity
# ---------------------------------------------------------------------------

def test_b_repeated_retrieval_does_not_extend_validity(monkeypatch):
    monkeypatch.setattr(settings, "DATA_MODE", "HYBRID")
    monkeypatch.setattr(settings, "IMD_API_KEY", "")

    connector = ImdHazardConnector()
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")

    payload1 = connector.get_hazard_bulletin(ctx)
    payload2 = connector.get_hazard_bulletin(ctx)

    assert payload1.valid_from == payload2.valid_from, "valid_from altered on repeated retrieval"
    assert payload1.valid_to == payload2.valid_to, "valid_to altered on repeated retrieval"
    assert payload1.bulletin_id == payload2.bulletin_id, "bulletin_id altered on repeated retrieval"


# ---------------------------------------------------------------------------
# Test C: Missing credentials/provider failure cannot become verified NORMAL conditions or support GO/HIGH
# ---------------------------------------------------------------------------

def test_c_missing_credentials_fails_closed_in_live_mode(monkeypatch):
    monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
    monkeypatch.setattr(settings, "IMD_API_KEY", "")

    connector = ImdHazardConnector()
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")

    # In LIVE mode without credentials, it must fail closed, raising Authentication error
    with pytest.raises(ConnectorAuthenticationError):
        connector.get_hazard_bulletin(ctx)


def test_c_unavailable_hazard_payload_fails_closed_to_unknown_low():
    connector = ImdHazardConnector()
    payload = connector._make_unavailable_payload(
        harbor="Ratnagiri",
        reason="IMD upstream down",
    )
    assert payload.severity == "UNKNOWN"
    assert payload.valid_from is None
    assert payload.valid_to is None
    assert payload.freshness_flags.get("coverage_status") == "UNAVAILABLE"

    # Evaluated through DeterministicRiskEngine with calm weather/marine
    now_iso = datetime.now(timezone.utc).isoformat()
    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=0.8,
        observed_at=now_iso,
        valid_to=(datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(),
        source_name="INCOIS OSF Live",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=8.0,
        observed_at=now_iso,
        valid_to=(datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(),
        source_name="IMD AWS Live",
    )
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=marine,
        weather=weather,
        hazard=payload,
        data_mode="LIVE",
    )
    assert assessment.status == RecommendationStatus.UNKNOWN
    assert assessment.confidence_level == ConfidenceLevel.LOW
    assert any("telemetry" in f.lower() or "expired" in f.lower() or "missing" in f.lower() or "degraded" in f.lower() for f in assessment.decisive_factors)


# ---------------------------------------------------------------------------
# Test D: Calm marine/weather plus simulated or expired hazard cannot produce GO/HIGH
# ---------------------------------------------------------------------------

def test_d_calm_conditions_plus_expired_hazard_cannot_produce_go_high():
    now_iso = datetime.now(timezone.utc).isoformat()
    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=0.7,
        observed_at=now_iso,
        valid_to=(datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(),
        source_name="INCOIS OSF Live",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=6.0,
        observed_at=now_iso,
        valid_to=(datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(),
        source_name="IMD AWS Live",
    )
    # Expired hazard bulletin from 2026-09-12
    expired_hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        severity="NORMAL",
        valid_from="2026-09-12T06:00:00Z",
        valid_to="2026-09-13T06:00:00Z",
        source_name="IMD Cyclone Warning Division (Historical)",
    )
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=marine,
        weather=weather,
        hazard=expired_hazard,
        data_mode="LIVE",
    )
    assert assessment.status != RecommendationStatus.GO, f"Must not grant GO on expired hazard: {assessment.status}"
    assert assessment.confidence_level != ConfidenceLevel.HIGH, f"Must not grant HIGH confidence: {assessment.confidence_level}"
    assert assessment.status == RecommendationStatus.UNKNOWN
    assert assessment.confidence_level == ConfidenceLevel.LOW


def test_d_calm_conditions_plus_simulated_hazard_cannot_produce_live_go_high():
    now_iso = datetime.now(timezone.utc).isoformat()
    future_iso = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=0.7,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="INCOIS OSF Live",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=6.0,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="IMD AWS Live",
    )
    simulated_hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        severity="NORMAL",
        valid_from=now_iso,
        valid_to=future_iso,
        source_name="Synthetic Hazard Generator (SIMULATED)",
        freshness_flags={"data_mode": "MOCK", "simulated": True},
    )
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=marine,
        weather=weather,
        hazard=simulated_hazard,
        data_mode="LIVE",
    )
    assert assessment.status == RecommendationStatus.UNKNOWN
    assert assessment.confidence_level == ConfidenceLevel.LOW


# ---------------------------------------------------------------------------
# Test E: Valid, geographically applicable severe hazard produces restrictive decision
# ---------------------------------------------------------------------------

def test_e_valid_active_severe_hazard_produces_no_go():
    now_dt = datetime.now(timezone.utc)
    valid_from = (now_dt - timedelta(hours=1)).isoformat()
    valid_to = (now_dt + timedelta(hours=12)).isoformat()

    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.0,
        observed_at=now_dt.isoformat(),
        valid_to=valid_to,
        source_name="INCOIS OSF Live",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=12.0,
        observed_at=now_dt.isoformat(),
        valid_to=valid_to,
        source_name="IMD AWS Live",
    )
    severe_hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=True,
        severity="WARNING",
        headline="Cyclone Alert: Severe cyclonic storm approaching Maharashtra coast",
        valid_from=valid_from,
        valid_to=valid_to,
        source_name="IMD Cyclone Warning Division Live",
    )
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=marine,
        weather=weather,
        hazard=severe_hazard,
        data_mode="LIVE",
    )
    assert assessment.status == RecommendationStatus.NO_GO
    assert any("cyclone" in f.lower() or "warning" in f.lower() for f in assessment.decisive_factors)


# ---------------------------------------------------------------------------
# Test F: Historical severe hazard is identified as historical, not active warning
# ---------------------------------------------------------------------------

def test_f_historical_severe_hazard_not_treated_as_active_warning():
    # Historical cyclone warning from 15 days ago
    hist_start = "2026-09-12T06:00:00Z"
    hist_end = "2026-09-13T06:00:00Z"
    assessment_time = "2026-09-30T06:00:00Z"

    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.1,
        observed_at="2026-09-30T05:30:00Z",
        valid_to="2026-09-30T12:00:00Z",
        source_name="INCOIS OSF Live",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=10.0,
        observed_at="2026-09-30T05:30:00Z",
        valid_to="2026-09-30T12:00:00Z",
        source_name="IMD AWS Live",
    )
    historical_cyclone = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=True,
        severity="WARNING",
        headline="Deep Depression warning for coastal Ratnagiri",
        valid_from=hist_start,
        valid_to=hist_end,
        source_name="IMD Cyclone Warning Division (Archive)",
    )
    ctx = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        departure_time=assessment_time,
        craft_profile="motorized_boat",
    )
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=marine,
        weather=weather,
        hazard=historical_cyclone,
        data_mode="LIVE",
    )

    # Must NOT trigger active NO_GO due to historical cyclone
    assert assessment.status != RecommendationStatus.NO_GO, (
        f"Historical severe hazard must not trigger NO_GO. Got: {assessment.status}"
    )
    # Must fail closed to UNKNOWN because hazard bulletin is expired
    assert assessment.status == RecommendationStatus.UNKNOWN
    assert assessment.confidence_level == ConfidenceLevel.LOW
    # The historical storm should be documented as historical, not an active decisive factor
    assert any("historical" in f.lower() or "expired" in f.lower() for f in assessment.non_decisive_factors)
    assert any("expired" in w.lower() or "historical" in w.lower() for w in assessment.warnings)


# ---------------------------------------------------------------------------
# Test G: Assessment inside vs outside source validity interval with timezone offsets
# ---------------------------------------------------------------------------

def test_g_assessment_inside_versus_outside_validity_with_timezones():
    # Bulletin valid in IST: 2026-09-30T09:00:00+05:30 (03:30 UTC) to 2026-09-30T18:00:00+05:30 (12:30 UTC)
    valid_from_ist = "2026-09-30T09:00:00+05:30"
    valid_to_ist = "2026-09-30T18:00:00+05:30"

    bulletin = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=True,
        severity="ALERT",
        valid_from=valid_from_ist,
        valid_to=valid_to_ist,
        source_name="IMD Regional Centre Mumbai",
    )
    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.0,
        observed_at="2026-09-30T04:00:00Z",
        valid_to="2026-09-30T13:00:00Z",
        source_name="INCOIS OSF Live",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=12.0,
        observed_at="2026-09-30T04:00:00Z",
        valid_to="2026-09-30T13:00:00Z",
        source_name="IMD AWS Live",
    )

    # 1. Assessment at 06:00 UTC (11:30 IST) -> INSIDE validity interval
    ctx_inside = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        departure_time="2026-09-30T06:00:00Z",
        craft_profile="motorized_boat",
    )
    res_inside = DeterministicRiskEngine.evaluate(
        context=ctx_inside,
        marine=marine,
        weather=weather,
        hazard=bulletin,
        data_mode="LIVE",
    )
    # Active alert triggers restrictive decision
    assert res_inside.status in (RecommendationStatus.NO_GO, RecommendationStatus.CAUTION)

    # 2. Assessment at 13:00 UTC (18:30 IST) -> OUTSIDE validity interval (expired by 30 mins)
    ctx_outside = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        departure_time="2026-09-30T13:00:00Z",
        craft_profile="motorized_boat",
    )
    res_outside = DeterministicRiskEngine.evaluate(
        context=ctx_outside,
        marine=marine,
        weather=weather,
        hazard=bulletin,
        data_mode="LIVE",
    )
    # Stale hazard prevents active alert triggering NO_GO, status falls closed to UNKNOWN
    assert res_outside.status == RecommendationStatus.UNKNOWN
    assert res_outside.confidence_level == ConfidenceLevel.LOW


# ---------------------------------------------------------------------------
# Test H: Geographic fallback metadata survives typed payloads/adapters and blocks GO/HIGH
# ---------------------------------------------------------------------------

def test_h_geographic_fallback_metadata_survives_and_blocks_go_high():
    now_dt = datetime.now(timezone.utc)
    fresh_from = now_dt.isoformat()
    fresh_to = (now_dt + timedelta(hours=6)).isoformat()

    # Create fresh marine payload with fallback_model and GEOGRAPHIC_FALLBACK
    marine_payload = MarineConditionsPayload(
        harbor="Alibag",
        significant_wave_height_m=0.8,
        observed_at=fresh_from,
        valid_to=fresh_to,
        source_name="INCOIS OSF (Ratnagiri Fallback Reference)",
        freshness_flags={
            "coverage_status": "GEOGRAPHIC_FALLBACK",
            "fallback_model": True,
            "reference_harbor": "Ratnagiri",
        },
    )

    ctx = ToolInvocationContext(origin_harbor="Alibag", craft_profile="motorized_boat")
    # Adapt through ProviderToolAdapter
    tool_res = ProviderToolAdapter.adapt_marine_conditions(lambda c: marine_payload, ctx)
    assert tool_res.status.value == "ok"
    ev = tool_res.evidence[0]

    # Verify structured metadata survived
    assert "GEOGRAPHIC_FALLBACK" in ev.quality_flags
    assert "FALLBACK_MODEL" in ev.quality_flags or "FALLBACK" in ev.quality_flags

    weather_payload = WeatherConditionsPayload(
        harbor="Alibag",
        wind_speed_knots=8.0,
        observed_at=fresh_from,
        valid_to=fresh_to,
        source_name="IMD AWS Live",
    )
    hazard_payload = HazardBulletinPayload(
        harbor="Alibag",
        severity="NORMAL",
        valid_from=fresh_from,
        valid_to=fresh_to,
        source_name="IMD Coastal Warning Live",
    )

    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=marine_payload,
        weather=weather_payload,
        hazard=hazard_payload,
        data_mode="LIVE",
    )
    # Geographic fallback must strictly block GO and HIGH confidence
    assert assessment.status == RecommendationStatus.UNKNOWN
    assert assessment.confidence_level == ConfidenceLevel.LOW
    assert any("fallback" in f.lower() or "geographic" in f.lower() for f in assessment.decisive_factors)


# ---------------------------------------------------------------------------
# Test I: PFZ-only requests remain INFORMATIONAL and grant no voyage clearance
# ---------------------------------------------------------------------------

def test_i_pfz_only_requests_remain_informational(client):
    payload = {
        "message": "Where are the fish biting near Ratnagiri?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data.get("intent") == "PFZ"
    rec = data.get("recommendation", {})
    assert rec.get("status") == "INFORMATIONAL"
    assert rec.get("status") != "GO"
    summary = rec.get("summary", "").lower()
    assert "clearance" not in summary
    assert "safe to sail" not in summary


# ---------------------------------------------------------------------------
# Test J: Demo/simulation identity survives every layer used for assessment
# ---------------------------------------------------------------------------

def test_j_demo_simulation_identity_survives_every_layer():
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    now_iso = datetime.now(timezone.utc).isoformat()
    future_iso = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()

    sim_marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.0,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="M1 Synthetic Wave Generator",
    )
    res = ProviderToolAdapter.adapt_marine_conditions(lambda c: sim_marine, ctx, is_mock=True)
    ev = res.evidence[0]
    assert ev.data_mode == "MOCK"
    assert "SIMULATED" in ev.quality_flags
    assert "M2_CONTRACT_MOCK" in ev.quality_flags

    bundle = ObservationBundle(
        marine=sim_marine,
        data_mode="SYNTHETIC",
    )
    assert bundle.provenance_mode in ("DEMO", "SYNTHETIC")

    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=sim_marine,
        bundle=bundle,
        data_mode="SYNTHETIC",
    )
    assert assessment.confidence_level != ConfidenceLevel.HIGH, "Simulated data cannot produce HIGH confidence"
    assert any(
        prov.data_mode in ("MOCK", "SYNTHETIC")
        or any("demo" in q.lower() or "synthetic" in q.lower() for q in prov.quality_flags)
        for prov in assessment.provenance
    ), "Simulated provenance flag must be preserved"


# ---------------------------------------------------------------------------
# Test K: Real snapshot PFZ request via /api/v1/chat returns candidate MH-PFZ-51
# ---------------------------------------------------------------------------

def test_k_real_snapshot_pfz_request_returns_mh_pfz_51_geodesic(client, monkeypatch):
    monkeypatch.setattr(settings, "DATA_MODE", "SNAPSHOT")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    payload = {
        "message": "Where is the nearest potential fishing zone from Ratnagiri?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "departure_time": "2026-09-30T06:00:00Z",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Verify candidate MH-PFZ-51 is ranked first by geodesic engine
    answer = data.get("answer", "")
    assert "MH-PFZ-51" in answer, f"Expected candidate MH-PFZ-51 in answer: {answer}"

    # Verify distance ~13.1 nm and bearing ~241.3 degrees
    assert "13.1" in answer, f"Expected ~13.1 nm in answer: {answer}"
    assert "241" in answer, f"Expected ~241° bearing in answer: {answer}"

    # Verify contract mocks (14.2 nm / 278.0 deg or 12.4 nm / 285 deg) are absent
    assert "14.2" not in answer, f"Contract mock value 14.2 nm found: {answer}"
    assert "12.4" not in answer, f"Contract mock value 12.4 nm found: {answer}"

    pfz_ev = next((e for e in data.get("evidence", []) if e.get("metric_name") == "pfz_distance_nm"), None)
    assert pfz_ev is not None, "Expected pfz_distance_nm evidence item"
    dist_val = float(pfz_ev["metric_value"])
    assert abs(dist_val - 13.1) < 0.2, f"Expected distance ~13.1 nm, got {dist_val}"


# ---------------------------------------------------------------------------
# Test L: Container-equivalent isolated filesystem layout verifies snapshot discovery
# ---------------------------------------------------------------------------

def test_l_container_filesystem_layout_snapshot_discovery():
    """Simulates container environment (/app/data/source_snapshots) in an isolated directory."""
    import shutil
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        container_app = tmp_path / "app"
        container_snapshots = container_app / "data" / "source_snapshots"
        container_snapshots.mkdir(parents=True, exist_ok=True)

        # Place the genuine snapshot fixture in the isolated container path
        src_file = Path("data/source_snapshots/hazard_ratnagiri.json")
        shutil.copy(src_file, container_snapshots / "hazard_ratnagiri.json")

        # Point SnapshotConnector explicitly to the container path
        connector = SnapshotConnector(snapshots_path=str(container_snapshots))
        ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
        hazard = connector.get_hazard_bulletin(ctx)

        assert hazard.bulletin_id == "SNAP-IMD-001"
        assert hazard.valid_from == "2026-01-01T00:00:00+00:00"
        assert hazard.valid_to == "2030-01-01T00:00:00+00:00"


# ===========================================================================
# Finding 1 Regression: Structured provenance survival across all layers
# connector payload -> typed model -> adapter -> observation bundle -> risk engine -> endpoint evidence
# ===========================================================================

def test_regression_provenance_classification_survives_all_layers():
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=12)).isoformat()

    # 1. Connector raw payload with structured metadata
    connector_payload = {
        "harbor": "Ratnagiri",
        "significant_wave_height_m": 0.9,
        "observed_at": now_iso,
        "valid_to": future_iso,
        "source_name": "INCOIS Coastal Buoy System",
        "source_url": "https://incois.gov.in",
        "freshness_flags": {
            "data_mode": "LIVE",
            "coverage_status": "OFFICIAL",
            "quality_flags": ["verified_live", "sensor_calibrated"],
            "retrieved_at": now_iso,
        },
    }

    # 2. Typed model
    typed_marine = MarineConditionsPayload(**connector_payload)
    assert typed_marine.freshness_flags["data_mode"] == "LIVE"
    assert "verified_live" in typed_marine.freshness_flags["quality_flags"]

    # 3. Adapter
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    tool_res = ProviderToolAdapter.adapt_marine_conditions(lambda c: typed_marine, ctx, is_mock=False)
    ev = tool_res.evidence[0]
    assert ev.data_mode == "LIVE"
    assert "verified_live" in ev.quality_flags
    assert "sensor_calibrated" in ev.quality_flags
    assert "official_source" in ev.quality_flags

    # 4. Observation bundle
    bundle = ObservationBundle(
        marine=typed_marine,
        data_mode="LIVE",
    )
    assert bundle.provenance_mode == "LIVE"

    # 5. Risk engine
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=8.0,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="IMD Automatic Weather Station",
        freshness_flags={"data_mode": "LIVE", "coverage_status": "OFFICIAL", "quality_flags": ["verified_live"]},
    )
    hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        squall_alert=False,
        severity="NORMAL",
        valid_from=now_iso,
        valid_to=future_iso,
        source_name="IMD Cyclone Warning Division",
        freshness_flags={"data_mode": "LIVE", "coverage_status": "OFFICIAL", "quality_flags": ["verified_live"]},
    )

    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=typed_marine,
        weather=weather,
        hazard=hazard,
        bundle=bundle,
        data_mode="LIVE",
    )

    # 6. Preserved provenance
    prov_marine = next(p for p in assessment.provenance if "incois" in p.provider_name.lower() or "marine" in (p.source_name or "").lower())
    assert prov_marine.data_mode == "LIVE"
    assert "verified_live" in prov_marine.quality_flags
    assert "sensor_calibrated" in prov_marine.quality_flags


# ===========================================================================
# Finding 2 Regression: Mixed-Source Operational Assessments (Fail-Closed)
# Test both payload orderings through /api/v1/chat
# ===========================================================================

def test_regression_mixed_source_ordering_1_demo_marine_live_others(client, monkeypatch):
    """Ordering 1: Demo marine + live weather + live hazard in operational LIVE request."""
    monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=12)).isoformat()

    # Demo marine
    demo_marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=0.8,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="INCOIS Marine OSF (DEMO FIXTURE)",
        freshness_flags={"data_mode": "MOCK", "quality_flags": ["deterministic_demo", "SIMULATED"]},
    )
    # Live weather
    live_weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=8.0,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="IMD AWS Live Telemetry",
        freshness_flags={"data_mode": "LIVE", "coverage_status": "LIVE", "quality_flags": ["verified_live"]},
    )
    # Live hazard
    live_hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        squall_alert=False,
        severity="NORMAL",
        valid_from=now_iso,
        valid_to=future_iso,
        source_name="IMD Cyclone Warning Division",
        freshness_flags={"data_mode": "LIVE", "coverage_status": "LIVE", "quality_flags": ["verified_live"]},
    )

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=demo_marine,
        weather=live_weather,
        hazard=live_hazard,
        data_mode="LIVE",
    )

    # Operational LIVE request cannot return GO or HIGH when one essential source is demo
    assert assessment.status == RecommendationStatus.UNKNOWN, f"Expected UNKNOWN, got {assessment.status}"
    assert assessment.confidence_level == ConfidenceLevel.LOW, f"Expected LOW, got {assessment.confidence_level}"
    assert "simulated or demonstration data" in assessment.summary.lower()

    # Verify preserved source metadata
    prov_marine = next(p for p in assessment.provenance if "incois" in p.provider_name.lower())
    prov_weather = next(p for p in assessment.provenance if "weather" in (p.source_name or "").lower() or "imd" in p.provider_name.lower())
    assert prov_marine.data_mode == "MOCK"
    assert prov_weather.data_mode == "LIVE"


def test_regression_mixed_source_ordering_2_live_marine_demo_hazard(client, monkeypatch):
    """Ordering 2: Live marine + live weather + demo hazard in operational LIVE request."""
    monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=12)).isoformat()

    # Live marine
    live_marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=0.8,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="INCOIS Ocean State Forecast",
        freshness_flags={"data_mode": "LIVE", "coverage_status": "LIVE", "quality_flags": ["verified_live"]},
    )
    # Live weather
    live_weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=8.0,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="IMD AWS Live Telemetry",
        freshness_flags={"data_mode": "LIVE", "coverage_status": "LIVE", "quality_flags": ["verified_live"]},
    )
    # Demo hazard
    demo_hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        squall_alert=False,
        severity="NORMAL",
        valid_from=now_iso,
        valid_to=future_iso,
        source_name="IMD Hazard Division (DEMO FIXTURE)",
        freshness_flags={"data_mode": "MOCK", "quality_flags": ["deterministic_demo", "SIMULATED"]},
    )

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=live_marine,
        weather=live_weather,
        hazard=demo_hazard,
        data_mode="LIVE",
    )

    # Operational LIVE request cannot return GO or HIGH when hazard is demo
    assert assessment.status == RecommendationStatus.UNKNOWN, f"Expected UNKNOWN, got {assessment.status}"
    assert assessment.confidence_level == ConfidenceLevel.LOW, f"Expected LOW, got {assessment.confidence_level}"
    assert "simulated or demonstration data" in assessment.summary.lower()

    # Preserved source provenance
    prov_marine = next(p for p in assessment.provenance if "incois" in p.provider_name.lower())
    prov_hazard = next(p for p in assessment.provenance if "hazard" in (p.source_name or "").lower() or "cyclone" in (p.source_name or "").lower())
    assert prov_marine.data_mode == "LIVE"
    assert prov_hazard.data_mode == "MOCK"


# ===========================================================================
# Finding 3 Regression: Demo Response Wording (En, Mr, Hi) via /api/v1/chat
# ===========================================================================

def test_regression_demo_response_wording_english(client, monkeypatch):
    """In demo/snapshot scenario, calm conditions must explain modeled result, NOT give departure clearance."""
    monkeypatch.setattr(settings, "DATA_MODE", "SNAPSHOT")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    payload = {
        "message": "Is it safe to go fishing tomorrow from Ratnagiri?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "departure_time": "2026-09-30T06:00:00Z",
            "language_preference": "en",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    answer = data.get("answer", "")
    rec = data.get("recommendation", {})
    action = rec.get("next_action") or rec.get("recommended_action") or ""
    summary = rec.get("summary") or ""

    # Must NOT contain operational departure clearance: "Proceed with planned voyage under standard safety protocols."
    assert "Proceed with planned voyage under standard safety protocols" not in answer
    assert "Proceed with planned voyage under standard safety protocols" not in action

    # Must contain scenario qualification
    assert (
        "Demonstration scenario evaluation only" in action
        or "does not constitute live clearance" in answer
        or "Scenario Evaluation — Not Clearance" in summary
    )


def test_regression_demo_response_wording_marathi(client, monkeypatch):
    """Regional Marathi response must be completely localized with no English disclaimer leaks."""
    monkeypatch.setattr(settings, "DATA_MODE", "SNAPSHOT")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    payload = {
        "message": "उद्या रत्नागिरीहून मासेमारीसाठी जाणे सुरक्षित आहे का?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "departure_time": "2026-09-30T06:00:00Z",
            "language_preference": "mr",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    answer = data.get("answer", "")
    # English notice should NOT leak into Marathi answer
    assert "Notice: This is a scenario evaluation" not in answer
    assert "Proceed with planned voyage under standard safety protocols" not in answer
    # Must contain Marathi notice header
    assert "सूचना:" in answer or "सल्ला" in answer


def test_regression_demo_response_wording_hindi(client, monkeypatch):
    """Regional Hindi response must be completely localized with no English disclaimer leaks."""
    monkeypatch.setattr(settings, "DATA_MODE", "SNAPSHOT")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    payload = {
        "message": "क्या कल रत्नागिरी से मछली पकड़ने जाना सुरक्षित है?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "departure_time": "2026-09-30T06:00:00Z",
            "language_preference": "hi",
        },
    }
    response = client.post("/api/v1/chat", json=payload)
    assert response.status_code == 200
    data = response.json()

    answer = data.get("answer", "")
    assert "Notice: This is a scenario evaluation" not in answer
    assert "Proceed with planned voyage under standard safety protocols" not in answer
    assert "सूचना:" in answer or "सलाह" in answer


# ===========================================================================
# Finding 5 Regression: All Hazard Paths (Squall, Severe, Inapplicable, Future)
# ===========================================================================

def test_regression_hazard_squall_alert_triggers_caution():
    """Verified active squall alert triggers CAUTION."""
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=6)).isoformat()

    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=0.9,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="INCOIS OSF",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=10.0,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="IMD Weather",
    )
    hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        squall_alert=True,
        severity="ALERT",
        headline="Squally weather with wind gusts up to 35 knots expected.",
        valid_from=now_iso,
        valid_to=future_iso,
        source_name="IMD Hazard Warning Division",
    )
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=marine,
        weather=weather,
        hazard=hazard,
        data_mode="SNAPSHOT",
    )
    assert assessment.status == RecommendationStatus.CAUTION
    assert any("squall" in tc.metric_name.lower() and tc.exceeded for tc in assessment.threshold_comparisons)


def test_regression_hazard_severe_warning_triggers_no_go():
    """Verified active severe warning (severity=WARNING) triggers NO_GO."""
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=6)).isoformat()

    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=0.9,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="INCOIS OSF",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=10.0,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="IMD Weather",
    )
    hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        squall_alert=False,
        severity="WARNING",
        headline="Severe gale force winds and dangerous sea state bulletin.",
        valid_from=now_iso,
        valid_to=future_iso,
        source_name="IMD Hazard Warning Division",
    )
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=marine,
        weather=weather,
        hazard=hazard,
        data_mode="SNAPSHOT",
    )
    assert assessment.status == RecommendationStatus.NO_GO
    assert any(tc.impact == "NO_GO_TRIGGER" for tc in assessment.threshold_comparisons)


def test_regression_hazard_future_bulletin_not_treated_as_active():
    """Future hazard bulletin (valid in future) is not active for current departure."""
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    start_future = (now_utc + timedelta(hours=4)).isoformat()
    end_future = (now_utc + timedelta(hours=10)).isoformat()

    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=0.8,
        observed_at=now_iso,
        valid_to=(now_utc + timedelta(hours=6)).isoformat(),
        source_name="INCOIS OSF",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=8.0,
        observed_at=now_iso,
        valid_to=(now_utc + timedelta(hours=6)).isoformat(),
        source_name="IMD Weather",
    )
    hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=True,
        severity="WARNING",
        headline="Future Cyclonic Storm warning commencing in 4 hours.",
        valid_from=start_future,
        valid_to=end_future,
        source_name="IMD Hazard Warning Division",
    )
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=marine,
        weather=weather,
        hazard=hazard,
        data_mode="SNAPSHOT",
    )
    # The cyclone bulletin is future; it must NOT trigger active NO_GO for departure right now
    assert assessment.status != RecommendationStatus.NO_GO
    assert any("Future hazard bulletin noted" in f for f in assessment.non_decisive_factors)


def test_regression_hazard_geographically_inapplicable_not_active():
    """Hazard bulletin issued for a different harbor (e.g., Chennai) does not trigger active hazard in Ratnagiri."""
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=6)).isoformat()

    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=0.8,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="INCOIS OSF",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=8.0,
        observed_at=now_iso,
        valid_to=future_iso,
        source_name="IMD Weather",
    )
    hazard = HazardBulletinPayload(
        harbor="Chennai",  # East coast, inapplicable to Ratnagiri
        cyclone_warning_active=True,
        severity="WARNING",
        headline="Cyclone Alert for North Tamil Nadu & Chennai coast.",
        valid_from=now_iso,
        valid_to=future_iso,
        source_name="IMD Cyclone Warning Division",
    )
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    assessment = DeterministicRiskEngine.evaluate(
        context=ctx,
        marine=marine,
        weather=weather,
        hazard=hazard,
        data_mode="SNAPSHOT",
    )
    # Geographically inapplicable bulletin must not trigger NO_GO for Ratnagiri
    assert assessment.status != RecommendationStatus.NO_GO
    assert any("Geographically inapplicable" in f for f in assessment.non_decisive_factors)


# ===========================================================================
# Endpoint Regressions A through G (Exercising actual /api/v1/chat graph)
# ===========================================================================

def test_endpoint_regression_a_operational_live_snapshot_marine_unknown_low(client, monkeypatch):
    """A. Operational LIVE request + SNAPSHOT marine + valid live weather/hazard -> UNKNOWN/LOW."""
    monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=6)).isoformat()

    def mock_marine(self, ctx):
        return MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=0.8,
            observed_at="2026-09-12T06:00:00Z",
            valid_from="2026-09-12T06:00:00Z",
            valid_to="2026-09-13T06:00:00Z",
            source_name="INCOIS Ocean State Forecast Snapshot Fixture",
            freshness_flags={"data_mode": "SNAPSHOT", "quality_flags": ["SNAPSHOT_SOURCE", "SIMULATED"]},
        )

    def mock_weather(self, ctx):
        return WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=8.0,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_STATION"},
        )

    def mock_hazard(self, ctx):
        return HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            severity="NORMAL",
            headline="No active warnings.",
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Hazard Warning Division",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_BULLETIN"},
        )

    monkeypatch.setattr(ConnectorManager, "get_marine_conditions", mock_marine)
    monkeypatch.setattr(ConnectorManager, "get_weather_conditions", mock_weather)
    monkeypatch.setattr(ConnectorManager, "get_hazard_bulletin", mock_hazard)

    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Is it safe to sail from Ratnagiri?",
            "user_context": {"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat", "departure_time": now_iso},
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["recommendation"]["status"] == "UNKNOWN"
    assert data["confidence"]["level"] == "LOW"
    assert data["data_mode"] == "LIVE"
    assert "simulated or demonstration data" in data["recommendation"]["summary"].lower()

    # Verify endpoint evidence reflects actual source data modes
    marine_ev = next(e for e in data["evidence"] if e.get("metric_name") == "significant_wave_height")
    weather_ev = next(e for e in data["evidence"] if e.get("metric_name") == "wind_speed_knots")
    assert marine_ev["data_mode"] == "SNAPSHOT"
    assert "SNAPSHOT_SOURCE" in marine_ev["quality_flags"]
    assert "M2_CONTRACT_MOCK" not in marine_ev["quality_flags"]
    assert weather_ev["data_mode"] == "LIVE"
    assert "verified_live" in weather_ev["quality_flags"]


def test_endpoint_regression_b_operational_live_snapshot_hazard_unknown_low(client, monkeypatch):
    """B. Operational LIVE request + live marine/weather + SNAPSHOT hazard -> UNKNOWN/LOW."""
    monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=6)).isoformat()

    def mock_marine(self, ctx):
        return MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=0.8,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="INCOIS Ocean State Forecast Live",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_STATION"},
        )

    def mock_weather(self, ctx):
        return WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=8.0,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin Live",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_STATION"},
        )

    def mock_hazard(self, ctx):
        return HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            severity="NORMAL",
            headline="Snapshot normal hazard bulletin.",
            valid_from="2026-09-12T06:00:00Z",
            valid_to="2026-09-13T06:00:00Z",
            source_name="IMD Hazard Division Snapshot Fixture",
            freshness_flags={"data_mode": "SNAPSHOT", "quality_flags": ["SNAPSHOT_SOURCE", "SIMULATED"]},
        )

    monkeypatch.setattr(ConnectorManager, "get_marine_conditions", mock_marine)
    monkeypatch.setattr(ConnectorManager, "get_weather_conditions", mock_weather)
    monkeypatch.setattr(ConnectorManager, "get_hazard_bulletin", mock_hazard)

    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Is it safe to sail from Ratnagiri?",
            "user_context": {"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat", "departure_time": now_iso},
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["recommendation"]["status"] == "UNKNOWN"
    assert data["confidence"]["level"] == "LOW"
    assert data["data_mode"] == "LIVE"
    assert "simulated or demonstration data" in data["recommendation"]["summary"].lower()


def test_endpoint_regression_c_operational_hybrid_mixed_source_unknown_low(client, monkeypatch):
    """C. Same mixed-source cases under HYBRID -> UNKNOWN/LOW."""
    monkeypatch.setattr(settings, "DATA_MODE", "HYBRID")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=6)).isoformat()

    # C1: SNAPSHOT marine under HYBRID
    def mock_marine(self, ctx):
        return MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=0.8,
            observed_at="2026-09-12T06:00:00Z",
            valid_from="2026-09-12T06:00:00Z",
            valid_to="2026-09-13T06:00:00Z",
            source_name="INCOIS Ocean State Forecast Snapshot Fixture",
            freshness_flags={"data_mode": "SNAPSHOT", "quality_flags": ["SNAPSHOT_SOURCE", "SIMULATED"]},
        )

    def mock_weather(self, ctx):
        return WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=8.0,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin Live",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_STATION"},
        )

    def mock_hazard(self, ctx):
        return HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            severity="NORMAL",
            headline="Live calm advisory.",
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Hazard Division Live",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_BULLETIN"},
        )

    monkeypatch.setattr(ConnectorManager, "get_marine_conditions", mock_marine)
    monkeypatch.setattr(ConnectorManager, "get_weather_conditions", mock_weather)
    monkeypatch.setattr(ConnectorManager, "get_hazard_bulletin", mock_hazard)

    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Is it safe to sail from Ratnagiri?",
            "user_context": {"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat", "departure_time": now_iso},
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["recommendation"]["status"] == "UNKNOWN"
    assert data["confidence"]["level"] == "LOW"

    # C2: SNAPSHOT hazard under HYBRID
    def mock_hazard_snapshot(self, ctx):
        return HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            severity="NORMAL",
            headline="Snapshot hazard advisory.",
            valid_from="2026-09-12T06:00:00Z",
            valid_to="2026-09-13T06:00:00Z",
            source_name="IMD Hazard Division Snapshot Fixture",
            freshness_flags={"data_mode": "SNAPSHOT", "quality_flags": ["SNAPSHOT_SOURCE", "SIMULATED"]},
        )

    def mock_marine_live(self, ctx):
        return MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=0.8,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="INCOIS Ocean State Forecast Live",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_STATION"},
        )

    monkeypatch.setattr(ConnectorManager, "get_marine_conditions", mock_marine_live)
    monkeypatch.setattr(ConnectorManager, "get_hazard_bulletin", mock_hazard_snapshot)

    response2 = client.post(
        "/api/v1/chat",
        json={
            "message": "Is it safe to sail from Ratnagiri?",
            "user_context": {"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat", "departure_time": now_iso},
        },
    )
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["recommendation"]["status"] == "UNKNOWN"
    assert data2["confidence"]["level"] == "LOW"


def test_endpoint_regression_d_valid_verified_severe_hazard_retains_no_go(client, monkeypatch):
    """D. Valid verified severe hazard + demo marine -> retains justified NO_GO."""
    monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=6)).isoformat()

    def mock_marine(self, ctx):
        return MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=0.8,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="INCOIS Marine OSF (DEMO FIXTURE)",
            freshness_flags={"data_mode": "DEMO", "quality_flags": ["deterministic_demo", "SIMULATED"]},
        )

    def mock_weather(self, ctx):
        return WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=8.0,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin Live",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_STATION"},
        )

    def mock_hazard(self, ctx):
        return HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=True,
            squall_alert=True,
            severity="WARNING",
            headline="Severe Cyclonic Storm Warning over Ratnagiri Coast.",
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Cyclone Warning Division",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_BULLETIN"},
        )

    monkeypatch.setattr(ConnectorManager, "get_marine_conditions", mock_marine)
    monkeypatch.setattr(ConnectorManager, "get_weather_conditions", mock_weather)
    monkeypatch.setattr(ConnectorManager, "get_hazard_bulletin", mock_hazard)

    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Is it safe to sail from Ratnagiri?",
            "user_context": {"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat", "departure_time": now_iso},
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["recommendation"]["status"] == "NO_GO"
    assert data["confidence"]["level"] == "HIGH"
    assert data["data_mode"] == "LIVE"
    # Auxiliary simulation limitation is noted separately while retaining justified NO_GO
    warnings = data["recommendation"].get("warnings", [])
    assert any("Auxiliary" in w or "simulated" in w or "fallback" in w for w in warnings)
    decisive = data["recommendation"].get("decisive_factors", [])
    assert any("cyclone" in f.lower() or "severe" in f.lower() for f in decisive)


def test_endpoint_regression_e_simulated_severe_hazard_no_verified_operational_no_go_high(client, monkeypatch):
    """E. Simulated severe hazard + otherwise calm verified inputs -> no verified operational NO_GO/HIGH."""
    monkeypatch.setattr(settings, "DATA_MODE", "LIVE")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=6)).isoformat()

    def mock_marine(self, ctx):
        return MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=0.8,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="INCOIS Ocean State Forecast Live",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_STATION"},
        )

    def mock_weather(self, ctx):
        return WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=8.0,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin Live",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_STATION"},
        )

    def mock_hazard(self, ctx):
        return HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=True,
            squall_alert=True,
            severity="WARNING",
            headline="Simulated Cyclonic Storm Warning Fixture.",
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Hazard (Simulated Demo Fixture)",
            freshness_flags={"data_mode": "SIMULATED", "quality_flags": ["deterministic_demo", "SIMULATED"]},
        )

    monkeypatch.setattr(ConnectorManager, "get_marine_conditions", mock_marine)
    monkeypatch.setattr(ConnectorManager, "get_weather_conditions", mock_weather)
    monkeypatch.setattr(ConnectorManager, "get_hazard_bulletin", mock_hazard)

    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Is it safe to sail from Ratnagiri?",
            "user_context": {"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat", "departure_time": now_iso},
        },
    )
    assert response.status_code == 200
    data = response.json()
    # A simulated severe hazard must NOT independently justify operational NO_GO/HIGH
    assert not (data["recommendation"]["status"] == "NO_GO" and data["confidence"]["level"] == "HIGH")
    assert data["recommendation"]["status"] == "UNKNOWN"
    assert data["confidence"]["level"] == "LOW"


def test_endpoint_regression_f_structured_flags_survive_without_fabricated_verified_live(client, monkeypatch):
    """F. Structured cached/fallback/unavailable flags survive to endpoint evidence without fabricated verified_live."""
    monkeypatch.setattr(settings, "DATA_MODE", "HYBRID")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=6)).isoformat()

    def mock_marine(self, ctx):
        return MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=0.8,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="INCOIS OSF (Cached Station)",
            freshness_flags={
                "data_mode": "CACHED",
                "is_cached": True,
                "coverage_status": "OFFICIAL_STATION",
                "quality_flags": ["cached", "CACHED_SOURCE", "calibrated_buoy"],
            },
        )

    def mock_weather(self, ctx):
        return WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=8.0,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="Open-Meteo GFS Fallback",
            freshness_flags={
                "data_mode": "HYBRID",
                "fallback_model": True,
                "coverage_status": "FALLBACK_MODEL",
                "quality_flags": ["fallback_model", "FALLBACK", "open_meteo_model"],
            },
        )

    def mock_hazard(self, ctx):
        return HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            severity="UNKNOWN",
            headline="Upstream provider timeout.",
            valid_from=None,
            valid_to=None,
            source_name="IMD Hazard Bulletin (UNAVAILABLE)",
            freshness_flags={
                "data_mode": "UNAVAILABLE",
                "coverage_status": "UNAVAILABLE",
                "quality_flags": ["UNAVAILABLE", "degraded", "upstream_timeout"],
            },
        )

    monkeypatch.setattr(ConnectorManager, "get_marine_conditions", mock_marine)
    monkeypatch.setattr(ConnectorManager, "get_weather_conditions", mock_weather)
    monkeypatch.setattr(ConnectorManager, "get_hazard_bulletin", mock_hazard)

    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Is it safe to sail from Ratnagiri?",
            "user_context": {"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat", "departure_time": now_iso},
        },
    )
    assert response.status_code == 200
    data = response.json()

    for item in data.get("evidence", []):
        qf = item.get("quality_flags", [])
        assert "verified_live" not in qf, f"verified_live must not be fabricated for {item.get('metric_name')}: {qf}"

    marine_ev = next(e for e in data["evidence"] if e.get("metric_name") == "significant_wave_height")
    assert "cached" in marine_ev["quality_flags"]
    assert "calibrated_buoy" in marine_ev["quality_flags"]

    weather_ev = next(e for e in data["evidence"] if e.get("metric_name") == "wind_speed_knots")
    assert "fallback_model" in weather_ev["quality_flags"]
    assert "open_meteo_model" in weather_ev["quality_flags"]
    assert "official_source" not in weather_ev["quality_flags"]


def test_endpoint_regression_g_real_snapshot_pfz_distinguishes_calculation_lineage(client, monkeypatch):
    """G. Real snapshot PFZ endpoint evidence distinguishes fixtures, calculations, and contract mocks correctly."""
    monkeypatch.setattr(settings, "DATA_MODE", "SNAPSHOT")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Where are the potential fishing zones near Ratnagiri?",
            "user_context": {
                "origin_harbor": "Ratnagiri",
                "departure_time": "2026-09-30T06:00:00Z",
                "language_preference": "en",
            },
        },
    )
    assert response.status_code == 200
    data = response.json()

    # Locate PFZ distance calculation evidence item
    pfz_ev = next((e for e in data.get("evidence", []) if e.get("metric_name") == "pfz_distance_nm"), None)
    assert pfz_ev is not None, "PFZ distance calculation evidence must be present in response"

    # Lineage identifies the calculation and its snapshot input lineage
    assert pfz_ev["lineage_id"] == "pfz_ranking_eval:snapshot_inputs"
    assert pfz_ev["data_mode"] == "SNAPSHOT"
    assert "GEOSPATIAL_CALCULATION" in pfz_ev["quality_flags"]
    assert "SNAPSHOT_SOURCE" in pfz_ev["quality_flags"]

    # Distinguishable: must NOT be labelled contract mock or verified live
    assert "M2_CONTRACT_MOCK" not in pfz_ev["quality_flags"]
    assert "verified_live" not in pfz_ev["quality_flags"]
    assert "LIVE" != pfz_ev["data_mode"]

