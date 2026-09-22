"""Tests for P0-8G Route Alternatives & Balanced Candidate (ROUTE-C-BALANCED).

Owned by Dev 4 (Marine, Geo, Risk & Route Intelligence) & Dev 2 (Platform Contracts).
Validates:
1. Route A remains available (ROUTE-A-INSHORE).
2. Route B remains available (ROUTE-B-DIRECT).
3. Route C is returned (ROUTE-C-BALANCED) with unique stable ID and distinct geometry.
4. Route C passes through the same evaluation mechanism and contains truthful calculated metrics.
5. Genuine trade-off semantics between distance and exposure.
6. No route duplication; 3 candidates when all are feasible.
7. Honest handling for 1 or 2 candidates and NO_ROUTE cases.
8. Explicit handling of unknown sectors/origins/destinations.
9. API endpoint /api/v1/demo/routes/alternatives and sector aliases.
10. MapLayer generation preserves all candidate routes and recommended route distinction.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import MarineConditionsPayload
from backend.app.agents.integrations.dev4 import EvaluatedRouteItem, RouteExposurePayload
from backend.app.agents.integrations.mocks import MockRouteExposureEngine
from backend.app.domain.map_layers import generate_map_layers
from backend.app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def base_context():
    return ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        coordinates=[73.28, 16.99],
    )


@pytest.fixture
def marine_conditions():
    return MarineConditionsPayload(
        significant_wave_height_m=1.3,
        surface_current_knots=1.2,
        swell_height_m=0.8,
        swell_period_sec=8.0,
    )


def test_three_route_candidates_returned_with_stable_ids(base_context, marine_conditions):
    """Verifies that the engine returns 3 distinct candidates including ROUTE-C-BALANCED."""
    engine = MockRouteExposureEngine()
    payload = engine.evaluate_routes(base_context, marine_conditions, destination="Outer Bank")

    assert isinstance(payload, RouteExposurePayload)
    assert len(payload.routes) == 3

    route_ids = [r.route_id for r in payload.routes]
    assert "ROUTE-A-INSHORE" in route_ids
    assert "ROUTE-B-DIRECT" in route_ids
    assert "ROUTE-C-BALANCED" in route_ids

    # Verify no duplicates
    assert len(set(route_ids)) == 3


def test_route_c_has_distinct_geometry_and_waypoints(base_context, marine_conditions):
    """Verifies ROUTE-C-BALANCED has distinct waypoints from Route A and Route B."""
    engine = MockRouteExposureEngine()
    payload = engine.evaluate_routes(base_context, marine_conditions, destination="Outer Bank")

    route_map = {r.route_id: r for r in payload.routes}
    route_a = route_map["ROUTE-A-INSHORE"]
    route_b = route_map["ROUTE-B-DIRECT"]
    route_c = route_map["ROUTE-C-BALANCED"]

    assert route_c.waypoints != route_a.waypoints
    assert route_c.waypoints != route_b.waypoints
    assert len(route_c.waypoints) >= 2


def test_route_candidates_tradeoff_semantics(base_context, marine_conditions):
    """Verifies truthful calculated metric trade-offs:

    - Safety (Inshore): Lower exposure, longer distance
    - Balanced: Moderate exposure, intermediate distance
    - Direct: Shorter distance, higher exposure
    """
    engine = MockRouteExposureEngine()
    payload = engine.evaluate_routes(base_context, marine_conditions, destination="Outer Bank")

    route_map = {r.route_id: r for r in payload.routes}
    route_a = route_map["ROUTE-A-INSHORE"]
    route_b = route_map["ROUTE-B-DIRECT"]
    route_c = route_map["ROUTE-C-BALANCED"]

    # Exposure ordering: A (lowest) < C (intermediate) < B (highest)
    assert route_a.exposure_score < route_c.exposure_score < route_b.exposure_score

    # Distance ordering: B (shortest) < C (intermediate) < A (longest)
    assert route_b.distance_km < route_c.distance_km < route_a.distance_km

    # Wave height ordering: A <= C <= B
    assert route_a.max_wave_height_m <= route_c.max_wave_height_m <= route_b.max_wave_height_m


def test_fewer_candidates_handled_honestly(base_context, marine_conditions):
    """Verifies engine and payload honestly preserve whatever candidates exist without fabricating."""
    # When only 2 routes exist
    only_two = [
        EvaluatedRouteItem(
            route_id="ROUTE-A-INSHORE",
            name="Inshore Sheltered Channel",
            distance_km=26.5,
            max_wave_height_m=1.3,
            risk_rating="LOW",
            exposure_score=2.1,
            waypoints=[[73.28, 16.99], [73.20, 16.95]],
        ),
        EvaluatedRouteItem(
            route_id="ROUTE-B-DIRECT",
            name="Direct Open-Sea Channel",
            distance_km=20.2,
            max_wave_height_m=2.1,
            risk_rating="MODERATE",
            exposure_score=4.8,
            waypoints=[[73.28, 16.99], [73.10, 16.92]],
        ),
    ]
    engine_two = MockRouteExposureEngine(routes=only_two)
    payload_two = engine_two.evaluate_routes(base_context, marine_conditions, destination="Outer Bank")
    assert len(payload_two.routes) == 2

    # When no routes exist
    engine_none = MockRouteExposureEngine(routes=[])
    payload_none = engine_none.evaluate_routes(base_context, marine_conditions, destination="Outer Bank")
    assert len(payload_none.routes) == 0


def test_map_layers_with_three_route_candidates(base_context, marine_conditions):
    """Verifies map layers generator produces recommended route and candidate routes preserving all 3."""
    engine = MockRouteExposureEngine()
    payload = engine.evaluate_routes(base_context, marine_conditions, destination="Outer Bank")

    state = {
        "location": {"harbor": "Ratnagiri", "coordinates": [73.28, 16.99]},
        "destination": "Outer Bank",
        "intent": "ROUTE",
        "observations": {
            "route_analysis": payload.model_dump(),
        },
    }

    layers = generate_map_layers(state)
    layer_ids = [l.layer_id for l in layers]

    assert "layer_recommended_route" in layer_ids
    assert "layer_candidate_routes" in layer_ids

    rec_layer = next(l for l in layers if l.layer_id == "layer_recommended_route")
    assert rec_layer.geojson["properties"]["route_id"] == "ROUTE-A-INSHORE"

    cand_layer = next(l for l in layers if l.layer_id == "layer_candidate_routes")
    cand_ids = [f["properties"]["route_id"] for f in cand_layer.geojson["features"]]
    assert "ROUTE-B-DIRECT" in cand_ids
    assert "ROUTE-C-BALANCED" in cand_ids
    assert len(cand_ids) == 2


def test_api_demo_route_alternatives(client):
    """Verifies GET /api/v1/demo/routes/alternatives returns all 3 candidates."""
    res = client.get("/api/v1/demo/routes/alternatives")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "AVAILABLE"
    assert data["origin"] == "Ratnagiri"
    assert data["recommended_route_id"] == "ROUTE-B-DIRECT"
    assert len(data["routes"]) == 3

    route_ids = [r["route_id"] for r in data["routes"]]
    assert "ROUTE-A-INSHORE" in route_ids
    assert "ROUTE-B-DIRECT" in route_ids
    assert "ROUTE-C-BALANCED" in route_ids


def test_api_demo_sector_route_alternatives(client):
    """Verifies GET /api/v1/demo/sectors/{sector_id}/route-alternatives canonical endpoint."""
    res = client.get("/api/v1/demo/sectors/sector-ratnagiri/route-alternatives")
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "AVAILABLE"
    assert data["origin"] == "Ratnagiri"
    assert len(data["routes"]) == 3


def test_api_unknown_sector_handled_explicitly(client):
    """Verifies unknown sector does not silently fall back to Ratnagiri."""
    res = client.get("/api/v1/demo/sectors/unknown-nonexistent-sector/route-alternatives")
    assert res.status_code == 404


def test_route_waypoints_strictly_in_water_and_avoid_land(client):
    """Verifies that passage route waypoints never cross inland and stay strictly in maritime waters."""
    # 1. Benchmark Ratnagiri -> Outer Bank
    res = client.get("/api/v1/demo/routes/alternatives")
    assert res.status_code == 200
    data = res.json()
    origin_lng = data["origin_coordinates"][0]

    for route in data["routes"]:
        for wp in route["waypoints"]:
            assert wp[0] <= origin_lng, f"Route {route['route_id']} waypoint {wp} is east of harbor on land!"

    # 2. All 14 Fleet Surveillance Vessels
    vessels = client.get("/api/v1/demo/vessels").json()
    assert len(vessels) == 14

    for v in vessels:
        vid = v["public_id"]
        sec = "sector-" + v["home_harbor_id"].replace("harbor-", "")
        if sec == "sector-panaji":
            sec = "sector-goa"
        v_res = client.get(f"/api/v1/demo/routes/alternatives?sector_id={sec}&vessel_id={vid}")
        assert v_res.status_code == 200
        v_data = v_res.json()
        start_lng = v_data["origin_coordinates"][0]

        for route in v_data["routes"]:
            # Check length and distinct corridors
            assert len(route["waypoints"]) >= 2
            # Along west coast of India, open sea is to the west; no waypoint can exceed the harbor mouth longitude
            for wp in route["waypoints"]:
                assert wp[0] <= start_lng, f"Vessel {vid} route {route['route_id']} waypoint {wp} went inland (lng > {start_lng})!"

