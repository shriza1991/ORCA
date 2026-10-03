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


def test_marinewatch_fallback_labeling_is_honest(monkeypatch):
    """Verify Marinewatch fallback point forecast sets PHYSICAL_FALLBACK_MODEL and truthful source."""
    def unavailable(*args, **kwargs):
        raise RuntimeError("Controlled offline provider failure")
    monkeypatch.setattr(marine_watch_service._open_meteo, "_get", unavailable)
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


def test_retained_chat_preserves_original_evidence_and_derived_thresholds(client):
    """Verify retained chat preserves original evidence records and formats thresholds as derived evaluations."""
    # 1. Create a trip assessment to establish baseline
    dep_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    asm_resp = client.post(
        "/api/v1/trip-assessments",
        json={
            "origin_harbor": "Ratnagiri",
            "craft_profile": "motorized_boat",
            "vessel_size": "medium",
            "departure_time": dep_time,
            "data_mode": "SNAPSHOT",
        },
    )
    assert asm_resp.status_code == 200
    asm_data = asm_resp.json()
    asm_id = asm_data["assessment_id"]
    evidence_bundle_id = asm_data.get("evidence_bundle_id")

    # 2. Call retained chat
    chat_resp = client.post(
        "/api/v1/chat",
        json={
            "message": "Can I go fishing today?",
            "baseline_assessment_id": asm_id,
            "evidence_bundle_id": evidence_bundle_id,
            "data_mode": "SNAPSHOT",
            "user_context": {
                "harbor": "Ratnagiri",
                "craft_profile": "motorized_boat",
            },
        },
    )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()

    # Evidence items must be present
    evidence = chat_data.get("evidence", [])
    assert len(evidence) > 0

    # Must contain original provider evidence (e.g. INCOIS or IMD or Reference)
    providers = [e.get("provider_name") for e in evidence if e.get("provider_name")]
    assert len(providers) > 0, "Original provider identities must be preserved"

    # Must contain derived threshold evaluation records with CALCULATED data_mode
    calc_records = [e for e in evidence if e.get("data_mode") == "CALCULATED"]
    assert len(calc_records) > 0, "Threshold comparisons must be represented as separate derived evaluation records"
    for cr in calc_records:
        assert cr.get("lineage_id") is not None, "Derived calculations must link to supporting source evidence lineage"
        assert cr.get("observed_time") is None, "Calculations without sensor readings must not fabricate observed_time"


def test_pfz_confidence_independent_of_voyage_baseline(client):
    """Verify PFZ advisory confidence is derived independently from candidate evidence and does not cite voyage limits."""
    # 1. Create a trip assessment with severe weather/hazard to produce NO_GO voyage baseline
    dep_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    asm_resp = client.post(
        "/api/v1/trip-assessments",
        json={
            "origin_harbor": "Ratnagiri",
            "craft_profile": "traditional_non_motorized",
            "vessel_size": "small",
            "departure_time": dep_time,
            "data_mode": "SNAPSHOT",
        },
    )
    assert asm_resp.status_code == 200
    asm_data = asm_resp.json()
    asm_id = asm_data["assessment_id"]

    # 2. Ask PFZ query in retained context
    chat_resp = client.post(
        "/api/v1/chat",
        json={
            "message": "Where is the nearest PFZ?",
            "baseline_assessment_id": asm_id,
            "evidence_bundle_id": asm_data.get("evidence_bundle_id"),
            "data_mode": "SNAPSHOT",
            "user_context": {
                "harbor": "Ratnagiri",
                "craft_profile": "traditional_non_motorized",
            },
        },
    )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()

    assert chat_data.get("intent") == "PFZ"

    # PFZ recommendation must remain INFORMATIONAL
    assert chat_data.get("recommendation", {}).get("status") == "INFORMATIONAL"

    # Advisory confidence must be derived for PFZ, not blindly inheriting voyage brief
    explanation = chat_data.get("explanation", {})
    factors = explanation.get("decisive_factors", [])
    joined_factors = " ".join(factors).lower()

    # Must not cite vessel operating limits or cyclone as PFZ candidate confidence explanation
    assert "cyclone" not in joined_factors
    assert "operating limits" not in joined_factors

    # Answer text must include departure clearance disclaimer
    answer = chat_data.get("answer", "")
    assert "departure" in answer.lower() or "clearance" in answer.lower() or "सुरक्षा" in answer or "परवानगी" in answer

    # mission_assessment must be preserved separately
    assert chat_data.get("mission_assessment") is not None
    assert chat_data["mission_assessment"]["assessment_id"] == asm_id


def test_collaboration_missing_evidence_honesty():
    """Verify missing collaboration evidence does not manufacture INCOIS/IMD provider claims."""
    from backend.app.domain.agent_collaboration import AgentCollaborationEngine
    from backend.app.contracts.chat import DataQualityRating

    # Build collaboration payload with empty evidence
    collab = AgentCollaborationEngine.derive_collaboration(
        observations={},
        risk_assessment=None,
        evidence=[],
        trace=[],
        user_profile={"craft_profile": "motorized_boat"},
        tool_results={},
        intent="SAFETY",
        language="en",
        harbor="Ratnagiri",
    )

    marine_agent = next(a for a in collab.agents if a.agent_id == "marine_agent")
    weather_agent = next(a for a in collab.agents if a.agent_id == "weather_agent")
    safety_agent = next(a for a in collab.agents if a.agent_id == "safety_agent")

    # Missing evidence must have LIMITED quality, NOT VERIFIED
    assert marine_agent.data_quality == DataQualityRating.LIMITED
    assert weather_agent.data_quality == DataQualityRating.LIMITED

    # Sources must NOT claim active INCOIS/IMD feeds
    for src in marine_agent.sources:
        assert src.provider == "Unavailable"
        assert src.last_updated is None

    for src in weather_agent.sources:
        assert src.provider == "Unavailable"
        assert src.last_updated is None

    # Safety agent is domain intelligence calculation, NOT verified sensor feed
    assert safety_agent.data_quality == DataQualityRating.PARTIAL
    assert any(s.provider in ("ORCA Safety Authority", "ORCA Domain Intelligence") for s in safety_agent.sources)


def test_pfz_confidence_precedence_matrix():
    """Verify PFZ confidence precedence rules across expired demo, unverified, missing validity, and verified."""
    from backend.app.contracts.chat import ConfidenceLevel
    from backend.app.services.mission_conversation import _derive_pfz_confidence
    from unittest.mock import MagicMock

    departure = "2026-10-04T06:00:00Z"

    # Helper mock assessment builder
    def build_mock_assessment(candidates, data_mode="LIVE", prov_mode="LIVE"):
        asm = MagicMock()
        asm.pfz_candidates = candidates
        asm.conditions.data_mode = data_mode
        asm.conditions.provenance_mode = prov_mode
        return asm

    sample_candidate = [{"candidate_id": "MH-PFZ-01", "distance_nautical_miles": 12.4, "bearing_degrees": 245.0}]

    # Case 1: No supported candidates -> LOW
    asm_no_cand = build_mock_assessment([])
    conf = _derive_pfz_confidence(asm_no_cand, {}, departure, "en")
    assert conf.level == ConfidenceLevel.LOW
    assert "no supported fishing candidate" in " ".join(conf.reasons).lower()

    # Case 2: Missing validity -> LOW
    asm_cand = build_mock_assessment(sample_candidate, data_mode="LIVE")
    bundle_missing_val = {"pfz": {"valid_to": None, "bulletin_date": None}}
    conf = _derive_pfz_confidence(asm_cand, bundle_missing_val, departure, "en")
    assert conf.level == ConfidenceLevel.LOW
    assert "unknown or missing" in " ".join(conf.reasons).lower()

    # Case 3: Malformed validity -> LOW
    bundle_malformed = {"pfz": {"valid_from": "not-a-date", "valid_to": "invalid-iso"}}
    conf = _derive_pfz_confidence(asm_cand, bundle_malformed, departure, "en")
    assert conf.level == ConfidenceLevel.LOW
    assert "malformed" in " ".join(conf.reasons).lower()

    # Case 4: Expired demo source -> LOW (MUST NOT receive MEDIUM just because it is demo)
    asm_demo = build_mock_assessment(sample_candidate, data_mode="DEMO", prov_mode="DEMO")
    bundle_expired_demo = {
        "pfz": {
            "valid_from": "2026-10-01T00:00:00Z",
            "valid_to": "2026-10-03T00:00:00Z",  # Expired before departure 2026-10-04T06:00:00Z
            "data_mode": "DEMO",
        }
    }
    conf = _derive_pfz_confidence(asm_demo, bundle_expired_demo, departure, "en")
    assert conf.level == ConfidenceLevel.LOW
    assert "expired" in " ".join(conf.reasons).lower()

    # Case 5: Not-yet-valid source -> LOW
    bundle_future = {
        "pfz": {
            "valid_from": "2026-10-05T00:00:00Z",  # Future relative to departure
            "valid_to": "2026-10-06T00:00:00Z",
            "data_mode": "LIVE",
        }
    }
    conf = _derive_pfz_confidence(asm_cand, bundle_future, departure, "en")
    assert conf.level == ConfidenceLevel.LOW
    assert "commences after departure" in " ".join(conf.reasons).lower()

    # Case 6: Valid demo/snapshot -> MEDIUM with scenario wording
    bundle_valid_demo = {
        "pfz": {
            "valid_from": "2026-10-04T00:00:00Z",
            "valid_to": "2026-10-04T18:00:00Z",
            "data_mode": "SNAPSHOT",
        }
    }
    asm_snapshot = build_mock_assessment(sample_candidate, data_mode="SNAPSHOT", prov_mode="DEMO")
    conf = _derive_pfz_confidence(asm_snapshot, bundle_valid_demo, departure, "en")
    assert conf.level == ConfidenceLevel.MEDIUM
    assert any("medium" in r.lower() or "modeled" in r.lower() or "simulated" in r.lower() or "scenario" in r.lower() for r in conf.reasons)

    # Case 7: Fresh unverified live -> MEDIUM (MUST NOT receive HIGH)
    bundle_fresh_unverified = {
        "pfz": {
            "valid_from": "2026-10-04T00:00:00Z",
            "valid_to": "2026-10-04T18:00:00Z",
            "source_name": "Third-Party Ocean SST Feed",
            "data_mode": "LIVE",
            "quality_flags": [],
            "freshness_flags": {"verified_live": False},
        }
    }
    conf = _derive_pfz_confidence(asm_cand, bundle_fresh_unverified, departure, "en")
    assert conf.level == ConfidenceLevel.MEDIUM, "Unverified live PFZ feed must not acquire HIGH confidence"
    assert "unverified" in " ".join(conf.reasons).lower()

    # Case 8: Valid verified official live with certified coverage -> HIGH
    bundle_valid_verified = {
        "pfz": {
            "valid_from": "2026-10-04T00:00:00Z",
            "valid_to": "2026-10-04T18:00:00Z",
            "source_name": "INCOIS Marine PFZ Advisory",
            "data_mode": "LIVE",
            "quality_flags": ["official_source", "verified_live", "certified_coverage"],
            "freshness_flags": {"is_official": True, "verified_live": True, "coverage_status": "CERTIFIED"},
        }
    }
    conf = _derive_pfz_confidence(asm_cand, bundle_valid_verified, departure, "en")
    assert conf.level == ConfidenceLevel.HIGH
    assert "high confidence" in " ".join(conf.reasons).lower()


def test_retained_evidence_lineage_and_voice_consistency():
    """Verify original evidence preservation, unmanufactured lineage links, and voice/text consistency."""
    from backend.app.services.mission_conversation import _build_retained_evidence, bind_mission_response
    from backend.app.services.mission_evidence import get_assessment, retain_assessment, retain_bundle
    from backend.app.contracts.assessment import TripAssessmentRequest
    from backend.app.services.assessment_service import AssessmentService
    from backend.app.contracts.chat import ChatResponse, Recommendation, RecommendationStatus, Confidence, ConfidenceLevel
    from datetime import datetime, timezone, timedelta

    # 1. Create a baseline assessment
    now_utc = datetime.now(timezone.utc)
    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        departure_time=now_utc.isoformat(),
        return_time=(now_utc + timedelta(hours=6)).isoformat(),
        data_mode="SNAPSHOT",
    )
    assessment = AssessmentService.assess_trip(req)
    retain_assessment(assessment)

    # 2. Verify _build_retained_evidence
    evidence_items = _build_retained_evidence(assessment)
    assert len(evidence_items) > 0

    source_ids = {e.evidence_id for e in evidence_items if e.data_mode != "CALCULATED"}
    calculated_items = [e for e in evidence_items if e.data_mode == "CALCULATED"]

    # Derived items must be CALCULATED, have observed_time=None, and lineage_id must strictly point to source_ids or be None
    assert len(calculated_items) > 0
    for calc in calculated_items:
        assert calc.data_mode == "CALCULATED"
        assert calc.observed_time is None
        assert "calculation" in " ".join(calc.quality_flags).lower() or "evaluation" in " ".join(calc.quality_flags).lower()
        if calc.lineage_id is not None:
            assert calc.lineage_id in source_ids, f"Lineage ID {calc.lineage_id} does not resolve to an evidence item in the bundle!"
            assert "retained_source" not in calc.lineage_id, "Manufactured fallback ID must not be generated"

    # 3. Verify text and voice response projection consistency
    mock_chat_response = ChatResponse(
        run_id="run-text-1",
        conversation_id="conv-1",
        answer="Conditions advisory",
        intent="SAFETY",
        recommendation=Recommendation(
            status=RecommendationStatus.GO,
            summary="Safe to go",
            next_action="Sail safely",
        ),
        confidence=Confidence(level=ConfidenceLevel.MEDIUM, reasons=["Scenario evaluation"]),
    )

    profile = {
        "baseline_assessment_id": assessment.assessment_id,
        "evidence_bundle_id": assessment.evidence_bundle_id,
        "data_mode": "SNAPSHOT",
    }

    # Bind text response
    text_resp = bind_mission_response(mock_chat_response, profile, "is it safe?")
    assert text_resp.evidence_bundle_id == assessment.evidence_bundle_id
    assert len(text_resp.evidence) == len(evidence_items)

    # Bind voice response with identical profile
    mock_voice_response = ChatResponse(
        run_id="run-voice-1",
        conversation_id="conv-1",
        answer="Conditions advisory voice",
        intent="SAFETY",
        recommendation=Recommendation(
            status=RecommendationStatus.GO,
            summary="Safe to go",
            next_action="Sail safely",
        ),
        confidence=Confidence(level=ConfidenceLevel.MEDIUM, reasons=["Scenario evaluation"]),
    )
    voice_resp = bind_mission_response(mock_voice_response, profile, "is it safe?")
    assert voice_resp.evidence_bundle_id == assessment.evidence_bundle_id
    assert len(voice_resp.evidence) == len(text_resp.evidence)

    # IDs and lineage are identical across text and voice
    text_ev_ids = [e.evidence_id for e in text_resp.evidence]
    voice_ev_ids = [e.evidence_id for e in voice_resp.evidence]
    assert text_ev_ids == voice_ev_ids


def test_partial_provenance_preserves_all_available_sources():
    """Verify that if provenance list only contains marine, weather and hazard payloads are still preserved independently."""
    from backend.app.contracts.chat import DataProvenance, EvidenceItem, UserContext, RecommendationStatus
    from backend.app.contracts.observation import ObservationBundle
    from backend.app.contracts.assessment import TripAssessmentResponse
    from backend.app.agents.integrations.dev2 import WeatherConditionsPayload, HazardBulletinPayload
    from backend.app.services.mission_conversation import _build_retained_evidence

    prov_marine = DataProvenance(
        provider_name="INCOIS",
        source_name="INCOIS Ocean State Forecast",
        valid_from="2026-10-04T00:00:00Z",
        valid_to="2026-10-04T12:00:00Z",
        data_mode="LIVE",
        quality_flags=["official_source"],
    )

    weather_payload = WeatherConditionsPayload(
        source_name="IMD Coastal AWS",
        observed_at="2026-10-04T06:00:00Z",
        valid_to="2026-10-04T12:00:00Z",
        harbor="Ratnagiri",
    )

    hazard_payload = HazardBulletinPayload(
        source_name="IMD Cyclone Warning Division",
        severity="NORMAL",
        valid_from="2026-10-04T00:00:00Z",
        valid_to="2026-10-04T12:00:00Z",
        harbor="Ratnagiri",
    )

    bundle = ObservationBundle(
        weather=weather_payload,
        hazard=hazard_payload,
        provenance=[prov_marine],
        data_mode="LIVE",
    )

    response = TripAssessmentResponse(
        assessment_id="asm-partial-prov-01",
        evidence_bundle_id="bundle-partial-01",
        assessed_at="2026-10-04T06:00:00Z",
        trip_context=UserContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat"),
        decision=RecommendationStatus.GO,
        conditions=bundle,
        evidence=[],
    )

    evidence_items = _build_retained_evidence(response)
    source_names = [e.source_name for e in evidence_items]

    # All three domains must be preserved independently!
    assert any("ocean state forecast" in s.lower() for s in source_names)
    assert any("coastal aws" in s.lower() for s in source_names)
    assert any("cyclone warning" in s.lower() for s in source_names)


def test_missing_provenance_does_not_manufacture_provider_names_or_retrieval_timestamps():
    """Verify missing provider name, retrieved timestamp, and coverage are not manufactured."""
    from backend.app.contracts.chat import UserContext, RecommendationStatus
    from backend.app.contracts.observation import ObservationBundle
    from backend.app.contracts.assessment import TripAssessmentResponse
    from backend.app.agents.integrations.dev2 import MarineConditionsPayload
    from backend.app.services.mission_conversation import _build_retained_evidence

    # Marine payload with no provider_name, no retrieved_at, and no harbor/coverage specified
    marine_payload = MarineConditionsPayload(
        source_name="Custom Wave Gauge Telemetry",
        observed_at="2026-10-04T06:00:00Z",
        valid_to="2026-10-04T12:00:00Z",
    )

    bundle = ObservationBundle(
        marine=marine_payload,
        data_mode="LIVE",
    )

    response = TripAssessmentResponse(
        assessment_id="asm-no-manufacture-01",
        evidence_bundle_id="bundle-no-manufacture-01",
        assessed_at="2026-10-04T06:00:00Z",
        trip_context=UserContext(origin_harbor="Malvan", craft_profile="motorized_boat"),
        decision=RecommendationStatus.GO,
        conditions=bundle,
        evidence=[],
    )

    evidence_items = _build_retained_evidence(response)
    marine_ev = next(e for e in evidence_items if "gauge" in e.source_name.lower())

    # Provider name must NOT be defaulted to INCOIS, IMD, or Open-Meteo
    assert marine_ev.provider_name is None
    # Retrieved at must NOT be defaulted to current timestamp
    assert marine_ev.retrieved_at is None
    # Coverage must NOT be substituted with requested harbor "Malvan"
    assert marine_ev.coverage is None or marine_ev.coverage != "Malvan Marine Waters"


def test_absent_hazard_evidence_does_not_create_false_negative_hazard_calculation():
    """Verify that when hazard evaluation was absent, a calculated hazard_active=False is not created."""
    from backend.app.contracts.chat import UserContext, RecommendationStatus
    from backend.app.contracts.observation import ObservationBundle
    from backend.app.contracts.assessment import TripAssessmentResponse
    from backend.app.services.mission_conversation import _build_retained_evidence

    # ObservationBundle with missing hazard (e.g. Incomplete data)
    bundle = ObservationBundle(
        marine=None,
        weather=None,
        hazard=None,
        data_mode="UNAVAILABLE",
    )

    # Incomplete assessment where hazard evaluation is absent
    response = TripAssessmentResponse(
        assessment_id="asm-absent-hazard-01",
        evidence_bundle_id="bundle-absent-hazard-01",
        assessed_at="2026-10-04T06:00:00Z",
        trip_context=UserContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat"),
        decision=RecommendationStatus.UNKNOWN,
        conditions=bundle,
        evidence=[{"issue": "Incomplete data", "details": "Critical components failed to load."}],
    )

    evidence_items = _build_retained_evidence(response)

    # Must NOT contain a calculated evidence item asserting hazard_active=False or cyclone_warning_active=False
    for ev in evidence_items:
        if ev.data_mode == "CALCULATED":
            assert ev.metric_name not in ("cyclone_warning_active", "hazard_active", "severe_weather_warning")
            assert ev.metric_value is not False


def test_derived_checks_match_stored_assessment_threshold_results():
    """Verify calculations match stored assessment threshold results and link strictly to supporting sources."""
    from backend.app.contracts.chat import UserContext, RecommendationStatus, ThresholdComparison
    from backend.app.contracts.observation import ObservationBundle
    from backend.app.contracts.assessment import TripAssessmentResponse
    from backend.app.agents.integrations.dev2 import MarineConditionsPayload
    from backend.app.services.mission_conversation import _build_retained_evidence

    marine_payload = MarineConditionsPayload(
        source_name="INCOIS OSF",
        provider_name="INCOIS",
        observed_at="2026-10-04T06:00:00Z",
        valid_to="2026-10-04T12:00:00Z",
    )

    bundle = ObservationBundle(
        marine=marine_payload,
        weather=None,
        hazard=None,
        data_mode="SNAPSHOT",
    )

    # Stored threshold comparison for wave height
    thresh = ThresholdComparison(
        metric_name="significant_wave_height",
        observed_value=1.8,
        threshold_value=2.0,
        operator="<=",
        unit="meters",
        exceeded=False,
        impact="SAFE",
        description="Significant wave height 1.8m within vessel limit 2.0m",
    )

    response = TripAssessmentResponse(
        assessment_id="asm-thresh-01",
        evidence_bundle_id="bundle-thresh-01",
        assessed_at="2026-10-04T06:00:00Z",
        trip_context=UserContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat"),
        decision=RecommendationStatus.GO,
        conditions=bundle,
        evidence=[thresh.model_dump()],
    )

    evidence_items = _build_retained_evidence(response)
    calc_item = next(e for e in evidence_items if e.data_mode == "CALCULATED")

    assert calc_item.metric_name == "significant_wave_height"
    assert calc_item.metric_value == 1.8
    assert calc_item.metric_unit == "meters"
    assert calc_item.observed_time is None
    # Links strictly to the marine source in the bundle
    assert calc_item.lineage_id == "bundle-thresh-01:source:marine"


def test_bundle_source_ids_are_unique_and_links_resolve_correctly():
    """Verify all evidence IDs within a bundle are unique and lineage IDs resolve to an exact source."""
    from backend.app.services.assessment_service import AssessmentService
    from backend.app.contracts.assessment import TripAssessmentRequest
    from backend.app.services.mission_conversation import _build_retained_evidence
    from datetime import datetime, timezone, timedelta

    now_utc = datetime.now(timezone.utc)
    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        departure_time=now_utc.isoformat(),
        return_time=(now_utc + timedelta(hours=6)).isoformat(),
        data_mode="SNAPSHOT",
    )
    assessment = AssessmentService.assess_trip(req)
    evidence_items = _build_retained_evidence(assessment)

    # Unique evidence IDs
    ev_ids = [e.evidence_id for e in evidence_items]
    assert len(ev_ids) == len(set(ev_ids)), f"Duplicate evidence IDs found: {ev_ids}"

    source_ids = {e.evidence_id for e in evidence_items if e.data_mode != "CALCULATED"}
    for e in evidence_items:
        if e.data_mode == "CALCULATED" and e.lineage_id is not None:
            assert e.lineage_id in source_ids, f"Lineage ID {e.lineage_id} does not resolve to an evidence item in the bundle!"


def test_pfz_high_requires_explicit_applicability_and_verification():
    """Verify PFZ HIGH requires certified coverage, canonical official origin, and non-contradictory flags."""
    from backend.app.services.mission_conversation import _derive_pfz_confidence
    from backend.app.contracts.chat import UserContext, RecommendationStatus, ConfidenceLevel
    from backend.app.contracts.observation import ObservationBundle
    from backend.app.contracts.assessment import TripAssessmentResponse

    departure = "2026-10-04T06:00:00Z"
    candidate = [{
        "candidate_id": "MH-PFZ-TEST",
        "distance_nautical_miles": 14.5,
        "bearing_degrees": 245,
        "valid_from": "2026-10-04T00:00:00Z",
        "valid_to": "2026-10-04T18:00:00Z",
    }]

    asm = TripAssessmentResponse(
        assessment_id="asm-pfz-gate",
        evidence_bundle_id="b-pfz-gate",
        assessed_at="2026-10-04T05:00:00Z",
        trip_context=UserContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat"),
        decision=RecommendationStatus.GO,
        conditions=ObservationBundle(data_mode="LIVE", provenance_mode="LIVE"),
        pfz_candidates=candidate,
        evidence=[],
    )

    # 1. Unknown coverage cannot silently pass as certified -> MEDIUM
    b_unknown_cov = {
        "pfz": {
            "valid_from": "2026-10-04T00:00:00Z",
            "valid_to": "2026-10-04T18:00:00Z",
            "source_name": "Official INCOIS PFZ Bulletin",
            "data_mode": "LIVE",
            "quality_flags": ["official_source", "verified_live"],
            "freshness_flags": {"is_official": True, "verified_live": True},
            # coverage_status is missing / unknown
        }
    }
    conf = _derive_pfz_confidence(asm, b_unknown_cov, departure, "en")
    assert conf.level == ConfidenceLevel.MEDIUM
    assert "uncertified" in " ".join(conf.reasons).lower() or "unverified geographic coverage" in " ".join(conf.reasons).lower()

    # 2. Contradictory flags (verified_live but also degraded/fallback) -> LOW
    b_contradictory = {
        "pfz": {
            "valid_from": "2026-10-04T00:00:00Z",
            "valid_to": "2026-10-04T18:00:00Z",
            "source_name": "INCOIS PFZ Bulletin",
            "data_mode": "LIVE",
            "quality_flags": ["official_source", "verified_live", "degraded"],
            "freshness_flags": {"is_official": True, "verified_live": True, "coverage_status": "CERTIFIED"},
        }
    }
    conf = _derive_pfz_confidence(asm, b_contradictory, departure, "en")
    assert conf.level == ConfidenceLevel.LOW
    assert "contradictory" in " ".join(conf.reasons).lower()

    # 3. Source-name-only claim ("INCOIS" in source_name but no canonical official provenance) -> MEDIUM
    b_source_name_only = {
        "pfz": {
            "valid_from": "2026-10-04T00:00:00Z",
            "valid_to": "2026-10-04T18:00:00Z",
            "source_name": "INCOIS Commercial Relay Feed",
            "data_mode": "LIVE",
            "quality_flags": ["verified_live"],
            "freshness_flags": {"verified_live": True, "coverage_status": "CERTIFIED"},
            # is_official and official_source are absent!
        }
    }
    conf = _derive_pfz_confidence(asm, b_source_name_only, departure, "en")
    assert conf.level == ConfidenceLevel.MEDIUM
    assert "canonical verified official" in " ".join(conf.reasons).lower() or "unverified" in " ".join(conf.reasons).lower()

    # 4. Valid verified official bulletin with certified coverage, but missing oceanographic thermal/chlorophyll inputs -> HIGH, but describes advisory geometry accurately without manufacturing thermal front claim
    b_verified_no_sst = {
        "pfz": {
            "valid_from": "2026-10-04T00:00:00Z",
            "valid_to": "2026-10-04T18:00:00Z",
            "source_name": "INCOIS PFZ Official Bulletin",
            "data_mode": "LIVE",
            "quality_flags": ["official_source", "verified_live", "certified_coverage"],
            "freshness_flags": {"is_official": True, "verified_live": True, "coverage_status": "CERTIFIED"},
        }
    }
    conf = _derive_pfz_confidence(asm, b_verified_no_sst, departure, "en")
    assert conf.level == ConfidenceLevel.HIGH
    reasons_text = " ".join(conf.reasons)
    assert "direct oceanographic thermal front" not in reasons_text.lower(), "Must not claim thermal fronts when not established"
    assert "advisory candidate coordinates and bulletin validity verified" in reasons_text.lower()
