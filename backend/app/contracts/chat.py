"""Canonical Chat Request and Response Contracts for ORCA.

Owned by Dev 2 (Backend Platform), referenced by Dev 1, Dev 3, and Dev 4.
All changes to these models must follow the RFC process in docs/DEVELOPMENT.md.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class RecommendationStatus(str, Enum):
    GO = "GO"
    CAUTION = "CAUTION"
    NO_GO = "NO_GO"
    UNKNOWN = "UNKNOWN"
    INFORMATIONAL = "INFORMATIONAL"


class ConfidenceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class UserContext(BaseModel):
    sector_id: Optional[str] = Field(
        None,
        description="Canonical Authority surveillance sector public_id (e.g., 'sector-ratnagiri')",
    )
    origin_harbor: Optional[str] = Field(
        None, description="Departure landing center or harbor name (e.g., 'Ratnagiri')"
    )
    coordinates: Optional[List[float]] = Field(
        None, description="[longitude, latitude] pair in EPSG:4326"
    )
    craft_profile: Optional[str] = Field(
        "motorized_boat",
        description="Craft class: traditional_non_motorized | motorized_boat | mechanized_trawler",
    )
    language_preference: Optional[str] = Field(
        "auto", description="Preferred response language ISO code: auto | en | hi | mr | ta"
    )
    parent_assessment_id: Optional[str] = Field(
        None, description="Optional baseline assessment ID for what-if comparisons"
    )
    departure_time: Optional[str] = Field(
        None, description="Structured planned departure time (ISO-8601 UTC)"
    )
    return_time: Optional[str] = Field(
        None, description="Structured planned return time (ISO-8601 UTC)"
    )
    target_pfz: Optional[str] = Field(
        None, description="Target PFZ candidate preference (auto | custom)"
    )
    vessel_size: Optional[str] = Field(
        "medium", description="Vessel size classification: small | medium | large"
    )


class ChatRequest(BaseModel):
    evidence_bundle_id: Optional[str] = None
    baseline_assessment_id: Optional[str] = None
    data_mode: Optional[str] = Field(None, pattern="^(DEMO|SNAPSHOT|SYNTHETIC|HYBRID|LIVE)$")
    conversation_id: Optional[str] = Field(
        None, description="Client session UUID; generated server-side if null"
    )
    message: str = Field(..., min_length=1, description="Natural language user query")
    user_context: Optional[UserContext] = Field(
        default_factory=UserContext, description="Optional spatial or operational context"
    )
    mission_state: Optional[Any] = Field(
        None, description="Canonical M1.1 MissionState context"
    )


class ThresholdComparison(BaseModel):
    """Deterministic threshold check performed by domain risk engine."""

    metric_name: str = Field(..., description="Environmental or physical parameter identifier")
    observed_value: Any = Field(..., description="Numerical or boolean value observed from sensors/forecasts")
    threshold_value: Any = Field(..., description="Operational safety limit for craft profile")
    operator: str = Field(">", description="Comparison operator applied (e.g., '>', '>=', '==', '<=')")
    unit: Optional[str] = Field(None, description="Physical unit of measurement")
    exceeded: bool = Field(False, description="True if observed parameter breaches the safe operating limit")
    impact: str = Field("SAFE", description="Decision consequence: 'NO_GO_TRIGGER', 'CAUTION_TRIGGER', 'SAFE', or 'UNKNOWN'")
    description: str = Field("", description="Human-readable explanation of threshold comparison")


class DataProvenance(BaseModel):
    """Data provenance and validity envelope for underlying feeds."""

    provider_name: str = Field(..., description="Originating agency (e.g., 'INCOIS', 'IMD', 'ORCA')")
    source_name: str = Field(..., description="Specific feed, bulletin, or model designation")
    source_url: Optional[str] = Field(None, description="Direct URL to official bulletin or portal")
    observed_time: Optional[str] = Field(None, description="Observation / telemetry timestamp (ISO-8601 UTC)")
    valid_from: Optional[str] = Field(None, description="Validity start timestamp (ISO-8601 UTC)")
    valid_to: Optional[str] = Field(None, description="Validity expiration timestamp (ISO-8601 UTC)")
    data_mode: Optional[str] = Field("HISTORICAL", description="Data resolution mode: LIVE | CACHED_REAL | HISTORICAL | MOCK | UNAVAILABLE")
    lineage_id: Optional[str] = Field(None, description="Lineage ID, bulletin ID, or fixture identifier")
    retrieved_at: Optional[str] = Field(None, description="System retrieval timestamp (ISO-8601 UTC)")
    is_stale: bool = Field(False, description="True if observation time or valid_to window indicates stale data")
    quality_flags: List[str] = Field(default_factory=list, description="Quality and verification badges")


class Confidence(BaseModel):
    level: ConfidenceLevel = Field(
        ..., description="Derived confidence based on source availability and freshness"
    )
    reasons: List[str] = Field(
        default_factory=list, description="Justification for confidence rating"
    )


class Recommendation(BaseModel):
    status: RecommendationStatus = Field(
        ..., description="Deterministic safety evaluation state"
    )
    summary: str = Field(..., description="Executive 1-2 sentence recommendation summary")
    decisive_factors: List[str] = Field(
        default_factory=list,
        description="List of key numerical or environmental drivers behind the status",
    )
    non_decisive_factors: List[str] = Field(
        default_factory=list,
        description="Relevant contextual parameters that remained within safe limits",
    )
    threshold_comparisons: List[ThresholdComparison] = Field(
        default_factory=list,
        description="Structured threshold comparisons driving the decision",
    )
    next_action: str = Field(
        ..., description="Direct actionable directive for the mariner or user"
    )
    confidence: Optional[Confidence] = Field(
        None, description="Derived confidence based on source availability and freshness"
    )
    provenance: List[DataProvenance] = Field(
        default_factory=list,
        description="Origin, timestamps, and validity windows for underlying data feeds",
    )
    evidence_ids: List[str] = Field(
        default_factory=list,
        description="IDs of linked evidence items supporting this decision",
    )
    warnings: List[str] = Field(
        default_factory=list,
        description="Warnings when critical data is missing, degraded, or stale",
    )


class EvidenceItem(BaseModel):
    evidence_id: Optional[str] = Field(
        None, description="Unique deterministic identifier (e.g., 'EV123' or 'EV-INCOIS-WAVE-001')"
    )
    source_name: str = Field(
        ..., description="Official issuing authority (e.g., 'INCOIS Ocean State Forecast')"
    )
    provider_name: Optional[str] = Field(
        None, description="Originating provider (e.g., 'INCOIS', 'IMD', 'ORCA')"
    )
    source_url: Optional[str] = Field(
        None, description="Direct URL to official bulletin or portal"
    )
    observed_time: Optional[str] = Field(
        None, description="Timestamp of underlying satellite or sensor measurement"
    )
    valid_from: Optional[str] = Field(
        None, description="Start of forecast/advisory validity window (ISO-8601 UTC)"
    )
    valid_to: Optional[str] = Field(
        None, description="End of forecast/advisory validity window (ISO-8601 UTC)"
    )
    retrieved_at: Optional[str] = Field(
        None,
        description="System retrieval timestamp (ISO-8601 UTC)",
    )
    geometry: Optional[Dict[str, Any]] = Field(
        None, description="Optional GeoJSON Point or Polygon associated with measurement"
    )
    metric_name: Optional[str] = Field(
        None, description="Physical variable name (e.g., 'significant_wave_height')"
    )
    metric_value: Optional[Any] = Field(
        None, description="Numerical value or status"
    )
    metric_unit: Optional[str] = Field(
        None, description="Standard unit (e.g., 'meters', 'knots', 'celsius')"
    )
    quality_flags: List[str] = Field(
        default_factory=list,
        description="Quality badges: 'official_source', 'fresh', 'snapshot_fallback'",
    )
    coverage: Optional[str] = Field(
        None, description="Geographical coverage or location associated with the evidence"
    )
    data_mode: Optional[str] = Field(
        None, description="Operational data mode: LIVE | CACHED_REAL | HISTORICAL | MOCK | UNAVAILABLE"
    )
    lineage_id: Optional[str] = Field(
        None, description="Traceable reference to the raw API response ID or fixture file"
    )
    resolved_conflicts: Optional[List[Dict[str, Any]]] = Field(
        default_factory=list, description="List of conflicts resolved for this evidence (source, value, reason)."
    )


class MapLayer(BaseModel):
    layer_id: str = Field(..., description="Unique identifier for MapLibre layer management")
    name: str = Field(..., description="User-friendly display label in layer selector")
    layer_type: str = Field("geojson", description="Layer format: geojson")
    visible: bool = Field(True, description="Default layer visibility state")
    style: Optional[Dict[str, Any]] = Field(
        default_factory=dict, description="Rendering aesthetics (color, opacity, stroke)"
    )
    geojson: Dict[str, Any] = Field(
        ..., description="Standard GeoJSON Feature or FeatureCollection"
    )


class AgentTraceItem(BaseModel):
    step: int = Field(..., description="Sequential order in pipeline execution")
    node: str = Field(..., description="LangGraph specialist node name")
    agent: Optional[str] = Field(None, description="Responsible cognitive component, agent, or node identifier")
    action: str = Field(..., description="Sanitized description of task executed")
    status: str = Field("completed", description="Status: started | completed | failed | skipped | blocked | sanitized | degraded")
    duration_ms: Optional[float] = Field(None, description="Execution duration in milliseconds")
    evidence_ids: List[str] = Field(default_factory=list, description="Associated evidence IDs produced or consumed")
    error: Optional[str] = Field(None, description="Sanitized error description when execution fails")
    tool_name: Optional[str] = Field(None, description="Specific tool identifier if step is a specialist tool")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO-8601 UTC timestamp",
    )


class ChatResponse(BaseModel):
    evidence_bundle_id: Optional[str] = None
    mission_assessment: Optional[Any] = None
    proposed_assessment: Optional[Any] = None
    run_id: str = Field(..., description="Unique orchestration run ID")
    conversation_id: str = Field(..., description="Client session UUID mapping to message thread")
    assessment_id: Optional[str] = Field(None, description="Unique identifier for the generated assessment if applicable")
    language: str = Field("en", description="Detected/responded ISO language code")
    intent: str = Field(..., description="Classified query intent category")
    answer: str = Field(
        ..., description="Synthesized, localized natural language conversational response"
    )
    recommendation: Recommendation = Field(
        ..., description="Deterministic safety recommendation"
    )
    confidence: Confidence = Field(..., description="Evidence-backed confidence rating")
    evidence: List[EvidenceItem] = Field(
        default_factory=list, description="Verifiable citations for all factual assertions"
    )
    map_layers: List[MapLayer] = Field(
        default_factory=list, description="Vector spatial layers to render on MapLibre map"
    )
    trace: List[AgentTraceItem] = Field(
        default_factory=list,
        description="Sanitized high-level execution trace (no private chain-of-thought)",
    )
    warnings: List[str] = Field(
        default_factory=list, description="Operational caveats or degraded fallback notices"
    )
    suggested_followups: List[str] = Field(
        default_factory=list, description="Contextual quick-reply suggestions for the user"
    )
    agent_collaboration: Optional["AgentCollaborationPayload"] = Field(
        None,
        description="Multi-agent reasoning, evidence provenance, conflict arbitration, and causal timeline",
    )
    decision_object: Optional[Any] = Field(
        None,
        description="Canonical M3 DecisionObject produced by deterministic reasoning pipeline",
    )
    decision_delta: Optional[Any] = Field(
        None,
        description="Structured M3 DecisionDelta comparing counterfactual/current to baseline",
    )
    mission_state: Optional[Any] = Field(
        None,
        description="Canonical M1.1 MissionState context",
    )
    data_mode: str = Field(
        "UNAVAILABLE",
        description="Resolved source mode: LIVE | CACHED_REAL | DEMO | MOCK | FALLBACK | UNAVAILABLE",
    )


class DataQualityRating(str, Enum):
    VERIFIED = "Verified"
    PARTIAL = "Partial"
    SNAPSHOT_FALLBACK = "Snapshot Fallback"
    LIMITED = "Limited"


class AgentEvidenceSource(BaseModel):
    source_name: str = Field(..., description="Official feed name, e.g. 'INCOIS OSF'")
    provider: str = Field(..., description="Issuing authority, e.g. 'INCOIS'")
    last_updated: Optional[str] = Field(None, description="Observation or bulletin timestamp")
    valid_to: Optional[str] = Field(None, description="Forecast validity window end")
    coverage: str = Field(..., description="Geographical coverage, e.g. 'Arabian Sea · Konkan Corridor'")
    quality_rating: DataQualityRating = Field(DataQualityRating.VERIFIED, description="Data assurance level")


class IndividualAgentReasoning(BaseModel):
    agent_id: str = Field(..., description="Internal identifier, e.g. 'marine_agent'")
    agent_name: str = Field(..., description="Display label, e.g. 'Marine Intelligence Agent'")
    role_description: str = Field(..., description="Functional specialization")
    status: str = Field("COMPLETE", description="Agent state: RUNNING | COMPLETE | WARNING | CONFLICT")
    recommendation: RecommendationStatus = Field(..., description="Agent stance: GO | CAUTION | NO_GO | UNKNOWN | INFORMATIONAL")
    evidence_strength: ConfidenceLevel = Field(ConfidenceLevel.HIGH, description="HIGH | MEDIUM | LOW")
    data_quality: DataQualityRating = Field(DataQualityRating.VERIFIED, description="Verified | Partial | Snapshot Fallback | Limited")
    sources: List[AgentEvidenceSource] = Field(default_factory=list, description="Authoritative upstream feeds")
    observations: Dict[str, Any] = Field(default_factory=dict, description="Observed variables")
    summary: str = Field(..., description="Concise assessment summary")
    key_findings: List[str] = Field(default_factory=list, description="Key environmental drivers")


class ConflictArbitration(BaseModel):
    conflict_detected: bool = Field(False, description="True if agent stances diverged")
    conflict_type: Optional[str] = Field(None, description="Category of conflict, e.g. 'SAFETY_OVERRIDE_OPPORTUNITY'")
    reason: Optional[str] = Field(None, description="Summary of the conflicting conditions")
    agent_positions: Dict[str, str] = Field(default_factory=dict, description="Summary map of agent positions")
    winning_agent: str = Field(..., description="Prevailing agent or 'Decision Authority'")
    winning_decision: RecommendationStatus = Field(..., description="Final arbitrated recommendation")
    winning_rule: str = Field(..., description="Statutory precedence rule applied")
    accepted_reasons: List[str] = Field(default_factory=list, description="Why the winning decision was accepted")
    rejected_reasons: List[str] = Field(default_factory=list, description="Why opposing positions were overridden")


class CausalReasoningExplanation(BaseModel):
    facts: List[Dict[str, Any]] = Field(default_factory=list, description="Verified factual telemetry points")
    inferences: List[str] = Field(default_factory=list, description="Derived relations and environmental implications")
    constraints: List[str] = Field(default_factory=list, description="Vessel limits, boundary rules, and legal mandates")
    decision: str = Field(..., description="The definitive operational verdict")
    recommendation: str = Field(..., description="Actionable directive for the user")


class ReasoningTimelineStep(BaseModel):
    step_number: int = Field(..., description="1-8 sequence index")
    agent_id: str = Field(..., description="Agent or engine key")
    label: str = Field(..., description="Human-readable milestone name")
    timestamp: str = Field(..., description="ISO or localized execution timestamp")
    duration_ms: float = Field(0.0, description="Step duration in milliseconds")
    status: str = Field("completed", description="completed | warning | conflict | in_progress")
    detail: str = Field(..., description="Milestone action or payload summary")


class AgentCollaborationPayload(BaseModel):
    agents: List[IndividualAgentReasoning] = Field(default_factory=list, description="Individual agent stances and evidence")
    arbitration: ConflictArbitration = Field(..., description="Decision Authority conflict resolution")
    explanation: CausalReasoningExplanation = Field(..., description="5-stage causal explainability breakdown")
    timeline: List[ReasoningTimelineStep] = Field(default_factory=list, description="8-step agentic lifecycle timeline")
    stakeholder_perspectives: Dict[str, Dict[str, Any]] = Field(default_factory=dict, description="Tailored views for fisherman, authority, researcher")


ChatResponse.model_rebuild()


class TranscribeResponse(BaseModel):
    transcript: str = Field(..., description="Transcribed text from speech")
    language: str = Field(..., description="Raw language code returned by STT (e.g., 'mr-IN', 'hi-IN', 'en-IN')")
    normalized_language: str = Field(..., description="Normalized ISO-639-1 language code (e.g., 'mr', 'hi', 'en')")


class VoiceChatResponse(ChatResponse):
    transcript: str = Field(..., description="Transcribed mariner audio query")
    detected_language: str = Field("en", description="Raw language code detected by STT")
    audio_base64: Optional[str] = Field(
        None, description="Base64-encoded synthesized speech audio (WAV format)"
    )
    audio_format: str = Field("audio/wav", description="MIME format of the synthesized audio")

