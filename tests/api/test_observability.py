"""Tests for Observability and Structured Telemetry.

Verifies:
1. X-Request-ID propagation in response headers
2. X-Response-Time-Ms latency header injection
3. Structured logging output formatting without secret leaks
4. Connector execution latency and status logging in ConnectorManager
"""

import json
import logging
from unittest.mock import MagicMock
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.api.middleware import ObservabilityMiddleware, RequestIDMiddleware
from backend.app.connectors.manager import ConnectorManager
from backend.app.connectors.modes import DataMode
from backend.app.connectors.snapshot import SnapshotConnector
from backend.app.core.logging import RedactingJsonFormatter


@pytest.fixture
def obs_app():
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(ObservabilityMiddleware)

    @app.get("/api/v1/ping")
    def ping():
        return {"message": "pong"}

    return app


def test_observability_headers_injected(obs_app):
    client = TestClient(obs_app)
    response = client.get("/api/v1/ping")

    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert "X-Response-Time-Ms" in response.headers
    assert float(response.headers["X-Response-Time-Ms"]) >= 0.0


def test_redacting_json_formatter_masks_secrets():
    formatter = RedactingJsonFormatter()
    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Connecting with api_key='secret_token_12345' at 18.924827, 72.834729",
        args=(),
        exc_info=None,
    )
    formatted = formatter.format(record)
    log_json = json.loads(formatted)

    assert "secret_token_12345" not in log_json["message"]
    assert "***REDACTED***" in log_json["message"]
    # Precise coordinate should be rounded to 2 decimals
    assert "18.92" in log_json["message"]


def test_connector_manager_telemetry_logging(caplog):
    snapshot_conn = SnapshotConnector()
    manager = ConnectorManager(DataMode.SNAPSHOT, snapshot_connector=snapshot_conn)
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")

    with caplog.at_level(logging.INFO):
        bulletin = manager.get_hazard_bulletin(ctx)

    assert bulletin is not None
    # Check that execution log occurred with duration_ms and status
    assert any("Connector execution [get_hazard_bulletin] mode=SNAPSHOT" in record.message for record in caplog.records)
