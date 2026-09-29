"""FastAPI Main Application Entrypoint for ORCA.

Owned by Dev 2 (Backend Platform Lead).
"""

import logging
from contextlib import asynccontextmanager
import asyncio
import sys
from pathlib import Path

# Ensure project root and backend directory are in sys.path
_current_dir = Path(__file__).resolve().parent
_backend_dir = _current_dir.parent
_repo_root = _backend_dir.parent
if str(_repo_root) not in sys.path:
    sys.path.insert(0, str(_repo_root))
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

try:
    from backend.app.agents.memory import memory_manager
    from backend.app.api.v1.marinewatch import router as marinewatch_router
    from backend.app.api.v1.routes import router as api_v1_router
    from backend.app.connectors.client import connector_http_client
    from backend.app.core.config import settings
    from backend.app.core.logging import setup_logging
    from backend.app.db.store import SQLAlchemyConversationStore
except ImportError:
    from app.agents.memory import memory_manager
    from app.api.v1.marinewatch import router as marinewatch_router
    from app.api.v1.routes import router as api_v1_router
    from app.connectors.client import connector_http_client
    from app.core.config import settings
    from app.core.logging import setup_logging
    from app.db.store import SQLAlchemyConversationStore

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.app.core.worker import alert_monitor_loop
    task = asyncio.create_task(alert_monitor_loop(interval_seconds=60))
    yield
    task.cancel()
    connector_http_client.close()


def create_app() -> FastAPI:
    """Application factory for ORCA."""
    setup_logging(settings.LOG_LEVEL)
    
    app = FastAPI(
        lifespan=lifespan,
        title=settings.APP_NAME,
        description=(
            "ORCA — Marine EcOsystem Reasoning with Collaborative Agents\n"
            "Marine Mission Intelligence Platform (ORCA)\n"
            "SIH 2026 Problem Statement PS 26176"
        ),
        version="0.1.0",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
    )

    from backend.app.api.middleware import (
        ObservabilityMiddleware,
        RateLimitMiddleware,
        RequestIDMiddleware,
        RequestSizeLimitMiddleware,
        UnhandledExceptionMiddleware,
    )
    app.add_middleware(UnhandledExceptionMiddleware)
    app.add_middleware(ObservabilityMiddleware)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(RequestSizeLimitMiddleware, max_upload_size=1048576)
    app.add_middleware(
        RateLimitMiddleware,
        chat_limit=settings.RATE_LIMIT_CHAT_PER_MINUTE,
        voice_limit=settings.RATE_LIMIT_VOICE_PER_MINUTE,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "X-Response-Time-Ms"],
    )

    # Register API Routers
    app.include_router(api_v1_router)
    app.include_router(marinewatch_router)

    # Configure persistence. Production requires the managed PostgreSQL/PostGIS
    # connection; only local/demo environments retain the explicit offline
    # fallback used by hermetic tests and snapshot demonstrations.
    try:
        from backend.app.db.models import Base
        from backend.app.db.session import engine
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        if settings.APP_ENV.lower() not in {"production", "staging"}:
            Base.metadata.create_all(bind=engine)
        memory_manager.set_store(SQLAlchemyConversationStore())
    except Exception as e:
        if settings.APP_ENV.lower() in {"production", "staging"}:
            logger.critical("Required PostgreSQL/PostGIS database unavailable: %s", e)
            raise RuntimeError("Required PostgreSQL/PostGIS database is unavailable") from e
        logger.warning("Database init skipped or unavailable on startup: %s", e)

    # Register Dev 2 providers
    from backend.app.agents.integrations.mocks import register_m2_contract_mocks
    from backend.app.agents.tools import tool_registry
    from backend.app.connectors.imd_hazard import ImdHazardConnector
    from backend.app.connectors.incois import IncoisOceanStateConnector
    from backend.app.connectors.open_meteo import OpenMeteoConnector
    from backend.app.connectors.manager import ConnectorManager
    from backend.app.connectors.registration import register_dev2_provider_tools, register_dev4_operational_engines
    from backend.app.connectors.snapshot import SnapshotConnector
    from backend.app.connectors.modes import DataMode

    from backend.app.connectors.sachet import SachetConnector

    snapshot_connector = SnapshotConnector()
    open_meteo_live = OpenMeteoConnector()
    incois_live = IncoisOceanStateConnector()
    hazard_live = ImdHazardConnector()
    sachet_live = SachetConnector()
    
    marine_live = [incois_live, open_meteo_live]
    weather_live = [incois_live, open_meteo_live]
    pfz_live = incois_live
    svas_live = incois_live

    manager = ConnectorManager(
        None,
        snapshot_connector=snapshot_connector,
        marine_live=marine_live,
        weather_live=weather_live,
        hazard_live=hazard_live,
        pfz_live=pfz_live,
        svas_live=svas_live,
        sachet_live=sachet_live,
    )
    register_dev2_provider_tools(tool_registry, manager)
    
    if manager.current_mode in (DataMode.LIVE, DataMode.HYBRID):
        register_dev4_operational_engines(tool_registry, manager)
    else:
        register_m2_contract_mocks(tool_registry, override=False)

    @app.get("/", tags=["System"])
    async def root():
        return {
            "name": settings.APP_NAME,
            "description": "Smart Autonomous Marine Understanding, Decision & Risk Assistant",
            "sih_problem_statement": "PS 26176 - ORCA",
            "organization": "ISRO / Department of Space",
            "status": "Scaffold Ready for Day 1 Implementation",
            "docs": "/docs",
        }

    return app


app = create_app()
