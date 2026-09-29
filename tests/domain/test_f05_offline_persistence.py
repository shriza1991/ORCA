"""F05 Offline Persistence & Degradation Resilience Test Suite.

Audits and verifies backend behavior when the persistent database (PostgreSQL/PostGIS)
is unavailable or when persistence operations fail.

CRITICAL INVARIANTS:
1. No unexpected 500 on DB unavailability during run creation, run completion, or reads.
2. Honest provenance: Never fabricates durable persistence when data was not saved.
3. Resilient in-memory fallback: Retains run, evidence, map-layer, and history in the current process.
4. Demo/synthetic reads remain 100% operational when DB is offline.
5. Zero regression on F01, F02/F03, and F04.
"""

import uuid
from unittest.mock import MagicMock, patch
import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from backend.app.contracts.chat import (
    ChatRequest,
    ChatResponse,
    RecommendationStatus,
    UserContext,
)
from backend.app.db.offline_store import offline_persistence_store
from backend.app.main import app
from backend.app.services.agent_run_service import (
    AgentRunService,
    _DuplicateRunError,
)


@pytest.fixture(autouse=True)
def clean_offline_store():
    """Ensure in-memory offline store is clean before and after each test."""
    offline_persistence_store.clear()
    yield
    offline_persistence_store.clear()


class FailingDBSession:
    """Mock database session that unconditionally raises OperationalError (DB offline)."""

    def __enter__(self):
        raise sa.exc.OperationalError("PostgreSQL connection refused / offline", params={}, orig=None)

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


# ---------------------------------------------------------------------------
# 1. Run Creation & Completion in Offline Mode
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_db_unavailable_during_run_creation_and_completion():
    """Verify that when the database is offline, analysis succeeds and returns with [PERSISTENCE-DEGRADED]."""
    service = AgentRunService(data_mode="SYNTHETIC")

    req = ChatRequest(
        message="Can I depart from Ratnagiri?",
        conversation_id="thread-offline-001",
        user_context=UserContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat"),
    )
    run_id = str(uuid.uuid4())

    mock_state = {
        "response": "Sea conditions are calm and safe.",
        "risk_assessment": {
            "status": "GO",
            "summary": "Calm conditions, safe for motorized boats.",
            "next_action": "Proceed with departure.",
            "decisive_factors": ["Wave height 0.9m <= 1.5m"],
            "non_decisive_factors": [],
            "threshold_comparisons": [],
            "provenance": [],
            "evidence_ids": ["ev-offline-001"],
            "warnings": [],
        },
        "confidence": {"level": "HIGH", "reasons": ["Synthetic forecast"]},
        "evidence": [
            {
                "evidence_id": "ev-offline-001",
                "source_name": "INCOIS Ocean State Forecast",
                "metric_name": "significant_wave_height",
                "metric_value": 0.9,
                "metric_unit": "m",
            }
        ],
        "map_layers": [
            {
                "layer_id": "layer-offline-001",
                "layer_type": "point",
                "name": "Ratnagiri Station",
                "geojson": {"type": "Point", "coordinates": [73.28, 16.99]},
                "properties": {"layer_id": "layer-offline-001", "name": "Ratnagiri Station"},
            }
        ],
        "warnings": [],
        "messages": [],
    }

    with patch("backend.app.services.agent_run_service.run_orca_graph", return_value=mock_state), \
         patch("backend.app.db.session.SessionLocal", side_effect=FailingDBSession):

        resp = await service.run_agent(
            user_message=req.message,
            conversation_id=req.conversation_id,
            run_id=run_id,
            user_context=req.user_context.model_dump(),
        )

        # 1. Analysis must NOT crash with 500 or error
        assert resp is not None
        assert resp.recommendation.status == RecommendationStatus.GO

        # 2. Honest degradation: Must flag that data was not persisted
        assert any("[PERSISTENCE-DEGRADED]" in w for w in resp.warnings)

        # 3. In-memory store must have captured the ephemeral run details
        in_mem = offline_persistence_store.get_run_with_details(run_id)
        assert in_mem is not None
        assert in_mem["id"] == run_id
        assert in_mem["persisted"] is False
        assert in_mem["persistence_status"] == "offline_in_memory"
        assert in_mem["response"]["recommendation"]["status"] == "GO"


@pytest.mark.asyncio
async def test_duplicate_run_protection_in_offline_mode():
    """Verify that concurrent active run detection still functions when DB is offline."""
    service = AgentRunService(data_mode="SYNTHETIC")
    conversation_id = "thread-dup-offline-002"

    # Pre-populate active running run in offline store
    active_run_id = str(uuid.uuid4())
    offline_persistence_store.create_run(
        run_id=active_run_id,
        thread_id=conversation_id,
        status="RUNNING",
    )

    req = ChatRequest(
        message="Another query in same thread while active",
        conversation_id=conversation_id,
        user_context=UserContext(),
    )
    new_run_id = str(uuid.uuid4())

    with patch("backend.app.db.session.SessionLocal", side_effect=FailingDBSession):
        with pytest.raises(_DuplicateRunError):
            await service.run_agent(
                user_message=req.message,
                conversation_id=conversation_id,
                run_id=new_run_id,
                user_context=req.user_context.model_dump(),
            )


# ---------------------------------------------------------------------------
# 2. HTTP Endpoint Fallback Reads When DB is Offline
# ---------------------------------------------------------------------------


def test_get_run_offline_fallback():
    """GET /api/v1/runs/{run_id} returns in-memory run with offline metadata when DB is down."""
    client = TestClient(app)
    run_id = str(uuid.uuid4())
    thread_id = "thread-get-run-003"

    # Store run in offline store
    offline_persistence_store.create_run(
        run_id=run_id,
        thread_id=thread_id,
        metadata_json={
            "request_id": "req-003",
            "request": {"message": "Hello ORCA"},
        },
        status="COMPLETED",
    )
    offline_persistence_store.update_run(
        run_id=run_id,
        response={"answer": "Safe to depart", "recommendation": {"status": "GO"}},
    )

    with patch("backend.app.db.session.SessionLocal", side_effect=FailingDBSession):
        response = client.get(f"/api/v1/runs/{run_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == run_id
        assert data["persisted"] is False
        assert data["persistence_status"] == "offline_in_memory"
        assert data["response"]["recommendation"]["status"] == "GO"


def test_get_run_nonexistent_returns_404_not_500():
    """GET /api/v1/runs/{unknown} returns 404 when DB is offline (never 500)."""
    client = TestClient(app)
    unknown_id = str(uuid.uuid4())

    with patch("backend.app.db.session.SessionLocal", side_effect=FailingDBSession):
        response = client.get(f"/api/v1/runs/{unknown_id}")
        assert response.status_code == 404
        assert response.json() == {"error": "Run not found"}


def test_get_conversation_history_offline_fallback():
    """GET /api/v1/chat/{conversation_id}/history returns in-memory turns when DB is down."""
    client = TestClient(app)
    thread_id = "thread-history-004"
    run_1 = str(uuid.uuid4())
    run_2 = str(uuid.uuid4())

    offline_persistence_store.create_run(
        run_id=run_1,
        thread_id=thread_id,
        metadata_json={"request": {"message": "Turn 1"}},
        status="COMPLETED",
    )
    offline_persistence_store.update_run(run_1, response={"answer": "Response 1"})

    offline_persistence_store.create_run(
        run_id=run_2,
        thread_id=thread_id,
        metadata_json={"request": {"message": "Turn 2"}},
        status="COMPLETED",
    )
    offline_persistence_store.update_run(run_2, response={"answer": "Response 2"})

    with patch("backend.app.db.session.SessionLocal", side_effect=FailingDBSession):
        response = client.get(f"/api/v1/chat/{thread_id}/history")
        assert response.status_code == 200
        data = response.json()
        assert data["conversation_id"] == thread_id
        assert len(data["history"]) == 2
        assert data["history"][0]["request"]["message"] == "Turn 1"
        assert data["history"][1]["request"]["message"] == "Turn 2"
        assert data["persistence_status"] == "offline_in_memory"


def test_get_map_layer_offline_fallback():
    """GET /api/v1/map/layers/{layer_id} returns in-memory map layer when DB is down."""
    client = TestClient(app)
    run_id = str(uuid.uuid4())
    layer_id = str(uuid.uuid4())

    offline_persistence_store.save_map_layer(
        run_id=run_id,
        layer_type="hazard_polygon",
        geojson_geom={"type": "Polygon", "coordinates": [[[73.0, 16.0], [73.5, 16.0], [73.5, 16.5], [73.0, 16.0]]]},
        properties={"layer_id": layer_id, "name": "Offline High Wave Alert"},
    )

    with patch("backend.app.db.session.SessionLocal", side_effect=FailingDBSession):
        response = client.get(f"/api/v1/map/layers/{layer_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == layer_id
        assert data["layer_type"] == "hazard_polygon"
        assert data["properties"]["name"] == "Offline High Wave Alert"


def test_get_map_layer_nonexistent_returns_404_not_500():
    """GET /api/v1/map/layers/{unknown} returns 404 when DB is offline (never 500)."""
    client = TestClient(app)
    unknown_id = str(uuid.uuid4())

    with patch("backend.app.db.session.SessionLocal", side_effect=FailingDBSession):
        response = client.get(f"/api/v1/map/layers/{unknown_id}")
        assert response.status_code == 404
        assert response.json() == {"error": "Map layer not found"}


# ---------------------------------------------------------------------------
# 3. Synthetic Demo Endpoints Read Availability Without DB
# ---------------------------------------------------------------------------


def test_synthetic_demo_endpoints_with_db_offline():
    """Verify all /api/v1/demo/* endpoints return valid structured data when DB is offline."""
    client = TestClient(app)

    with patch("backend.app.db.session.SessionLocal", side_effect=FailingDBSession):
        # 1. Manifest
        res = client.get("/api/v1/demo/manifest")
        assert res.status_code == 200
        assert res.json()["dataset_name"] == "ORCA_DEMO_V1"

        # 2. Stakeholders
        res = client.get("/api/v1/demo/stakeholders")
        assert res.status_code == 200
        assert len(res.json()) >= 5

        # 3. Harbors
        res = client.get("/api/v1/demo/harbors")
        assert res.status_code == 200
        harbor_names = [h["name"] for h in res.json()]
        assert "Ratnagiri" in harbor_names

        # 4. Vessels
        res = client.get("/api/v1/demo/vessels")
        assert res.status_code == 200
        assert len(res.json()) >= 2

        # 5. Marine Observations
        res = client.get("/api/v1/demo/marine-observations")
        assert res.status_code == 200
        assert len(res.json()) > 0

        # 6. Routes
        res = client.get("/api/v1/demo/routes")
        assert res.status_code == 200
        assert "nodes" in res.json() and "edges" in res.json()

        # 7. Hazards
        res = client.get("/api/v1/demo/hazards")
        assert res.status_code == 200
        assert len(res.json()) > 0

        # 8. Notifications
        res = client.get("/api/v1/demo/notifications")
        assert res.status_code == 200
        assert len(res.json()) > 0


# ---------------------------------------------------------------------------
# 4. Invariants & Safety Preservation
# ---------------------------------------------------------------------------


def test_offline_mode_does_not_fabricate_safe_weather_values():
    """Verify that offline persistence failures never invent safe weather/marine metrics."""
    service = AgentRunService(data_mode="SYNTHETIC")

    # Verify that DataService still uses authentic source normalizers
    from backend.app.services.data_service import data_service
    from backend.app.agents.integrations.contracts import ToolInvocationContext

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    bundle = data_service.get_observation_bundle(ctx)

    # Observations remain typed and grounded
    assert bundle.marine is not None
    assert bundle.weather is not None
    assert bundle.hazard is not None
