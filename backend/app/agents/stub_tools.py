"""In-Memory Specialist Stub Tools for ORCA / ORCA (Milestone M1).

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

CRITICAL ARCHITECTURAL NOTICES:
===============================================================================
1. DEMONSTRATION PURPOSES ONLY:
   These tools produce controlled, in-memory simulated marine data for testing
   and demonstrating the agent orchestration pipeline in Milestone M1.
   They DO NOT call external APIs (owned by Dev 2) or run mathematical/risk
   algorithms (owned by Dev 4).

2. EVIDENCE TRACEABILITY:
   Every numerical claim or safety metric is backed by an explicit EvidenceItem
   tagged with 'M1_DEMO_DATA' and 'SIMULATED'.
===============================================================================
"""

from typing import Any, Optional
from datetime import datetime, timezone

from backend.app.agents.tools import (
    ToolDefinition,
    ToolParameter,
    tool_registry,
)
from backend.app.contracts.chat import (
    Confidence,
    ConfidenceLevel,
    EvidenceItem,
    Recommendation,
    RecommendationStatus,
)
from backend.app.contracts.tools import ToolResult, ToolStatus


# =============================================================================
# 1. PFZ (Potential Fishing Zone) Stub Tool
# =============================================================================

def pfz_stub(
    harbor: str = "Ratnagiri",
    max_distance_nm: float = 30.0,
    **kwargs: Any,
) -> ToolResult:
    """Simulated Potential Fishing Zone retrieval tool for demonstration."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return ToolResult(
        status=ToolStatus.OK,
        data={
            "source_type": "M1_DEMO",
            "target_harbor": harbor,
            "candidates_found": 1,
            "pfz_candidates": [
                {
                    "candidate_id": "PFZ-DEMO-001",
                    "latitude": 16.98,
                    "longitude": 73.12,
                    "distance_nautical_miles": 12.4,
                    "bearing_degrees": 285.0,
                    "water_depth_m": 45.0,
                    "sea_surface_temp_c": 28.5,
                    "chlorophyll_mg_m3": 1.25,
                    "validity": "simulated_active",
                }
            ],
        },
        evidence=[
            EvidenceItem(
                source_name="INCOIS PFZ Advisory (Simulated M1 Demo)",
                source_url="https://incois.gov.in/marine_fisheries/pfz_demo",
                observed_time=now_iso,
                valid_from=now_iso,
                valid_to="2026-09-07T18:00:00Z",
                metric_name="pfz_distance_nm",
                metric_value=12.4,
                metric_unit="nautical_miles",
                quality_flags=["M1_DEMO_DATA", "SIMULATED"],
            )
        ],
        warnings=["Demonstration data only — not for real navigation or fishing operations."],
    )


# =============================================================================
# 2. Marine Ocean State Stub Tool
# =============================================================================

def marine_stub(
    harbor: str = "Ratnagiri",
    time_offset: str = "tomorrow_morning",
    **kwargs: Any,
) -> ToolResult:
    """Simulated Ocean State Forecast tool (wave height, swell, currents)."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return ToolResult(
        status=ToolStatus.OK,
        data={
            "source_type": "M1_DEMO",
            "target_harbor": harbor,
            "time_window": time_offset,
            "significant_wave_height_m": 1.8,
            "maximum_wave_height_m": 2.4,
            "swell_height_m": 1.2,
            "swell_period_sec": 8.5,
            "sea_surface_current_knots": 1.1,
        },
        evidence=[
            EvidenceItem(
                source_name="INCOIS Ocean State Forecast (Simulated M1 Demo)",
                source_url="https://incois.gov.in/portal/osf_demo",
                observed_time=now_iso,
                valid_from=now_iso,
                valid_to="2026-09-07T12:00:00Z",
                metric_name="significant_wave_height",
                metric_value=1.8,
                metric_unit="meters",
                quality_flags=["M1_DEMO_DATA", "SIMULATED"],
            ),
            EvidenceItem(
                source_name="INCOIS Ocean State Forecast (Simulated M1 Demo)",
                source_url="https://incois.gov.in/portal/osf_demo",
                observed_time=now_iso,
                valid_from=now_iso,
                valid_to="2026-09-07T12:00:00Z",
                metric_name="swell_period_sec",
                metric_value=8.5,
                metric_unit="seconds",
                quality_flags=["M1_DEMO_DATA", "SIMULATED"],
            ),
        ],
        warnings=["Simulated sea-state data — not an official INCOIS broadcast."],
    )


# =============================================================================
# 3. Weather & Hazard Bulletin Stub Tool
# =============================================================================

def weather_stub(
    harbor: str = "Ratnagiri",
    **kwargs: Any,
) -> ToolResult:
    """Simulated Atmospheric Weather & Cyclone Hazard Bulletin tool."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return ToolResult(
        status=ToolStatus.OK,
        data={
            "source_type": "M1_DEMO",
            "target_harbor": harbor,
            "wind_speed_knots": 16.0,
            "wind_gust_knots": 22.0,
            "wind_direction": "WSW",
            "cyclone_warning_active": False,
            "squall_alert": False,
            "visibility_km": 9.5,
        },
        evidence=[
            EvidenceItem(
                source_name="IMD Coastal Weather Bulletin (Simulated M1 Demo)",
                source_url="https://mausam.imd.gov.in/demo",
                observed_time=now_iso,
                valid_from=now_iso,
                valid_to="2026-09-07T18:00:00Z",
                metric_name="wind_speed_knots",
                metric_value=16.0,
                metric_unit="knots",
                quality_flags=["M1_DEMO_DATA", "SIMULATED"],
            ),
            EvidenceItem(
                source_name="IMD Coastal Weather Bulletin (Simulated M1 Demo)",
                source_url="https://mausam.imd.gov.in/demo",
                observed_time=now_iso,
                valid_from=now_iso,
                valid_to="2026-09-07T18:00:00Z",
                metric_name="cyclone_warning_active",
                metric_value=False,
                quality_flags=["M1_DEMO_DATA", "SIMULATED"],
            ),
        ],
        warnings=["Simulated weather advisory — not an official IMD bulletin."],
    )


# =============================================================================
# 4. Deterministic Risk Evaluation Stub Tool (Dev 4 Simulator)
# =============================================================================

def risk_stub(
    wave_height_m: float = 1.8,
    wind_speed_knots: float = 16.0,
    cyclone_active: bool = False,
    craft_type: str = "motorized_boat",
    status_override: Optional[str] = None,
    **kwargs: Any,
) -> ToolResult:
    """Simulated Deterministic Risk Engine evaluation (Dev 4 contract placeholder).

    Evaluates wave heights against vessel ceiling:
    - wave_height > 2.5m or cyclone_active -> NO_GO
    - wave_height between 1.5m and 2.5m -> CAUTION
    - wave_height < 1.5m -> GO
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    if status_override:
        rec_status = RecommendationStatus(status_override)
    elif cyclone_active or wave_height_m > 2.5:
        rec_status = RecommendationStatus.NO_GO
    elif wave_height_m >= 1.5 or wind_speed_knots >= 20.0:
        rec_status = RecommendationStatus.CAUTION
    else:
        rec_status = RecommendationStatus.GO

    summary_map = {
        RecommendationStatus.GO: "Simulated marine conditions are calm and within craft operational thresholds.",
        RecommendationStatus.CAUTION: f"Simulated sea state exhibits moderate wave height ({wave_height_m}m). Exercise coastal vigilance.",
        RecommendationStatus.NO_GO: f"Simulated conditions exceed safety ceiling ({wave_height_m}m waves). Departure prohibited in simulation.",
        RecommendationStatus.UNKNOWN: "Insufficient simulated data to compute safety state.",
    }

    factors = [
        f"Simulated significant wave height: {wave_height_m}m",
        f"Simulated wind speed: {wind_speed_knots} knots",
        f"Craft operational profile: {craft_type}",
    ]
    if cyclone_active:
        factors.append("Active simulated storm/cyclone advisory")

    next_action_map = {
        RecommendationStatus.GO: "Proceed with voyage; maintain VHF Channel 16 watch (Simulation only).",
        RecommendationStatus.CAUTION: "Operate within 5 nautical miles of coastline and monitor weather (Simulation only).",
        RecommendationStatus.NO_GO: "Remain moored in port until simulated alerts clear.",
        RecommendationStatus.UNKNOWN: "Request fresh marine observations before departure.",
    }

    recommendation = Recommendation(
        status=rec_status,
        summary=summary_map[rec_status],
        decisive_factors=factors,
        next_action=next_action_map[rec_status],
    )

    confidence = Confidence(
        level=ConfidenceLevel.MEDIUM,
        reasons=["Generated from M1 in-memory simulated demonstration dataset"],
    )

    return ToolResult(
        status=ToolStatus.OK,
        data={
            "source_type": "M1_DEMO",
            "recommendation": recommendation.model_dump(),
            "confidence": confidence.model_dump(),
        },
        evidence=[
            EvidenceItem(
                source_name="ORCA Risk Engine (Simulated M1 Demo)",
                source_url="https://orca.internal/risk_eval",
                observed_time=now_iso,
                metric_name="risk_status",
                metric_value=rec_status.value,
                quality_flags=["M1_DEMO_DATA", "SIMULATED"],
            )
        ],
        warnings=["Simulated risk evaluation for software verification — do not base marine voyages on this output."],
    )


# =============================================================================
# 4A. Trip Assessment Stub Tool (Unified Pipeline Mock)
# =============================================================================

def trip_assessment_stub(
    origin_harbor: str = "Ratnagiri",
    craft_profile: str = "motorized_boat",
    **kwargs: Any,
) -> ToolResult:
    """Simulated Trip Assessment pipeline evaluation."""
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # Simulate a NO_GO decision based on some craft threshold for demo
    rec_status = RecommendationStatus.CAUTION
    summary = f"Simulated trip assessment for {origin_harbor}. Exercise caution."
    
    recommendation = Recommendation(
        status=rec_status,
        summary=summary,
        decisive_factors=[f"Craft: {craft_profile}", "Simulated M1 environment"],
        next_action="Monitor local weather (Simulation only).",
    )
    
    confidence = Confidence(
        level=ConfidenceLevel.MEDIUM,
        reasons=["Generated from M1 simulated assessment pipeline"],
    )

    marine = {
        "harbor": origin_harbor,
        "significant_wave_height_m": 1.5,
        "sea_surface_current_knots": 1.1,
    }
    weather = {
        "harbor": origin_harbor,
        "wind_speed_knots": 15.0,
        "wind_gust_knots": 18.0,
        "visibility_km": 10.0,
    }

    return ToolResult(
        status=ToolStatus.OK,
        data={
            "source_type": "M1_DEMO",
            "recommendation": recommendation.model_dump(),
            "confidence": confidence.model_dump(),
            "conditions": {
                "marine": marine,
                "weather": weather,
            },
        },
        evidence=[
            EvidenceItem(
                source_name="ORCA Trip Assessment (Simulated M1 Demo)",
                source_url="https://orca.internal/trip_assessment",
                observed_time=now_iso,
                metric_name="risk_status",
                metric_value=rec_status.value,
                quality_flags=["M1_DEMO_DATA", "SIMULATED"],
            )
        ],
        warnings=["Simulated unified assessment for demonstration."],
    )


# =============================================================================
# 5. Route Comparison Stub Tool
# =============================================================================

def route_stub(
    origin_harbor: str = "Veraval",
    destination: str = "Outer Bank",
    **kwargs: Any,
) -> ToolResult:
    """Simulated Route Navigation and Exposure Scoring tool."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return ToolResult(
        status=ToolStatus.OK,
        data={
            "source_type": "M1_DEMO",
            "origin": origin_harbor,
            "destination": destination,
            "routes": [
                {
                    "route_id": "ROUTE-A-INSHORE",
                    "name": "Protected Inshore Passage",
                    "distance_km": 28.2,
                    "max_wave_height_m": 1.4,
                    "risk_rating": "LOW",
                },
                {
                    "route_id": "ROUTE-B-DIRECT",
                    "name": "Direct Deepwater Channel",
                    "distance_km": 22.1,
                    "max_wave_height_m": 2.2,
                    "risk_rating": "MODERATE",
                },
            ],
        },
        evidence=[
            EvidenceItem(
                source_name="ORCA Route Planner (Simulated M1 Demo)",
                source_url="https://orca.internal/route_planner",
                observed_time=now_iso,
                metric_name="route_inshore_distance_km",
                metric_value=28.2,
                metric_unit="kilometers",
                quality_flags=["M1_DEMO_DATA", "SIMULATED"],
            )
        ],
        warnings=["Simulated route calculations — not verified for bathymetric depth or shallow shoals."],
    )


# =============================================================================
# 6. Analytical Explanation Stub Tool
# =============================================================================

def explanation_stub(
    topic: str = "route_risk",
    **kwargs: Any,
) -> ToolResult:
    """Simulated context retriever for analytical explanation queries."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return ToolResult(
        status=ToolStatus.OK,
        data={
            "source_type": "M1_DEMO",
            "topic": topic,
            "decisive_reason": "Passage intersects shallow coral reef zone with restricted maritime boundary.",
            "rule_violation": "IMBL_PROXIMITY_BUFFER",
        },
        evidence=[
            EvidenceItem(
                source_name="Maritime Geofence Registry (Simulated M1 Demo)",
                source_url="https://orca.internal/geofence",
                observed_time=now_iso,
                metric_name="geofence_id",
                metric_value="RESTRICTED-REEF-ZONE-4",
                quality_flags=["M1_DEMO_DATA", "SIMULATED"],
            )
        ],
        warnings=["Simulated explanatory evidence."],
    )


# =============================================================================
# Registry Initialization Helper
# =============================================================================

def register_m1_stub_tools(registry: Optional[Any] = None) -> None:
    """Registers all M1 in-memory stub tools with the global AgentToolRegistry."""
    target_registry = registry or tool_registry
    stubs = [
        (
            ToolDefinition(
                name="pfz_stub",
                description="Retrieve demonstration Potential Fishing Zones and coordinates",
                category="marine",
                parameters=[
                    ToolParameter(name="harbor", type_name="str", description="Departure harbor", required=False, default="Ratnagiri"),
                    ToolParameter(name="max_distance_nm", type_name="float", description="Search radius in nautical miles", required=False, default=30.0),
                ],
                is_deterministic=True,
            ),
            pfz_stub,
        ),
        (
            ToolDefinition(
                name="marine_stub",
                description="Retrieve demonstration ocean state forecast (wave height, currents)",
                category="marine",
                parameters=[
                    ToolParameter(name="harbor", type_name="str", description="Target harbor", required=False, default="Ratnagiri"),
                    ToolParameter(name="time_offset", type_name="str", description="Time offset identifier", required=False, default="tomorrow_morning"),
                ],
                is_deterministic=True,
            ),
            marine_stub,
        ),
        (
            ToolDefinition(
                name="weather_stub",
                description="Retrieve demonstration coastal weather and cyclone warning status",
                category="weather",
                parameters=[
                    ToolParameter(name="harbor", type_name="str", description="Target harbor", required=False, default="Ratnagiri"),
                ],
                is_deterministic=True,
            ),
            weather_stub,
        ),
        (
            ToolDefinition(
                name="risk_stub",
                description="Evaluate demonstration weather conditions against craft limits for Go/No-Go status",
                category="risk",
                parameters=[
                    ToolParameter(name="wave_height_m", type_name="float", description="Wave height in meters", required=False, default=1.8),
                    ToolParameter(name="wind_speed_knots", type_name="float", description="Wind speed in knots", required=False, default=16.0),
                    ToolParameter(name="cyclone_active", type_name="bool", description="True if cyclone warning active", required=False, default=False),
                    ToolParameter(name="craft_type", type_name="str", description="Vessel craft class", required=False, default="motorized_boat"),
                    ToolParameter(name="status_override", type_name="str", description="Optional manual status override", required=False, default=None),
                ],
                is_deterministic=True,
            ),
            risk_stub,
        ),
        (
            ToolDefinition(
                name="trip_assessment_stub",
                description="Execute the unified trip assessment pipeline using M1 simulated data.",
                category="risk",
                parameters=[
                    ToolParameter(name="origin_harbor", type_name="str", description="Departure harbor", required=False, default="Ratnagiri"),
                    ToolParameter(name="craft_profile", type_name="str", description="Vessel craft class", required=False, default="motorized_boat"),
                ],
                is_deterministic=True,
            ),
            trip_assessment_stub,
        ),
        (
            ToolDefinition(
                name="route_stub",
                description="Compare demonstration navigation routes and safety scores",
                category="route",
                parameters=[
                    ToolParameter(name="origin_harbor", type_name="str", description="Departure harbor", required=False, default="Veraval"),
                    ToolParameter(name="destination", type_name="str", description="Target fishing area", required=False, default="Outer Bank"),
                ],
                is_deterministic=True,
            ),
            route_stub,
        ),
        (
            ToolDefinition(
                name="explanation_stub",
                description="Retrieve demonstration explanatory context for risk decisions",
                category="marine",
                parameters=[
                    ToolParameter(name="topic", type_name="str", description="Explanatory topic identifier", required=False, default="route_risk"),
                ],
                is_deterministic=True,
            ),
            explanation_stub,
        ),
    ]

    for definition, handler in stubs:
        target_registry.register_tool(definition, handler, override=True)


# Auto-register stub tools upon module import
register_m1_stub_tools()
