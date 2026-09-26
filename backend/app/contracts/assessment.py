"""Trip Assessment API Contracts.

Owned by Dev 2 (Backend Platform) & Dev 4 (Domain Intelligence).
These schemas power the unified trip assessment pipeline.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.contracts.chat import (
    UserContext,
    RecommendationStatus,
    DataProvenance
)
from backend.app.contracts.observation import ObservationBundle
from backend.app.contracts.mission import MissionState


class TripAssessmentRequest(BaseModel):
    """Request payload for the unified trip assessment."""

    origin_harbor: Optional[str] = Field(None, description="Departure harbor or landing center.")
    coordinates: Optional[List[float]] = Field(None, description="[lon, lat] of the starting point.")
    craft_profile: str = Field("motorized_boat", description="Vessel classification.")
    departure_time: Optional[str] = Field(None, description="Planned departure time (ISO-8601 UTC).")
    return_time: Optional[str] = Field(None, description="Planned return time (ISO-8601 UTC).")
    destination_id: Optional[str] = Field(None, description="Optional PFZ or target destination ID.")
    language_preference: str = Field("auto", description="Language preference for alerts and summaries.")
    data_mode: str = Field("HYBRID", description="Data resolution mode (LIVE | HYBRID | SNAPSHOT | SYNTHETIC).")
    parent_assessment_id: Optional[str] = Field(None, description="ID of a previous assessment for comparison.")
    mission_state: Optional[MissionState] = Field(None, description="Canonical M1.1 MissionState context.")


class AssessmentSourceStatus(BaseModel):
    """Status for individual data sources in the assessment."""
    provider_name: str
    status: str = Field(description="CONFIGURED, UNAVAILABLE, FAILED, STALE, CACHED, SUCCESS")
    error_message: Optional[str] = None


class TripAssessmentResponse(BaseModel):
    """Unified response payload containing the complete safety assessment."""

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
