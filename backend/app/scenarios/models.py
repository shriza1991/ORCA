"""Canonical Scenario Domain Models for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability) & Dev 4 (Domain Intelligence).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Defines schemas for:
- Canonical evaluation scenarios (S1–S8)
- Scenario input conditions (marine, weather, hazards, geospatial)
- Distinct polygon categories (EEZ/IMBL advisory vs. restricted/no-go)
- Expected deterministic outcomes and evidence grounding requirements
- Execution audit results for automated evaluation and UI visualization
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.agents.intent import IntentCategory
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    PFZSourceDataPayload,
    WeatherConditionsPayload,
)
from backend.app.agents.integrations.dev4 import (
    EvaluatedRouteItem,
    GeospatialHazardPayload,
    PFZCandidatePayload,
    RiskAssessmentPayload,
    RouteExposurePayload,
)
from backend.app.contracts.chat import ConfidenceLevel, EvidenceItem, RecommendationStatus


class ScenarioCategory(str, Enum):
    """Categorization of maritime scenarios."""

    SAFETY = "SAFETY"
    HAZARDS = "HAZARDS"
    PFZ = "PFZ"
    ROUTE = "ROUTE"
    DATA_QUALITY = "DATA_QUALITY"
    MULTILINGUAL = "MULTILINGUAL"
    TEMPORAL = "TEMPORAL"


class PolygonType(str, Enum):
    """Semantic classification of maritime geospatial polygons.

    Advisory/boundary polygons (EEZ, IMBL) are kept strictly distinct
    from hard-stop / restricted polygons (Naval Firing Range, Port Security).
    """

    RESTRICTED_NO_GO = "RESTRICTED_NO_GO"
    NAVAL_FIRING_RANGE = "NAVAL_FIRING_RANGE"
    MPA_SANCTUARY_CORE = "MPA_SANCTUARY_CORE"
    IMBL_ADVISORY_BORDER = "IMBL_ADVISORY_BORDER"
    EEZ_BOUNDARY = "EEZ_BOUNDARY"
    COASTAL_REGULATION_ZONE = "COASTAL_REGULATION_ZONE"


class ScenarioPolygon(BaseModel):
    """Geospatial boundary or restricted polygon fixture."""

    polygon_id: str = Field(..., description="Unique polygon identifier")
    name: str = Field(..., description="Official designation of the zone")
    polygon_type: PolygonType = Field(..., description="Semantic polygon type")
    is_hard_restriction: bool = Field(
        ...,
        description="True for hard NO_GO zones (Naval firing range); False for advisory borders (EEZ/IMBL)",
    )
    coordinates: List[Any] = Field(default_factory=list, description="GeoJSON coordinates (EPSG:4326)")
    description: str = Field("", description="Contextual explanation of maritime rule or boundary")


class ScenarioInputData(BaseModel):
    """Normalized domain input parameters for a scenario."""

    origin_harbor: str = Field("Ratnagiri", description="Departure harbor or landing center")
    destination: Optional[str] = Field(None, description="Optional destination harbor or waypoint")
    coordinates: Optional[List[float]] = Field(None, description="Departure/operational coordinates [lon, lat]")
    craft_profile: str = Field("motorized_boat", description="Vessel type (e.g. traditional_craft, motorized_boat, mechanized_trawler)")
    marine: Optional[MarineConditionsPayload] = Field(None, description="Normalized marine condition payload")
    weather: Optional[WeatherConditionsPayload] = Field(None, description="Normalized weather condition payload")
    hazard: Optional[HazardBulletinPayload] = Field(None, description="Severe weather / cyclone bulletin payload")
    polygons: List[ScenarioPolygon] = Field(default_factory=list, description="Active maritime polygons in scenario area")
    pfz_features: Optional[List[Dict[str, Any]]] = Field(None, description="Raw INCOIS PFZ line features")
    routes: Optional[List[Dict[str, Any]]] = Field(None, description="Candidate routes for comparison")
    is_stale: bool = Field(False, description="Flag indicating sensor/forecast telemetry is outdated or missing")
    stale_reason: Optional[str] = Field(None, description="Explanation for data degradation")


class ScenarioExpectedOutcome(BaseModel):
    """Deterministic, reproducible expectation for scenario evaluation."""

    intent: IntentCategory = Field(..., description="Expected classified user intent")
    status: RecommendationStatus = Field(..., description="Authoritative deterministic risk status")
    confidence: ConfidenceLevel = Field(ConfidenceLevel.HIGH, description="Expected confidence level")
    expected_tools: List[str] = Field(default_factory=list, description="Capabilities expected in task plan")
    decisive_factors_keywords: List[str] = Field(
        default_factory=list,
        description="Substrings expected in decisive factors (e.g. ['wave', 'cyclone', 'restricted'])",
    )
    expected_evidence_metrics: List[str] = Field(
        default_factory=list,
        description="Metrics that must be present in verified evidence items",
    )
    recommended_action_keywords: List[str] = Field(
        default_factory=list,
        description="Keywords expected in actionable mariner directive",
    )


class ScenarioDefinition(BaseModel):
    """First-class canonical evaluation and demonstration scenario definition."""

    id: str = Field(..., description="Canonical scenario identifier (e.g. 'S1', 'S2', ... 'S8')")
    name: str = Field(..., description="Human-readable title of scenario")
    category: ScenarioCategory = Field(..., description="Domain category")
    description: str = Field(..., description="Detailed narrative and operational context")
    harbor: str = Field(..., description="Primary coastal harbor")
    query: str = Field(..., description="Default user query in English")
    multilingual_queries: Dict[str, str] = Field(
        default_factory=dict,
        description="Localized queries keyed by ISO language code ('en', 'mr', 'hi')",
    )
    inputs: ScenarioInputData = Field(..., description="Normalized domain input conditions")
    expected: ScenarioExpectedOutcome = Field(..., description="Authoritative expected deterministic outcome")
    tags: List[str] = Field(default_factory=list, description="Searchable taxonomy tags")
    ui_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="UI badges, icons, color hints, and display card attributes",
    )


class ScenarioExecutionResult(BaseModel):
    """Audit result from executing a scenario through the ORCA pipeline."""

    scenario_id: str = Field(..., description="Evaluated scenario ID")
    scenario_name: str = Field(..., description="Evaluated scenario name")
    passed: bool = Field(..., description="True if all deterministic checks satisfied")
    actual_intent: str = Field(..., description="Classified intent from graph")
    expected_intent: str = Field(..., description="Expected intent")
    actual_status: RecommendationStatus = Field(..., description="Actual recommendation status")
    expected_status: RecommendationStatus = Field(..., description="Expected recommendation status")
    actual_confidence: ConfidenceLevel = Field(..., description="Actual confidence rating")
    expected_confidence: ConfidenceLevel = Field(..., description="Expected confidence rating")
    executed_tools: List[str] = Field(default_factory=list, description="Tools dispatched during execution")
    evidence_count: int = Field(0, description="Total verified evidence items")
    evidence_grounded: bool = Field(True, description="True if all critical claims backed by evidence")
    response_text: str = Field("", description="Synthesized mariner explanation")
    trace_steps_count: int = Field(0, description="Number of execution trace events")
    warnings: List[str] = Field(default_factory=list, description="Warnings generated by graph")
    validation_notes: List[str] = Field(default_factory=list, description="Detailed validation breakdown")


class ScenarioManifestItem(BaseModel):
    """Lightweight scenario descriptor for client UI and API listings."""

    id: str
    name: str
    category: str
    intent: str
    harbor: str
    expected_status: str
    expected_confidence: str
    description: str
    query: str
    tags: List[str] = Field(default_factory=list)
    ui_metadata: Dict[str, Any] = Field(default_factory=dict)
