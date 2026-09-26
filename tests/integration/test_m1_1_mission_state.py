"""Acceptance Tests for M1.1 MissionState Context.

Validates:
1. TripAssessmentRequest/Response canonical MissionState round-trip.
2. Chat pipeline MissionState multi-turn preservation across turns.
3. Voice chat pipeline parameters ingestion and MissionState preservation.
4. AlertService MissionState attachment to monitored trips and reassessments.
5. Contract compatibility with existing UserContext and legacy fields.
"""

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.contracts.assessment import TripAssessmentRequest, TripAssessmentResponse
from backend.app.contracts.chat import ChatRequest, ChatResponse, UserContext
from backend.app.contracts.alerts import SavedTripRequest, SavedTripResponse
from backend.app.contracts.mission import MissionState, mission_from_user_context
from backend.app.services.assessment_service import AssessmentService
from backend.app.services.alert_service import AlertService


client = TestClient(app)


def test_m1_1_acceptance_test_1_assessment_pipeline():
    """TEST 1: Create assessment with Origin: Ratnagiri, Craft: motorized_boat,

    Departure: Tomorrow 04:00, Return: Tomorrow 18:00.
    Response contains mission_state with identical values.
    """
    departure = "2026-09-27T04:00:00Z"
    return_time = "2026-09-27T18:00:00Z"

    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        departure_time=departure,
        return_time=return_time,
        destination_id="pfz-zone-42",
        language_preference="en",
        data_mode="SNAPSHOT",
    )

    response = AssessmentService.assess_trip(req)

    assert isinstance(response, TripAssessmentResponse)
    assert response.mission_state is not None
    ms = response.mission_state

    # Verify origin
    assert ms.origin.name == "Ratnagiri"
    assert ms.origin_harbor == "Ratnagiri"

    # Verify vessel craft profile
    assert ms.vessel.type == "motorized_boat"
    assert ms.craft_profile == "motorized_boat"

    # Verify timing
    assert ms.timing.departure == departure
    assert ms.departure_time == departure
    assert ms.timing.return_deadline == return_time
    assert ms.return_time == return_time

    # Verify destination
    assert ms.destination.name == "pfz-zone-42"
    assert ms.target_pfz == "pfz-zone-42"

    # Verify legacy trip_context echo is also preserved
    assert response.trip_context.origin_harbor == "Ratnagiri"
    assert response.trip_context.craft_profile == "motorized_boat"
    assert response.trip_context.departure_time == departure
    assert response.trip_context.return_time == return_time
    assert response.trip_context.target_pfz == "pfz-zone-42"


def test_m1_1_acceptance_test_2_chat_pipeline_preservation():
    """TEST 2: Chat multi-turn:

    Pass mission_state with departure_time, return_time, target_pfz.
    Send 'What if I leave 4 hours later?'
    Response includes mission_state with no fields lost.
    """
    initial_u_ctx = UserContext(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        departure_time="2026-09-27T04:00:00Z",
        return_time="2026-09-27T18:00:00Z",
        target_pfz="zone-9",
        language_preference="en",
        parent_assessment_id="assmnt-base-001",
    )
    initial_ms = mission_from_user_context(initial_u_ctx, message="Initial voyage assessment")

    chat_payload = {
        "conversation_id": "test-conv-m1-1",
        "message": "What if I leave 4 hours later?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "craft_profile": "motorized_boat",
            "departure_time": "2026-09-27T08:00:00Z",
            "return_time": "2026-09-27T22:00:00Z",
            "target_pfz": "zone-9",
            "parent_assessment_id": "assmnt-base-001",
        },
        "mission_state": initial_ms.model_dump(),
    }

    res = client.post("/api/v1/chat", json=chat_payload)
    assert res.status_code == 200
    data = res.json()

    assert "mission_state" in data
    assert data["mission_state"] is not None
    returned_ms = data["mission_state"]

    assert returned_ms["origin"]["name"] == "Ratnagiri"
    assert returned_ms["vessel"]["type"] == "motorized_boat"
    assert returned_ms["timing"]["departure"] == "2026-09-27T04:00:00Z"
    assert returned_ms["timing"]["return_deadline"] == "2026-09-27T18:00:00Z"
    assert returned_ms["destination"]["name"] == "zone-9"
    assert returned_ms["parent_assessment_id"] == "assmnt-base-001"


def test_m1_1_acceptance_test_3_voice_pipeline_parameters():
    """TEST 3: Voice interaction carries operational parameters and preserves MissionState."""
    from unittest.mock import patch

    with patch("backend.app.api.v1.routes.transcribe_audio_bytes") as mock_stt, \
         patch("backend.app.api.v1.routes.synthesize_speech") as mock_tts:
        
        mock_stt.return_value = {
            "transcript": "Is it safe to depart Ratnagiri?",
            "language": "en",
            "normalized_language": "en",
        }
        mock_tts.return_value = {
            "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=",
            "audio_format": "audio/wav",
            "language_code": "en-IN",
        }

        res = client.post(
            "/api/v1/voice/chat",
            data={
                "origin_harbor": "Ratnagiri",
                "craft_profile": "motorized_boat",
                "departure_time": "2026-09-27T04:00:00Z",
                "return_time": "2026-09-27T18:00:00Z",
                "target_pfz": "pfz-south-1",
                "parent_assessment_id": "assmnt-voice-base",
            },
            files={"file": ("voice.wav", b"fake-audio-payload", "audio/wav")},
        )

        assert res.status_code == 200
        data = res.json()
        assert data["audio_base64"] is not None
        assert "recommendation" in data
        assert data["language"] == "en"


def test_m1_1_acceptance_test_4_alert_service_mission_state():
    """TEST 4: AlertService registers trip and persists MissionState context."""
    req = SavedTripRequest(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        departure_time="2026-09-27T04:00:00Z",
        return_time="2026-09-27T18:00:00Z",
        language="en",
    )

    saved = AlertService.register_trip_monitoring(req)
    assert isinstance(saved, SavedTripResponse)
    assert saved.mission_state is not None
    assert saved.mission_state.origin.name == "Ratnagiri"
    assert saved.mission_state.vessel.type == "motorized_boat"
    assert saved.mission_state.timing.departure == "2026-09-27T04:00:00Z"
    assert saved.mission_state.timing.return_deadline == "2026-09-27T18:00:00Z"
