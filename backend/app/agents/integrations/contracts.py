"""Integration Contracts, Ownership, Errors & Capability Taxonomy for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Defines the formal boundaries and integration contracts between:
- Dev 3: Agent Orchestrator & LangGraph Pipeline
- Dev 2: Backend Platform & External Data Connectors (INCOIS, IMD, etc.)
- Dev 4: Marine, Geospatial, Risk & Route Domain Intelligence Engines
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# =============================================================================
# 1. Tool Owner Taxonomy
# =============================================================================

class ToolOwner(str, Enum):
    """Explicit developer role ownership for specialist tools and adapters."""

    DEV2 = "dev2"
    """Backend Platform & Connectors: owns external data retrieval and caching."""

    DEV3 = "dev3"
    """Agent Orchestration: owns graph routing, memory, adapters, and synthesis."""

    DEV4 = "dev4"
    """Marine & Geo Intelligence: owns mathematical calculations, PFZ ranking, and risk rules."""


# =============================================================================
# 2. Standardized Error Codes & Semantics
# =============================================================================

class ToolErrorCode(str, Enum):
    """Standardized error categories returned by tools and adapters."""

    TOOL_NOT_REGISTERED = "TOOL_NOT_REGISTERED"
    """The tool is not recognized in the approved AgentToolRegistry."""

    MISSING_CONTEXT = "MISSING_CONTEXT"
    """Critical input parameter (e.g. origin harbor, craft type) was not provided."""

    TOOL_UNAVAILABLE = "TOOL_UNAVAILABLE"
    """The requested capability is currently disabled, offline, or unregistered."""

    INVALID_INPUT = "INVALID_INPUT"
    """Supplied arguments failed schema validation or fell outside valid coordinates."""

    UPSTREAM_FAILURE = "UPSTREAM_FAILURE"
    """External issuing authority (e.g. INCOIS/IMD) server returned 5xx or bad data."""

    TIMEOUT = "TIMEOUT"
    """External retrieval or computation exceeded bounded latency limit."""

    PARTIAL_DATA = "PARTIAL_DATA"
    """Some required metrics were retrieved, but non-critical variables were missing."""

    INVALID_RESULT = "INVALID_RESULT"
    """Tool output failed schema or mathematical boundary validation."""

    EVIDENCE_MISSING = "EVIDENCE_MISSING"
    """Tool completed execution but failed to provide mandatory EvidenceItem citations."""

    @property
    def is_retryable(self) -> bool:
        """True if the orchestrator may attempt a bounded retry."""
        return self in (ToolErrorCode.UPSTREAM_FAILURE, ToolErrorCode.TIMEOUT)

    @property
    def requires_clarification(self) -> bool:
        """True if the error necessitates requesting clarification from the mariner."""
        return self in (ToolErrorCode.MISSING_CONTEXT, ToolErrorCode.INVALID_INPUT)

    @property
    def is_user_safe(self) -> bool:
        """True if this error can be communicated to the end-user without leaking secrets."""
        return self in (
            ToolErrorCode.MISSING_CONTEXT,
            ToolErrorCode.TOOL_UNAVAILABLE,
            ToolErrorCode.TIMEOUT,
            ToolErrorCode.PARTIAL_DATA,
        )


# =============================================================================
# 3. Standard Tool Invocation Context
# =============================================================================

class ToolInvocationContext(BaseModel):
    """Normalized operational context passed into tool adapters and engines."""

    origin_harbor: Optional[str] = Field(None, description="Departure harbor name (e.g. 'Ratnagiri')")
    sector_id: Optional[str] = Field(None, description="Canonical Authority surveillance sector public_id")
    coordinates: Optional[List[float]] = Field(None, description="[longitude, latitude] in EPSG:4326")
    departure_time: Optional[str] = Field(None, description="ISO-8601 UTC departure timestamp or offset")
    duration_hours: float = Field(8.0, description="Voyage duration in hours")
    craft_profile: str = Field("motorized_boat", description="Craft class: traditional_non_motorized | motorized_boat | mechanized_trawler")
    vessel_size: Optional[str] = Field("medium", description="Vessel size classification: small | medium | large")
    activity: str = Field("fishing", description="Maritime activity: fishing | transport | recreational")
    destination: Optional[str] = Field(None, description="Target destination or fishing ground")
    user_constraints: Dict[str, Any] = Field(default_factory=dict, description="Operational limits (e.g. max distance)")


# =============================================================================
# 4. Capability Catalog Specification
# =============================================================================

class CapabilityDefinition(BaseModel):
    """Specification of a high-level system capability."""

    name: str = Field(..., description="Canonical capability identifier")
    owner: ToolOwner = Field(..., description="Responsible developer owner")
    description: str = Field(..., description="Capability description")
    required_context_fields: List[str] = Field(default_factory=list, description="Mandatory context variables")
    dependencies: List[str] = Field(default_factory=list, description="Capabilities that must execute beforehand")
    requires_evidence: bool = Field(True, description="True if output must contain EvidenceItem citations")


CAPABILITIES_CATALOG: Dict[str, CapabilityDefinition] = {
    "marine_conditions": CapabilityDefinition(
        name="marine_conditions",
        owner=ToolOwner.DEV2,
        description="Retrieves significant wave height, swell period, currents, and SST.",
        required_context_fields=["origin_harbor"],
        dependencies=[],
        requires_evidence=True,
    ),
    "weather_conditions": CapabilityDefinition(
        name="weather_conditions",
        owner=ToolOwner.DEV2,
        description="Retrieves wind speed, wind gusts, and atmospheric conditions.",
        required_context_fields=["origin_harbor"],
        dependencies=[],
        requires_evidence=True,
    ),
    "hazard_search": CapabilityDefinition(
        name="hazard_search",
        owner=ToolOwner.DEV2,
        description="Retrieves active IMD cyclone alerts, depressions, and squall bulletins.",
        required_context_fields=["origin_harbor"],
        dependencies=[],
        requires_evidence=True,
    ),
    "trip_assessment": CapabilityDefinition(
        name="trip_assessment",
        owner=ToolOwner.DEV2,
        description="Executes the unified trip assessment pipeline (Marine, Weather, Hazard, Risk).",
        required_context_fields=["origin_harbor"],
        dependencies=[],
        requires_evidence=True,
    ),
    "svas_advisory": CapabilityDefinition(
        name="svas_advisory",
        owner=ToolOwner.DEV2,
        description="Retrieves INCOIS Small Vessel Advisory Services (SVAS) risk ratings and warnings.",
        required_context_fields=["origin_harbor"],
        dependencies=[],
        requires_evidence=True,
    ),
    "pfz_search": CapabilityDefinition(
        name="pfz_search",
        owner=ToolOwner.DEV4,
        description="Queries INCOIS PFZ coordinates and ranks candidates relative to origin harbor.",
        required_context_fields=["origin_harbor"],
        dependencies=["marine_conditions"],
        requires_evidence=True,
    ),
    "risk_evaluation": CapabilityDefinition(
        name="risk_evaluation",
        owner=ToolOwner.DEV4,
        description="Deterministically evaluates wave and wind thresholds against craft limits.",
        required_context_fields=["origin_harbor", "craft_profile"],
        dependencies=["marine_conditions", "weather_conditions", "hazard_search"],
        requires_evidence=True,
    ),
    "route_analysis": CapabilityDefinition(
        name="route_analysis",
        owner=ToolOwner.DEV4,
        description="Evaluates alternative passage lines and waypoint environmental exposure.",
        required_context_fields=["origin_harbor", "destination"],
        dependencies=["marine_conditions", "hazard_search"],
        requires_evidence=True,
    ),
    "geospatial_hazard": CapabilityDefinition(
        name="geospatial_hazard",
        owner=ToolOwner.DEV4,
        description="Evaluates spatial intersections with restricted maritime polygons, naval ranges, and MPAs.",
        required_context_fields=["origin_harbor"],
        dependencies=[],
        requires_evidence=True,
    ),
}


# =============================================================================
# 5. Reliability & Fallback Contracts (M14)
# =============================================================================

class ReliabilityPolicy(BaseModel):
    """Execution reliability and retry parameters for specialist tools and adapters."""

    max_retries: int = Field(2, description="Maximum number of retry attempts for transient errors")
    timeout_seconds: float = Field(3.0, description="Upper execution threshold before TIMEOUT error")
    enable_fallback: bool = Field(True, description="Whether to query snapshot store upon failure")
    max_snapshot_age_hours: float = Field(
        24.0, description="Maximum permitted age in hours for cached fallback snapshots"
    )
    retry_delay_seconds: float = Field(0.0, description="Delay between retry attempts")


class FallbackSnapshot(BaseModel):
    """Cached historical domain observation used when real-time provider is unreachable."""

    snapshot_id: str = Field(..., description="Unique snapshot identifier")
    tool_name: str = Field(..., description="Target specialist tool name")
    harbor: str = Field(..., description="Geographic harbor or region associated with data")
    captured_at: str = Field(..., description="ISO-8601 UTC timestamp of original capture")
    data: Dict[str, Any] = Field(default_factory=dict, description="Structured observation payload")
    evidence: List[Any] = Field(default_factory=list, description="Evidence items with citations")
    warnings: List[str] = Field(default_factory=list, description="Associated warnings")
    source_name: str = Field("ORCA Offline Snapshot Archive", description="Provider origin")
