import json
import pytest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from unittest.mock import MagicMock

sys.modules['langgraph'] = MagicMock()
sys.modules['langgraph.graph'] = MagicMock()

# Avoid importing from backend.app.agents directly if it causes langgraph import errors.
class MockContext:
    def __init__(self, origin_harbor="Ratnagiri"):
        self.origin_harbor = origin_harbor
        self.coordinates = None
        self.craft_profile = None
        self.time_of_departure = None

ToolInvocationContext = MockContext

from backend.app.connectors.base import validate_iso8601, validate_coordinates
from backend.app.connectors.errors import (
    ConnectorMissingSnapshotError,
    ConnectorStaleSnapshotError,
    ConnectorMalformedResponseError,
    ConnectorTimeoutError,
    ConnectorAuthenticationError
)
from backend.app.connectors.manager import ConnectorManager
from backend.app.connectors.modes import DataMode
from backend.app.connectors.snapshot import SnapshotConnector


class MockLiveProvider:
    def __init__(self, should_timeout=False, should_auth_fail=False):
        self.should_timeout = should_timeout
        self.should_auth_fail = should_auth_fail

    def get_marine_conditions(self, context: ToolInvocationContext):
        if self.should_timeout:
            raise ConnectorTimeoutError("Mock timeout")
        if self.should_auth_fail:
            raise ConnectorAuthenticationError("Mock auth fail")
        class MockPayload:
            source_name = "Live Provider"
        return MockPayload()


@pytest.fixture
def snapshot_connector(tmp_path):
    return SnapshotConnector(snapshots_path=str(tmp_path))


@pytest.fixture
def valid_snapshot_data():
    now = datetime.now(timezone.utc)
    payload = {}
    import hashlib
    import json
    data_str = json.dumps(payload, sort_keys=True).encode("utf-8")
    checksum = hashlib.sha256(data_str).hexdigest()
    
    return {
        "metadata": {
            "snapshot_id": "TEST",
            "provider": "TEST",
            "source_name": "Test Source",
            "captured_at": now.isoformat(),
            "valid_from": (now - timedelta(days=1)).isoformat(),
            "valid_to": (now + timedelta(days=1)).isoformat(),
            "schema_version": "1.0",
            "checksum": checksum,
            "status": "SIMULATED"
        },
        "payload": payload
    }


def test_validate_iso8601():
    validate_iso8601("2026-09-06T12:00:00Z")
    validate_iso8601("2026-09-06T12:00:00+00:00")
    with pytest.raises(ValueError):
        validate_iso8601("2026-09-06T12:00:00")  # Missing tzinfo


def test_validate_coordinates():
    validate_coordinates(73.0, 16.0)
    with pytest.raises(ValueError):
        validate_coordinates(200.0, 16.0)
    with pytest.raises(ValueError):
        validate_coordinates(73.0, 100.0)


def test_snapshot_missing(snapshot_connector):
    context = ToolInvocationContext(origin_harbor="Unknown")
    with pytest.raises(ConnectorMissingSnapshotError):
        snapshot_connector.get_marine_conditions(context)


def test_snapshot_load_and_checksum(tmp_path, snapshot_connector, valid_snapshot_data):
    file_path = tmp_path / "marine_ratnagiri.json"
    
    import hashlib
    payload = {"harbor": "Ratnagiri", "significant_wave_height_m": "not_a_float"}
    data_str = json.dumps(payload, sort_keys=True).encode("utf-8")
    valid_snapshot_data["metadata"]["checksum"] = hashlib.sha256(data_str).hexdigest()
    valid_snapshot_data["payload"] = payload
    
    with open(file_path, "w") as f:
        json.dump(valid_snapshot_data, f)
        
    context = ToolInvocationContext(origin_harbor="Ratnagiri")
    # Will fail pydantic validation of MarineConditionsPayload because of invalid field type,
    # but the checksum and metadata load will pass.
    with pytest.raises(Exception):
        snapshot_connector.get_marine_conditions(context)


def test_snapshot_stale(tmp_path, snapshot_connector, valid_snapshot_data):
    file_path = tmp_path / "marine_ratnagiri.json"
    now = datetime.now(timezone.utc)
    valid_snapshot_data["metadata"]["valid_to"] = (now - timedelta(days=1)).isoformat()
    valid_snapshot_data["payload"] = {}
    
    with open(file_path, "w") as f:
        json.dump(valid_snapshot_data, f)
        
    context = ToolInvocationContext(origin_harbor="Ratnagiri")
    with pytest.raises(ConnectorStaleSnapshotError):
        snapshot_connector.get_marine_conditions(context)


def test_manager_live_mode(snapshot_connector):
    live = MockLiveProvider()
    manager = ConnectorManager(DataMode.LIVE, snapshot_connector, marine_live=live)
    context = ToolInvocationContext(origin_harbor="Ratnagiri")
    
    res = manager.get_marine_conditions(context)
    assert res.source_name == "Live Provider"


def test_manager_snapshot_mode(tmp_path, snapshot_connector):
    # Snapshot mode makes zero network requests. We don't even configure live provider.
    manager = ConnectorManager(DataMode.SNAPSHOT, snapshot_connector)
    context = ToolInvocationContext(origin_harbor="Ratnagiri")
    with pytest.raises(ConnectorMissingSnapshotError):
        manager.get_marine_conditions(context)


def test_manager_hybrid_fallback(snapshot_connector, monkeypatch):
    # Mock snapshot connector to just return a dummy payload object for testing
    class DummyPayload:
        source_name = "Snapshot Provider"
    
    monkeypatch.setattr(snapshot_connector, "get_marine_conditions", lambda c: DummyPayload())
    
    # 1. Transient error -> Fallback
    live_timeout = MockLiveProvider(should_timeout=True)
    manager = ConnectorManager(DataMode.HYBRID, snapshot_connector, marine_live=live_timeout)
    context = ToolInvocationContext(origin_harbor="Ratnagiri")
    
    res = manager.get_marine_conditions(context)
    assert "HYBRID Fallback" in res.source_name
    assert "Transient Error" in res.source_name
    
    # 2. Authentication failure still degrades to the configured snapshot,
    # with the failure category preserved in provenance.
    live_auth_fail = MockLiveProvider(should_auth_fail=True)
    manager = ConnectorManager(DataMode.HYBRID, snapshot_connector, marine_live=live_auth_fail)
    
    auth_fallback = manager.get_marine_conditions(context)
    assert "HYBRID Fallback" in auth_fallback.source_name
    assert "Authentication Failure" in auth_fallback.source_name
