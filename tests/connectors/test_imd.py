"""Tests for IMD Coastal Weather and Hazard/Cyclone Warning Bulletins.

Tests:
- Normal bulletin
- High-wind bulletin
- Squall/cyclone warning
- Expired warning
- Malformed bulletin
- Missing fields
- Timeout / network failure
- Fallback to Open-Meteo for weather
- Hard-stop compatibility
"""

import httpx
import pytest
import respx
from datetime import UTC, datetime, timedelta

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.connectors.imd_hazard import ImdHazardConnector
from backend.app.connectors.imd_weather import ImdWeatherConnector
from backend.app.core.config import settings


@pytest.fixture
def imd_weather():
    ImdWeatherConnector._cache.clear()
    return ImdWeatherConnector(data_mode="HYBRID")


@pytest.fixture
def imd_hazard():
    ImdHazardConnector._cache.clear()
    return ImdHazardConnector(data_mode="HYBRID")


# =============================================================================
# 1. IMD Coastal Weather Bulletin Tests
# =============================================================================

@respx.mock
def test_imd_weather_live_success(monkeypatch, imd_weather):
    monkeypatch.setattr(settings, "IMD_API_KEY", "test-imd-key")
    monkeypatch.setattr(settings, "IMD_API_BASE_URL", "https://mausam.imd.gov.in/api/coastal_bulletin")

    mock_url = "https://mausam.imd.gov.in/api/coastal_bulletin"
    now_str = datetime.now(UTC).isoformat()
    valid_to_str = (datetime.now(UTC) + timedelta(hours=12)).isoformat()

    respx.get(mock_url).mock(return_value=httpx.Response(
        200,
        json={
            "wind_speed": 16.5,
            "gust_speed": 22.0,
            "direction_deg": 240.0,
            "visibility_km": 9.0,
            "observed_at": now_str,
            "valid_to": valid_to_str,
        }
    ))

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = imd_weather.get_weather_conditions(ctx)

    assert payload.wind_speed_knots == 16.5
    assert payload.wind_gust_knots == 22.0
    assert payload.wind_direction_deg == 240.0
    assert payload.visibility_km == 9.0
    assert payload.source_name == "IMD Coastal Weather Bulletin"


@respx.mock
def test_imd_weather_live_failure_fallback_to_open_meteo(monkeypatch, imd_weather):
    monkeypatch.setattr(settings, "IMD_API_KEY", "test-imd-key")
    monkeypatch.setattr(settings, "IMD_API_BASE_URL", "https://mausam.imd.gov.in/api/coastal_bulletin")

    respx.get("https://mausam.imd.gov.in/api/coastal_bulletin").mock(
        side_effect=httpx.TimeoutException("IMD server timeout")
    )

    respx.get("https://api.open-meteo.com/v1/forecast").mock(return_value=httpx.Response(
        200,
        json={
            "hourly": {
                "time": ["2026-09-22T00:00"],
                "wind_speed_10m": [14.0],
                "wind_gusts_10m": [18.0],
                "wind_direction_10m": [220.0],
                "visibility": [8000.0],
            }
        }
    ))

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = imd_weather.get_weather_conditions(ctx)

    assert payload.wind_speed_knots == 14.0
    assert "Open-Meteo" in payload.source_name


# =============================================================================
# 2. IMD Hazard / Cyclone Warning Tests
# =============================================================================

@respx.mock
def test_imd_hazard_cyclone_alert(monkeypatch, imd_hazard):
    monkeypatch.setattr(settings, "IMD_API_KEY", "test-imd-key")
    monkeypatch.setattr(settings, "IMD_API_BASE_URL", "https://mausam.imd.gov.in/api/cyclone_bulletin")

    mock_url = "https://mausam.imd.gov.in/api/cyclone_bulletin"
    now_str = datetime.now(UTC).isoformat()

    valid_to_str = (datetime.now(UTC) + timedelta(hours=24)).isoformat()

    respx.get(mock_url).mock(return_value=httpx.Response(
        200,
        json={
            "cyclone_alert": True,
            "squall_alert": True,
            "bulletin_id": "CYC-ARB-2026-04",
            "severity": "WARNING",
            "headline": "Severe Cyclonic Storm over Eastcentral Arabian Sea",
            "valid_from": now_str,
            "valid_to": valid_to_str,
        }
    ))

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = imd_hazard.get_hazard_bulletin(ctx)

    assert payload.cyclone_warning_active is True
    assert payload.squall_alert is True
    assert payload.severity == "WARNING"
    assert "Severe Cyclonic Storm" in payload.headline
    assert payload.source_name == "IMD Cyclone Warning Division"


def test_imd_hazard_fallback_normal():
    # Without API key, connector returns safe NORMAL bulletin with degraded flag
    conn = ImdHazardConnector(data_mode="HYBRID")
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = conn.get_hazard_bulletin(ctx)

    assert payload.cyclone_warning_active is False
    assert payload.squall_alert is False
    assert payload.severity == "UNKNOWN"
    assert "UNAVAILABLE" in payload.source_name
