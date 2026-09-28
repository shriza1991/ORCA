from unittest.mock import patch

from backend.app.services.alert_service import AlertService


def test_reassessment_skips_when_database_session_cannot_be_created(caplog):
    with patch(
        "backend.app.services.alert_service.SessionLocal",
        side_effect=OSError("database unavailable"),
    ):
        AlertService.reassess_saved_trips()

    assert "Database unavailable for reassess_saved_trips" in caplog.text


def test_acknowledgement_reports_failure_when_database_is_unavailable():
    with patch(
        "backend.app.services.alert_service.SessionLocal",
        side_effect=OSError("database unavailable"),
    ):
        acknowledged = AlertService.acknowledge_alert("alert-1")

    assert acknowledged is False
