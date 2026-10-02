"""Integration tests for the three remaining integration inconsistencies:
1. Grounded INFORMATIONAL PFZ responses with retained GO/NO_GO baselines.
2. Safety confidence based on authentic source verification (verified official vs fallback/unverified).
"""

from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    WeatherConditionsPayload,
)
from backend.app.agents.tools import tool_registry
from backend.app.agents.integrations.mocks import register_m2_contract_mocks
from backend.app.connectors.manager import ConnectorManager
from backend.app.contracts.assessment import TripAssessmentRequest
from backend.app.core.config import settings
from backend.app.main import create_app
from backend.app.services.assessment_service import AssessmentService
from backend.app.services.mission_evidence import retain_assessment


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


@pytest.fixture(autouse=True)
def restore_registry_and_settings(monkeypatch):
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


# ===========================================================================
# 1. KEEP PFZ RESPONSES INFORMATIONAL
# ===========================================================================

def test_chat_pfz_with_retained_go_baseline(client, monkeypatch):
    """PFZ query with retained GO baseline remains INFORMATIONAL, grounded in evidence, and does not grant clearance."""
    monkeypatch.setattr(settings, "DATA_MODE", "DEMO")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    # Assess baseline trip with calm parameters -> GO
    req_go = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        vessel_size="medium",
        departure_time="2026-09-28T06:00:00Z",
        return_time="2026-09-28T18:00:00Z",
        language_preference="en",
        data_mode="DEMO",
    )
    assessment_go = AssessmentService.assess_trip(req_go)
    assert assessment_go.decision.value == "GO"
    assert len(assessment_go.pfz_candidates) > 0
    retain_assessment(assessment_go)

    res = client.post(
        "/api/v1/chat",
        json={
            "message": "Where is the nearest PFZ?",
            "data_mode": "DEMO",
            "user_context": {"language_preference": "en"},
            "baseline_assessment_id": assessment_go.assessment_id,
            "evidence_bundle_id": assessment_go.evidence_bundle_id,
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()

    # 1. PFZ recommendation remains INFORMATIONAL
    assert data["intent"] == "PFZ"
    assert data["recommendation"]["status"] == "INFORMATIONAL"
    assert data["decision_object"]["decision"] == "INFORMATIONAL"

    # 2. Candidate information remains grounded in retained evidence
    top_candidate = assessment_go.pfz_candidates[0]
    assert top_candidate["candidate_id"] in data["answer"]
    assert f"{top_candidate['distance_nautical_miles']:.1f}" in data["answer"] or str(top_candidate["distance_nautical_miles"]) in data["answer"]
    assert any(top_candidate["candidate_id"] in factor for factor in data["recommendation"]["decisive_factors"])

    # 3. The separate voyage assessment retains its original decision (GO)
    assert data["mission_assessment"]["assessment_id"] == assessment_go.assessment_id
    assert data["mission_assessment"]["decision"] == "GO"

    # 4. The answer does not grant passage or departure clearance
    lower_answer = data["answer"].lower()
    assert "clear for departure" not in lower_answer
    assert "proceed with planned voyage" not in lower_answer
    assert "proceed to sea" not in lower_answer
    assert "does not certify passage or departure" in lower_answer or "clearance must be independently assessed" in lower_answer


def test_chat_pfz_with_retained_nogo_baseline(client, monkeypatch):
    """PFZ query with retained NO_GO baseline remains INFORMATIONAL, with original NO_GO retained in mission_assessment."""
    monkeypatch.setattr(settings, "DATA_MODE", "DEMO")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    # Assess baseline trip with traditional craft in high wave scenario or small craft -> NO_GO
    req_nogo = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        craft_profile="traditional_non_motorized",
        vessel_size="small",
        departure_time="2026-10-03T06:00:00Z",
        return_time="2026-10-03T18:00:00Z",
        language_preference="en",
        data_mode="DEMO",
    )
    assessment_nogo = AssessmentService.assess_trip(req_nogo)
    assert assessment_nogo.decision.value == "NO_GO"
    retain_assessment(assessment_nogo)

    res = client.post(
        "/api/v1/chat",
        json={
            "message": "Where are the potential fishing zones near Ratnagiri?",
            "data_mode": "DEMO",
            "user_context": {"language_preference": "en"},
            "baseline_assessment_id": assessment_nogo.assessment_id,
            "evidence_bundle_id": assessment_nogo.evidence_bundle_id,
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()

    # 1. PFZ recommendation remains INFORMATIONAL (not NO_GO)
    assert data["intent"] == "PFZ"
    assert data["recommendation"]["status"] == "INFORMATIONAL"
    assert data["decision_object"]["decision"] == "INFORMATIONAL"

    # 2. Separate voyage assessment retains original NO_GO
    assert data["mission_assessment"]["assessment_id"] == assessment_nogo.assessment_id
    assert data["mission_assessment"]["decision"] == "NO_GO"

    # 3. Answer does not grant departure clearance
    lower_answer = data["answer"].lower()
    assert "clear for departure" not in lower_answer
    assert "clearance must be independently assessed" in lower_answer or "does not certify passage or departure" in lower_answer


# ===========================================================================
# 2. BASE SAFETY CONFIDENCE ON ACTUAL SOURCE VERIFICATION
# ===========================================================================

def test_endpoint_verified_official_severe_hazard_plus_demo_auxiliary_retains_no_go(client, monkeypatch):
    """Valid verified official severe hazard + demo auxiliary telemetry retains justified NO_GO with HIGH confidence."""
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
    assert any("verified official observations" in r.lower() for r in data["confidence"]["reasons"])


def test_endpoint_unverified_fallback_severe_hazard_no_fabricated_high_confidence(client, monkeypatch):
    """Unverified/fallback severe hazard does not acquire fabricated official verification or HIGH confidence."""
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
        # Hazard bulletin with unverified / fallback provenance metadata
        return HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=True,
            squall_alert=True,
            severity="WARNING",
            headline="Unverified Community Squall Report.",
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="Coastal Fallback Advisory (UNVERIFIED)",
            freshness_flags={"data_mode": "UNVERIFIED", "coverage_status": "UNVERIFIED", "is_fallback": True},
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

    # Restrictive decision is preserved (severe hazard requires NO_GO)
    assert data["recommendation"]["status"] == "NO_GO"

    # Must NOT acquire HIGH confidence or claim verified official observations
    assert data["confidence"]["level"] != "HIGH"
    assert data["confidence"]["level"] in ("MEDIUM", "LOW")
    reasons = " ".join(data["confidence"]["reasons"]).lower()
    assert "verified official observations" not in reasons


def test_endpoint_fallback_marine_above_threshold_honest_confidence_and_explanation(client, monkeypatch):
    """Fallback marine above restrictive threshold receives honest MEDIUM confidence and fallback explanation."""
    monkeypatch.setattr(settings, "DATA_MODE", "HYBRID")
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")

    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    future_iso = (now_utc + timedelta(hours=6)).isoformat()

    def mock_marine(self, ctx):
        # Fallback marine model with wave height 2.5m (exceeds 1.5m limit for motorized boat)
        return MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=3.0,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="Open-Meteo Marine API Fallback",
            freshness_flags={
                "data_mode": "HYBRID",
                "fallback_model": True,
                "coverage_status": "FALLBACK_MODEL",
                "quality_flags": ["fallback_model", "FALLBACK"],
            },
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
            headline="No active severe weather warnings.",
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
            "message": "Can I depart from Ratnagiri now?",
            "user_context": {"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat", "departure_time": now_iso},
        },
    )
    assert response.status_code == 200
    data = response.json()

    # Restrictive decision preserved
    assert data["recommendation"]["status"] == "NO_GO"

    # Honest confidence (not HIGH)
    assert data["confidence"]["level"] == "MEDIUM"

    # Honest explanation: notes fallback model forecast observations
    reasons = " ".join(data["confidence"]["reasons"]).lower()
    assert "fallback model" in reasons or "fallback" in reasons
    assert "verified official observations" not in reasons


def test_endpoint_fallback_wind_above_threshold_honest_confidence_and_explanation(client, monkeypatch):
    """Fallback wind above restrictive threshold receives honest MEDIUM confidence and fallback explanation."""
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
            source_name="INCOIS Ocean State Forecast Live",
            freshness_flags={"data_mode": "LIVE", "verified_live": True, "coverage_status": "OFFICIAL_STATION"},
        )

    def mock_weather(self, ctx):
        # Fallback wind model with 28.0 knots (above 20 knot limit for motorized boat)
        return WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=28.0,
            observed_at=now_iso,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="Open-Meteo GFS Fallback",
            freshness_flags={
                "data_mode": "HYBRID",
                "fallback_model": True,
                "coverage_status": "FALLBACK_MODEL",
                "quality_flags": ["fallback_model", "FALLBACK"],
            },
        )

    def mock_hazard(self, ctx):
        return HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            severity="NORMAL",
            headline="No active severe weather warnings.",
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
            "message": "Can I depart from Ratnagiri now?",
            "user_context": {"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat", "departure_time": now_iso},
        },
    )
    assert response.status_code == 200
    data = response.json()

    # Restrictive decision preserved
    assert data["recommendation"]["status"] == "NO_GO"

    # Honest confidence (MEDIUM, not HIGH)
    assert data["confidence"]["level"] == "MEDIUM"

    # Honest explanation
    reasons = " ".join(data["confidence"]["reasons"]).lower()
    assert "fallback" in reasons
    assert "verified official observations" not in reasons
