import pytest
from shapely.geometry import LineString
from backend.app.domain.route_engine import DeterministicRouteExposureEngine
from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import MarineConditionsPayload

@pytest.fixture
def route_engine():
    return DeterministicRouteExposureEngine()

@pytest.fixture
def mock_context():
    return ToolInvocationContext(
        origin_harbor="Ratnagiri",
        coordinates=[73.28, 16.99]
    )

@pytest.fixture
def mock_marine():
    return MarineConditionsPayload(
        significant_wave_height_m=1.2,
        source_name="Test"
    )

def test_engine_initializes_and_loads_coastline(route_engine):
    assert route_engine.land_polygon is not None
    assert route_engine.land_polygon.is_valid

def test_route_generation(route_engine, mock_context, mock_marine):
    payload = route_engine.evaluate_routes(
        context=mock_context,
        marine=mock_marine,
        destination="Outer Bank",
    )
    
    assert payload.origin == "Ratnagiri"
    assert len(payload.routes) == 3
    assert payload.recommended_route_id != ""

def test_land_intersection(route_engine):
    # Create a route that goes inland (e.g. into India)
    # Ratnagiri is around 73.3E, 17.0N. Let's make a route going East to 74.0E (land).
    inland_route = LineString([[73.2, 17.0], [74.0, 17.0]])
    assert route_engine._intersects_land(inland_route) == True
    
    # Create a route that goes purely west (open Arabian Sea)
    sea_route = LineString([[73.2, 17.0], [72.0, 17.0]])
    assert route_engine._intersects_land(sea_route) == False

def test_distance_calculation(route_engine):
    # Distance from 0,0 to 0,1 is ~111.2 km
    dist = route_engine._calculate_route_distance_km([[0.0, 0.0], [0.0, 1.0]])
    assert 110.0 < dist < 112.0
