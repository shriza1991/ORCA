"""FastAPI Main Application Entrypoint for SAMUDRA.

Owned by Dev 2 (Backend Platform Lead).
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.agents.memory import memory_manager
from backend.app.api.v1.marinewatch import router as marinewatch_router
from backend.app.api.v1.routes import router as api_v1_router
from backend.app.connectors.client import connector_http_client
from backend.app.core.config import settings
from backend.app.core.logging import setup_logging
from backend.app.db.store import SQLAlchemyConversationStore

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    connector_http_client.close()


def create_app() -> FastAPI:
    """Application factory for SAMUDRA."""
    setup_logging(settings.LOG_LEVEL)
    
    app = FastAPI(
        lifespan=lifespan,
        title=settings.APP_NAME,
        description=(
            "Smart Autonomous Marine Understanding, Decision & Risk Assistant (SAMUDRA)\n"
            "SIH 2026 Problem Statement PS 26176 — ORCA: Marine EcOsystem Reasoning with Collaborative Agents"
        ),
        version="0.1.0",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
    )

    # CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from backend.app.api.middleware import RequestIDMiddleware, RequestSizeLimitMiddleware
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(RequestSizeLimitMiddleware, max_upload_size=1048576)

    # Register API Routers
    app.include_router(api_v1_router)
    app.include_router(marinewatch_router)

    # Configure persistence
    try:
        from backend.app.db.models import Base
        from backend.app.db.session import engine
        Base.metadata.create_all(bind=engine)
        memory_manager.set_store(SQLAlchemyConversationStore())
    except Exception as e:
        logger.warning("Database init skipped or unavailable on startup: %s", e)

    # Register Dev 2 providers
    from backend.app.agents.integrations.mocks import register_m2_contract_mocks
    from backend.app.agents.tools import tool_registry
    from backend.app.connectors.imd_hazard import ImdHazardConnector
    from backend.app.connectors.imd_weather import ImdWeatherConnector
    from backend.app.connectors.incois import IncoisOceanStateConnector
    from backend.app.connectors.manager import ConnectorManager
    from backend.app.connectors.registration import register_dev2_provider_tools
    from backend.app.connectors.snapshot import SnapshotConnector

    snapshot_connector = SnapshotConnector()
    marine_live = IncoisOceanStateConnector()
    weather_live = ImdWeatherConnector()
    hazard_live = ImdHazardConnector()
    pfz_live = marine_live

    manager = ConnectorManager(
        None,
        snapshot_connector=snapshot_connector,
        marine_live=marine_live,
        weather_live=weather_live,
        hazard_live=hazard_live,
        pfz_live=pfz_live,
    )
    register_dev2_provider_tools(tool_registry, manager)
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
