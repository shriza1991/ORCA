"""Task 6 corrective behavior through the real monitoring service, with DB boundaries mocked."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import json
import pytest
from backend.app.contracts.alerts import SavedTripRequest
from backend.app.contracts.chat import UserContext
from backend.app.contracts.mission import mission_from_user_context
from backend.app.db.models import SavedTripSubscription
from backend.app.services.alert_service import AlertService


def test_registration_persists_complete_canonical_context_as_json():
    session = MagicMock()
    def add(sub):
        sub.public_id = 'subscription'
        sub.created_at = datetime.now(timezone.utc)
    session.add.side_effect = add
    with patch('backend.app.services.alert_service.SessionLocal') as factory:
        factory.return_value.__enter__.return_value = session
        response = AlertService.register_trip_monitoring(SavedTripRequest(
            origin_harbor='Ratnagiri', craft_profile='motorized_boat', vessel_size='small',
            coordinates=(73.2, 17.1), destination_id='pfz_7', data_mode='SNAPSHOT',
            departure_time='2026-10-04T11:30:00+05:30', return_time='2026-10-04T23:30:00+05:30', language='mr',
        ))
    sub = session.add.call_args.args[0]
    assert response.monitoring_mode == 'durable'
    assert sub.data_mode == 'SNAPSHOT'
    persisted = sub.mission_context_json
    assert persisted['origin']['longitude'] == 73.2
    assert persisted['destination']['name'] == 'pfz_7'
    assert persisted['vessel']['size_category'] == 'small'
    assert persisted['timing']['departure'] == '2026-10-04T06:00:00+00:00'
    json.dumps(persisted)  # JSONB cannot accept unencoded datetime/model instances.


def test_reassessment_restores_destination_coordinates_size_and_mode_after_restart():
    mission = mission_from_user_context(user_context=UserContext(origin_harbor='Ratnagiri', craft_profile='motorized_boat', vessel_size='large', coordinates=(73.2,17.1), target_pfz='pfz_7'), message='monitor')
    sub = SimpleNamespace(public_id='subscription', id='sub-id', origin_harbor='Ratnagiri', craft_profile='motorized_boat', vessel_size='large', data_mode='SNAPSHOT', language='hi', departure_time=datetime(2026,10,4,6,tzinfo=timezone.utc), return_time=datetime(2026,10,4,18,tzinfo=timezone.utc), mission_context_json=mission.model_dump(mode='json'))
    session = MagicMock()
    def query(model):
        q = MagicMock(); q.filter.return_value = q; q.all.return_value = [sub] if model is SavedTripSubscription else []; q.first.return_value = None
        return q
    session.query.side_effect = query
    with patch('backend.app.services.alert_service.SessionLocal') as factory, patch('backend.app.services.alert_service.AssessmentService.assess_trip') as assess:
        factory.return_value.__enter__.return_value = session
        assess.return_value = SimpleNamespace(assessment_id='assessment', alerts=[], decision='GO', brief=None)
        AlertService._monitored_trips_mission_state.clear()
        AlertService.reassess_saved_trips()
    request = assess.call_args.args[0]
    assert request.coordinates == [73.2,17.1]
    assert request.destination_id == 'pfz_7'
    assert request.vessel_size == 'large'
    assert request.data_mode == 'SNAPSHOT'
    assert request.mission_state.mission_id == mission.mission_id


@pytest.mark.parametrize('changes', [
    {'valid_from': datetime.now(timezone.utc)+timedelta(hours=1)},
    {'valid_to': datetime.now(timezone.utc)-timedelta(hours=1)},
    {'status': 'EXPIRED'},
])
def test_delivery_excludes_future_expired_and_resolved_alerts(changes):
    now = datetime.now(timezone.utc)
    record = SimpleNamespace(id='alert', alert_type='ASSESSMENT_ALERT', severity='high', title='Warning', description='Warning', recommended_action='Review', status='ACTIVE', is_acknowledged=False, valid_from=None, valid_to=None, created_at=now)
    for name,value in changes.items(): setattr(record,name,value)
    session = MagicMock()
    session.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id='sub', is_active=True)
    session.query.return_value.filter.return_value.order_by.return_value.all.return_value = [record]
    with patch('backend.app.services.alert_service.SessionLocal') as factory:
        factory.return_value.__enter__.return_value = session
        alerts, mode = AlertService.get_active_alerts('subscription')
    assert alerts == []
    assert mode == 'durable'


def test_recurring_resolved_warning_is_reactivated_and_requires_new_acknowledgement():
    now = datetime.now(timezone.utc)
    record = SimpleNamespace(status='EXPIRED', is_acknowledged=True, valid_from=now-timedelta(hours=2), valid_to=now-timedelta(hours=1), assessment_id='old')
    AlertService._renew_alert(record,'new')
    assert record.status == 'ACTIVE'
    assert record.is_acknowledged is False
    assert record.valid_to is None
    assert record.assessment_id == 'new'
    assert AlertService._alert_is_current(record, datetime.now(timezone.utc))


@pytest.mark.parametrize('departure,return_time', [('invalid',None), (None,'invalid'), ('2026-10-04T18:00:00Z','2026-10-04T06:00:00Z')])
def test_invalid_partial_trip_windows_are_rejected_before_database_fallback(departure,return_time):
    with patch('backend.app.services.alert_service.SessionLocal') as factory:
        with pytest.raises(ValueError):
            AlertService.register_trip_monitoring(SavedTripRequest(origin_harbor='Ratnagiri',craft_profile='motorized_boat',departure_time=departure,return_time=return_time))
        factory.assert_not_called()


def test_stop_monitoring_disables_subscription_and_expires_delivered_warnings():
    session = MagicMock()
    sub = SimpleNamespace(id='sub', is_active=True)
    warning = SimpleNamespace(status='ACTIVE', valid_to=None)
    session.query.return_value.filter.return_value.first.return_value = sub
    session.query.return_value.filter.return_value.all.return_value = [warning]
    with patch('backend.app.services.alert_service.SessionLocal') as factory:
        factory.return_value.__enter__.return_value = session
        assert AlertService.stop_monitoring('subscription') is True
    assert sub.is_active is False
    assert warning.status == 'EXPIRED'
    assert warning.valid_to is not None
    session.commit.assert_called_once()


def test_stop_monitoring_does_not_report_success_when_database_is_unavailable():
    with patch('backend.app.services.alert_service.SessionLocal', side_effect=OSError('offline')):
        assert AlertService.stop_monitoring('subscription') is False
