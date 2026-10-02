"""Mission comparison regressions: frozen inputs, validity, and explicit refresh."""
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.contracts.assessment import TripAssessmentRequest, TripSimulationRequest
from backend.app.services.assessment_service import AssessmentService
from backend.app.services.data_service import DataService
from backend.app.services.mission_evidence import get_assessment
from backend.app.domain.synthetic.generator import current_demo_reference


@pytest.fixture
def baseline(monkeypatch):
    monkeypatch.setattr("backend.app.services.assessment_service.DB_AVAILABLE", False)
    t = current_demo_reference() + timedelta(hours=2)
    req = TripAssessmentRequest(origin_harbor="Ratnagiri", data_mode="DEMO",
        departure_time=t.isoformat(), return_time=(t + timedelta(hours=12)).isoformat())
    return req, AssessmentService.assess_trip(req)


def test_comparison_never_refetches_retained_inputs(baseline, monkeypatch):
    from backend.app.api.v1.assessments import compare_trip
    req, a = baseline
    def forbidden(*args, **kwargs):
        raise AssertionError("Comparison attempted provider refetch")
    for method in ("get_marine_conditions", "get_weather_conditions", "get_hazard_bulletin", "get_pfz_raw_advisories"):
        monkeypatch.setattr(DataService, method, forbidden)
    comparison = compare_trip(TripSimulationRequest(baseline=req, simulated=req, baseline_assessment_id=a.assessment_id))
    assert comparison.baseline.assessment_id == a.assessment_id
    assert comparison.simulated.evidence_bundle_id == a.evidence_bundle_id
    assert comparison.simulated.decision == a.decision
    assert not comparison.delta.decision_changed
    assert comparison.simulated.mission_state.mission_id == a.mission_state.mission_id
    assert comparison.simulated.trip_context.return_time == req.return_time


def test_retained_assessment_cannot_be_mutated(baseline):
    _, a = baseline
    copy = get_assessment(a.assessment_id)
    copy.conditions.hourly_forecast.clear()
    copy.brief.negative_factors.clear()
    assert get_assessment(a.assessment_id).conditions.hourly_forecast
    assert get_assessment(a.assessment_id).brief.negative_factors


@pytest.mark.parametrize("edit", [{"origin_harbor": "Malvan"}, {"evidence_bundle_id": "wrong-bundle"}, {"data_mode": "LIVE"}])
def test_comparison_rejects_unrelated_inputs(baseline, edit):
    req, a = baseline
    response = TestClient(app).post("/api/v1/trip-assessments/simulate", json={
        "baseline": req.model_dump(), "simulated": req.model_copy(update=edit).model_dump(),
        "baseline_assessment_id": a.assessment_id})
    assert response.status_code in (409, 422)


def test_missing_baseline_is_explicit_conflict(baseline):
    req, _ = baseline
    response = TestClient(app).post("/api/v1/trip-assessments/simulate", json={
        "baseline": req.model_dump(), "simulated": req.model_dump(), "baseline_assessment_id": "evicted"})
    assert response.status_code == 409


def test_delayed_departure_preserves_restriction_and_duration(baseline):
    from backend.app.api.v1.assessments import compare_trip
    from backend.app.services.mission_conversation import proposed_request
    req, a = baseline
    proposed = proposed_request(a, "What if I leave 4 hours later?")
    comparison = compare_trip(TripSimulationRequest(baseline=req, simulated=proposed, baseline_assessment_id=a.assessment_id))
    assert comparison.simulated.decision.value == "NO_GO"
    assert comparison.simulated.evidence_bundle_id == a.evidence_bundle_id
    assert comparison.delta.temporal_changes["departure_after"] == proposed.departure_time
    assert all(not r["departure_supported"] for r in comparison.simulated.route_candidates)


def test_clock_edit_uses_mission_date_and_indian_timezone(baseline):
    from datetime import datetime
    from backend.app.services.mission_conversation import proposed_request
    req, a = baseline
    proposed = proposed_request(a, "What if I leave at 11 AM?")
    assert proposed.departure_time.endswith("+05:30")
    assert datetime.fromisoformat(proposed.departure_time).hour == 11
    assert datetime.fromisoformat(proposed.return_time) - datetime.fromisoformat(proposed.departure_time) == timedelta(hours=12)
    assert proposed_request(a, "What if I leave at 29:00?") is None


def test_outside_frozen_forecast_cannot_grant_clearance(baseline):
    from backend.app.api.v1.assessments import compare_trip
    from backend.app.services.mission_conversation import proposed_request
    req, a = baseline
    comparison = compare_trip(TripSimulationRequest(baseline=req, simulated=proposed_request(a, "What if I leave 200 hours later?"), baseline_assessment_id=a.assessment_id))
    assert comparison.simulated.decision.value == "UNKNOWN"


def test_route_forecast_accepts_normalized_fields_and_detects_partial_coverage():
    from backend.app.domain.trajectory_exposure import TrajectoryExposureEngine
    t = current_demo_reference()
    engine = TrajectoryExposureEngine()
    row = {"observation_time": t.isoformat(), "significant_wave_height_m": 2.3, "wind_speed_knots": 22}
    result = engine.evaluate_trajectory([[73.28, 16.99]], departure_time=t, hourly_forecast=[row])
    assert result.waypoint_timeline[0].wave_height_m == 2.3
    assert result.waypoint_timeline[0].wind_knots == 22
    long_route = engine.evaluate_trajectory([[73.28, 16.99], [70, 16]], departure_time=t, hourly_forecast=[row])
    assert long_route.missing_data_state


def test_refresh_is_distinct_new_evidence_operation(baseline, monkeypatch):
    from backend.app.api.v1.assessments import refresh_assessment
    req, a = baseline
    old = DataService.get_weather_conditions
    def changed(self, context):
        payload = old(self, context)
        payload.wind_speed_knots = 35
        payload.wind_gust_knots = 45
        return payload
    monkeypatch.setattr(DataService, "get_weather_conditions", changed)
    refreshed = refresh_assessment(a.assessment_id)
    assert refreshed.simulated.evidence_bundle_id != a.evidence_bundle_id
    assert any("wind" in f for f in refreshed.delta.changed_factors)
    assert get_assessment(a.assessment_id).conditions.weather.wind_speed_knots != 35


def test_future_severe_warning_during_trip_is_not_ignored():
    from backend.app.domain.risk_engine import DeterministicRiskEngine
    from backend.app.agents.integrations.contracts import ToolInvocationContext
    from backend.app.agents.integrations.dev2 import MarineConditionsPayload, WeatherConditionsPayload, HazardBulletinPayload
    t = current_demo_reference()
    marine = MarineConditionsPayload(significant_wave_height_m=0.8, observed_at=t.isoformat(), valid_to=(t+timedelta(hours=24)).isoformat(), source_name="DEMO")
    weather = WeatherConditionsPayload(wind_speed_knots=4, observed_at=t.isoformat(), valid_to=(t+timedelta(hours=24)).isoformat(), source_name="DEMO")
    hazard = HazardBulletinPayload(harbor="Ratnagiri", cyclone_warning_active=True, severity="DANGER", valid_from=(t+timedelta(hours=2)).isoformat(), valid_to=(t+timedelta(hours=20)).isoformat(), source_name="DEMO")
    result = DeterministicRiskEngine().evaluate(ToolInvocationContext(origin_harbor="Ratnagiri"), marine=marine, weather=weather, hazard=hazard, data_mode="DEMO", reference_time=t, return_time=(t+timedelta(hours=12)).isoformat())
    assert result.status.value == "NO_GO"


def test_pinned_chat_reuses_mission_and_returns_server_proposal(baseline, monkeypatch):
    from backend.app.core.config import settings
    from backend.app.agents.integrations.mocks import register_m2_contract_mocks
    from backend.app.agents.tools import tool_registry
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")
    req, a = baseline
    client = TestClient(app)
    context = {"language_preference": "en"}
    conversation = None
    try:
        for message, intent in (("Can I go fishing?", "SAFETY"), ("Why?", "ANALYTICAL_EXPLANATION"), ("What if I leave four hours later?", "WHAT_IF"), ("Where is the nearest PFZ?", "PFZ"), ("Where are the nearest hazards?", "HAZARDS"), ("Show me the safest route", "ROUTE")):
            res = client.post("/api/v1/chat", json={"message": message, "conversation_id": conversation,
                "data_mode": "DEMO", "user_context": context,
                "baseline_assessment_id": a.assessment_id, "evidence_bundle_id": a.evidence_bundle_id})
            assert res.status_code == 200, res.text
            data = res.json()
            conversation = data["conversation_id"]
            assert data["intent"] == intent
            assert data["evidence_bundle_id"] == a.evidence_bundle_id
            assert data["mission_assessment"]["assessment_id"] == a.assessment_id
            if intent in ("SAFETY", "ANALYTICAL_EXPLANATION", "ROUTE"):
                assert data["recommendation"]["status"] == a.decision.value
            if intent == "WHAT_IF":
                assert data["decision_delta"]["new_decision"] == "NO_GO"
                assert data["proposed_assessment"]["trip_context"]["departure_time"] != req.departure_time
                assert data["mission_state"]["timing"]["departure"] == a.mission_state.timing.departure
        res = client.post("/api/v1/chat", json={"message": "Why?", "data_mode": "DEMO",
            "user_context": {"language_preference": "hi"}, "baseline_assessment_id": a.assessment_id,
            "evidence_bundle_id": a.evidence_bundle_id})
        assert res.json()["language"] == "hi"
        assert res.json()["recommendation"]["status"] == a.decision.value
    finally:
        register_m2_contract_mocks(tool_registry, override=True)


def test_demo_health_requires_no_database(monkeypatch):
    from backend.app.core.config import settings
    monkeypatch.setattr(settings, "DATA_MODE", "DEMO")
    def forbidden():
        raise AssertionError("DEMO health attempted database access")
    monkeypatch.setattr("backend.app.api.v1.routes.SessionLocal", forbidden)
    data = TestClient(app).get("/api/v1/health").json()
    assert data["status"] == "healthy"
    assert data["database"] == "not_required"


def test_historical_hazard_corpus_is_reused_for_new_window(baseline):
    from backend.app.api.v1.assessments import compare_trip
    from backend.app.services.mission_conversation import proposed_request
    req, a = baseline
    result = compare_trip(TripSimulationRequest(baseline=req, simulated=proposed_request(a, "26 hours later"), baseline_assessment_id=a.assessment_id))
    assert result.simulated.evidence_bundle_id == a.evidence_bundle_id
    assert result.simulated.conditions.hazard.severity == "NORMAL"
    assert result.simulated.conditions.captured_at == a.conditions.captured_at


def test_voice_turn_uses_same_retained_decision_as_text(baseline, monkeypatch):
    from backend.app.core.config import settings
    from backend.app.agents.integrations.mocks import register_m2_contract_mocks
    from backend.app.agents.tools import tool_registry
    monkeypatch.setattr(settings, "LLM_MODE", "deterministic")
    _, a = baseline
    monkeypatch.setattr("backend.app.api.v1.routes.transcribe_audio_bytes", lambda **kwargs:
        {"transcript": "Why?", "language": "hi", "normalized_language": "hi"})
    monkeypatch.setattr("backend.app.api.v1.routes.synthesize_speech", lambda **kwargs:
        {"audio_base64": None, "audio_format": "audio/wav"})
    try:
        response = TestClient(app).post("/api/v1/voice/chat", files={"file": ("voice.wav", b"controlled-test", "audio/wav")},
            data={"baseline_assessment_id": a.assessment_id, "evidence_bundle_id": a.evidence_bundle_id, "data_mode": "DEMO"})
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["language"] == "hi"
        assert data["recommendation"]["status"] == a.decision.value
        assert data["evidence_bundle_id"] == a.evidence_bundle_id
        assert data["mission_state"]["timing"]["departure"] == a.mission_state.timing.departure
        assert data["mission_assessment"]["assessment_id"] == a.assessment_id
    finally:
        register_m2_contract_mocks(tool_registry, override=True)


def test_complete_demo_hazard_corpus_does_not_create_false_expiry(baseline):
    _, a = baseline
    assert a.decision.value == "NO_GO"
    assert a.conditions.hazard.freshness_flags["coverage_end"]
    assert a.brief.confidence == "MEDIUM"
    assert not any("expired" in factor.lower() for factor in a.brief.negative_factors)


def test_structured_cached_provenance_survives_bundle_serialization():
    from backend.app.contracts.observation import ObservationBundle
    cached = {"source_name": "INCOIS", "freshness_flags": {"data_mode": "SAVED"}}
    bundle = ObservationBundle(marine=cached, data_mode="HYBRID")
    assert bundle.provenance_mode == "SAVED"
    assert ObservationBundle(**bundle.model_dump()).provenance_mode == "SAVED"
    assert ObservationBundle(data_mode="LIVE").provenance_mode == "UNAVAILABLE"


def test_retained_pfz_expiry_does_not_create_an_invented_route(baseline, monkeypatch):
    from backend.app.services.mission_evidence import FrozenDataService
    from backend.app.agents.integrations.dev2 import PFZSourceDataPayload
    from backend.app.api.v1.assessments import compare_trip
    req, a = baseline
    monkeypatch.setattr(FrozenDataService, "get_pfz_raw_advisories", lambda *args:
        PFZSourceDataPayload(features=[], bulletin_date=req.departure_time, valid_to=req.departure_time, source_name="Expired retained PFZ (DEMO)"))
    result = compare_trip(TripSimulationRequest(baseline=req, simulated=req, baseline_assessment_id=a.assessment_id))
    assert result.simulated.pfz_candidates == []
    assert result.simulated.route_candidates == []
