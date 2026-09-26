"""Unit tests for Proactive Trajectory Geofence & Boundary Monitoring (Phase 5 / P1 §16 / P4)."""

import pytest
from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.domain.geo_restrictions import DeterministicGeospatialEngine


def test_proactive_trajectory_detects_approaching_restricted_zone():
    """Vessel sailing directly toward Malvan MPA or Goa Naval Range triggers a proactive boundary alert with time-to-cross."""
    engine = DeterministicGeospatialEngine()
    
    # Vessel at (73.47, 16.15) heading due south (180 deg) at 12 knots toward Malvan MPA (approx 16.06, 73.47)
    # Malvan MPA is around 16.0 to 16.1 latitude
    ctx = ToolInvocationContext(
        origin_harbor="Malvan",
        coordinates=[73.47, 16.15],
    )
    
    # Heading 180 (Due South) straight into Malvan MPA
    hazard = engine.check_projected_trajectory_hazards(
        context=ctx,
        current_coordinates=[73.47, 16.15],
        speed_knots=12.0,
        heading_degrees=180.0,
        lookahead_hours=2.0,
    )
    
    assert hazard.projected_intersection is True
    assert hazard.time_to_cross_hours is not None
    assert 0.0 < hazard.time_to_cross_hours <= 2.0
    assert hazard.distance_to_boundary_km is not None
    assert hazard.restriction_name is not None
    assert "Malvan" in hazard.restriction_name or hazard.restricted is True


def test_proactive_trajectory_safe_when_heading_away_from_restriction():
    """Vessel heading away from restricted zone does not trigger projected intersection."""
    engine = DeterministicGeospatialEngine()
    
    # Vessel at (73.47, 16.15) heading due North (0 deg) away from Malvan
    ctx = ToolInvocationContext(
        origin_harbor="Malvan",
        coordinates=[73.47, 16.15],
    )
    
    hazard = engine.check_projected_trajectory_hazards(
        context=ctx,
        current_coordinates=[73.47, 16.15],
        speed_knots=12.0,
        heading_degrees=0.0,  # North (away from Malvan)
        lookahead_hours=2.0,
    )
    
    assert hazard.projected_intersection is False
    assert hazard.time_to_cross_hours is None
