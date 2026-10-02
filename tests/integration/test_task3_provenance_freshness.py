"""Task 3: Honest Source Labels, Evidence Freshness, and Provenance Regression Tests.

Verifies:
1. Close Safety Verification Defect:
   A. Fresh unverified/fallback severe hazard plus demo auxiliary data.
   B. Fresh verified official severe hazard plus demo auxiliary data.
   C. Fresh fallback marine/wind above an existing restrictive threshold.
2. Distinct Source Facts & Provenance:
   - Cached official data retains official origin without fabricated verified_live.
   - Open-Meteo/fallback data retains fallback identity (fallback_model, not official).
   - Snapshot evidence has snapshot lineage (snapshot_fixture), never live_api.
   - Contract mocks remain distinguishable from actual fixtures (M2_CONTRACT_MOCK excluded).
   - PFZ calculations preserve input provenance and do not turn execution time into observation time.
   - Retrieval does not make an expired source fresh.
   - Missing verification/validity does not create a verified/live badge.
   - Marinewatch fallback point/route endpoints label physical models honestly.
"""

from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from backend.app.agents.integrations.adapters import ProviderToolAdapter
from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    WeatherConditionsPayload,
)
from backend.app.connectors.snapshot import SnapshotConnector
from backend.app.contracts.chat import ConfidenceLevel, RecommendationStatus
from backend.app.core.config import settings
from backend.app.domain.risk_engine import DeterministicRiskEngine
from backend.app.main import create_app
from backend.app.services.marinewatch_service import marine_watch_service


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
    yield
    tool_registry._registry = orig_registry
    tool_registry._handlers = orig_handlers
    settings.DATA_MODE = orig_data_mode
    settings.LLM_MODE = orig_llm_mode


# =============================================================================
# 1. Close Safety Verification Defect: Cases A, B, C
# =============================================================================

def test_case_a_fresh_unverified_severe_hazard_with_demo_auxiliary():
    """Case A: Fresh unverified/fallback severe hazard plus demo auxiliary data.

    Assert:
    - Cannot acquire fabricated verified official status or HIGH confidence.
    - Auxiliary data is simulated/demo, so in operational mode it fails closed (UNKNOWN/LOW).
    """
    now_utc = datetime.now(timezone.utc)
    ctx = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        departure_time=now_utc.isoformat(),
        data_mode="LIVE",
    )

    # Unverified severe hazard (e.g. community crowdsourced report or unverified advisory)
    unverified_hazard = HazardBulletinPayload(
        bulletin_id="COMMUNITY-ALERT-01",
        harbor="Ratnagiri",
        severity="DANGER",
        headline="Unverified Local Cyclone Sighting",
        description="Informal social media alert of cyclonic winds off coast",
        valid_from=(now_utc - timedelta(hours=1)).isoformat(),
        valid_to=(now_utc + timedelta(hours=6)).isoformat(),
        source_name="Community Coastal Watch (Unverified Fallback)",
        source_url=None,
        cyclone_warning_active=True,
        freshness_flags={
            "is_official": False,
            "coverage_status": "UNVERIFIED",
            "fallback": True,
        },
    )

    # Demo auxiliary telemetry
    demo_marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.2,
        observed_at=now_utc.isoformat(),
        valid_to=(now_utc + timedelta(hours=6)).isoformat(),
        source_name="ORCA Demo Marine Simulator",
        freshness_flags={"data_mode": "DEMO", "coverage_status": "DEMO"},
    )
    demo_weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=12.0,
        observed_at=now_utc.isoformat(),
        valid_to=(now_utc + timedelta(hours=6)).isoformat(),
        source_name="ORCA Demo Weather Simulator",
        freshness_flags={"data_mode": "DEMO", "coverage_status": "DEMO"},
    )

    result = DeterministicRiskEngine.evaluate(
        ctx,
        marine=demo_marine,
        weather=demo_weather,
        hazard=unverified_hazard,
        data_mode="LIVE",
        reference_time=now_utc,
    )

    # Must NOT acquire verified official status or HIGH confidence
    assert result.confidence_level != ConfidenceLevel.HIGH, "Unverified hazard + demo auxiliary must not acquire HIGH confidence"
    # Because auxiliary inputs are demo/simulated in LIVE mode, system fails closed
    assert result.status == RecommendationStatus.UNKNOWN
    assert result.confidence_level == ConfidenceLevel.LOW
    assert "verified official observations" not in " ".join(result.confidence_reasons).lower()


def test_case_b_fresh_verified_official_severe_hazard_with_demo_auxiliary():
    """Case B: Fresh verified official severe hazard plus demo auxiliary data.

    Assert:
    - Preserves justified NO_GO behavior with HIGH confidence and verified official reasoning.
    """
    now_utc = datetime.now(timezone.utc)
    ctx = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        departure_time=now_utc.isoformat(),
        data_mode="LIVE",
    )

    # Fresh verified official severe hazard
    verified_hazard = HazardBulletinPayload(
        bulletin_id="IMD-CYC-2026-03",
        harbor="Ratnagiri",
        severity="DANGER",
        headline="Very Severe Cyclonic Storm Warning",
        description="Official warning from IMD Cyclone Warning Division",
        valid_from=(now_utc - timedelta(hours=1)).isoformat(),
        valid_to=(now_utc + timedelta(hours=12)).isoformat(),
        source_name="IMD Cyclone Warning Division",
        source_url="https://mausam.imd.gov.in/cyclone",
        cyclone_warning_active=True,
        quality_flags=["official_source", "verified_live"],
        freshness_flags={
            "is_official": True,
            "verified_live": True,
            "coverage_status": "OFFICIAL_BULLETIN",
        },
    )

    # Demo auxiliary telemetry
    demo_marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.2,
        observed_at=now_utc.isoformat(),
        valid_to=(now_utc + timedelta(hours=6)).isoformat(),
        source_name="ORCA Demo Marine Simulator",
        freshness_flags={"data_mode": "DEMO", "coverage_status": "DEMO"},
    )
    demo_weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=12.0,
        observed_at=now_utc.isoformat(),
        valid_to=(now_utc + timedelta(hours=6)).isoformat(),
        source_name="ORCA Demo Weather Simulator",
        freshness_flags={"data_mode": "DEMO", "coverage_status": "DEMO"},
    )

    result = DeterministicRiskEngine.evaluate(
        ctx,
        marine=demo_marine,
        weather=demo_weather,
        hazard=verified_hazard,
        data_mode="LIVE",
        reference_time=now_utc,
    )

    # B must preserve the justified NO_GO behavior with HIGH confidence
    assert result.status == RecommendationStatus.NO_GO
    assert result.confidence_level == ConfidenceLevel.HIGH
    assert any("verified official observations" in r.lower() for r in result.confidence_reasons)


def test_case_c_fresh_fallback_marine_above_restrictive_threshold():
    """Case C: Fresh fallback marine/wind above an existing restrictive threshold.

    Assert:
    - Restrictive recommendation (NO_GO) is preserved due to wave exceeding threshold.
    - Cannot acquire fabricated verified official status or HIGH confidence.
    - Confidence is MEDIUM with fallback model forecast reasoning.
    """
    now_utc = datetime.now(timezone.utc)
    ctx = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",  # wave_nogo_m is 2.0m
        departure_time=now_utc.isoformat(),
        data_mode="LIVE",
    )

    # Fallback marine model exceeding safety limit (3.2m > 2.0m)
    fallback_marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=3.2,
        observed_at=now_utc.isoformat(),
        valid_to=(now_utc + timedelta(hours=6)).isoformat(),
        source_name="Open-Meteo Marine API (Fallback Model)",
        quality_flags=["fallback_model"],
        freshness_flags={
            "fallback_model": True,
            "coverage_status": "FALLBACK",
        },
    )

    normal_weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=12.0,
        observed_at=now_utc.isoformat(),
        valid_to=(now_utc + timedelta(hours=6)).isoformat(),
        source_name="IMD Coastal Weather Bulletin",
        quality_flags=["official_source", "verified_live"],
        freshness_flags={"is_official": True, "verified_live": True, "coverage_status": "OFFICIAL_STATION"},
    )
    normal_hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        severity="NORMAL",
        headline="Calm conditions",
        valid_from=(now_utc - timedelta(hours=1)).isoformat(),
        valid_to=(now_utc + timedelta(hours=12)).isoformat(),
        source_name="IMD Hazard Division",
        quality_flags=["official_source", "verified_live"],
        freshness_flags={"is_official": True, "verified_live": True, "coverage_status": "OFFICIAL_BULLETIN"},
    )

    result = DeterministicRiskEngine.evaluate(
        ctx,
        marine=fallback_marine,
        weather=normal_weather,
        hazard=normal_hazard,
        data_mode="LIVE",
        reference_time=now_utc,
    )

    # Restrictive NO_GO preserved
    assert result.status == RecommendationStatus.NO_GO
    # Cannot acquire HIGH confidence or verified official status
    assert result.confidence_level == ConfidenceLevel.MEDIUM
    assert not any("verified official observations" in r.lower() for r in result.confidence_reasons)
    assert any("fallback model forecast observations" in r.lower() for r in result.confidence_reasons)


# =============================================================================
# 2. Distinct Source Facts, Lineage & Generated Labels
# =============================================================================

def test_snapshot_marine_lineage_is_snapshot_fixture_not_live_api():
    """Verify that SnapshotConnector marine payload produces lineage_id='snapshot_fixture' and NOT 'live_api'."""
    connector = SnapshotConnector()
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    
    result = ProviderToolAdapter.adapt_marine_conditions(
        connector.get_marine_conditions,
        ctx,
        is_mock=False,
    )

    assert result.status.value.lower() == "ok"
    assert len(result.evidence) > 0
    ev = result.evidence[0]
    assert ev.lineage_id != "live_api", f"Snapshot marine must not have lineage_id='live_api', got {ev.lineage_id}"
    assert ev.lineage_id == "snapshot_fixture"
    assert ev.data_mode == "SNAPSHOT"
    assert "M2_CONTRACT_MOCK" not in ev.quality_flags


def test_cached_official_data_retains_official_origin_without_verified_live():
    """Verify cached official data keeps official_source but cannot claim verified_live."""
    now_utc = datetime.now(timezone.utc)
    cached_payload = HazardBulletinPayload(
        bulletin_id="BULLETIN-CACHED-01",
        harbor="Ratnagiri",
        severity="NORMAL",
        headline="Calm conditions",
        valid_from=(now_utc - timedelta(hours=2)).isoformat(),
        valid_to=(now_utc + timedelta(hours=4)).isoformat(),
        source_name="IMD Cyclone Warning Division [Cached Store]",
        quality_flags=["official_source", "cached_source"],
        freshness_flags={"is_cached": True, "is_official": True, "coverage_status": "OFFICIAL_BULLETIN"},
    )

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    result = ProviderToolAdapter.adapt_hazard_bulletin(
        lambda _: cached_payload,
        ctx,
        is_mock=False,
    )

    ev = result.evidence[0]
    assert "official_source" in ev.quality_flags
    assert "verified_live" not in ev.quality_flags
    assert ev.lineage_id == "BULLETIN-CACHED-01"


def test_open_meteo_fallback_retains_actual_identity():
    """Verify Open-Meteo fallback data retains fallback_model and never claims official_source or verified_live."""
    now_utc = datetime.now(timezone.utc)
    fallback_payload = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.4,
        observed_at=now_utc.isoformat(),
        valid_to=(now_utc + timedelta(hours=3)).isoformat(),
        source_name="Open-Meteo Marine Forecast",
        freshness_flags={"is_fallback": True, "coverage_status": "FALLBACK"},
    )

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    result = ProviderToolAdapter.adapt_marine_conditions(
        lambda _: fallback_payload,
        ctx,
        is_mock=False,
    )

    ev = result.evidence[0]
    assert "fallback_model" in ev.quality_flags
    assert "official_source" not in ev.quality_flags
    assert "verified_live" not in ev.quality_flags
    assert ev.lineage_id == "fallback_model"


def test_pfz_ranking_preserves_input_provenance_and_observation_time():
    """Verify PFZ calculations preserve input provenance without fabricating execution time as observation time."""
    from backend.app.domain.pfz import DeterministicPFZRankingEngine
    pfz_engine = DeterministicPFZRankingEngine()
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")

    features = [
        {
            "id": "MH-PFZ-01",
            "geometry": {"type": "Point", "coordinates": [73.1, 16.9]},
            "properties": {"candidate_id": "MH-PFZ-01", "location_reference": "Ratnagiri Offshore", "sst": 28.2, "chlorophyll": 0.9},
        }
    ]

    # Explicit input bulletin date and validity
    bulletin_date = "2026-09-24T04:51:07Z"
    valid_to = "2026-09-25T04:51:07Z"

    result = ProviderToolAdapter.adapt_pfz_ranking(
        pfz_engine.rank_pfz_candidates,
        ctx,
        raw_features=features,
        is_mock=False,
        source_data_mode="SNAPSHOT",
        observed_time=bulletin_date,
        valid_from=bulletin_date,
        valid_to=valid_to,
    )

    assert result.status.value.lower() == "ok"
    ev = result.evidence[0]
    assert ev.observed_time == bulletin_date
    assert ev.valid_to == valid_to
    assert ev.data_mode == "SNAPSHOT"
    assert ev.lineage_id == "pfz_ranking_eval:snapshot_inputs"
    # Execution time is preserved in retrieved_at, not substituted for observed_time
    assert ev.retrieved_at is not None
    assert ev.retrieved_at != bulletin_date


def test_pfz_ranking_without_observation_time_remains_none():
    """Verify that calculation without an observation timestamp preserves None rather than now_iso."""
    from backend.app.domain.pfz import DeterministicPFZRankingEngine
    pfz_engine = DeterministicPFZRankingEngine()
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")

    features = [
        {
            "id": "MH-PFZ-01",
            "geometry": {"type": "Point", "coordinates": [73.1, 16.9]},
            "properties": {"candidate_id": "MH-PFZ-01", "location_reference": "Ratnagiri Offshore", "sst": 28.2, "chlorophyll": 0.9},
        }
    ]

    result = ProviderToolAdapter.adapt_pfz_ranking(
        pfz_engine.rank_pfz_candidates,
        ctx,
        raw_features=features,
        is_mock=False,
        source_data_mode="SNAPSHOT",
        observed_time=None,
    )

    ev = result.evidence[0]
    assert ev.observed_time is None, "Calculation without direct sensor reading must have observed_time=None"


def test_retrieval_does_not_make_expired_source_fresh():
    """Verify that an expired forecast retains EXPIRED/stale quality flags upon adapter processing."""
    expired_time = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    expired_payload = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.0,
        observed_at=expired_time,
        valid_to=expired_time,
        source_name="INCOIS OSF (Historical)",
    )

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    result = ProviderToolAdapter.adapt_marine_conditions(
        lambda _: expired_payload,
        ctx,
        is_mock=False,
    )

    ev = result.evidence[0]
    assert any(flag in ev.quality_flags for flag in ("EXPIRED", "stale", "stale_telemetry"))
    assert "verified_live" not in ev.quality_flags


def test_marinewatch_fallback_labeling_is_honest():
    """Verify Marinewatch fallback point forecast sets PHYSICAL_FALLBACK_MODEL and truthful source."""
    res = marine_watch_service.get_point_forecast(lat=16.98, lon=73.28)
    fc = res["forecast"]
    # When Open-Meteo or INCOIS live API is unreachable or mocked, it falls back to physical model
    if fc["data_mode"] != "LIVE":
        assert fc["data_mode"] == "PHYSICAL_FALLBACK_MODEL"
        assert any(
            src["provider"] == "ORCA Physical Fallback Model" for src in res["sources"]
        )
        assert not any(
            src["provider"] == "INCOIS" and "Harmonic" in src.get("dataset", "") for src in res["sources"]
        )
