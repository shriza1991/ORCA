"""Integration tests for FastAPI health and system metadata routes."""

import pytest
from fastapi.testclient import TestClient
from backend.app.core.config import settings

# Test connection handling
try:
    from sqlalchemy import create_engine
    from sqlalchemy.exc import OperationalError
    engine = create_engine(settings.SYNC_DATABASE_URL)
    with engine.connect():
        db_available = True
except Exception:
    db_available = False

pytestmark = pytest.mark.skipif(
    not db_available,
    reason="PostgreSQL/PostGIS server is unavailable. Integration tests skipped."
)


def test_health_check_endpoint(client: TestClient):
    """GET /api/v1/health should return 200 with operational mode."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["app_name"] == "ORCA"
    assert "data_mode" in data


def test_scenarios_listing_endpoint(client: TestClient):
    """GET /api/v1/scenarios should list the 8 canonical evaluation scenarios."""
    response = client.get("/api/v1/scenarios")
    assert response.status_code == 200
    data = response.json()
    assert "scenarios" in data
    assert len(data["scenarios"]) == 8
    scenario_ids = [s["id"] for s in data["scenarios"]]
    assert "S1" in scenario_ids
    assert "S8" in scenario_ids


def test_chat_endpoint_is_wired(client: TestClient):
    """POST /api/v1/chat must no longer return 501.

    The endpoint is now wired to the LangGraph ORCA pipeline.
    Acceptable responses:
    - 200 with a valid ChatResponse body (agent ran successfully)
    - 503 if the agent runtime is missing a required dependency (CI environment)

    The original 501 scaffold placeholder has been replaced.
    """
    response = client.post(
        "/api/v1/chat",
        json={
            "message": "Is it safe to leave Ratnagiri tomorrow?",
            "user_context": {
                "origin_harbor": "Ratnagiri",
                "craft_profile": "motorized_boat",
            },
        },
    )
    # Must NOT be 501 (that was the pre-wiring placeholder)
    assert response.status_code != 501, (
        "Chat endpoint returned 501 — wiring to agent graph did not succeed."
    )
    # Accept 200 (success) or 503 (missing LLM/graph dependency in CI)
    assert response.status_code in (200, 503), (
        f"Unexpected status code {response.status_code}: {response.text[:200]}"
    )


def test_chat_response_schema_on_success(client: TestClient):
    """When chat returns 200, the body must conform to ChatResponse schema."""
    response = client.post(
        "/api/v1/chat",
        json={
            "message": "What are the current wave conditions at Ratnagiri?",
            "user_context": {
                "origin_harbor": "Ratnagiri",
                "craft_profile": "motorized_boat",
            },
        },
    )
    if response.status_code == 503:
        # Agent graph dependency unavailable in CI — skip schema check
        return

    assert response.status_code == 200
    data = response.json()
    # Core required fields
    assert "run_id" in data
    assert "conversation_id" in data
    assert "answer" in data
    assert "recommendation" in data
    assert data["data_mode"] in ("LIVE", "DEMO", "UNAVAILABLE")
    assert "confidence" in data
    assert "evidence" in data
    # Recommendation status must be a known value
    assert data["recommendation"]["status"] in ("GO", "CAUTION", "NO_GO", "UNKNOWN", "INFORMATIONAL")
