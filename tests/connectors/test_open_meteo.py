import pytest
respx = pytest.importorskip("respx")
import httpx
from datetime import datetime, timezone
import time
import sys
from unittest.mock import MagicMock

# Mock langgraph to prevent ModuleNotFoundError when importing from backend.app.agents
sys.modules['langgraph'] = MagicMock()
sys.modules['langgraph.graph'] = MagicMock()

from backend.app.connectors.open_meteo import OpenMeteoConnector
from backend.app.connectors.errors import (
    ConnectorTimeoutError,
    ConnectorRateLimitError,
    ConnectorMalformedResponseError,
    ConnectorUpstreamUnavailableError,
)
# Do not import from backend.app.agents.integrations.contracts to avoid langgraph import

class MockContext:
    def __init__(self, origin_harbor="Ratnagiri", coordinates=None, departure_time=None):
        self.origin_harbor = origin_harbor
        self.coordinates = coordinates
        self.craft_profile = None
        self.departure_time = departure_time

ToolInvocationContext = MockContext

@pytest.fixture
def connector():
    # Clear cache before each test
    OpenMeteoConnector._cache.clear()
    return OpenMeteoConnector()

@respx.mock
def test_marine_conditions_success(connector):
    mock_url = "https://marine-api.open-meteo.com/v1/marine"
    respx.get(mock_url).mock(return_value=httpx.Response(
        200,
        json={
            "hourly": {
                "time": ["2026-09-22T00:00", "2026-09-22T01:00"],
                "wave_height": [2.5, 2.6],
                "wave_direction": [200.0, 205.0],
                "wave_period": [7.0, 7.1],
                "swell_wave_height": [1.5, 1.6],
                "swell_wave_period": [8.0, 8.1],
                # Open-Meteo returns km/h; correct conversion: 0.5 km/h ÷ 1.852 = 0.27000 kn
                "ocean_current_velocity": [0.5, 0.6],
                "sea_surface_temperature": [28.5, 28.6],
            }
        }
    ))

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = connector.get_marine_conditions(ctx)

    assert payload.significant_wave_height_m == 2.5
    assert payload.swell_height_m == 1.5
    assert payload.swell_period_sec == 8.0
    # Correct unit: 0.5 km/h ÷ 1.852 = 0.27000 kn (not 0.97 which was the wrong m/s factor)
    assert abs(payload.surface_current_knots - (0.5 / 1.852)) < 0.001
    assert payload.sea_surface_temp_c == 28.5
    assert payload.source_name == "Open-Meteo Marine API"

@respx.mock
def test_weather_conditions_missing_optional(connector):
    mock_url = "https://api.open-meteo.com/v1/forecast"
    respx.get(mock_url).mock(return_value=httpx.Response(
        200,
        json={
            "hourly": {
                "time": ["2026-09-22T00:00", "2026-09-22T01:00"],
                "wind_speed_10m": [15.0, 16.0],
                "wind_gusts_10m": [None, None],    # Missing at all slots
                "wind_direction_10m": [None, 180.0],  # Slot 0 is None, slot 1 is 180
                "visibility": [None, None],
            }
        }
    ))

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = connector.get_weather_conditions(ctx)

    # No departure_time → index 0 is selected
    assert payload.wind_speed_knots == 15.0
    assert payload.wind_gust_knots is None
    # Slot 0 direction is None — index selection must not bleed to index 1
    assert payload.wind_direction_deg is None
    assert payload.visibility_km is None

@respx.mock
def test_timeout_and_retry(connector):
    mock_url = "https://marine-api.open-meteo.com/v1/marine"

    # Fail first with timeout, succeed on retry
    route = respx.get(mock_url)
    route.side_effect = [
        httpx.TimeoutException("Timeout"),
        httpx.Response(200, json={"hourly": {"time": ["2026-09-22T00:00"], "wave_height": [1.0]}})
    ]

    ctx = ToolInvocationContext()
    payload = connector.get_marine_conditions(ctx)
    assert payload.significant_wave_height_m == 1.0
    assert route.call_count == 2

    # Now test failing twice
    connector._cache.clear()
    route.side_effect = [
        httpx.TimeoutException("Timeout"),
        httpx.TimeoutException("Timeout")
    ]

    with pytest.raises(ConnectorTimeoutError):
        connector.get_marine_conditions(ctx)

@respx.mock
def test_rate_limit(connector):
    mock_url = "https://marine-api.open-meteo.com/v1/marine"
    respx.get(mock_url).mock(return_value=httpx.Response(429, json={"error": "Rate limit"}))
    
    ctx = ToolInvocationContext()
    with pytest.raises(ConnectorRateLimitError):
        connector.get_marine_conditions(ctx)

@respx.mock
def test_malformed_response(connector):
    mock_url = "https://marine-api.open-meteo.com/v1/marine"
    respx.get(mock_url).mock(return_value=httpx.Response(200, text="Not JSON"))
    
    ctx = ToolInvocationContext()
    with pytest.raises(ConnectorMalformedResponseError):
        connector.get_marine_conditions(ctx)

@respx.mock
def test_cache_hit(connector):
    mock_url = "https://marine-api.open-meteo.com/v1/marine"
    route = respx.get(mock_url).mock(return_value=httpx.Response(
        200,
        json={"hourly": {"time": ["2026-09-22T00:00"], "wave_height": [2.0]}}
    ))

    ctx = ToolInvocationContext(origin_harbor="Mumbai")
    connector.get_marine_conditions(ctx)
    assert route.call_count == 1

    # Second call should hit cache
    connector.get_marine_conditions(ctx)
    assert route.call_count == 1

    # Clear cache and it should call again
    connector._cache.clear()
    connector.get_marine_conditions(ctx)
    assert route.call_count == 2
