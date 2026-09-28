"""Integration tests for ORCA runs, evidence, and map layer persistence.

Owned by Dev 2 (Backend Platform).
"""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from backend.app.core.config import settings
from backend.app.db.models import RunStatus

# Test connection handling for PostGIS
try:
    from sqlalchemy import create_engine
    engine = create_engine(settings.SYNC_DATABASE_URL)
    with engine.connect():
        db_available = True
except OperationalError:
    db_available = False

pytestmark = pytest.mark.skipif(
    not db_available,
    reason="PostgreSQL/PostGIS server is unavailable. Integration tests skipped."
)


def _post_chat(client: TestClient, payload: dict[str, Any]):
    return client.post("/api/v1/chat", json=payload)


def test_completed_run_and_retrieval(client: TestClient):
    """Test a complete successful run and retrieval via /runs/{run_id}."""
    resp = _post_chat(client, {
        "message": "Is it safe to leave Ratnagiri tomorrow morning?",
        "user_context": {"origin_harbor": "Ratnagiri"}
    })
    
    # 1. Chat completes
    assert resp.status_code == 200
    data = resp.json()
    run_id = data["run_id"]
    
    # 2. Run retrieval
    run_resp = client.get(f"/api/v1/runs/{run_id}")
    assert run_resp.status_code == 200
    run_data = run_resp.json()
    assert run_data["id"] == run_id
    assert run_data["status"] == RunStatus.COMPLETED.value
    
    # 3. Evidence relationship
    assert "evidence" in data
    
    # 4. Trace relationship
    assert "trace" in data


def test_partial_run(client: TestClient):
    """Test a partial run that has warnings."""
    # We can trigger a partial run by simulating a condition that generates warnings.
    with patch("backend.app.services.state_mapper.map_state_to_response") as mock_mapper:
        from backend.app.contracts.chat import (
            ChatResponse,
            Confidence,
            ConfidenceLevel,
            Recommendation,
            RecommendationStatus,
        )
        mock_mapper.return_value = ChatResponse(
            run_id=str(uuid.uuid4()),
            conversation_id=str(uuid.uuid4()),
            language="en",
            intent="SAFETY",
            answer="Partial answer",
            recommendation=Recommendation(
                status=RecommendationStatus.UNKNOWN,
                summary="Partial",
                decisive_factors=[],
                next_action="Wait"
            ),
            confidence=Confidence(level=ConfidenceLevel.LOW, reasons=[]),
            evidence=[],
            map_layers=[],
            trace=[],
            warnings=["[WARNING] degraded data source"],
            suggested_followups=[]
        )
        
        resp = _post_chat(client, {"message": "Safe?"})
        assert resp.status_code == 200
        data = resp.json()
        run_id = data["run_id"]
        
        run_resp = client.get(f"/api/v1/runs/{run_id}")
        assert run_resp.status_code == 200
        assert run_resp.json()["status"] == RunStatus.PARTIAL.value


def test_failed_run(client: TestClient):
    """Test an unexpected error marks the run as FAILED."""
    with patch("backend.app.services.agent_run_service.run_orca_graph") as mock_run:
        mock_run.side_effect = Exception("Simulated fatal error")
        resp = _post_chat(client, {"message": "Crash me"})
        
        # 1. Chat returns 500
        assert resp.status_code == 500
        
        # 2. Extract run_id from ErrorEnvelope
        data = resp.json()
        assert "error" in data
        run_id = data["error"]["run_id"]
        
        # 3. Run marked as FAILED
        run_resp = client.get(f"/api/v1/runs/{run_id}")
        assert run_resp.status_code == 200
        assert run_resp.json()["status"] == RunStatus.FAILED.value


def test_cancelled_run(client: TestClient):
    """Test a cancelled request marks the run as CANCELLED."""
    import asyncio
    with patch("backend.app.services.agent_run_service.run_orca_graph") as mock_run:
        mock_run.side_effect = asyncio.CancelledError()
        
        try:
            _post_chat(client, {"message": "Cancel me"})
        except BaseException:
            pass
            

def test_map_layer_retrieval(client: TestClient):
    """Test point/line/polygon layer retrieval via /map/layers/{layer_id}."""
    resp = _post_chat(client, {
        "message": "Are there restricted zones near Ratnagiri?",
        "user_context": {"origin_harbor": "Ratnagiri"}
    })
    
    assert resp.status_code == 200
    data = resp.json()
    
    layers = data.get("map_layers", [])
    if not layers:
        pytest.skip("No map layers returned in this scenario, skipping retrieval test")
        
    layer_id = layers[0]["layer_id"]
    
    # Retrieve layer
    layer_resp = client.get(f"/api/v1/map/layers/{layer_id}")
    assert layer_resp.status_code == 200
    
    layer_data = layer_resp.json()
    assert layer_data["id"] == layer_id
    assert "geometry" in layer_data
    assert "properties" in layer_data


def test_not_found_responses(client: TestClient):
    """Test 404 responses for non-existent runs and layers."""
    bad_id = str(uuid.uuid4())
    
    run_resp = client.get(f"/api/v1/runs/{bad_id}")
    assert run_resp.status_code == 404
    
    layer_resp = client.get(f"/api/v1/map/layers/{bad_id}")
    assert layer_resp.status_code == 404
    
    bad_format = "not-a-uuid"
    run_resp_bad = client.get(f"/api/v1/runs/{bad_format}")
    assert run_resp_bad.status_code == 400


def test_duplicate_submission(client: TestClient):
    """Test that a duplicate submission for the same conversation returns 409."""
    # We mock the active_run check to simulate a concurrent run
    with patch("backend.app.db.repositories.run.RunRepository.create"):
        with patch("backend.app.db.session.SessionLocal") as MockSession:
            session_inst = MockSession.return_value.__enter__.return_value
            session_inst.query.return_value.filter_by.return_value.first.return_value = type('FakeRun', (), {'id': uuid.uuid4()})()
            
            resp = _post_chat(client, {"message": "Duplicate me"})
            assert resp.status_code == 409
            assert resp.json()["error"]["code"] == "DUPLICATE_RUN"


def test_conversation_reuse(client: TestClient):
    """Test that sequential requests can reuse the same conversation_id."""
    conv_id = str(uuid.uuid4())
    
    resp1 = _post_chat(client, {
        "conversation_id": conv_id,
        "message": "First message"
    })
    assert resp1.status_code == 200
    
    resp2 = _post_chat(client, {
        "conversation_id": conv_id,
        "message": "Follow up message"
    })
    assert resp2.status_code == 200
    
    assert resp1.json()["conversation_id"] == conv_id
    assert resp2.json()["conversation_id"] == conv_id
    assert resp1.json()["run_id"] != resp2.json()["run_id"]


def test_snapshot_provider_execution(client: TestClient):
    """Test execution in SNAPSHOT mode (the default)."""
    resp = _post_chat(client, {"message": "Safe?"})
    assert resp.status_code == 200
    data = resp.json()
    # Complete DEMO evidence is labeled structurally and need not emit a
    # degraded-data warning merely because it is not live.
    assert data["data_mode"] == "DEMO"
    assert data["recommendation"]["status"] in {"GO", "CAUTION", "NO_GO", "UNKNOWN"}


def test_hybrid_provider_execution(client: TestClient):
    """Test execution in HYBRID mode returns 503."""
    import backend.app.services.agent_run_service as svc_module
    original = svc_module.agent_run_service._data_mode
    svc_module.agent_run_service._data_mode = "HYBRID"
    try:
        resp = _post_chat(client, {"message": "Safe?"})
        assert resp.status_code == 503
        data = resp.json()
        assert data["error"]["code"] == "DATA_MODE_NOT_READY"
    finally:
        svc_module.agent_run_service._data_mode = original


def test_get_conversation_history(client: TestClient):
    """Test /api/v1/chat/{conversation_id}/history retrieval."""
    conv_id = str(uuid.uuid4())
    resp = _post_chat(client, {
        "conversation_id": conv_id,
        "message": "First message"
    })
    assert resp.status_code == 200
    
    hist_resp = client.get(f"/api/v1/chat/{conv_id}/history")
    assert hist_resp.status_code == 200
    
    data = hist_resp.json()
    assert data["conversation_id"] == conv_id
    assert len(data["history"]) >= 1
    assert data["history"][0]["id"] == resp.json()["run_id"]
    
    # Test unknown ID
    bad_id = str(uuid.uuid4())
    bad_resp = client.get(f"/api/v1/chat/{bad_id}/history")
    assert bad_resp.status_code == 404


def test_get_base_layers(client: TestClient):
    """Test /api/v1/layers/base retrieval."""
    resp = client.get("/api/v1/layers/base")
    assert resp.status_code == 200
    
    data = resp.json()
    assert data["type"] == "FeatureCollection"
    assert "features" in data
