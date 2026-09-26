"""API v1 Routing for SAMUDRA.

Owned by Dev 2 (Backend Platform).
Routes declare types and inputs, delegating to:
  - AgentRunService  (Dev 2): async wrapper around Dev 3's run_orca_graph
  - map_state_to_response (Dev 2): ORCAState → ChatResponse conversion

Dev 2 responsibilities here:
- Request validation and session ID generation
- DATA_MODE-aware tool_mode selection (via AgentRunService)
- LIVE/HYBRID rejection until providers are wired (returns 503)
- Bounded error handling (no agent errors exposed to client)
- OpenAPI request/response examples for developer discovery
"""

from __future__ import annotations

import logging
import math
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from backend.app.contracts.chat import (
    ChatRequest,
    ChatResponse,
    TranscribeResponse,
    VoiceChatResponse,
)
from backend.app.contracts.situation import SectorHazard, SectorHazardAssociationsResponse, SectorHazardsResponse, SectorOperationalAlertsResponse, SectorSituationResponse, VesselHazardAssociation, VesselHazardOperationalAlert
from backend.app.core.config import settings
from backend.app.db.session import SessionLocal
from backend.app.services.agent_run_service import (
    Dev2ErrorEnvelope,
    _AgentExecutionError,
    _AgentRuntimeUnavailableError,
    _DuplicateRunError,
    _LiveModeNotReadyError,
    _build_degraded_response,
    agent_run_service,
)
from backend.app.services.stt_service import (
    STTConfigurationError,
    STTServiceError,
    transcribe_audio_bytes,
)
from backend.app.services.tts_service import (
    TTSConfigurationError,
    TTSServiceError,
    synthesize_speech,
)

from backend.app.api.v1.assessments import router as assessments_router
from backend.app.api.v1.alerts import router as alerts_router

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")
router.include_router(assessments_router)
router.include_router(alerts_router)



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_user_context(request: ChatRequest) -> dict[str, Any]:
    """Convert ChatRequest.user_context to the dict expected by ORCAState."""
    if request.user_context is None:
        return {}
    ctx = request.user_context
    context = {
        "sector_id": ctx.sector_id,
        "origin_harbor": ctx.origin_harbor,
        "coordinates": ctx.coordinates,
        "craft_profile": ctx.craft_profile or "motorized_boat",
        "language_preference": ctx.language_preference or "auto",
    }
    if ctx.sector_id:
        from backend.app.domain.situation import resolve_authority_sector_context

        sector_context = resolve_authority_sector_context(ctx.sector_id)
        if sector_context is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown canonical Authority sector '{ctx.sector_id}'.",
            )
        # A validated Authority sector is authoritative for this request; no
        # client-provided harbor or coordinates can cross-contaminate it.
        context.update({
            "sector_id": sector_context["sector_id"],
            "origin_harbor": sector_context["origin_harbor"],
            "coordinates": sector_context["coordinates"],
        })
    return context


# ---------------------------------------------------------------------------
# OpenAPI examples — used on the /chat endpoint
# ---------------------------------------------------------------------------

_CHAT_REQUEST_EXAMPLE: dict[str, Any] = {
    "summary": "Safety check from Ratnagiri (SNAPSHOT mode)",
    "description": (
        "Typical safety-of-departure query in English. "
        "In SNAPSHOT mode the response is populated from M2 contract mocks."
    ),
    "value": {
        "message": "Is it safe to leave Ratnagiri tomorrow morning?",
        "conversation_id": None,
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "craft_profile": "motorized_boat",
            "language_preference": "en",
        },
    },
}

_CHAT_REQUEST_EXAMPLE_HINDI: dict[str, Any] = {
    "summary": "Hindi safety query (multi-lingual)",
    "value": {
        "message": "क्या कल सुबह रत्नागिरि से निकलना सुरक्षित है?",
        "user_context": {
            "origin_harbor": "Ratnagiri",
            "craft_profile": "motorized_boat",
            "language_preference": "hi",
        },
    },
}

_CHAT_RESPONSE_EXAMPLE: dict[str, Any] = {
    "summary": "Successful CAUTION response (SNAPSHOT / contract-mock)",
    "value": {
        "run_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "conversation_id": "8d1e5c0f-2b4a-4e6b-9f7c-1a3d5e7b9f01",
        "language": "en",
        "intent": "GO_NO_GO_SAFETY",
        "answer": "[CAUTION] Operational Advisory for Ratnagiri: ...",
        "recommendation": {
            "status": "CAUTION",
            "summary": "Elevated wave heights forecast. Exercise caution.",
            "decisive_factors": ["Significant wave height: 2.1 m", "Wind speed: 18 kn"],
            "next_action": "Depart only with experienced crew and adequate safety gear.",
        },
        "confidence": {
            "level": "MEDIUM",
            "reasons": ["INCOIS OSF data (contract mock). Real-time verification pending."],
        },
        "evidence": [],
        "map_layers": [],
        "trace": [],
        "warnings": ["[SNAPSHOT] Data sourced from M2 contract mocks — not live."],
        "suggested_followups": [
            "When will sea conditions improve?",
            "Alternative sheltered route options",
            "Port authority emergency contacts",
        ],
    },
}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/health", tags=["System"])
async def health_check():
    """System health check and operational mode discovery."""
    from sqlalchemy import text

    from backend.app.db.models import ConnectorStatus

    db_status = "unknown"
    global_status = "healthy"
    connectors = []

    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
            db_status = "connected"

            # Check connector health
            if settings.DATA_MODE != "SNAPSHOT":
                connectors = session.query(ConnectorStatus).all()
                if any(not c.is_online for c in connectors):
                    global_status = "degraded"
                if connectors and all(not c.is_online for c in connectors):
                    global_status = "unavailable"

    except Exception as e:
        logger.debug("Database health check failed (service offline): %s", e)
        db_status = f"disconnected ({e})"
        global_status = "unavailable"

    return {
        "status": global_status,
        "app_name": settings.APP_NAME,
        "app_env": settings.APP_ENV,
        "data_mode": settings.DATA_MODE,
        "database": db_status,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    tags=["Agentic Chat"],
    summary="Submit query to LangGraph Bounded Agent Pipeline",
    description=(
        "Entrypoint for marine natural-language queries.\n\n"
        "Wires ChatRequest into the LangGraph ORCA agent pipeline (Dev 3) and\n"
        "converts the resulting ORCAState into a ChatResponse.\n\n"
        "**DATA_MODE behaviour:**\n"
        "- `SNAPSHOT` — Uses M2 typed contract mocks (`tool_mode=contract_mock`). "
        "All evidence items are explicitly labelled as simulated. "
        "This is the only mode enabled in the current milestone.\n"
        "- `LIVE` / `HYBRID` — Returns **503** until real provider auth and "
        "connector wiring are completed (Dev 3 handoff).\n\n"
        "**Error handling:**\n"
        "- Agent graph exceptions are caught and returned as a ChatResponse "
        "with `recommendation.status=UNKNOWN` and a `[DEV2-AGENT-ERROR]` warning.\n"
        "- Missing langgraph dependency → HTTP 503 with structured error body."
    ),
    openapi_extra={
        "requestBody": {
            "content": {
                "application/json": {
                    "examples": {
                        "safety_en": _CHAT_REQUEST_EXAMPLE,
                        "safety_hi": _CHAT_REQUEST_EXAMPLE_HINDI,
                    }
                }
            }
        },
        "responses": {
            "200": {
                "content": {
                    "application/json": {
                        "examples": {
                            "caution_snapshot": _CHAT_RESPONSE_EXAMPLE,
                        }
                    }
                }
            }
        },
    },
)
async def chat_endpoint(request: ChatRequest) -> ChatResponse:
    """Entrypoint for marine natural-language queries.

    Delegates to AgentRunService which:
    1. Guards DATA_MODE (rejects LIVE/HYBRID with 503)
    2. Offloads synchronous run_orca_graph to anyio's thread pool
    3. Maps ORCAState → ChatResponse via state_mapper
    4. Returns a degraded UNKNOWN response on agent exception

    Session management
    ------------------
    - ``conversation_id`` is generated server-side if absent from the request.
    - A new ``run_id`` UUID is generated for every request regardless.
    """
    conversation_id = request.conversation_id or str(uuid.uuid4())
    run_id = str(uuid.uuid4())
    user_context = _build_user_context(request)

    try:
        return await agent_run_service.run_agent(
            user_message=request.message,
            conversation_id=conversation_id,
            run_id=run_id,
            user_context=user_context,
        )

    except _DuplicateRunError as exc:
        envelope = Dev2ErrorEnvelope(
            code="DUPLICATE_RUN",
            message=f"Run ID {exc.run_id} already exists.",
            hint="Generate a new UUID for each chat request.",
            run_id=exc.run_id,
        )
        logger.warning("chat: Duplicate run — run_id=%s", exc.run_id)
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=envelope.to_dict(),
        )

    except _AgentExecutionError as exc:
        from backend.app.connectors.errors import (
            ConnectorAuthenticationError,
            ConnectorMalformedResponseError,
            ConnectorMissingSnapshotError,
            ConnectorRateLimitError,
            ConnectorStaleSnapshotError,
            ConnectorTimeoutError,
            ConnectorUpstreamUnavailableError,
        )

        # Expected provider failures are a valid degraded product state. Keep
        # the ChatResponse schema stable so clients can render UNKNOWN/HOLD
        # instead of collapsing a safety query into a generic 502 error.
        expected_provider_failure = (
            ConnectorAuthenticationError,
            ConnectorMalformedResponseError,
            ConnectorMissingSnapshotError,
            ConnectorRateLimitError,
            ConnectorStaleSnapshotError,
            ConnectorTimeoutError,
            ConnectorUpstreamUnavailableError,
        )
        if isinstance(exc.original_exc, expected_provider_failure):
            return _build_degraded_response(exc.run_id, conversation_id, exc.original_exc)

        error_code = "AGENT_EXECUTION_FAILED"
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        msg = "SAMUDRA encountered an internal error while processing your query."

        # Mask raw error messages for public consumption
        if isinstance(exc.original_exc, ConnectorTimeoutError):
            error_code = "UPSTREAM_TIMEOUT"
            status_code = status.HTTP_504_GATEWAY_TIMEOUT
            msg = "A live marine data provider took too long to respond."
        elif isinstance(exc.original_exc, ConnectorRateLimitError):
            error_code = "UPSTREAM_RATE_LIMIT"
            status_code = status.HTTP_429_TOO_MANY_REQUESTS
            msg = "Too many requests to marine data providers. Please try again later."
        elif isinstance(exc.original_exc, ConnectorAuthenticationError):
            error_code = "UPSTREAM_AUTH_FAILED"
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            msg = "SAMUDRA is temporarily unable to authenticate with marine data providers."
        elif isinstance(exc.original_exc, ConnectorMalformedResponseError):
            error_code = "UPSTREAM_MALFORMED_DATA"
            status_code = status.HTTP_502_BAD_GATEWAY
            msg = "Received invalid or unparseable data from a marine data provider."
        elif isinstance(
            exc.original_exc,
            (
                ConnectorUpstreamUnavailableError,
                ConnectorMissingSnapshotError,
                ConnectorStaleSnapshotError,
            ),
        ):
            error_code = "UPSTREAM_UNAVAILABLE"
            status_code = status.HTTP_502_BAD_GATEWAY
            msg = "A critical marine data provider is currently offline or unreachable."

        envelope = Dev2ErrorEnvelope(
            code=error_code,
            message=msg,
            hint="Please try again or contact support. Do not make any voyage decisions based on this response.",
            run_id=exc.run_id,
        )
        logger.error("chat: Agent execution failed — run_id=%s: %s", exc.run_id, exc.original_exc)
        return JSONResponse(
            status_code=status_code,
            content=envelope.to_dict(),
        )

    except _LiveModeNotReadyError as exc:
        envelope = Dev2ErrorEnvelope(
            code="DATA_MODE_NOT_READY",
            message=(
                f"DATA_MODE={exc.data_mode} is not yet available. "
                "Only SNAPSHOT mode is enabled in this milestone."
            ),
            hint=(
                "Set DATA_MODE=SNAPSHOT in your environment, or wait for the "
                "provider wiring milestone (Dev 3 handoff)."
            ),
            run_id=exc.run_id,
        )
        logger.warning("chat: DATA_MODE=%s not ready — run_id=%s", exc.data_mode, exc.run_id)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=envelope.to_dict(),
        )

    except _AgentRuntimeUnavailableError as exc:
        envelope = Dev2ErrorEnvelope(
            code="AGENT_RUNTIME_UNAVAILABLE",
            message="Agent runtime is not available. Ensure all dependencies are installed.",
            hint="Install: pip install langgraph",
            run_id=exc.run_id,
        )
        logger.error("chat: langgraph unavailable — run_id=%s", exc.run_id)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=envelope.to_dict(),
        )


@router.get(
    "/runs/{run_id}",
    tags=["Agentic Chat"],
    summary="Get Run details",
)
async def get_run(run_id: str):
    """Retrieve details for a specific ORCA agent run."""
    import uuid

    from backend.app.db.offline_store import offline_persistence_store
    from backend.app.db.repositories import RunRepository
    from backend.app.db.session import SessionLocal

    try:
        run_uuid = uuid.UUID(run_id)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid run_id format"})

    # 1. Try database first
    try:
        with SessionLocal() as session:
            run_repo = RunRepository(session)
            details = run_repo.get_run_with_details(run_uuid)
            if details:
                return details
    except Exception as exc:
        logger.debug("Database get_run failed (service offline): %s", exc)

    # 2. Fallback to in-memory offline store
    offline_details = offline_persistence_store.get_run_with_details(run_uuid)
    if offline_details:
        return offline_details

    return JSONResponse(status_code=404, content={"error": "Run not found"})


@router.get(
    "/map/layers/{layer_id}",
    tags=["Map"],
    summary="Get Map Layer",
)
async def get_map_layer(layer_id: str):
    """Retrieve a specific Map Layer by ID."""
    import uuid

    from geoalchemy2.shape import to_shape
    from shapely.geometry import mapping

    from backend.app.db.models import MapLayer
    from backend.app.db.offline_store import offline_persistence_store
    from backend.app.db.session import SessionLocal

    try:
        layer_uuid = uuid.UUID(layer_id)
    except ValueError:
        return JSONResponse(status_code=400, content={"error": "Invalid layer_id format"})

    # 1. Try database first
    try:
        with SessionLocal() as session:
            layer = session.query(MapLayer).filter_by(id=layer_uuid).first()
            if layer:
                geom_shape = to_shape(layer.geometry)
                geojson_geom = mapping(geom_shape)

                return {
                    "id": str(layer.id),
                    "run_id": str(layer.run_id),
                    "layer_type": layer.layer_type,
                    "geometry": geojson_geom,
                    "properties": layer.properties,
                    "created_at": layer.created_at.isoformat() if layer.created_at else None,
                }
    except Exception as exc:
        logger.debug("Database get_map_layer failed (service offline): %s", exc)

    # 2. Fallback to in-memory offline store
    offline_layer = offline_persistence_store.get_map_layer(layer_uuid)
    if offline_layer:
        return offline_layer

    return JSONResponse(status_code=404, content={"error": "Map layer not found"})


@router.get(
    "/scenarios",
    tags=["Evaluation & Demo"],
    summary="List canonical evaluation scenarios (S1–S8)",
)
async def list_scenarios():
    """Returns metadata for the 8 canonical evaluation scenarios (S1-S8)."""
    from backend.app.scenarios.registry import get_scenario_manifest

    manifest = get_scenario_manifest()
    return {"scenarios": [item.model_dump() for item in manifest]}


@router.get(
    "/demo-scenarios",
    tags=["Evaluation & Demo"],
    summary="Canonical alias for /scenarios — list evaluation scenarios (S1–S8)",
    description=(
        "Canonical alias for ``GET /api/v1/scenarios``.\n\n"
        "Returns the same 8 evaluation scenario descriptors. "
        "Clients and demo frontends should prefer this path going forward."
    ),
)
async def list_demo_scenarios():
    """Canonical alias for /scenarios — returns the same 8 scenario descriptors."""
    return await list_scenarios()


@router.get(
    "/scenarios/{scenario_id}",
    tags=["Evaluation & Demo"],
    summary="Get detailed scenario definition",
)
async def get_scenario_details(scenario_id: str):
    """Retrieve full scenario definition, inputs, and expected outcomes."""
    from backend.app.scenarios.registry import get_scenario

    try:
        scenario = get_scenario(scenario_id)
        return scenario.model_dump()
    except KeyError:
        return JSONResponse(status_code=404, content={"error": f"Scenario '{scenario_id}' not found."})


@router.post(
    "/scenarios/{scenario_id}/run",
    tags=["Evaluation & Demo"],
    summary="Execute evaluation scenario through SAMUDRA pipeline",
)
async def run_scenario_endpoint(scenario_id: str, language: str | None = None):
    """Executes a scenario deterministically through the LangGraph pipeline and returns the evaluation audit."""
    from backend.app.scenarios.registry import get_scenario
    from backend.app.scenarios.runner import ScenarioRunner

    try:
        scenario = get_scenario(scenario_id)
    except KeyError:
        return JSONResponse(status_code=404, content={"error": f"Scenario '{scenario_id}' not found."})

    result = ScenarioRunner.run(scenario, language=language)
    return result.model_dump()


@router.get(
    "/chat/{conversation_id}/history",
    tags=["Agentic Chat"],
    summary="Get conversation history",
)
async def get_conversation_history(conversation_id: str):
    """Retrieve chat history for a specific conversation ID."""
    from backend.app.db.offline_store import offline_persistence_store
    from backend.app.db.repositories import RunRepository
    from backend.app.db.session import SessionLocal

    # 1. Try database first
    try:
        with SessionLocal() as session:
            run_repo = RunRepository(session)
            runs = run_repo.get_all_by_thread(conversation_id)
            if runs:
                history = []
                for run in runs:
                    metadata = run.metadata_json or {}
                    turn = {
                        "id": str(run.id),
                        "status": run.run_status.value,
                        "started_at": run.started_at.isoformat() if run.started_at else None,
                        "request": metadata.get("request"),
                        "response": metadata.get("response"),
                        "data_mode": metadata.get("data_mode"),
                    }
                    history.append(turn)
                return {"conversation_id": conversation_id, "history": history}
    except Exception as exc:
        logger.debug("Database get_conversation_history failed (service offline): %s", exc)

    # 2. Fallback to in-memory offline store
    offline_runs = offline_persistence_store.get_runs_by_thread(conversation_id)
    if offline_runs:
        history = []
        for r in offline_runs:
            turn = {
                "id": str(r["id"]),
                "status": r["status"],
                "started_at": r["started_at"],
                "request": r.get("request"),
                "response": r.get("response"),
                "data_mode": r.get("data_mode"),
                "persisted": False,
            }
            history.append(turn)
        return {
            "conversation_id": conversation_id,
            "history": history,
            "persistence_status": "offline_in_memory",
            "warnings": ["[OFFLINE-EPHEMERAL] Conversation history loaded from in-memory session."],
        }

    return JSONResponse(status_code=404, content={"error": "Conversation not found"})


@router.get(
    "/layers/base",
    tags=["Map"],
    summary="Get static base layers",
)
async def get_base_layers():
    """Returns static operational polygons (e.g. IMBL, restricted zones) as GeoJSON."""
    import json
    from pathlib import Path

    candidate_paths = [
        Path("data/fixtures/geofences_india.geojson"),
        Path("data/fixtures/geospatial/restricted_zones.geojson"),
    ]
    for path in candidate_paths:
        if path.exists():
            try:
                with open(path, encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "POLY-NAV-GOA-01",
                "properties": {
                    "polygon_id": "POLY-NAV-GOA-01",
                    "name": "Naval Firing Range Foxtrot (Goa Sector)",
                    "polygon_type": "NAVAL_FIRING_RANGE",
                    "is_hard_restriction": True,
                    "restriction_level": "NO_GO",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [73.18, 15.30],
                            [73.35, 15.28],
                            [73.42, 15.36],
                            [73.42, 15.48],
                            [73.38, 15.54],
                            [73.25, 15.55],
                            [73.15, 15.52],
                            [73.08, 15.45],
                            [73.06, 15.38],
                            [73.12, 15.32],
                            [73.18, 15.30],
                        ]
                    ],
                },
            }
        ],
    }
 
 
@router.post(
    "/voice/transcribe",
    response_model=TranscribeResponse,
    status_code=status.HTTP_200_OK,
    tags=["Voice & STT"],
    summary="Transcribe mariner audio to text using Sarvam STT",
    description=(
        "Accepts multipart audio recordings (wav/webm/mp4), transcribes them using "
        "Sarvam AI's saaras:v4 model, and returns the transcript, raw language code, "
        "and normalized ISO-639-1 language code (e.g., 'mr', 'hi', 'en')."
    ),
)
async def transcribe_voice_endpoint(file: UploadFile = File(...)):
    """Transcribes an uploaded audio file using Sarvam STT."""
    try:
        audio_bytes = await file.read()
        filename = file.filename or "audio.wav"
        content_type = file.content_type

        result = transcribe_audio_bytes(
            audio_bytes=audio_bytes,
            filename=filename,
            content_type=content_type,
        )

        return TranscribeResponse(
            transcript=result["transcript"],
            language=result["language"],
            normalized_language=result["normalized_language"],
        )
    except STTConfigurationError as exc:
        logger.warning("Voice transcription unconfigured: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "STT_UNCONFIGURED", "detail": exc.message},
        )
    except STTServiceError as exc:
        logger.error("Voice transcription service error: %s", exc)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": "STT_ERROR", "detail": exc.message},
        )
    except Exception as exc:
        logger.exception("Unexpected error in voice transcription: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "TRANSCRIPTION_FAILED", "detail": "An internal error occurred during audio transcription."},
        )


@router.post(
    "/voice/chat",
    response_model=VoiceChatResponse,
    status_code=status.HTTP_200_OK,
    tags=["Voice & STT"],
    summary="End-to-end voice chat endpoint (STT -> ORCA Agent -> TTS)",
    description=(
        "Accepts mariner audio recording via multipart form data, transcribes it using Sarvam STT, "
        "routes the query through the LangGraph ORCA reasoning pipeline, synthesizes the localized "
        "advisory using Sarvam TTS, and returns a playable base64 audio response alongside full "
        "safety recommendation, evidence, and trace telemetry."
    ),
)
async def voice_chat_endpoint(
    file: UploadFile = File(...),
    conversation_id: str | None = Form(None),
    origin_harbor: str | None = Form(None),
    craft_profile: str | None = Form("motorized_boat"),
    language_preference: str | None = Form("auto"),
):
    """End-to-end voice chat adapter around ORCA pipeline."""
    # 1. Validate audio payload
    try:
        audio_bytes = await file.read()
    except Exception as exc:
        logger.error("Failed to read uploaded audio file: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "INVALID_AUDIO", "detail": "Failed to read uploaded audio file."},
        )

    if not audio_bytes or len(audio_bytes) == 0:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "INVALID_AUDIO", "detail": "Empty audio file provided."},
        )

    # 2. STT Transcription
    filename = file.filename or "audio.wav"
    content_type = file.content_type

    try:
        stt_result = transcribe_audio_bytes(
            audio_bytes=audio_bytes,
            filename=filename,
            content_type=content_type,
        )
    except STTConfigurationError as exc:
        logger.warning("Voice chat STT unconfigured: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "STT_UNCONFIGURED", "detail": exc.message},
        )
    except STTServiceError as exc:
        logger.error("Voice chat STT error: %s", exc)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": "STT_ERROR", "detail": exc.message},
        )
    except Exception as exc:
        logger.exception("Unexpected error in voice chat STT: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "TRANSCRIPTION_FAILED", "detail": "An internal error occurred during STT transcription."},
        )

    transcript = stt_result.get("transcript", "").strip()
    raw_language = stt_result.get("language", "unknown")
    normalized_language = stt_result.get("normalized_language", "en")

    if not transcript:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "EMPTY_TRANSCRIPT", "detail": "Could not recognize any speech in the uploaded audio."},
        )

    # 3. ORCA Agent Pipeline Integration
    effective_conv_id = conversation_id or str(uuid.uuid4())
    run_id = str(uuid.uuid4())

    effective_lang = (
        normalized_language
        if (language_preference in (None, "", "auto"))
        else language_preference
    )

    user_context = {
        "origin_harbor": origin_harbor,
        "craft_profile": craft_profile or "motorized_boat",
        "language_preference": effective_lang,
    }

    try:
        chat_response = await agent_run_service.run_agent(
            user_message=transcript,
            conversation_id=effective_conv_id,
            run_id=run_id,
            user_context=user_context,
        )
    except _DuplicateRunError as exc:
        envelope = Dev2ErrorEnvelope(
            code="DUPLICATE_RUN",
            message=f"Run ID {exc.run_id} already exists.",
            hint="Generate a new UUID for each chat request.",
            run_id=exc.run_id,
        )
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=envelope.to_dict(),
        )
    except _LiveModeNotReadyError as exc:
        envelope = Dev2ErrorEnvelope(
            code="DATA_MODE_NOT_READY",
            message=f"DATA_MODE={exc.data_mode} is not yet available.",
            hint="Set DATA_MODE=SNAPSHOT in your environment.",
            run_id=exc.run_id,
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=envelope.to_dict(),
        )
    except _AgentRuntimeUnavailableError as exc:
        envelope = Dev2ErrorEnvelope(
            code="AGENT_RUNTIME_UNAVAILABLE",
            message="Agent runtime is not available.",
            run_id=exc.run_id,
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=envelope.to_dict(),
        )
    except _AgentExecutionError as exc:
        envelope = Dev2ErrorEnvelope(
            code="AGENT_EXECUTION_FAILED",
            message="SAMUDRA encountered an internal error while processing your query.",
            run_id=exc.run_id,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=envelope.to_dict(),
        )
    except Exception as exc:
        logger.exception("Unexpected error in ORCA voice agent execution: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "AGENT_EXECUTION_FAILED", "detail": str(exc)},
        )

    if isinstance(chat_response, JSONResponse):
        return chat_response

    # 4. TTS Speech Synthesis
    audio_base64: str | None = None
    audio_format = "audio/wav"
    try:
        tts_result = synthesize_speech(
            text=chat_response.answer,
            language_code=chat_response.language or normalized_language,
        )
        audio_base64 = tts_result.get("audio_base64")
        audio_format = tts_result.get("audio_format", "audio/wav")
    except TTSConfigurationError as exc:
        logger.warning("Voice chat TTS unconfigured: %s", exc)
        chat_response.warnings.append(f"[TTS-UNCONFIGURED] Speech synthesis unavailable: {exc.message}")
    except TTSServiceError as exc:
        logger.error("Voice chat TTS service error: %s", exc)
        chat_response.warnings.append(f"[TTS-ERROR] Speech synthesis degraded: {exc.message}")
    except Exception as exc:
        logger.exception("Unexpected error in voice chat TTS: %s", exc)
        chat_response.warnings.append(f"[TTS-FAILED] Speech synthesis failed: {str(exc)}")

    # 5. Return Complete VoiceChatResponse
    return VoiceChatResponse(
        run_id=chat_response.run_id,
        conversation_id=chat_response.conversation_id,
        language=chat_response.language,
        intent=chat_response.intent,
        answer=chat_response.answer,
        recommendation=chat_response.recommendation,
        confidence=chat_response.confidence,
        evidence=chat_response.evidence,
        map_layers=chat_response.map_layers,
        trace=chat_response.trace,
        warnings=chat_response.warnings,
        suggested_followups=chat_response.suggested_followups,
        transcript=transcript,
        detected_language=raw_language,
        audio_base64=audio_base64,
        audio_format=audio_format,
    )


# ---------------------------------------------------------------------------
# Synthetic Demo Endpoints (/api/v1/demo/*)
# ---------------------------------------------------------------------------
from backend.app.db.repositories import SyntheticDemoRepository
import pathlib
import json

_in_memory_synthetic_cache: dict[str, Any] | None = None


def _get_synthetic_records(key: str, namespace: str = "SAMUDRA_DEMO_V1") -> list[dict[str, Any]]:
    """Fallback generator for synthetic demo records when PostgreSQL is offline."""
    global _in_memory_synthetic_cache
    if _in_memory_synthetic_cache is None:
        from backend.app.domain.synthetic.generator import generate_synthetic_demo_dataset
        _in_memory_synthetic_cache = generate_synthetic_demo_dataset()
    raw_items = _in_memory_synthetic_cache.get(key, [])
    formatted = []
    for item in raw_items:
        if item.get("namespace") == namespace:
            d = dict(item)
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
                elif isinstance(v, uuid.UUID):
                    d[k] = str(v)
            formatted.append(d)
    return formatted


def _model_to_dict(obj: Any) -> dict[str, Any]:
    """Helper to convert SQLAlchemy model instance to dictionary."""
    if obj is None:
        return {}
    res = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        if isinstance(val, datetime):
            res[col.name] = val.isoformat()
        elif isinstance(val, uuid.UUID):
            res[col.name] = str(val)
        else:
            res[col.name] = val
    return res


@router.get("/demo/manifest", tags=["Synthetic Demo"])
def get_demo_manifest() -> dict[str, Any]:
    """Retrieve the manifest and metadata for the SAMUDRA synthetic demo dataset."""
    manifest_path = pathlib.Path(__file__).resolve().parent.parent.parent.parent / "data" / "fixtures" / "synthetic" / "manifest.json"
    if manifest_path.exists():
        with open(manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "dataset_name": "SAMUDRA_DEMO_V1",
        "description": "Deterministic synthetic marine, weather, EO, and operational demo dataset for SAMUDRA",
        "status": "active",
    }


@router.get("/demo/stakeholders", tags=["Synthetic Demo"])
def get_demo_stakeholders(namespace: str = "SAMUDRA_DEMO_V1") -> list[dict[str, Any]]:
    """List all synthetic demo stakeholders."""
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_stakeholders(namespace=namespace)
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_stakeholders failed (service offline): %s", exc)
    return _get_synthetic_records("stakeholders", namespace=namespace)


@router.get("/demo/harbors", tags=["Synthetic Demo"])
def get_demo_harbors(namespace: str = "SAMUDRA_DEMO_V1") -> list[dict[str, Any]]:
    """List all synthetic demo harbors."""
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_harbors(namespace=namespace)
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_harbors failed (service offline): %s", exc)
    return _get_synthetic_records("harbors", namespace=namespace)


@router.get("/demo/fishers", tags=["Synthetic Demo"])
def get_demo_fishers(namespace: str = "SAMUDRA_DEMO_V1") -> list[dict[str, Any]]:
    """List all synthetic demo fishers."""
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_fishers(namespace=namespace)
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_fishers failed (service offline): %s", exc)
    return _get_synthetic_records("fishers", namespace=namespace)


def _resolve_sector_to_harbor_id(sector: str | None) -> str | None:
    """Helper to map a surveillance sector identifier or display name to canonical harbor ID."""
    if not sector:
        return None
    from backend.app.domain.situation import resolve_sector_harbor_id

    harbor_id = resolve_sector_harbor_id(sector)
    if harbor_id:
        return harbor_id

    s = sector.strip()
    s_lower = s.lower()
    # Keep compatibility with historical display-name inputs that are not
    # present in the canonical sector registry.
    try:
        sectors_path = pathlib.Path(__file__).resolve().parent.parent.parent.parent / "data" / "fixtures" / "synthetic" / "samudra" / "sectors.json"
        if sectors_path.exists():
            with open(sectors_path, "r", encoding="utf-8") as f:
                sectors_data = json.load(f)
                for sec in sectors_data:
                    if (
                        sec.get("public_id") == s
                        or sec.get("name") == s
                        or sec.get("public_id", "").lower() == s_lower
                        or sec.get("name", "").lower() == s_lower
                    ):
                        return sec.get("harbor_id")
    except Exception:
        pass

    if "ratnagiri" in s_lower:
        return "harbor-ratnagiri"
    if "malvan" in s_lower:
        return "harbor-malvan"
    if "goa" in s_lower or "panaji" in s_lower:
        return "harbor-panaji"
    if "mumbai" in s_lower:
        return "harbor-mumbai"
    if "veraval" in s_lower:
        return "harbor-veraval"
    return "unseeded"


@router.get("/demo/sectors", tags=["Synthetic Demo"])
def get_demo_sectors(namespace: str = "SAMUDRA_DEMO_V1") -> list[dict[str, Any]]:
    """List canonical demonstration surveillance sectors."""
    from backend.app.domain.situation import get_canonical_sectors

    sectors = get_canonical_sectors()
    if sectors:
        return sectors
    return _get_synthetic_records("sectors", namespace=namespace)


@router.get(
    "/demo/sectors/{sector_id}/situation",
    response_model=SectorSituationResponse,
    tags=["Synthetic Demo"],
)
def get_demo_sector_situation(
    sector_id: str,
    reference_time: str | None = None,
    craft_profile: str = "motorized_boat",
    namespace: str = "SAMUDRA_DEMO_V1",
) -> SectorSituationResponse:
    """Retrieve authoritative situation, fleet count, active hazards, and deterministic risk for a sector."""
    from backend.app.domain.situation import evaluate_sector_situation

    situation = evaluate_sector_situation(
        sector_id=sector_id,
        reference_time=reference_time,
        craft_profile=craft_profile,
        namespace=namespace,
    )
    if situation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Surveillance sector '{sector_id}' not found.",
        )
    return situation


@router.get("/demo/vessels", tags=["Synthetic Demo"])
def get_demo_vessels(
    sector: str | None = None,
    harbor_id: str | None = None,
    namespace: str = "SAMUDRA_DEMO_V1",
) -> list[dict[str, Any]]:
    """List synthetic demo vessels, optionally filtered by surveillance sector or home harbor."""
    effective_harbor = harbor_id or _resolve_sector_to_harbor_id(sector)
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_vessels(namespace=namespace, harbor_id=effective_harbor)
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_vessels failed (service offline): %s", exc)
    records = _get_synthetic_records("vessels", namespace=namespace)
    if effective_harbor:
        records = [r for r in records if r.get("home_harbor_id") == effective_harbor]
    elif sector:
        records = []
    return records


@router.get("/demo/trips", tags=["Synthetic Demo"])
def get_demo_trips(namespace: str = "SAMUDRA_DEMO_V1") -> list[dict[str, Any]]:
    """List all synthetic demo fishing trips."""
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_trips(namespace=namespace)
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_trips failed (service offline): %s", exc)
    return _get_synthetic_records("trips", namespace=namespace)


@router.get("/demo/marine-observations", tags=["Synthetic Demo"])
def get_demo_marine_observations(
    harbor_id: str | None = None, namespace: str = "SAMUDRA_DEMO_V1"
) -> list[dict[str, Any]]:
    """List synthetic demo marine observations."""
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_marine_observations(namespace=namespace, harbor_id=harbor_id)
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_marine_observations failed (service offline): %s", exc)
    records = _get_synthetic_records("marine_observations", namespace=namespace)
    if harbor_id:
        records = [r for r in records if r.get("harbor_id") == harbor_id]
    return records


@router.get("/demo/eo-grid-cells", tags=["Synthetic Demo"])
def get_demo_eo_grid_cells(
    cell_id: str | None = None, namespace: str = "SAMUDRA_DEMO_V1"
) -> list[dict[str, Any]]:
    """List synthetic Earth Observation grid cell data."""
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_eo_grid_cells(namespace=namespace, cell_id=cell_id)
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_eo_grid_cells failed (service offline): %s", exc)
    records = _get_synthetic_records("eo_grid_cells", namespace=namespace)
    if cell_id:
        records = [r for r in records if r.get("cell_id") == cell_id]
    return records


@router.get("/demo/pfz-candidates", tags=["Synthetic Demo"])
def get_demo_pfz_candidates(
    valid_only: bool = False, namespace: str = "SAMUDRA_DEMO_V1"
) -> list[dict[str, Any]]:
    """List synthetic Potential Fishing Zone (PFZ) advisory candidates."""
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_pfz_candidates(namespace=namespace, valid_only=valid_only)
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_pfz_candidates failed (service offline): %s", exc)
    records = _get_synthetic_records("pfz_candidates", namespace=namespace)
    if valid_only:
        records = [r for r in records if r.get("qc_status") == "VALID" or r.get("status") == "ACTIVE"]
    return records


@router.get("/demo/geofences", tags=["Synthetic Demo"])
def get_demo_geofences(namespace: str = "SAMUDRA_DEMO_V1") -> list[dict[str, Any]]:
    """List synthetic demo maritime geofences and restricted zones."""
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_geofences(namespace=namespace)
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_geofences failed (service offline): %s", exc)
    return _get_synthetic_records("geofences", namespace=namespace)


@router.get("/demo/routes", tags=["Synthetic Demo"])
def get_demo_routes(namespace: str = "SAMUDRA_DEMO_V1") -> dict[str, Any]:
    """List synthetic demo maritime route graph (nodes and edges)."""
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            nodes = repo.get_route_nodes(namespace=namespace)
            edges = repo.get_route_edges(namespace=namespace)
            if nodes or edges:
                return {
                    "nodes": [_model_to_dict(n) for n in nodes],
                    "edges": [_model_to_dict(e) for e in edges],
                }
    except Exception as exc:
        logger.debug("Database get_demo_routes failed (service offline): %s", exc)
    nodes = _get_synthetic_records("route_nodes", namespace=namespace)
    edges = _get_synthetic_records("route_edges", namespace=namespace)
    return {
        "nodes": nodes,
        "edges": edges,
    }


@router.get(
    "/demo/routes/alternatives",
    tags=["Synthetic Demo"],
    summary="Get evaluated passage route alternatives for a sector or origin/destination",
)
def get_demo_route_alternatives(
    sector_id: str | None = None,
    origin_harbor: str | None = None,
    destination: str | None = None,
    craft_profile: str = "motorized_boat",
    vessel_id: str | None = None,
    namespace: str = "SAMUDRA_DEMO_V1",
) -> dict[str, Any]:
    """Retrieve evaluated passage route alternatives computed by RouteExposureEngine."""
    from backend.app.agents.integrations.contracts import ToolInvocationContext
    from backend.app.agents.integrations.dev2 import MarineConditionsPayload
    from backend.app.domain.route_engine import DeterministicRouteExposureEngine
    from backend.app.domain.geo_restrictions import DeterministicGeospatialEngine
    from backend.app.domain.situation import resolve_authority_sector_context

    effective_origin = origin_harbor
    effective_coords = None
    effective_dest_coords = None

    if sector_id:
        sector_ctx = resolve_authority_sector_context(sector_id)
        if sector_ctx is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Surveillance sector '{sector_id}' not found.",
            )
        effective_origin = sector_ctx.get("origin_harbor") or effective_origin
        effective_coords = sector_ctx.get("coordinates")

        sector_dest_map = {
            "sector-ratnagiri": ("Ratnagiri Outer Bank", [72.95, 16.82]),
            "sector-malvan": ("Malvan Deep Bank", [73.365, 16.03]),
            "sector-goa": ("Goa Coastal Patrol Zone", [73.66, 15.36]),
            "sector-mumbai": ("Bombay High Perimeter", [72.56, 19.16]),
            "sector-veraval": ("Saurashtra Deep Bank", [70.19, 20.73]),
        }
        if sector_id in sector_dest_map and not destination:
            effective_dest, effective_dest_coords = sector_dest_map[sector_id]
        else:
            effective_dest = destination or "Outer Bank"
    else:
        effective_dest = destination or "Outer Bank"

    v_base_waypoints = None
    if vessel_id:
        from backend.app.domain.synthetic.generator import generate_synthetic_demo_dataset
        ds = generate_synthetic_demo_dataset()
        vessel = next((v for v in ds.get("vessels", []) if v.get("public_id") == vessel_id), None)
        if vessel:
            craft_profile = vessel.get("vessel_type", craft_profile)
            v_positions = [p for p in ds.get("replay_positions", []) if p.get("vessel_id") == vessel_id]
            if v_positions:
                effective_coords = [v_positions[0]["longitude"], v_positions[0]["latitude"]]
                effective_dest_coords = [v_positions[-1]["longitude"], v_positions[-1]["latitude"]]
                v_base_waypoints = [[p["longitude"], p["latitude"]] for p in v_positions]
            trip = next((t for t in ds.get("trips", []) if t.get("vessel_id") == vessel_id), None)
            if trip and trip.get("destination_name"):
                effective_dest = trip["destination_name"]

    if not effective_origin:
        effective_origin = "Ratnagiri"

    ctx = ToolInvocationContext(
        origin_harbor=effective_origin,
        craft_profile=craft_profile,
        coordinates=effective_coords,
        sector_id=sector_id,
    )

    marine = MarineConditionsPayload(
        significant_wave_height_m=1.3,
        surface_current_knots=1.2,
        swell_height_m=0.8,
        swell_period_sec=8.0,
    )

    try:
        engine = DeterministicRouteExposureEngine()
        geo_engine = DeterministicGeospatialEngine()
        payload = engine.evaluate_routes(
            context=ctx,
            marine=marine,
            destination=effective_dest,
            weather=None,
            hazard=None,
            geospatial_engine=geo_engine,
            dest_coords=effective_dest_coords,
            base_waypoints=v_base_waypoints,
        )

        if not payload.routes:
            return {
                "status": "NO_ROUTE",
                "origin": payload.origin,
                "destination": payload.destination,
                "recommended_route_id": None,
                "routes": [],
                "message": "No feasible passage routes available for the specified origin/destination.",
            }

        return {
            "status": "AVAILABLE",
            "origin": payload.origin,
            "destination": payload.destination,
            "origin_coordinates": getattr(payload, "origin_coordinates", None) or effective_coords,
            "destination_coordinates": getattr(payload, "destination_coordinates", None) or effective_dest_coords,
            "recommended_route_id": payload.recommended_route_id,
            "routes": [r.model_dump() for r in payload.routes],
        }
    except Exception as exc:
        logger.exception("Failed evaluating route alternatives: %s", exc)
        return {
            "status": "UNAVAILABLE",
            "origin": effective_origin,
            "destination": effective_dest,
            "recommended_route_id": None,
            "routes": [],
            "message": f"Route data unavailable: {str(exc)}",
        }


@router.get(
    "/demo/sectors/{sector_id}/route-alternatives",
    tags=["Synthetic Demo"],
    summary="Get evaluated passage route alternatives for a specific surveillance sector",
)
def get_demo_sector_route_alternatives(
    sector_id: str,
    destination: str | None = None,
    craft_profile: str = "motorized_boat",
    vessel_id: str | None = None,
    namespace: str = "SAMUDRA_DEMO_V1",
) -> dict[str, Any]:
    """Canonical alias for retrieving route alternatives for a specific sector."""
    return get_demo_route_alternatives(
        sector_id=sector_id,
        destination=destination,
        craft_profile=craft_profile,
        vessel_id=vessel_id,
        namespace=namespace,
    )


def _canonical_sector_hazards(sector_id: str, namespace: str) -> list[dict[str, Any]] | None:
    """Delegate Authority hazard relevance to the shared domain resolver."""
    from backend.app.domain.situation import get_canonical_active_hazards_for_sector

    return get_canonical_active_hazards_for_sector(sector_id, namespace=namespace)


@router.get("/demo/hazards", tags=["Synthetic Demo"])
def get_demo_hazards(
    sector: str | None = None,
    status: str | None = None,
    namespace: str = "SAMUDRA_DEMO_V1",
) -> list[dict[str, Any]]:
    """List synthetic demo marine weather hazard advisories, optionally filtered by sector."""
    if sector:
        # Backwards-compatible filtered view, now using the same canonical
        # assignment/status semantics as P0-6 and the sector endpoint.
        return _canonical_sector_hazards(sector, namespace) or []

    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_hazards(namespace=namespace, status=status)
            if items:
                items_dict = [_model_to_dict(item) for item in items]
                return items_dict
    except Exception as exc:
        logger.debug("Database get_demo_hazards failed (service offline): %s", exc)
    records = _get_synthetic_records("hazards", namespace=namespace)
    if status:
        records = [r for r in records if r.get("status") == status]
    return records


@router.get(
    "/demo/sectors/{sector_id}/hazards",
    response_model=SectorHazardsResponse,
    tags=["Synthetic Demo"],
)
def get_demo_sector_hazards(
    sector_id: str,
    namespace: str = "SAMUDRA_DEMO_V1",
) -> SectorHazardsResponse:
    """Return only canonical active hazards relevant to one Authority sector."""
    hazards = _canonical_sector_hazards(sector_id, namespace)
    if hazards is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Surveillance sector '{sector_id}' not found.",
        )

    return SectorHazardsResponse(
        sector_id=sector_id,
        hazards=[
            SectorHazard(
                hazard_id=hazard["public_id"],
                hazard_type=hazard["event_type"],
                severity=hazard["severity"],
                status=hazard["status"],
                headline=hazard["headline"],
                geometry=hazard["geometry_geojson"],
                valid_from=hazard["start_time"].isoformat(),
                valid_to=hazard["end_time"].isoformat(),
                provenance=hazard.get("provenance_json", {}),
            )
            for hazard in hazards
        ],
    )


@router.get(
    "/demo/sectors/{sector_id}/hazard-associations",
    response_model=SectorHazardAssociationsResponse,
    tags=["Synthetic Demo"],
)
def get_demo_sector_hazard_associations(
    sector_id: str, namespace: str = "SAMUDRA_DEMO_V1"
) -> SectorHazardAssociationsResponse:
    """Return observational vessel-in-active-hazard-area associations."""
    from backend.app.domain.situation import get_canonical_vessel_hazard_associations_for_sector
    associations = get_canonical_vessel_hazard_associations_for_sector(sector_id, namespace)
    if associations is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Surveillance sector '{sector_id}' not found.")
    return SectorHazardAssociationsResponse(
        sector_id=sector_id,
        associations=[VesselHazardAssociation(**association) for association in associations],
    )


@router.get(
    "/demo/sectors/{sector_id}/operational-alerts",
    response_model=SectorOperationalAlertsResponse,
    tags=["Synthetic Demo"],
)
def get_demo_sector_operational_alerts(
    sector_id: str, namespace: str = "SAMUDRA_DEMO_V1"
) -> SectorOperationalAlertsResponse:
    """Return current derived vessel-in-active-hazard-area alerts."""
    from backend.app.domain.situation import get_canonical_operational_alerts_for_sector
    alerts = get_canonical_operational_alerts_for_sector(sector_id, namespace)
    if alerts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Surveillance sector '{sector_id}' not found.")
    return SectorOperationalAlertsResponse(
        sector_id=sector_id,
        alerts=[VesselHazardOperationalAlert(**alert) for alert in alerts],
    )


@router.get("/demo/notifications", tags=["Synthetic Demo"])
def get_demo_notifications(
    sector: str | None = None,
    role: str | None = None,
    is_read: bool | None = None,
    namespace: str = "SAMUDRA_DEMO_V1",
) -> list[dict[str, Any]]:
    """List synthetic demo notifications and safety advisories, optionally filtered by sector."""
    effective_harbor = _resolve_sector_to_harbor_id(sector)
    target_vessel_ids = None
    if effective_harbor and effective_harbor != "unseeded":
        vessel_records = _get_synthetic_records("vessels", namespace=namespace)
        target_vessel_ids = [v["public_id"] for v in vessel_records if v.get("home_harbor_id") == effective_harbor]

    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_notifications(
                namespace=namespace,
                role=role,
                is_read=is_read,
                vessel_ids=target_vessel_ids,
            )
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_notifications failed (service offline): %s", exc)
    records = _get_synthetic_records("notifications", namespace=namespace)
    if role:
        records = [r for r in records if r.get("recipient_role") == role or r.get("target_role") == role]
    if is_read is not None:
        records = [r for r in records if r.get("is_read") == is_read]
    if target_vessel_ids is not None:
        records = [
            r for r in records
            if (r.get("vessel_id") in target_vessel_ids)
            or (effective_harbor == "harbor-ratnagiri" and (r.get("geofence_id") == "geofence-03" or r.get("hazard_id") in ("hazard-01", "hazard-02")))
            or (effective_harbor == "harbor-malvan" and (r.get("geofence_id") == "geofence-02" or r.get("hazard_id") in ("hazard-04", "hazard-07")))
        ]
    elif sector and "goa" in sector.lower():
        records = [r for r in records if r.get("geofence_id") == "geofence-01" or r.get("hazard_id") in ("hazard-03", "hazard-08")]
    elif sector and ("mumbai" in sector.lower() or "veraval" in sector.lower() or effective_harbor == "unseeded"):
        records = []
    return records


@router.get("/demo/vessels/{vessel_id}/replay", tags=["Synthetic Demo"])
def get_demo_vessel_replay(
    vessel_id: str, namespace: str = "SAMUDRA_DEMO_V1"
) -> list[dict[str, Any]]:
    """Get recorded replay track positions for a specific vessel."""
    try:
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_vessel_replay(namespace=namespace, vessel_id=vessel_id)
            if items:
                return [_model_to_dict(item) for item in items]
    except Exception as exc:
        logger.debug("Database get_demo_vessel_replay failed (service offline): %s", exc)
    records = _get_synthetic_records("replay_positions", namespace=namespace)
    return [r for r in records if r.get("vessel_id") == vessel_id]


@router.get("/demo/vessels/{vessel_id}/estimated-trajectory", tags=["Synthetic Demo"])
def get_demo_vessel_estimated_trajectory(vessel_id: str, namespace: str = "SAMUDRA_DEMO_V1") -> dict[str, Any]:
    """Bounded synthetic surveillance estimate from the latest canonical replay state."""
    positions = get_demo_vessel_replay(vessel_id, namespace)
    if not positions:
        raise HTTPException(status_code=404, detail="Unknown vessel")
    latest = max(positions, key=lambda item: item.get("timestamp", ""))
    required = ("latitude", "longitude", "speed_knots", "heading_deg")
    if any(latest.get(key) is None for key in required):
        return {"vessel_id": vessel_id, "status": "UNAVAILABLE", "reason": "Current vessel movement state unavailable", "synthetic": True}
    lat, lon = float(latest["latitude"]), float(latest["longitude"])
    speed, heading = float(latest["speed_knots"]), float(latest["heading_deg"])
    points = []
    earth_radius_m = 6_371_000.0
    for offset in range(0, 31, 5):
        distance_m = speed * 1852.0 * offset / 60.0
        bearing = math.radians(heading)
        lat1, lon1 = math.radians(lat), math.radians(lon)
        lat2 = math.asin(math.sin(lat1) * math.cos(distance_m / earth_radius_m) + math.cos(lat1) * math.sin(distance_m / earth_radius_m) * math.cos(bearing))
        lon2 = lon1 + math.atan2(math.sin(bearing) * math.sin(distance_m / earth_radius_m) * math.cos(lat1), math.cos(distance_m / earth_radius_m) - math.sin(lat1) * math.sin(lat2))
        points.append({"latitude": math.degrees(lat2), "longitude": math.degrees(lon2), "offset_minutes": offset})
    return {"vessel_id": vessel_id, "generated_from": {"latitude": lat, "longitude": lon, "speed_knots": speed, "heading_deg": heading, "observed_at": latest.get("timestamp")}, "horizon_minutes": 30, "points": points, "status": "AVAILABLE", "synthetic": True}




