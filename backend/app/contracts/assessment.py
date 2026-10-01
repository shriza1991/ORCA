"""Trip Assessment API Contracts.

Owned by Dev 2 (Backend Platform) & Dev 4 (Domain Intelligence).
These schemas power the unified trip assessment pipeline.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field, model_validator

from backend.app.contracts.chat import (
    UserContext,
    RecommendationStatus,
    DataProvenance,
    AgentCollaborationPayload,
)
from backend.app.contracts.observation import ObservationBundle
from backend.app.contracts.mission import MissionState, DecisionDelta


class TripAssessmentRequest(BaseModel):
    """Request payload for the unified trip assessment."""

    origin_harbor: Optional[str] = Field(None, description="Departure harbor or landing center.")
    coordinates: Optional[List[float]] = Field(None, description="[lon, lat] of the starting point.")
    craft_profile: str = Field("motorized_boat", description="Vessel classification.")
    vessel_size: Optional[str] = Field("medium", description="Vessel size classification: small | medium | large.")
    departure_time: Optional[str] = Field(None, description="Planned departure time (ISO-8601 UTC).")
    return_time: Optional[str] = Field(None, description="Planned return time (ISO-8601 UTC).")
    destination_id: Optional[str] = Field(None, description="Optional PFZ or target destination ID.")
    language_preference: str = Field("auto", description="Language preference for alerts and summaries.")
    data_mode: str = Field("HYBRID", description="Data resolution mode (LIVE | HYBRID | SNAPSHOT | SYNTHETIC | DEMO).")
    evidence_bundle_id: Optional[str] = None
    selected_route_id: Optional[str] = None
    parent_assessment_id: Optional[str] = Field(None, description="ID of a previous assessment for comparison.")
    mission_state: Optional[MissionState] = Field(None, description="Canonical M1.1 MissionState context.")

    @model_validator(mode="after")
    def validate_trip_window(self) -> "TripAssessmentRequest":
        dep_dt = None
        if self.departure_time:
            try:
                clean_dep = self.departure_time.replace("Z", "+00:00")
                dep_dt = datetime.fromisoformat(clean_dep)
            except Exception as e:
                raise ValueError(f"Invalid departure_time format: {self.departure_time}. Must be valid ISO-8601.") from e

        ret_dt = None
        if self.return_time:
            try:
                clean_ret = self.return_time.replace("Z", "+00:00")
                ret_dt = datetime.fromisoformat(clean_ret)
            except Exception as e:
                raise ValueError(f"Invalid return_time format: {self.return_time}. Must be valid ISO-8601.") from e

        if dep_dt and ret_dt and ret_dt <= dep_dt:
            raise ValueError(f"return_time ({self.return_time}) must be after departure_time ({self.departure_time})")

        if self.mission_state and getattr(self.mission_state, "timing", None):
            ms_dep = self.mission_state.timing.departure
            ms_ret = self.mission_state.timing.return_deadline
            ms_dep_dt, ms_ret_dt = None, None
            if ms_dep:
                try:
                    ms_dep_dt = datetime.fromisoformat(ms_dep.replace("Z", "+00:00"))
                except Exception as e:
                    raise ValueError(f"Invalid mission_state departure format: {ms_dep}. Must be valid ISO-8601.") from e
            if ms_ret:
                try:
                    ms_ret_dt = datetime.fromisoformat(ms_ret.replace("Z", "+00:00"))
                except Exception as e:
                    raise ValueError(f"Invalid mission_state return format: {ms_ret}. Must be valid ISO-8601.") from e
            if ms_dep_dt and ms_ret_dt and ms_ret_dt <= ms_dep_dt:
                raise ValueError(f"mission_state return_deadline ({ms_ret}) must be after departure ({ms_dep})")

        return self


class AssessmentSourceStatus(BaseModel):
    """Status for individual data sources in the assessment."""
    provider_name: str
    status: str = Field(description="CONFIGURED, UNAVAILABLE, FAILED, STALE, CACHED, SUCCESS")
    error_message: Optional[str] = None


class MissionBriefPayload(BaseModel):
    """Grounded, deterministic mission brief explaining the safety decision (M1.2)."""
    summary: str
    recommended_action: str
    positive_factors: list[str]
    negative_factors: list[str]
    confidence: str
    confidence_reasons: list[str]
    vessel_type: Optional[str] = None
    vessel_size: Optional[str] = None
    capability_notes: Optional[str] = None


class DecisionBoundaryItem(BaseModel):
    """Deterministic boundary proximity metric for marine safety thresholds (M1.4)."""
    metric_name: str
    observed_value: float
    threshold_value: float
    operator: str
    unit: str
    margin: float
    margin_percent: float
    target_tier: str
    is_nearest_boundary: bool = False


class DecisionStabilityPayload(BaseModel):
    """Deterministic recommendation stability assessment (M1.4)."""
    level: str
    headline: str
    reason: str
    nearest_boundary: Optional[DecisionBoundaryItem] = None
    minimal_safe_adjustment: Optional[str] = None
    sensitivity_ranking: List[str] = Field(default_factory=list)


class SafeMissionWindow(BaseModel):
    """Deterministic safe operational window evaluation (M1.4)."""
    is_current_safe: bool
    recommended_window_start: Optional[str] = None
    recommended_window_end: Optional[str] = None
    earliest_safer_departure: Optional[str] = None
    window_summary: str


class CounterfactualFlipExplanation(BaseModel):
    """Deterministic causal attribution for decision flip between scenarios (M1.4)."""
    baseline_decision: str
    simulated_decision: str
    decision_flipped: bool
    primary_cause_metric: str
    observed_before: Union[float, str]
    observed_after: Union[float, str]
    threshold_crossed: Union[float, str]
    explanation_text: str
    minimal_adjustment_to_revert: Optional[str] = None


class TripAssessmentResponse(BaseModel):
    """Unified response payload containing the complete safety assessment."""

    evidence_bundle_id: Optional[str] = None
    evaluator_version: str = "mission-evaluation-v1"
    explanation_kind: str = "derived_domain_explanation"
    evaluation_events: List[Dict[str, Any]] = Field(default_factory=list)
    assessment_id: str = Field(..., description="Unique identifier for this assessment.")
    assessed_at: str = Field(..., description="Timestamp of the assessment generation (ISO-8601 UTC).")
    
    trip_context: UserContext = Field(..., description="Echo of the evaluated context.")
    
    decision: RecommendationStatus = Field(
        ..., description="Final safety decision: GO (within limits), CAUTION, NO_GO (do not depart), UNKNOWN (cannot assess)."
    )
    
    conditions: ObservationBundle = Field(..., description="The snapshot bundle of normalized observations.")
    
    alerts: List[Dict[str, Any]] = Field(default_factory=list, description="List of generated warnings and alerts.")
    
    pfz_candidates: List[Dict[str, Any]] = Field(default_factory=list, description="Ranked PFZ zones if requested.")
    
    route_candidates: List[Dict[str, Any]] = Field(default_factory=list, description="Recommended safe routes if applicable.")
    
    map_layers: Dict[str, Any] = Field(default_factory=dict, description="Pre-configured Mapbox/Maplibre layer sources.")
    
    evidence: List[Dict[str, Any]] = Field(
        default_factory=list, description="Threshold comparisons and decisive factors backing the decision."
    )
    
    source_status: List[AssessmentSourceStatus] = Field(
        default_factory=list, description="Status of each underlying data provider."
    )
    
    is_durable: bool = Field(False, description="True if this assessment was persisted to the database.")
    mission_state: Optional[MissionState] = Field(None, description="Canonical M1.1 MissionState context.")
    brief: Optional[MissionBriefPayload] = Field(None, description="Grounded M1.2 deterministic mission brief and why explanation.")
    agent_collaboration: Optional[AgentCollaborationPayload] = Field(
        None, description="Deterministic multi-agent reasoning, stances, arbitration, and timeline (M1.3)."
    )
    stability: Optional[DecisionStabilityPayload] = Field(
        None, description="Deterministic recommendation stability and nearest boundary proximity (M1.4)."
    )
    safe_window: Optional[SafeMissionWindow] = Field(
        None, description="Earliest safe mission departure window (M1.4)."
    )


class TripSimulationRequest(BaseModel):
    baseline_assessment_id: Optional[str] = None
    baseline: TripAssessmentRequest
    simulated: TripAssessmentRequest


class TripSimulationResponse(BaseModel):
    baseline: TripAssessmentResponse
    simulated: TripAssessmentResponse
    delta: DecisionDelta

