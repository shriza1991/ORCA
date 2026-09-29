"""Dev 4 Interface Protocols & Payload Schemas (Marine, Geo, Risk & Route Intelligence).

Owned by Dev 3 (Architecture & Interface Definition).
Implemented by Dev 4 (Domain Intelligence Engines).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

CRITICAL ARCHITECTURAL BOUNDARY:
===============================================================================
Dev 4 implements the deterministic mathematical, geospatial, and risk algorithms.
Dev 4 MUST satisfy these typed interface protocols.
The agent (Dev 3) will NEVER calculate risk thresholds, great-circle distances,
or polygon intersections in prompts. It strictly consumes Dev 4's outputs.
===============================================================================
"""

from typing import Any, Dict, List, Optional, Protocol, runtime_checkable
from pydantic import BaseModel, Field

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    WeatherConditionsPayload,
)
from backend.app.contracts.chat import (
    ConfidenceLevel,
    DataProvenance,
    RecommendationStatus,
    ThresholdComparison,
)


# =============================================================================
# 1. Dev 4 Output Payload Schemas
# =============================================================================

class RiskAssessmentPayload(BaseModel):
    """Deterministic safety decision computed by Dev 4's Python Risk Engine."""

    status: RecommendationStatus = Field(..., description="Immutable safety evaluation state (GO/CAUTION/NO_GO/UNKNOWN)")
    summary: str = Field(..., description="1-2 sentence executive summary of safety state")
    decisive_factors: List[str] = Field(
        default_factory=list,
        description="Key numerical or physical factors triggering the decision (e.g. 'Wave height 2.8m > 2.0m threshold')",
    )
    non_decisive_factors: List[str] = Field(
        default_factory=list,
        description="Relevant contextual parameters that remained within safe limits",
    )
    threshold_comparisons: List[ThresholdComparison] = Field(
        default_factory=list,
        description="Structured threshold comparisons driving the decision",
    )
    recommended_action: str = Field(..., description="Direct actionable directive for the mariner")
    confidence_level: ConfidenceLevel = Field(ConfidenceLevel.HIGH, description="Confidence based on data quality")
    confidence_reasons: List[str] = Field(default_factory=list, description="Justification for rating")
    provenance: List[DataProvenance] = Field(
        default_factory=list,
        description="Origin, timestamps, and validity windows for underlying data feeds",
    )
    evidence_ids: List[str] = Field(
        default_factory=list,
        description="IDs of linked evidence items supporting this decision",
    )
    warnings: List[str] = Field(default_factory=list, description="Degradation or proximity notices")


class PFZCandidatePayload(BaseModel):
    """Single ranked Potential Fishing Zone candidate calculated by Dev 4."""

    candidate_id: str = Field(..., description="Unique candidate identifier")
    latitude: float = Field(..., description="Latitude coordinate in EPSG:4326")
    longitude: float = Field(..., description="Longitude coordinate in EPSG:4326")
    distance_nautical_miles: float = Field(..., ge=0.0, description="Geodesic distance from departure harbor")
    bearing_degrees: float = Field(..., ge=0.0, le=360.0, description="Compass bearing from departure harbor")
    water_depth_m: Optional[float] = Field(None, description="Bathymetric water depth at location")
    sea_surface_temp_c: Optional[float] = Field(None, description="SST at PFZ coordinate")
    chlorophyll_mg_m3: Optional[float] = Field(None, description="Chlorophyll concentration")
    location_reference: Optional[str] = Field(None, description="Human readable location reference from raw data")
    rank: int = Field(..., ge=1, description="1-indexed proximity and productivity ranking")
    selection_reason: Optional[str] = Field(None, description="Deterministic reason this candidate was selected or ranked")


class PFZRankingPayload(BaseModel):
    """Collection of ranked PFZ zones produced by Dev 4 geodesic ranking engine."""

    origin_harbor: str = Field(..., description="Departure landing center")
    total_candidates: int = Field(..., description="Number of candidates evaluated")
    ranked_candidates: List[PFZCandidatePayload] = Field(default_factory=list, description="Ranked candidate list")


class EvaluatedRouteItem(BaseModel):
    """Single passage route evaluated for wave, wind, and restricted area exposure."""

    route_id: str = Field(..., description="Route identifier (e.g. 'ROUTE-A-INSHORE')")
    name: str = Field(..., description="Human-readable channel or passage name")
    distance_km: float = Field(..., ge=0.0, description="Total nautical distance in kilometers")
    max_wave_height_m: float = Field(..., description="Peak significant wave height along route")
    risk_rating: str = Field("LOW", description="Exposure rating: LOW | MODERATE | HIGH")
    exposure_score: float = Field(..., description="Numerical risk exposure metric")
    waypoints: List[List[float]] = Field(default_factory=list, description="List of [lon, lat] coordinates")
    eta_hours: Optional[float] = Field(None, description="Estimated time of arrival in hours")
    eta_assumptions: Optional[str] = Field(None, description="Assumptions used for ETA calculation")
    fuel_estimate_liters: Optional[float] = Field(None, description="Estimated fuel consumption")
    one_way_distance_km: Optional[float] = Field(None, description="One-way route distance in kilometers")
    round_trip_distance_km: Optional[float] = Field(None, description="Round-trip route distance in kilometers")
    one_way_fuel_liters: Optional[float] = Field(None, description="One-way fuel estimate in liters")
    round_trip_fuel_liters: Optional[float] = Field(None, description="Round-trip fuel estimate in liters")
    fuel_assumptions: Optional[str] = Field(None, description="Assumptions used for fuel calculation")
    is_feasible: bool = Field(True, description="False if route intersects land or NO_GO area")
    infeasibility_reasons: List[str] = Field(default_factory=list, description="Why the route is infeasible")
    is_synthetic: bool = Field(False, description="True if route is a demo/synthetic corridor")
    missing_data_state: Optional[str] = Field(None, description="Explanation if data was missing")
    waypoint_timeline: Optional[List[Dict[str, Any]]] = Field(
        default=None, description="Time-indexed waypoint meteorological exposure breakdown"
    )
    current_adjusted: bool = Field(
        default=False, description="True if ETA and fuel account for surface ocean current vectors"
    )
    peak_exposure_point: Optional[Dict[str, Any]] = Field(
        default=None, description="Coordinate and timestamp of peak sea state exposure"
    )


class RouteExposurePayload(BaseModel):
    """Multi-route comparison and risk exposure analysis produced by Dev 4."""

    origin: str = Field(..., description="Departure harbor")
    destination: str = Field(..., description="Destination or target fishing bank")
    recommended_route_id: str = Field(..., description="ID of lowest-risk passage")
    routes: List[EvaluatedRouteItem] = Field(default_factory=list, description="Evaluated passage options")
    origin_coordinates: Optional[List[float]] = Field(None, description="[lon, lat] departure coordinates")
    destination_coordinates: Optional[List[float]] = Field(None, description="[lon, lat] destination coordinates")
    departure_windows: Optional[List[Dict[str, Any]]] = Field(
        default=None, description="Evaluated departure time windows within forecast envelope"
    )
    optimal_departure_recommendation: Optional[str] = Field(
        default=None, description="Actionable recommendation for optimal departure window"
    )


class GeospatialHazardPayload(BaseModel):
    """Geofence spatial intersection result produced by Dev 4 using Shapely."""

    intersected: bool = Field(False, description="True if point or trajectory intersects restricted zone")
    restriction_name: Optional[str] = Field(None, description="Name of polygon (e.g. 'Naval Firing Range Foxtrot')")
    restriction_type: Optional[str] = Field(None, description="Category: NAVAL_RANGE | MPA | SHALLOW_REEF | IMBL")
    distance_to_boundary_km: Optional[float] = Field(None, description="Distance to nearest restricted polygon")
    hard_stop: bool = Field(False, description="True if passage is strictly prohibited (NO_GO)")
    restricted: bool = Field(False, description="True if operational caution or restriction applies (CAUTION)")
    time_to_cross_hours: Optional[float] = Field(
        default=None, description="Projected time in hours before vessel crosses restricted boundary"
    )
    projected_intersection: bool = Field(
        default=False, description="True if vessel projected trajectory intercepts restricted zone"
    )


# =============================================================================
# 2. Dev 4 Interface Protocols
# =============================================================================

@runtime_checkable
class RiskEvaluationEngine(Protocol):
    """Interface that Dev 4's deterministic risk engine must implement."""

    def evaluate_risk(
        self,
        context: ToolInvocationContext,
        marine: MarineConditionsPayload,
        weather: WeatherConditionsPayload,
        hazard: HazardBulletinPayload,
    ) -> RiskAssessmentPayload:
        """Evaluates wave, wind, and storm data against craft ceilings."""
        ...


@runtime_checkable
class PFZRankingEngine(Protocol):
    """Interface that Dev 4's PFZ calculation module must implement."""

    def rank_pfz_candidates(
        self,
        context: ToolInvocationContext,
        raw_features: List[Dict[str, Any]],
        max_search_radius_nm: float = 50.0,
    ) -> PFZRankingPayload:
        """Calculates geodesic distances and ranks PFZ coordinates."""
        ...


@runtime_checkable
class RouteExposureEngine(Protocol):
    """Interface that Dev 4's route planning engine must implement."""

    def evaluate_routes(
        self,
        context: ToolInvocationContext,
        marine: MarineConditionsPayload,
        destination: str,
        weather: Optional[WeatherConditionsPayload] = None,
        hazard: Optional[HazardBulletinPayload] = None,
        geospatial_engine: Optional[Any] = None,
        dest_coords: Optional[List[float]] = None,
        base_waypoints: Optional[List[List[float]]] = None,
    ) -> RouteExposurePayload:
        """Computes alternative route passages and scores risk exposure."""
        ...


@runtime_checkable
class GeospatialHazardEngine(Protocol):
    """Interface that Dev 4's geofence intersection engine must implement."""

    def check_geofence_hazards(
        self,
        context: ToolInvocationContext,
        coordinates: List[float],
    ) -> GeospatialHazardPayload:
        """Performs spatial intersection with restricted maritime polygons."""
        ...
