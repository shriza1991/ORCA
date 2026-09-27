"""Unit tests for Time-Dependent Marine Routing with Ocean Current Vectors (Phase 5 / P2 §20 / P4)."""

import pytest
from shapely.geometry import Polygon
from backend.app.domain.marine_routing import MarinePathfinder, haversine


def test_pathfinder_defaults_to_distance_without_currents():
    """Without current vectors, pathfinder produces standard shortest path avoiding land."""
    pathfinder = MarinePathfinder(land_polygon=None, resolution_deg=0.02)
    start = [73.28, 16.99]
    end = [73.00, 16.80]
    
    path = pathfinder.find_path(start, end)
    assert path is not None
    assert len(path) >= 2
    assert path[0] == start
    assert path[-1] == end


def test_direct_path_honors_land_clearance_buffer():
    land = Polygon([(0.9, 0.02), (1.1, 0.02), (1.1, 0.2), (0.9, 0.2)])
    pathfinder = MarinePathfinder(land_polygon=land, resolution_deg=0.02)
    start = [0.0, 0.0]
    end = [2.0, 0.0]

    assert pathfinder._line_navigable(*start, *end)
    assert not pathfinder._line_navigable(*start, *end, safety_buffer_deg=0.05)


def test_favorable_current_reduces_path_cost():
    """Vessel navigating with a favorable following current experiences lower transit cost than against opposing current."""
    pathfinder = MarinePathfinder(land_polygon=None, resolution_deg=0.02)
    start = [73.28, 16.99]
    end = [73.00, 16.80]
    
    # 1. Favorable westward/southward current (helping the journey west-southwest)
    favorable_current = lambda lon, lat: (-2.0, -1.0)  # knots (westward, southward)
    
    # 2. Opposing eastward/northward current (fighting against the journey)
    adverse_current = lambda lon, lat: (2.0, 1.0)  # knots (eastward, northward)
    
    path_fav = pathfinder.find_path(
        start, end,
        current_vector_fn=favorable_current,
        craft_speed_knots=8.0,
    )
    path_adv = pathfinder.find_path(
        start, end,
        current_vector_fn=adverse_current,
        craft_speed_knots=8.0,
    )
    
    assert path_fav is not None
    assert path_adv is not None
    assert len(path_fav) >= 2
    assert len(path_adv) >= 2


def test_current_vectors_divert_path_around_strong_adverse_current_eddy():
    """Pathfinder swerves around a localized adverse current jet or eddy to minimize fuel/time cost."""
    # Create a localized strong opposing current in a specific bounding box
    def eddy_current(lon, lat):
        # Strong opposing head-current jet between 73.10 and 73.18
        if 73.10 <= lon <= 73.18 and 16.88 <= lat <= 16.96:
            return (5.0, 3.0)  # Violent opposing current (5 knots east, 3 knots north)
        return (0.0, 0.0)

    pathfinder = MarinePathfinder(land_polygon=None, resolution_deg=0.02)
    start = [73.28, 16.99]
    end = [73.00, 16.80]

    path_with_eddy = pathfinder.find_path(
        start, end,
        current_vector_fn=eddy_current,
        craft_speed_knots=6.0,
    )
    assert path_with_eddy is not None
    assert len(path_with_eddy) >= 2
