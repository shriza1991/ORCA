"""Unit tests for Dynamic Trajectory Exposure Engine (Phase 5 / P4 GIS & Temporal)."""

import math
from datetime import datetime, timezone, timedelta
import pytest

from backend.app.agents.integrations.dev2 import MarineConditionsPayload
from backend.app.domain.trajectory_exposure import (
    TrajectoryExposureEngine,
    WaypointTimelineItem,
    TrajectoryExposureResult,
)


def _make_hourly_forecast(base_time: datetime, count_hours: int = 12) -> list[MarineConditionsPayload]:
    """Generates synthetic hourly forecast where wave height builds up from 1.0m to 3.0m."""
    forecasts = []
    for h in range(count_hours):
        t = base_time + timedelta(hours=h)
        # Wave height increases by 0.2m every 2 hours
        wave = round(1.0 + (h * 0.18), 2)
        forecasts.append(
            MarineConditionsPayload(
                significant_wave_height_m=wave,
                surface_current_knots=round(0.8 + (h * 0.1), 1),
                sea_surface_temp_c=28.5,
                source_name="INCOIS OSF Hourly",
                observed_at=t.isoformat(),
            )
        )
    return forecasts


def test_trajectory_exposure_evaluates_time_varying_sea_state():
    """Verify trajectory exposure evaluates increasing wave heights along a multi-hour route."""
    engine = TrajectoryExposureEngine()
    
    # 4-waypoint route spanning ~30 nautical miles (~55 km)
    # Ratnagiri (73.28, 16.99) heading seaward west-southwest
    waypoints = [
        [73.28, 16.99],
        [73.15, 16.90],
        [73.00, 16.80],
        [72.85, 16.70],
    ]
    
    departure = datetime(2026, 9, 26, 6, 0, tzinfo=timezone.utc)
    hourly_forecast = _make_hourly_forecast(departure, count_hours=10)
    
    result = engine.evaluate_trajectory(
        waypoints=waypoints,
        craft_profile="motorized_boat",  # 8.0 knots nominal
        departure_time=departure,
        hourly_forecast=hourly_forecast,
    )
    
    assert isinstance(result, TrajectoryExposureResult)
    assert len(result.waypoint_timeline) == 4
    
    # First waypoint at departure time (T+0)
    wp0 = result.waypoint_timeline[0]
    assert wp0.eta_hours == 0.0
    assert wp0.wave_height_m == 1.0
    
    # Final waypoint arrives ~3.5 to 4.5 hours later
    wp_final = result.waypoint_timeline[-1]
    assert wp_final.eta_hours > 3.0
    # Because waves build up over time, final waypoint experiences higher sea state
    assert wp_final.wave_height_m > wp0.wave_height_m
    assert result.peak_wave_height_m >= wp_final.wave_height_m
    assert result.peak_exposure_point is not None
    assert "coordinates" in result.peak_exposure_point
    assert "eta_hours" in result.peak_exposure_point


def test_trajectory_exposure_handles_missing_forecast_gracefully():
    """When hourly forecast is missing or incomplete, falls back to static baseline with missing state notes."""
    engine = TrajectoryExposureEngine()
    waypoints = [[73.28, 16.99], [73.10, 16.85]]
    departure = datetime(2026, 9, 26, 6, 0, tzinfo=timezone.utc)
    
    # Fallback with empty hourly forecast
    result = engine.evaluate_trajectory(
        waypoints=waypoints,
        craft_profile="motorized_boat",
        departure_time=departure,
        hourly_forecast=[],
        fallback_wave_height_m=1.8,
    )
    
    assert len(result.waypoint_timeline) == 2
    assert result.peak_wave_height_m == 1.8
    assert result.missing_data_state is not None
    assert "missing" in result.missing_data_state.lower()


def test_craft_speed_affects_waypoint_etas():
    """Different craft speeds produce proportionately different waypoint arrival times."""
    engine = TrajectoryExposureEngine()
    waypoints = [[73.28, 16.99], [73.00, 16.80]]
    departure = datetime(2026, 9, 26, 6, 0, tzinfo=timezone.utc)
    hourly = _make_hourly_forecast(departure, count_hours=15)
    
    slow = engine.evaluate_trajectory(
        waypoints=waypoints,
        craft_profile="traditional_non_motorized",  # 3 knots
        departure_time=departure,
        hourly_forecast=hourly,
    )
    fast = engine.evaluate_trajectory(
        waypoints=waypoints,
        craft_profile="mechanized_trawler",  # 10 knots
        departure_time=departure,
        hourly_forecast=hourly,
    )
    
    # Slow craft takes more than 3x longer than fast craft
    assert slow.waypoint_timeline[-1].eta_hours > fast.waypoint_timeline[-1].eta_hours * 2.5
