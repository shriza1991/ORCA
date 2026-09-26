"""Canonical MissionState, DecisionObject, and DecisionDelta Contracts for ORCA.

Defines the core product abstractions specified in `docs/ORCA_AI_MASTER_CONTEXT.md`:
- Section 3: MissionState / Mission Twin
- Section 6: Canonical Decision Object
- Section 21: Decision Delta

Owned by Backend/Platform (P2) & Decision/Evidence (P5).
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.contracts.chat import (
    Confidence,
    ConfidenceLevel,
    DataProvenance,
    EvidenceItem,
    Recommendation,
    RecommendationStatus,
    UserContext,
)


# =============================================================================
# 1. Mission Sub-Models (Section 3.1)
# =============================================================================

class MissionUser(BaseModel):
    """User profile and identity context."""
    identity: Optional[str] = Field(None, description="Mariner, operator, or authority identity identifier")
    locale: str = Field("en", description="Language locale (e.g. 'en', 'hi', 'mr')")
    profile: Optional[str] = Field(None, description="User role / persona: 'fisher' | 'authority' | 'researcher'")


class MissionVessel(BaseModel):
    """Vessel specifications and operational limits."""
    type: str = Field("motorized_boat", description="Craft class: traditional_non_motorized | motorized_boat | mechanized_trawler")
    size_m: Optional[float] = Field(None, description="Overall length in meters")
    speed_knots: Optional[float] = Field(None, description="Cruising speed in knots")
    range_km: Optional[float] = Field(None, description="Operational cruising range in kilometers")
    capabilities: List[str] = Field(default_factory=list, description="Vessel equipment: e.g. ['vhf_radio', 'gps', 'navic', 'ais']")
    safety_constraints: Dict[str, Any] = Field(default_factory=dict, description="Vessel-specific threshold overrides")


class ObjectiveType(str, Enum):
    FISHING = "fishing"
    TRANSIT = "transit"
    RESEARCH = "research"
    EMERGENCY = "emergency"
    OTHER = "other"


class MissionObjective(BaseModel):
    """Primary voyage or mission goal."""
    type: ObjectiveType = Field(ObjectiveType.FISHING, description="Objective category")
    description: Optional[str] = Field(None, description="Natural language description of intent")
    target_species: Optional[str] = Field(None, description="Target marine species if fishing")


class MissionLocation(BaseModel):
    """Geographic point representation."""
    name: Optional[str] = Field(None, description="Port, harbor, or landmark name")
    latitude: Optional[float] = Field(None, description="Latitude in EPSG:4326")
    longitude: Optional[float] = Field(None, description="Longitude in EPSG:4326")


class MissionTiming(BaseModel):
    """Temporal schedule of the mission."""
    departure: Optional[str] = Field(None, description="ISO-8601 UTC departure timestamp or offset")
    operation_start: Optional[str] = Field(None, description="ISO-8601 UTC operation commencement")
    operation_end: Optional[str] = Field(None, description="ISO-8601 UTC operation conclusion")
    return_deadline: Optional[str] = Field(None, description="ISO-8601 UTC latest safe return time")
    duration_hours: float = Field(8.0, description="Estimated total mission duration in hours")


class MissionConstraints(BaseModel):
    """Ordered operational and safety boundaries."""
    legal: List[str] = Field(default_factory=list, description="Boundaries: IMBL, MPAs, naval firing zones")
    safety: List[str] = Field(default_factory=list, description="Environmental thresholds: wave height, wind, cyclone alerts")
    operational: List[str] = Field(default_factory=list, description="Port limits, daylight requirements, fuel reserve")
    vessel: List[str] = Field(default_factory=list, description="Vessel class ceilings")
    user_preferences: Dict[str, Any] = Field(default_factory=dict, description="User-declared constraints")


class MissionPreferences(BaseModel):
    """Soft optimization preferences."""
    distance: float = Field(1.0, description="Relative weight for distance minimization (0.0 to 1.0)")
    fuel: float = Field(1.0, description="Relative weight for fuel conservation")
    time: float = Field(1.0, description="Relative weight for time minimization")
    opportunity: float = Field(1.0, description="Relative weight for PFZ/catch opportunity")
    risk_tolerance: str = Field("cautious", description="Risk posture: 'cautious' | 'balanced' | 'opportunity'")


class MissionRoute(BaseModel):
    """Navigation trajectory and waypoints."""
    corridor_name: Optional[str] = Field(None, description="Selected corridor: 'Safest Corridor' | 'Balanced Corridor' | 'Direct Passage'")
    waypoints: List[List[float]] = Field(default_factory=list, description="List of [lon, lat] coordinates")
    distance_km: Optional[float] = Field(None, description="Total transit distance in kilometers")
    max_wave_height_m: Optional[float] = Field(None, description="Maximum predicted wave exposure along route")
    exposure_score: Optional[float] = Field(None, description="Cumulative environmental exposure score")


class PreviousDecision(BaseModel):
    """Cached decision state from preceding turn or baseline mission."""
    decision: RecommendationStatus = Field(..., description="GO | CAUTION | NO_GO | UNKNOWN")
    confidence: Optional[Confidence] = Field(None, description="Confidence rating and reasons")
    decisive_factor: Optional[str] = Field(None, description="Primary driver behind decision")
    evidence_ids: List[str] = Field(default_factory=list, description="Referenced evidence item IDs")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Timestamp when decision was evaluated",
    )


class MissionContextData(BaseModel):
    """Current environmental context snapshots observed for this mission."""
    weather: Dict[str, Any] = Field(default_factory=dict, description="Wind speed, gusts, atmospheric state")
    ocean: Dict[str, Any] = Field(default_factory=dict, description="Currents, SST, swell period")
    waves: Dict[str, Any] = Field(default_factory=dict, description="Significant wave height, swell height")
    pfz: Dict[str, Any] = Field(default_factory=dict, description="Candidate PFZ advisories, SST gradients")
    alerts: List[Dict[str, Any]] = Field(default_factory=list, description="Active weather and coastal hazard bulletins")
    restrictions: List[Dict[str, Any]] = Field(default_factory=list, description="Active geofence restrictions intersected")


class MissionProvenance(BaseModel):
    """Provenance tracking for data used across this mission."""
    sources: List[str] = Field(default_factory=list, description="Authoritative sources queried (e.g. 'INCOIS_OSF', 'IMD')")
    timestamps: Dict[str, str] = Field(default_factory=dict, description="Observed and retrieved timestamps per source")
    validity_windows: Dict[str, Dict[str, str]] = Field(default_factory=dict, description="valid_from and valid_to per source")
    quality_flags: List[str] = Field(default_factory=list, description="Composite quality badges")


class MissionUncertainty(BaseModel):
    """Uncertainty, missing data, and conflict indicators."""
    missing_fields: List[str] = Field(default_factory=list, description="Required fields that were not available")
    conflicts: List[str] = Field(default_factory=list, description="Discrepancies identified between sources")
    is_stale: bool = Field(False, description="True if any critical evidence exceeds freshness limits")
    fallback_used: bool = Field(False, description="True if unauthoritative or cached fallback data was consumed")


# =============================================================================
# 2. Canonical MissionState / Mission Twin (Section 3.1)
# =============================================================================

class MissionState(BaseModel):
    """Canonical Mission State and Mission Twin abstraction.

    Every meaningful interaction with ORCA resolves into or updates a MissionState.
    Supports multi-turn reasoning, counterfactual simulation ('What if?'),
    and decision delta computation ('What changed?').
    """
    mission_id: str = Field(..., description="Unique mission identifier (e.g. 'msn_ratnagiri_20260921_001')")
    conversation_id: Optional[str] = Field(None, description="Linked chat conversation UUID")
    user: MissionUser = Field(default_factory=MissionUser, description="Mariner profile and locale")
    vessel: MissionVessel = Field(default_factory=MissionVessel, description="Vessel class and capabilities")
    objective: MissionObjective = Field(default_factory=MissionObjective, description="Mission goal")
    origin: MissionLocation = Field(default_factory=MissionLocation, description="Departure harbor or coordinates")
    destination: MissionLocation = Field(default_factory=MissionLocation, description="Destination harbor, PFZ, or waypoint")
    operation_area: Optional[Dict[str, Any]] = Field(None, description="GeoJSON Polygon/MultiPolygon of operating zone")
    timing: MissionTiming = Field(default_factory=MissionTiming, description="Departure, operation, and return schedule")
    constraints: MissionConstraints = Field(default_factory=MissionConstraints, description="Hard and soft operational limits")
    preferences: MissionPreferences = Field(default_factory=MissionPreferences, description="Route and mission preferences")
    selected_area: Optional[Dict[str, Any]] = Field(None, description="GeoJSON of selected operational area")
    route: Optional[MissionRoute] = Field(None, description="Computed or selected route corridor")
    previous_decision: Optional[PreviousDecision] = Field(None, description="Preceding decision for comparison")
    parent_assessment_id: Optional[str] = Field(None, description="Parent baseline assessment ID for what-if scenarios")
    current_context: MissionContextData = Field(default_factory=MissionContextData, description="Environmental data snapshot")
    provenance: MissionProvenance = Field(default_factory=MissionProvenance, description="Source provenance lineage")
    uncertainty: MissionUncertainty = Field(default_factory=MissionUncertainty, description="Data gaps and conflict flags")
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Mission creation timestamp (ISO-8601 UTC)",
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Mission last updated timestamp (ISO-8601 UTC)",
    )

    @property
    def origin_harbor(self) -> Optional[str]:
        return self.origin.name

    @property
    def craft_profile(self) -> str:
        return self.vessel.type

    @property
    def departure_time(self) -> Optional[str]:
        return self.timing.departure

    @property
    def return_time(self) -> Optional[str]:
        return self.timing.return_deadline

    @property
    def target_pfz(self) -> Optional[str]:
        return self.destination.name

    @property
    def language_preference(self) -> str:
        return self.user.locale


# =============================================================================
# 3. Canonical Decision Object (Section 6)
# =============================================================================

class DecisionObject(BaseModel):
    """Structured decision output produced by ORCA's reasoning pipeline.

    All high-stakes mission decisions converge to this schema.
    """
    decision: RecommendationStatus = Field(
        ..., description="GO | CAUTION | NO_GO (AVOID) | UNKNOWN | INFORMATIONAL"
    )
    confidence: ConfidenceLevel = Field(
        ..., description="HIGH | MEDIUM | LOW derived from evidence quality and freshness"
    )
    confidence_reasons: List[str] = Field(default_factory=list, description="Justification for confidence rating")
    decisive_factor: str = Field(..., description="Primary rule or environmental condition driving the verdict")
    supporting_factors: List[str] = Field(default_factory=list, description="Additional contributing evidence")
    non_decisive_factors: List[str] = Field(default_factory=list, description="Parameters within safe operating limits")
    constraints_applied: List[str] = Field(default_factory=list, description="Hard constraints evaluated (safety, legal, vessel)")
    evidence: List[EvidenceItem] = Field(default_factory=list, description="Authoritative observations cited")
    inferences: List[str] = Field(default_factory=list, description="System deductions (e.g. 'threshold exceeded during window')")
    provenance: List[DataProvenance] = Field(default_factory=list, description="Source attribution metadata")
    uncertainty: List[str] = Field(default_factory=list, description="Missing data or conflict caveats")
    alternatives: List[Dict[str, Any]] = Field(default_factory=list, description="Feasible safe alternatives if decision is CAUTION/NO_GO")
    recommended_action: str = Field(..., description="Direct operational advice for the mariner")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Evaluation timestamp (ISO-8601 UTC)",
    )

    def to_recommendation(self) -> Recommendation:
        """Converts canonical DecisionObject to API Recommendation for backwards compatibility."""
        return Recommendation(
            status=self.decision,
            summary=self.decisive_factor,
            decisive_factors=[self.decisive_factor] + self.supporting_factors,
            non_decisive_factors=self.non_decisive_factors,
            next_action=self.recommended_action,
            confidence=Confidence(level=self.confidence, reasons=self.confidence_reasons),
            provenance=self.provenance,
            evidence_ids=[ev.source_name for ev in self.evidence],
            warnings=self.uncertainty,
        )


# =============================================================================
# 4. Canonical Decision Delta (Section 21)
# =============================================================================

class DecisionDelta(BaseModel):
    """Calculates and exposes the delta between baseline and counterfactual missions."""
    original_decision: RecommendationStatus = Field(..., description="Baseline decision status")
    new_decision: RecommendationStatus = Field(..., description="Counterfactual simulated status")
    decision_changed: bool = Field(False, description="True if status differed (e.g. NO_GO -> GO)")
    confidence_change: Optional[str] = Field(None, description="e.g. 'HIGH -> MEDIUM'")
    decisive_factor_change: Optional[Dict[str, str]] = Field(
        None, description="{'original': '...', 'new': '...'}"
    )
    added_factors: List[str] = Field(default_factory=list, description="New decisive factors in counterfactual")
    removed_factors: List[str] = Field(default_factory=list, description="Decisive factors resolved in counterfactual")
    changed_factors: List[str] = Field(default_factory=list, description="Factors whose numerical values changed")
    temporal_changes: Dict[str, Any] = Field(default_factory=dict, description="Time shifts applied (e.g. departure +4h)")
    route_changes: Optional[Dict[str, Any]] = Field(None, description="Route or corridor changes")
    spatial_changes: Optional[Dict[str, Any]] = Field(None, description="Operating zone or destination changes")
    summary: str = Field(..., description="Human-readable summary of what changed and why")


# =============================================================================
# 5. Conversion & Bridge Helpers
# =============================================================================

def mission_from_user_context(
    user_context: Optional[UserContext],
    message: str = "",
    conversation_id: Optional[str] = None,
    mission_id: Optional[str] = None,
) -> MissionState:
    """Bridges legacy/current UserContext into a full canonical MissionState."""
    mid = mission_id or f"msn_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    ctx = user_context or UserContext()

    # Determine origin location
    origin = MissionLocation(
        name=ctx.origin_harbor,
        latitude=ctx.coordinates[1] if ctx.coordinates and len(ctx.coordinates) > 1 else None,
        longitude=ctx.coordinates[0] if ctx.coordinates and len(ctx.coordinates) > 0 else None,
    )

    # Determine vessel profile
    vessel = MissionVessel(
        type=ctx.craft_profile or "motorized_boat",
    )

    # Determine user locale
    user = MissionUser(
        locale=ctx.language_preference if ctx.language_preference and ctx.language_preference != "auto" else "en",
    )

    # Determine timing
    timing = MissionTiming(
        departure=ctx.departure_time,
        return_deadline=ctx.return_time,
    )

    # Determine destination / target PFZ
    destination = MissionLocation(
        name=ctx.target_pfz,
    ) if ctx.target_pfz else MissionLocation()

    # Determine objective
    lower_msg = message.lower()
    obj_type = ObjectiveType.FISHING
    if "route" in lower_msg or "passage" in lower_msg:
        obj_type = ObjectiveType.TRANSIT
    elif "hazard" in lower_msg or "cyclone" in lower_msg or "warning" in lower_msg:
        obj_type = ObjectiveType.OTHER
    elif "research" in lower_msg:
        obj_type = ObjectiveType.RESEARCH

    return MissionState(
        mission_id=mid,
        conversation_id=conversation_id,
        user=user,
        vessel=vessel,
        objective=MissionObjective(type=obj_type, description=message if message else None),
        origin=origin,
        destination=destination,
        timing=timing,
        parent_assessment_id=ctx.parent_assessment_id,
    )
