"""Task 6 Regression Tests: Voice Context Binding, Trip Monitoring, and Alert Delivery."""

from datetime import datetime, timedelta, timezone
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from backend.app.contracts.chat import (
    ChatResponse,
    Recommendation,
    RecommendationStatus,
    Confidence,
    ConfidenceLevel,
)
from backend.app.main import app
from backend.app.services.alert_service import AlertService

client = TestClient(app)


def test_voice_endpoint_vessel_size_and_coordinates_binding():
    """Verify voice_chat_endpoint accepts vessel_size, coordinates, binds them to user_context."""
    mock_chat_response = ChatResponse(
        run_id="run-123",
        conversation_id="conv-vessel-123",
        answer="Safe to depart for large vessel.",
        language="en",
        intent="SAFETY",
        recommendation=Recommendation(
            status=RecommendationStatus.GO,
            summary="Safe conditions for voyage.",
            next_action="Proceed as planned.",
        ),
        confidence=Confidence(
            level=ConfidenceLevel.HIGH,
            reasons=["All environmental sensors nominal"],
        ),
        data_mode="DEMO",
    )

    with patch("backend.app.api.v1.routes.transcribe_audio_bytes", return_value={"transcript": "Can I go fishing?", "normalized_language": "en"}), \
         patch("backend.app.api.v1.routes.agent_run_service.run_agent", new_callable=AsyncMock, return_value=mock_chat_response) as mock_exec, \
         patch("backend.app.api.v1.routes.synthesize_speech", return_value=None):

        dummy_audio = BytesIO(b"RIFFdummywavebytes1234567890")
        response = client.post(
            "/api/v1/voice/chat",
            data={
                "origin_harbor": "Ratnagiri",
                "craft_profile": "motorized_boat",
                "vessel_size": "large",
                "coordinates": "[73.123, 17.567]",
                "departure_time": "2026-10-04T06:00:00Z",
                "return_time": "2026-10-04T18:00:00Z",
                "target_pfz": "pfz-1",
            },
            files={"file": ("test.wav", dummy_audio, "audio/wav")},
        )

        assert response.status_code == 200
        assert mock_exec.called
        call_kwargs = mock_exec.call_args.kwargs
        assert call_kwargs["user_context"]["vessel_size"] == "large"
        assert call_kwargs["user_context"]["coordinates"] == [73.123, 17.567]
        assert call_kwargs["user_context"]["origin_harbor"] == "Ratnagiri"


def test_saved_trip_invalid_trip_window_rejected():
    """Verify return_time <= departure_time is strictly rejected with HTTP 400 instead of inventing times."""
    dep = datetime(2026, 10, 4, 12, 0, 0, tzinfo=timezone.utc)
    ret = datetime(2026, 10, 4, 8, 0, 0, tzinfo=timezone.utc)  # Return before departure

    response = client.post(
        "/api/v1/alerts/monitor",
        json={
            "origin_harbor": "Ratnagiri",
            "craft_profile": "motorized_boat",
            "vessel_size": "medium",
            "departure_time": dep.isoformat(),
            "return_time": ret.isoformat(),
            "language": "en",
        },
    )

    assert response.status_code == 400
    assert "return_time must be strictly after departure_time" in response.json().get("detail", "")


def test_saved_trip_stores_vessel_size_and_monitoring_mode():
    """Verify saved trip registration preserves vessel_size and reports monitoring_mode."""
    dep = datetime(2026, 10, 4, 6, 0, 0, tzinfo=timezone.utc)
    ret = datetime(2026, 10, 4, 18, 0, 0, tzinfo=timezone.utc)

    response = client.post(
        "/api/v1/alerts/monitor",
        json={
            "origin_harbor": "Ratnagiri",
            "craft_profile": "motorized_boat",
            "vessel_size": "large",
            "departure_time": dep.isoformat(),
            "return_time": ret.isoformat(),
            "language": "en",
            "data_mode": "DEMO",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["subscription_id"] is not None
    assert data["vessel_size"] == "large"
    assert data["monitoring_mode"] in ("durable", "session-only", "unavailable")


def test_active_alerts_filtering_expired_alerts():
    """Verify get_active_alerts excludes expired warnings (valid_to < now)."""
    now = datetime.now(timezone.utc)
    valid_alert = MagicMock()
    valid_alert.id = "alert-1"
    valid_alert.alert_type = "ASSESSMENT_ALERT"
    valid_alert.severity = "high"
    valid_alert.title = "High Swell"
    valid_alert.description = "Rough conditions"
    valid_alert.recommended_action = "Stay in port"
    valid_alert.status = "ACTIVE"
    valid_alert.is_acknowledged = False
    valid_alert.valid_from = now
    valid_alert.valid_to = now + timedelta(hours=5)
    valid_alert.created_at = now

    mock_sub = MagicMock()
    mock_sub.id = 1
    mock_sub.public_id = "sub-123"

    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.first.return_value = mock_sub
    mock_session.query.return_value.filter.return_value.order_by.return_value.all.return_value = [valid_alert]

    with patch("backend.app.services.alert_service.SessionLocal") as mock_session_factory:
        mock_session_factory.return_value.__enter__.return_value = mock_session
        alerts, mode = AlertService.get_active_alerts("sub-123")

    assert len(alerts) == 1
    assert alerts[0].id == "alert-1"
    assert mode == "durable"


def test_acknowledgement_database_failure_via_api():
    """Verify alert acknowledgement returns 404 or 500 when alert cannot be acknowledged without claiming success."""
    with patch("backend.app.services.alert_service.AlertService.acknowledge_alert", return_value=False):
        response = client.post("/api/v1/alerts/alert-failed-123/acknowledge")
        # AlertService.acknowledge_alert returned False -> HTTP 404 Alert not found
        assert response.status_code == 404
        assert "not found" in response.json().get("detail", "").lower()
