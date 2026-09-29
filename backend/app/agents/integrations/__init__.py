"""Integration Contracts, Adapters, and Mocks Package for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.
"""

from backend.app.agents.integrations.adapters import ProviderToolAdapter
from backend.app.agents.integrations.contracts import (
    CAPABILITIES_CATALOG,
    CapabilityDefinition,
    FallbackSnapshot,
    ReliabilityPolicy,
    ToolErrorCode,
    ToolInvocationContext,
    ToolOwner,
)
from backend.app.agents.integrations.reliability import (
    ExecutionTelemetry,
    SnapshotStore,
    execute_with_reliability,
    global_snapshot_store,
)
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    HazardBulletinsProvider,
    MarineConditionsPayload,
    MarineConditionsProvider,
    PFZSourceDataPayload,
    PFZSourceDataProvider,
    WeatherConditionsPayload,
    WeatherConditionsProvider,
)
from backend.app.agents.integrations.dev4 import (
    EvaluatedRouteItem,
    GeospatialHazardEngine,
    GeospatialHazardPayload,
    PFZCandidatePayload,
    PFZRankingEngine,
    PFZRankingPayload,
    RiskAssessmentPayload,
    RiskEvaluationEngine,
    RouteExposureEngine,
    RouteExposurePayload,
)
from backend.app.agents.integrations.mocks import (
    MockGeospatialHazardEngine,
    MockHazardProvider,
    MockMarineConditionsProvider,
    MockPFZRankingEngine,
    MockPFZSourceProvider,
    MockRiskEngine,
    MockRouteExposureEngine,
    MockWeatherProvider,
    register_m2_contract_mocks,
)

__all__ = [
    # Contracts & Taxonomy
    "ToolOwner",
    "ToolErrorCode",
    "ToolInvocationContext",
    "CapabilityDefinition",
    "CAPABILITIES_CATALOG",
    # Reliability (M14)
    "ReliabilityPolicy",
    "FallbackSnapshot",
    "SnapshotStore",
    "global_snapshot_store",
    "execute_with_reliability",
    "ExecutionTelemetry",
    # Dev 2 Interfaces & Schemas
    "MarineConditionsPayload",
    "MarineConditionsProvider",
    "WeatherConditionsPayload",
    "WeatherConditionsProvider",
    "HazardBulletinPayload",
    "HazardBulletinsProvider",
    "PFZSourceDataPayload",
    "PFZSourceDataProvider",
    # Dev 4 Interfaces & Schemas
    "RiskAssessmentPayload",
    "RiskEvaluationEngine",
    "PFZCandidatePayload",
    "PFZRankingPayload",
    "PFZRankingEngine",
    "EvaluatedRouteItem",
    "RouteExposurePayload",
    "RouteExposureEngine",
    "GeospatialHazardPayload",
    "GeospatialHazardEngine",
    # Adapters
    "ProviderToolAdapter",
    # Mocks
    "MockMarineConditionsProvider",
    "MockWeatherProvider",
    "MockHazardProvider",
    "MockPFZSourceProvider",
    "MockRiskEngine",
    "MockPFZRankingEngine",
    "MockRouteExposureEngine",
    "MockGeospatialHazardEngine",
    "register_m2_contract_mocks",
]
