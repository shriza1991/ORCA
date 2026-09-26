"""LangGraph Agent Pipeline State Definition (ORCAState).

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Specifies the shared mutable state dictionary traversed and updated by LangGraph nodes.
Uses TypedDict with total=False to allow sparse/partial node updates per standard
LangGraph state graph conventions without redundant model duplication.
"""

from typing import Any, Dict, List, Optional, TypedDict

from backend.app.contracts.chat import (
    AgentCollaborationPayload,
    AgentTraceItem,
    Confidence,
    EvidenceItem,
    MapLayer,
    Recommendation,
)
from backend.app.contracts.observation import ObservationBundle


class ORCAState(TypedDict, total=False):
    """Shared state dictionary traversed by SAMUDRA / ORCA LangGraph nodes.

    Lifecycle stages:
    1. Input & Context (session, request, user inputs)
    2. Cognitive Extraction (intent, language, entities, clarification)
    3. Task Planning & Dispatch (tool queue, intermediate results)
    4. Domain Observations (marine, weather, and geospatial outputs from Dev 4 & Dev 2)
    5. Deterministic Risk & Evidence (risk assessment, confidence, verified citations)
    6. Final Synthesis (multilingual user-facing answer, map layers, followups)
    7. Audit Telemetry (sanitized execution trace, no private chain-of-thought)
    """

    # -------------------------------------------------------------------------
    # 1. Input & Session Context
    # -------------------------------------------------------------------------
    request_id: str
    """Unique per-request UUID for request tracking and telemetry."""

    thread_id: str
    """Persistent session / conversation UUID (maps to conversation_id)."""

    user_message: str
    """Raw incoming user prompt string."""

    language: str
    """Detected or user-preferred ISO language code (e.g., 'en', 'hi', 'mr', 'ta')."""

    user_profile: Dict[str, Any]
    """Vessel and operator attributes: craft_profile, experience_level, equipment."""

    location: Optional[Dict[str, Any]]
    """Spatio-temporal origin: harbor name, EPSG:4326 [lon, lat], maritime zone."""

    origin_harbor: Optional[str]
    """Resolved departure or origin harbor name (e.g. 'Ratnagiri', 'Malvan')."""

    destination: Optional[str]
    """Resolved target destination harbor or waypoint (e.g. 'Goa', 'Outer Bank')."""

    time_window: Optional[Dict[str, Any]]
    """Temporal window of voyage: departure_time, duration_hours, valid_until."""

    tool_mode: Optional[str]
    """Execution mode for specialist tools: 'demo' (M1 stubs), 'contract_mock' (M2 mocks), or 'provider' (live/hybrid/snapshot registered providers)."""

    capability_error: Optional[str]
    """Recorded capability failure if a required provider is unavailable."""

    llm_provider: Optional[Any]
    """Optional LLMProvider instance for cognitive assistance (M3)."""

    mission_state: Optional[Any]
    """Canonical M1.1 MissionState context preserved across assessment, chat, and voice."""

    # -------------------------------------------------------------------------
    # 2. Cognitive Extraction & Intent
    # -------------------------------------------------------------------------
    intent: Optional[str]
    """Canonical classified user intent category (from IntentCategory enum)."""

    missing_fields: List[str]
    """Critical operational parameters missing from user input (e.g., origin_harbor)."""

    clarification_needed: bool
    """Flag indicating whether the graph must pause to request user clarification."""

    clarification_prompt: Optional[str]
    """Localized question generated to request missing critical fields."""

    # -------------------------------------------------------------------------
    # 3. Planning & Specialist Dispatch
    # -------------------------------------------------------------------------
    task_plan: List[str]
    """Ordered sequence of specialist tools planned for execution by Supervisor."""

    tool_results: Dict[str, Any]
    """Normalized ToolResult payloads returned by executed specialist tools."""

    failed_tools: Optional[List[str]]
    """List of capability or tool names that failed during execution."""

    # -------------------------------------------------------------------------
    # 4. Domain Data & Observations (Supplied by Dev 4 Tools / Dev 2 Connectors)
    # -------------------------------------------------------------------------
    observation_bundle: Optional[ObservationBundle]
    """Authoritative snapshot bundle of normalized observations for one analysis run."""

    observations: Dict[str, Any]
    """Normalized marine and weather measurements (wave height, wind, swell, etc.)."""

    advisories: List[Dict[str, Any]]
    """Active bulletins and alerts (e.g., IMD cyclone warnings, squall notices)."""

    pfz_candidates: List[Dict[str, Any]]
    """Ranked Potential Fishing Zone candidates with distance, bearing, and depth."""

    route_candidates: List[Dict[str, Any]]
    """Evaluated navigation routes with waypoint coordinates and exposure metrics."""

    # -------------------------------------------------------------------------
    # 5. Deterministic Risk Evaluation & Evidence (Immutable by LLM)
    # -------------------------------------------------------------------------
    risk_assessment: Optional[Recommendation]
    """Deterministic safety decision (GO/CAUTION/NO_GO/UNKNOWN) produced by Dev 4 engine."""

    confidence: Optional[Confidence]
    """Evidence-backed confidence rating derived from source availability and freshness."""

    evidence: List[EvidenceItem]
    """Verified factual citations underpinning every numerical or safety assertion."""

    warnings: List[str]
    """Operational caveats, degraded fallback notices, or sensor stale flags."""

    # -------------------------------------------------------------------------
    # 5b. Canonical M3 Decision Contracts (Additive)
    # -------------------------------------------------------------------------
    decision_object: Optional[Any]
    """Canonical M3 DecisionObject produced by deterministic reasoning pipeline."""

    decision_delta: Optional[Any]
    """Structured M3 DecisionDelta comparing counterfactual/current to baseline."""

    # -------------------------------------------------------------------------
    # 6. Final Output & Presentation
    # -------------------------------------------------------------------------
    response: Optional[str]
    """Synthesized, localized conversational explanation for the user."""

    map_layers: List[MapLayer]
    """Vector spatial layers (GeoJSON) ready for rendering on MapLibre map."""

    suggested_followups: List[str]
    """Contextual quick-reply suggestions for the mariner."""

    agent_collaboration: Optional[AgentCollaborationPayload]
    """Multi-agent reasoning, evidence provenance, conflict arbitration, and causal timeline."""

    # -------------------------------------------------------------------------
    # 7. Audit Telemetry (Sanitized)
    # -------------------------------------------------------------------------
    trace: List[AgentTraceItem]
    """Sanitized high-level execution steps (no private chain-of-thought)."""


# Backward-compatibility alias for existing references across codebase
AgentState = ORCAState
