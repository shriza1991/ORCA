"""Agent Run Service — Non-blocking ORCA Graph Dispatcher.

Owned by Dev 2 (Backend Platform).
Referenced by: backend/app/api/v1/routes.py

This service is the sole point of contact between the FastAPI async layer
(Dev 2) and the synchronous LangGraph orchestrator (Dev 3).

Design decisions
----------------

1. Why ``anyio.to_thread.run_sync``?
   ``run_orca_graph`` calls ``graph.invoke()`` which is *synchronous* —
   LangGraph's StateGraph compile/invoke API does not expose an async
   interface at M1.  Calling it directly on the asyncio event loop would
   block every other in-flight request for the full graph execution duration
   (typically 300 ms–2 s under demo/mock modes).  Offloading to anyio's
   thread pool gives us cooperative concurrency at no correctness cost and
   no change to the Dev 3 interface.

2. Why ``tool_mode="contract_mock"`` for SNAPSHOT?
   The original "demo" tool_mode was the M1 stub layer — hard-wired fixture
   values with no typing guarantees.  The M2 contract mock layer
   (``tool_mode="contract_mock"``) provides typed Pydantic-validated
   payloads that exactly mirror the contracts that live providers will
   satisfy in a future milestone.  Using contract mocks for SNAPSHOT means
   the API surface exercised in snapshot mode is *identical* to the one that
   will be exercised in LIVE mode — only the data source changes.

   IMPORTANT: Contract mocks are labelled as simulated data in every
   EvidenceItem.quality_flags list.  They must NEVER be treated as live
   or hybrid data.

3. Why LIVE/HYBRID return 503?
   Real provider authentication (INCOIS API keys, IMD tokens) and connector
   wiring belong to a future milestone.  Exposing LIVE or HYBRID silently
   while still serving contract mocks would be a safety lie — a mariner
   would receive data that looks authoritative but is fabricated.  503 with
   a clear human-readable body is the only honest response until Dev 3
   completes the provider handoff.

4. Dev 3 handoff for provider mode
   When real providers are integrated, Dev 3 should:
   a. Add ``register_live_providers(tool_registry)`` in ``graph.py`` or a
      new ``integrations/live.py`` module.
   b. Update ``run_orca_graph`` to accept and route a ``tool_mode="live"``
      value through the supervisor node.
   c. Signal readiness by removing the LIVE/HYBRID guard below (or
      replacing it with a feature-flag check on ``settings.LIVE_READY``).
   Dev 2 will then wire ``AgentRunService.run_live()`` without touching the
   SNAPSHOT path.

5. Agent exception → degraded ChatResponse (not 5xx)
   A 500 on a marine safety query is worse UX than an explicit UNKNOWN
   response that tells the mariner "hold departure and contact support".
   The route layer can distinguish degraded responses via the warning
   ``"[DEV2-AGENT-ERROR]"`` prefix in the warnings list.
"""

from __future__ import annotations

import logging
import uuid
from functools import partial
from typing import Any

import anyio

from backend.app.contracts.chat import (
    ChatResponse,
    Confidence,
    ConfidenceLevel,
    Recommendation,
    RecommendationStatus,
)
from backend.app.core.config import settings
from backend.app.services import state_mapper

try:
    from backend.app.agents.graph import run_orca_graph
except ImportError:
    run_orca_graph = None

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Structured Dev 2 error envelope (also importable by the route layer)
# ---------------------------------------------------------------------------


class Dev2ErrorEnvelope:
    """Structured error body returned when the agent service cannot proceed.

    Not a Pydantic model — kept as a plain dataclass-style class so it can
    be used as both a dict payload and as a typed container without
    introducing a full model into the contract layer.
    """

    def __init__(
        self,
        code: str,
        message: str,
        hint: str = "",
        run_id: str | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.hint = hint
        self.run_id = run_id or str(uuid.uuid4())

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "hint": self.hint,
                "run_id": self.run_id,
            }
        }


# ---------------------------------------------------------------------------
# Degraded ChatResponse builder (agent exception path)
# ---------------------------------------------------------------------------


def _build_degraded_response(
    run_id: str,
    conversation_id: str,
    exc: Exception,
) -> ChatResponse:
    """Return a conservative UNKNOWN ChatResponse when the graph crashes.

    The warning list is tagged with ``[DEV2-AGENT-ERROR]`` so the route
    layer can log/alert without leaking exception internals to the client.
    """
    exc_type = type(exc).__name__
    logger.exception("AgentRunService: graph execution failed (%s)", exc_type)
    return ChatResponse(
        run_id=run_id,
        conversation_id=conversation_id,
        language="en",
        intent="UNKNOWN",
        answer=(
            "ORCA cannot access marine data right now, so a safe operating decision "
            "cannot be completed. Hold departure and verify with port authorities."
        ),
        recommendation=Recommendation(
            status=RecommendationStatus.UNKNOWN,
            summary="No reliable marine evidence was available for this assessment.",
            decisive_factors=["Internal agent error — no reliable data available."],
            next_action="Hold departure. Verify current conditions with port authorities.",
        ),
        confidence=Confidence(
            level=ConfidenceLevel.LOW,
            reasons=["Agent execution failed — no reliable data was gathered."],
        ),
        evidence=[],
        map_layers=[],
        trace=[],
        warnings=[
            f"[DEGRADED] Marine data provider or agent unavailable ({exc_type}). "
            "Response is unreliable and must not be used for voyage decisions."
        ],
        suggested_followups=[],
        data_mode="UNAVAILABLE",
    )


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------


class AgentRunService:
    """DATA_MODE-aware dispatcher for the ORCA LangGraph pipeline.

    Instantiate once at application startup and inject into route handlers.
    """

    def __init__(self, data_mode: str | None = None) -> None:
        self._data_mode = data_mode

    @property
    def data_mode(self) -> str:
        return self._data_mode or settings.DATA_MODE

    def _response_data_mode(self, response: ChatResponse | None = None) -> str:
        """Map internal connector modes to honest public response labels."""
        mode = self.data_mode.upper()
        if mode in {"SNAPSHOT", "SYNTHETIC"}:
            return "DEMO"
        if mode == "LIVE":
            return "LIVE"
        if mode == "HYBRID" and response is not None:
            source_names = [item.source_name for item in response.evidence]
            source_names.extend(item.source_name for item in response.recommendation.provenance)
            normalized_sources = [name.upper() for name in source_names]
            if any(
                marker in name
                for name in normalized_sources
                for marker in ("HYBRID FALLBACK", "ORCA", "SYNTHETIC", "SNAPSHOT", "DEMO")
            ):
                return "FALLBACK"
            if normalized_sources:
                return "LIVE"
        # Do not describe a hybrid request with no attributable evidence as
        # live or cached data.
        return "UNAVAILABLE"

    async def run_agent(
        self,
        *,
        user_message: str,
        conversation_id: str,
        run_id: str,
        user_context: dict[str, Any] | None = None,
        mission_state: Any | None = None,
    ) -> ChatResponse:
        """Run the ORCA graph in provider mode and persist the results."""
        # ------------------------------------------------------------------
        # DATA_MODE guard — when service instance is explicitly in LIVE/HYBRID
        # ------------------------------------------------------------------
        if self._data_mode in ("LIVE", "HYBRID"):
            logger.warning(
                "AgentRunService: DATA_MODE=%s requested but LIVE/HYBRID providers "
                "are not yet implemented. Returning 503.",
                self._data_mode,
            )
            raise _LiveModeNotReadyError(
                data_mode=self._data_mode,
                run_id=run_id,
            )

        import uuid

        from backend.app.db.models import RunStatus
        from backend.app.db.repositories import (
            EvidenceRepository,
            MapLayerRepository,
            RunRepository,
        )
        from backend.app.db.offline_store import offline_persistence_store
        from backend.app.db.session import SessionLocal

        if run_orca_graph is None:
            logger.error("AgentRunService: langgraph not installed — run_orca_graph unavailable")
            raise _AgentRuntimeUnavailableError(run_id=run_id)

        run_uuid = uuid.UUID(run_id)

        # 0. Check in-memory store for active runs in the same thread (concurrency check in offline mode)
        active_in_mem = offline_persistence_store.get_active_run_in_thread(conversation_id)
        if active_in_mem and str(active_in_mem.get("id")) != str(run_id):
            raise _DuplicateRunError(run_id=str(active_in_mem["id"]))

        # Generate request ID and persist full request envelope
        request_id = str(uuid.uuid4())
        metadata = {
            "request_id": request_id,
            "data_mode": self.data_mode,
            "request": {
                "message": user_message,
                "conversation_id": conversation_id,
                "user_context": user_context or {},
            },
        }

        # Track in offline in-memory store
        offline_persistence_store.create_run(
            run_id=run_id,
            thread_id=conversation_id,
            metadata_json=metadata,
            status=RunStatus.RUNNING.value,
        )

        # 1. Create RUNNING record in DB (if DB is online)
        try:
            with SessionLocal() as session:
                from backend.app.db.models import Run

                run_repo = RunRepository(session)

                # Check for concurrent running requests in the same conversation
                active_run = (
                    session.query(Run)
                    .filter_by(thread_id=conversation_id, run_status=RunStatus.RUNNING)
                    .first()
                )
                if active_run:
                    raise _DuplicateRunError(run_id=str(active_run.id))

                run_repo.create(thread_id=conversation_id, metadata_json=metadata, run_id=run_uuid)

                # Update to RUNNING
                run_repo.update_status(run_uuid, RunStatus.RUNNING)
        except _DuplicateRunError:
            offline_persistence_store.update_run(
                run_id=run_id,
                status=RunStatus.FAILED.value,
                error_message="Duplicate run in thread",
            )
            raise
        except Exception as exc:
            logger.debug("Database run tracking unavailable (service offline): %s", exc)

        logger.info(
            "AgentRunService: run_id=%s conversation_id=%s data_mode=%s tool_mode=provider llm_mode=%s",
            run_id,
            conversation_id,
            self.data_mode,
            settings.LLM_MODE,
        )

        _run = partial(
            run_orca_graph,
            user_message=user_message,
            thread_id=conversation_id,
            user_context=user_context or {},
            tool_mode="provider",  # Use registered providers
            llm_mode=settings.LLM_MODE,  # Config-driven dispatch (auto | deterministic | fake | provider)
            mission_state=mission_state,
        )

        try:
            final_state = await anyio.to_thread.run_sync(_run)
        except anyio.get_cancelled_exc_class():
            offline_persistence_store.update_run(run_id=run_id, status=RunStatus.CANCELLED.value)
            try:
                with SessionLocal() as session:
                    RunRepository(session).update_status(run_uuid, RunStatus.CANCELLED)
            except Exception:
                pass
            raise
        except Exception as exc:
            offline_persistence_store.update_run(
                run_id=run_id, status=RunStatus.FAILED.value, error_message=str(exc)
            )
            try:
                with SessionLocal() as session:
                    RunRepository(session).update_status(
                        run_uuid, RunStatus.FAILED, error_message=str(exc)
                    )
            except Exception:
                pass
            raise _AgentExecutionError(run_id=run_id, exc=exc)

        # Map state to response
        response = state_mapper.map_state_to_response(final_state, run_id, conversation_id)
        if response.run_id != run_id:
            response.run_id = run_id
        response.data_mode = self._response_data_mode(response)

        # Determine run status
        has_warnings = any(
            "failure" in w.lower() or "error" in w.lower() or "degraded" in w.lower()
            for w in response.warnings
        )
        final_status = RunStatus.PARTIAL if has_warnings else RunStatus.COMPLETED

        # 2. Persist to offline in-memory store first (guarantees session retrieval)
        response_envelope = {
            "answer": response.answer,
            "intent": response.intent,
            "language": response.language,
            "recommendation": response.recommendation.model_dump(),
            "confidence": response.confidence.model_dump(),
            "warnings": response.warnings,
            "suggested_followups": response.suggested_followups,
            "data_mode": response.data_mode,
        }
        trace_list = [
            t.model_dump() if hasattr(t, "model_dump") else t for t in response.trace
        ]
        offline_persistence_store.update_run(
            run_id=run_id,
            status=final_status.value,
            error_message="|".join(response.warnings) if has_warnings else None,
            response=response_envelope,
            trace=trace_list,
        )

        for ev in response.evidence:
            ev_source = getattr(ev, "source_name", None) or getattr(ev, "source", "unknown")
            raw_data = {
                "evidence_id": ev.evidence_id,
                "metric_name": ev.metric_name,
                "metric_value": ev.metric_value,
                "metric_unit": ev.metric_unit,
                "observed_time": ev.observed_time,
                "valid_from": ev.valid_from,
                "valid_to": ev.valid_to,
                "retrieved_at": ev.retrieved_at,
                "source_url": ev.source_url,
                "quality_flags": ev.quality_flags,
                "geometry": ev.geometry,
            }
            offline_persistence_store.save_evidence(
                run_id=run_id,
                source=ev_source,
                raw_data=raw_data,
                extracted_entities={},
            )

        for layer in response.map_layers:
            layer_dict = layer.model_dump() if hasattr(layer, "model_dump") else layer
            geojson_payload = layer_dict.get("geojson", {})
            ltype = layer_dict.get("layer_type", "feature")
            props = {
                "layer_id": layer_dict.get("layer_id"),
                "name": layer_dict.get("name"),
                "visible": layer_dict.get("visible", True),
                "style": layer_dict.get("style", {}),
            }
            offline_persistence_store.save_map_layer(
                run_id=run_id,
                layer_type=ltype,
                geojson_geom=geojson_payload,
                properties=props,
            )

        # 3. Persist to Database (if DB is online)
        persistence_ok = True
        try:
            with SessionLocal() as session:
                run_repo = RunRepository(session)
                evidence_repo = EvidenceRepository(session)
                map_repo = MapLayerRepository(session)

                run = run_repo.update_status(
                    run_uuid,
                    final_status,
                    error_message="|".join(response.warnings) if has_warnings else None,
                )
                if run:
                    updated_metadata = dict(run.metadata_json or {})
                    # Full response envelope for round-trip reconstruction
                    updated_metadata["response"] = response_envelope
                    updated_metadata["trace"] = trace_list
                    run.metadata_json = updated_metadata
                    session.add(run)
                    session.commit()

                # Persist Evidence — use contract field names
                for ev in response.evidence:
                    ev_source = getattr(ev, "source_name", None) or getattr(ev, "source", "unknown")
                    raw_data = {
                        "evidence_id": ev.evidence_id,
                        "metric_name": ev.metric_name,
                        "metric_value": ev.metric_value,
                        "metric_unit": ev.metric_unit,
                        "observed_time": ev.observed_time,
                        "valid_from": ev.valid_from,
                        "valid_to": ev.valid_to,
                        "retrieved_at": ev.retrieved_at,
                        "source_url": ev.source_url,
                        "quality_flags": ev.quality_flags,
                        "geometry": ev.geometry,
                    }
                    evidence_repo.create(
                        run_id=run_uuid,
                        source=ev_source,
                        raw_data=raw_data,
                        extracted_entities={},
                    )

                # Persist Map Layers — extract geometry from geojson payload
                for layer in response.map_layers:
                    layer_dict = layer.model_dump() if hasattr(layer, "model_dump") else layer
                    geojson_payload = layer_dict.get("geojson", {})
                    ltype = layer_dict.get("layer_type", "feature")

                    # Extract geometry from GeoJSON Feature, FeatureCollection, or raw Geometry
                    geom = None
                    if geojson_payload.get("type") == "Feature":
                        geom = geojson_payload.get("geometry")
                    elif geojson_payload.get("type") == "FeatureCollection":
                        features = geojson_payload.get("features", [])
                        if features:
                            geom = features[0].get("geometry")
                    elif geojson_payload.get("type") in (
                        "Point", "LineString", "Polygon",
                        "MultiPoint", "MultiLineString", "MultiPolygon",
                    ):
                        geom = geojson_payload

                    props = {
                        "layer_id": layer_dict.get("layer_id"),
                        "name": layer_dict.get("name"),
                        "visible": layer_dict.get("visible", True),
                        "style": layer_dict.get("style", {}),
                    }
                    if geom:
                        map_repo.create_from_geojson(
                            run_id=run_uuid,
                            layer_type=ltype,
                            geojson_geom=geom,
                            properties=props,
                        )
        except Exception as exc:
            persistence_ok = False
            logger.warning(
                "Database run persistence failed (analysis was successful): %s", exc
            )

        # Signal persistence degradation without failing the analysis response
        if not persistence_ok:
            response.warnings.append(
                "[PERSISTENCE-DEGRADED] Analysis completed successfully but could not "
                "be saved to the database. This response is valid but has not been persisted."
            )

        return response

    # Backward compatibility alias
    run_snapshot = run_agent


# ---------------------------------------------------------------------------
# Internal sentinel exceptions (never surfaced to clients)
# ---------------------------------------------------------------------------


class _LiveModeNotReadyError(Exception):
    """Raised when DATA_MODE is LIVE or HYBRID before providers are wired."""

    def __init__(self, data_mode: str, run_id: str) -> None:
        self.data_mode = data_mode
        self.run_id = run_id
        super().__init__(f"DATA_MODE={data_mode} not yet implemented")


class _AgentRuntimeUnavailableError(Exception):
    """Raised when the langgraph package cannot be imported."""

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        super().__init__("langgraph not installed")


class _DuplicateRunError(Exception):
    """Raised when a run_id already exists in the database."""

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        super().__init__(f"Run ID {run_id} already exists")


class _AgentExecutionError(Exception):
    """Raised when the agent graph execution fails unexpectedly."""

    def __init__(self, run_id: str, exc: Exception) -> None:
        self.run_id = run_id
        self.original_exc = exc
        super().__init__(f"Agent execution failed: {exc!s}")


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

agent_run_service = AgentRunService()
