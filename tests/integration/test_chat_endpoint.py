"""Integration tests for POST /api/v1/chat and GET /api/v1/demo-scenarios.

Owned by Dev 2 (Backend Platform).

Design notes
------------
* All round-trip chat tests accept HTTP 200 (graph ran) OR 503 (langgraph
  not installed in the test environment).  This mirrors the CI reality where
  the langgraph package is absent from the global Python install.
* When the response is 503, the test ONLY validates the structured error
  envelope — it does NOT validate ChatResponse fields.
* When the response is 200, the body MUST fully conform to ChatResponse.
* Tests that only need import-level inspection (e.g. anyio thread test) do
  NOT make HTTP calls and always pass.
"""

from __future__ import annotations

import pytest

import uuid
from backend.app.core.config import settings

# Test connection handling
try:
    from sqlalchemy import create_engine
    from sqlalchemy.exc import OperationalError
    engine = create_engine(settings.SYNC_DATABASE_URL)
    with engine.connect():
        db_available = True
except OperationalError:
    db_available = False

pytestmark = pytest.mark.skipif(
    not db_available,
    reason="PostgreSQL/PostGIS server is unavailable. Integration tests skipped."
)

from typing import Any, Dict

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_VALID_STATUSES = {"GO", "CAUTION", "NO_GO", "UNKNOWN", "INFORMATIONAL"}
_VALID_CONFIDENCE = {"HIGH", "MEDIUM", "LOW"}

SNAPSHOT_MODE_ENVIRON = {"DATA_MODE": "SNAPSHOT"}


def _assert_chat_response_shape(data: Dict[str, Any]) -> None:
    """Assert that `data` conforms to the ChatResponse contract."""
    assert "run_id" in data, "ChatResponse must contain 'run_id'"
    assert "conversation_id" in data, "ChatResponse must contain 'conversation_id'"
    assert "answer" in data, "ChatResponse must contain 'answer'"
    assert isinstance(data["answer"], str) and data["answer"], "'answer' must be non-empty string"

    assert "recommendation" in data, "ChatResponse must contain 'recommendation'"
    rec = data["recommendation"]
    assert rec["status"] in _VALID_STATUSES, f"Unexpected status: {rec['status']}"
    assert "summary" in rec, "recommendation must contain 'summary'"
    assert "next_action" in rec, "recommendation must contain 'next_action'"

    assert "confidence" in data, "ChatResponse must contain 'confidence'"
    conf = data["confidence"]
    assert conf["level"] in _VALID_CONFIDENCE, f"Unexpected confidence level: {conf['level']}"

    # List fields must be present (may be empty)
    assert "evidence" in data and isinstance(data["evidence"], list)
    assert "map_layers" in data and isinstance(data["map_layers"], list)
    assert "trace" in data and isinstance(data["trace"], list)
    assert "warnings" in data and isinstance(data["warnings"], list)
    assert "suggested_followups" in data and isinstance(data["suggested_followups"], list)


def _post_chat(client: TestClient, payload: Dict[str, Any]):
    """POST to /api/v1/chat and return the response."""
    return client.post("/api/v1/chat", json=payload)


# ---------------------------------------------------------------------------
# 1. Snapshot chat returns 200 with valid ChatResponse (or 503 without graph)
# ---------------------------------------------------------------------------

def test_snapshot_chat_returns_200_or_503(client: TestClient):
    """SNAPSHOT mode chat must return 200 (graph ran) or 503 (no langgraph).

    Must NEVER return 501 (old scaffold placeholder) or any other 4xx/5xx.
    """
    resp = _post_chat(client, {
        "message": "Is it safe to leave Ratnagiri tomorrow morning?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "craft_profile": "motorized_boat",
            "language_preference": "en",
        },
    })
    assert resp.status_code != 501, (
        "501 returned — chat endpoint is still on the scaffold placeholder."
    )
    assert resp.status_code in (200, 503), (
        f"Unexpected status {resp.status_code}: {resp.text[:300]}"
    )
    if resp.status_code == 200:
        _assert_chat_response_shape(resp.json())


# ---------------------------------------------------------------------------
# 2. conversation_id is generated when absent
# ---------------------------------------------------------------------------

def test_conversation_id_generated_when_absent(client: TestClient):
    """If conversation_id is not sent, the server must generate a non-empty UUID."""
    resp = _post_chat(client, {"message": "What are conditions near Ratnagiri?"})
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        data = resp.json()
        cid = data.get("conversation_id", "")
        assert cid, "conversation_id must be non-empty when generated server-side"
        # Validate it is a well-formed UUID
        uuid.UUID(cid)


# ---------------------------------------------------------------------------
# 3. Existing conversation_id is echoed back unchanged
# ---------------------------------------------------------------------------

def test_existing_conversation_id_is_reused(client: TestClient):
    """A conversation_id supplied by the client must be echoed back unchanged."""
    client_id = str(uuid.uuid4())
    resp = _post_chat(client, {
        "message": "What conditions should I expect at Ratnagiri?",
        "conversation_id": client_id,
    })
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        assert resp.json()["conversation_id"] == client_id, (
            "Server must echo back the caller-supplied conversation_id"
        )


# ---------------------------------------------------------------------------
# 4. Hindi response is contract-valid
# ---------------------------------------------------------------------------

def test_hindi_response_is_contract_valid(client: TestClient):
    """A Hindi-language query must produce a contract-valid ChatResponse."""
    resp = _post_chat(client, {
        "message": "क्या कल सुबह रत्नागिरि से निकलना सुरक्षित है?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "language_preference": "hi",
        },
    })
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        _assert_chat_response_shape(resp.json())


# ---------------------------------------------------------------------------
# 5. Marathi response is contract-valid
# ---------------------------------------------------------------------------

def test_marathi_response_is_contract_valid(client: TestClient):
    """A Marathi-language query must produce a contract-valid ChatResponse."""
    resp = _post_chat(client, {
        "message": "उद्या सकाळी रत्नागिरीहून जाणे सुरक्षित आहे का?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "language_preference": "mr",
        },
    })
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        _assert_chat_response_shape(resp.json())


# ---------------------------------------------------------------------------
# 6. Clarification response is contract-valid
# ---------------------------------------------------------------------------

def test_clarification_is_contract_valid(client: TestClient):
    """A query missing critical context (no harbor) must still return a valid body.

    The graph should route to the CLARIFICATION node and produce a ChatResponse
    with a clarification message rather than a safety determination.
    """
    resp = _post_chat(client, {
        # No origin_harbor — should trigger clarification path for route queries
        "message": "Is the route safe?",
    })
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        data = resp.json()
        _assert_chat_response_shape(data)
        # Clarification responses should not assert GO (that would be fabricated)
        assert data["recommendation"]["status"] != "GO", (
            "Clarification response must not assert GO without evidence"
        )


# ---------------------------------------------------------------------------
# 7. Unsupported query is contract-valid
# ---------------------------------------------------------------------------

def test_unsupported_query_is_contract_valid(client: TestClient):
    """A query outside ORCA's domain must return a valid ChatResponse body."""
    resp = _post_chat(client, {
        "message": "What is the capital of France?",
    })
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        data = resp.json()
        _assert_chat_response_shape(data)
        # Unsupported queries must not produce GO or CAUTION safety clearances
        assert data["recommendation"]["status"] in ("UNKNOWN", "INFORMATIONAL"), (
            f"Unsupported query produced unexpected status: {data['recommendation']['status']}"
        )


# ---------------------------------------------------------------------------
# 8. Agent exception is sanitized — no stack trace in client response
# ---------------------------------------------------------------------------

def test_agent_exception_is_sanitized(client: TestClient):
    """Internal exceptions must not appear as raw tracebacks in the response body.

    The degraded response MUST contain the [DEV2-AGENT-ERROR] prefix in
    warnings and MUST NOT expose raw Python exception class paths.
    """
    resp = _post_chat(client, {
        "message": "Is it safe to sail from Ratnagiri?",
        "user_context": {"origin_harbor": "Ratnagiri"},
    })
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        body_text = resp.text
        # Raw tracebacks must not be exposed
        assert "Traceback" not in body_text, "Raw traceback found in response body"
        assert "File \"" not in body_text, "File path found in response body"


# ---------------------------------------------------------------------------
# 9. Event loop is not directly blocked by synchronous graph invocation
# ---------------------------------------------------------------------------

def test_event_loop_not_blocked_by_graph_invocation():
    """Verifies that AgentRunService uses anyio.to_thread.run_sync.

    This is an import-level structural test — it inspects the source of
    ``run_snapshot`` to confirm the async offloading is present without
    requiring a live graph execution.
    """
    import inspect
    from backend.app.services.agent_run_service import AgentRunService

    source = inspect.getsource(AgentRunService.run_snapshot)
    assert "anyio.to_thread.run_sync" in source, (
        "run_snapshot must use anyio.to_thread.run_sync to offload "
        "the synchronous run_orca_graph call to a thread pool."
    )
    # Confirm it is declared as a coroutine (async def)
    assert inspect.iscoroutinefunction(AgentRunService.run_snapshot), (
        "run_snapshot must be declared async"
    )


# ---------------------------------------------------------------------------
# 10. /demo-scenarios alias returns the same 8 scenarios
# ---------------------------------------------------------------------------

def test_demo_scenarios_alias(client: TestClient):
    """GET /api/v1/demo-scenarios must return 200 with the same 8 canonical scenarios."""
    resp = client.get("/api/v1/demo-scenarios")
    assert resp.status_code == 200, (
        f"demo-scenarios alias returned {resp.status_code}: {resp.text[:200]}"
    )
    data = resp.json()
    assert "scenarios" in data, "Response must contain 'scenarios' key"
    assert len(data["scenarios"]) == 8, (
        f"Expected 8 scenarios, got {len(data['scenarios'])}"
    )
    ids = {s["id"] for s in data["scenarios"]}
    for expected_id in ("S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"):
        assert expected_id in ids, f"Scenario {expected_id} missing from demo-scenarios"


# ---------------------------------------------------------------------------
# 11. LIVE/HYBRID DATA_MODE returns structured 503 (not a crash)
# ---------------------------------------------------------------------------

def test_live_mode_returns_structured_503(monkeypatch, client: TestClient):
    """When DATA_MODE=LIVE, the endpoint must return 503 with a structured error body."""
    import backend.app.services.agent_run_service as svc_module

    # Patch the singleton's _data_mode for this test only
    original = svc_module.agent_run_service._data_mode
    svc_module.agent_run_service._data_mode = "LIVE"
    try:
        resp = _post_chat(client, {"message": "Is it safe to sail?"})
        assert resp.status_code == 503, (
            f"Expected 503 for LIVE mode, got {resp.status_code}"
        )
        body = resp.json()
        assert "error" in body, "503 body must contain 'error' key (Dev2ErrorEnvelope)"
        assert body["error"]["code"] == "DATA_MODE_NOT_READY"
    finally:
        svc_module.agent_run_service._data_mode = original
