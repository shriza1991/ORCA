"""Pinned Ratnagiri Fisher console demo scenario.

The scenario is intentionally explicit and offline. It is selected only when the
assessment request uses data_mode=DEMO; normal LIVE/HYBRID routing is unchanged.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    WeatherConditionsPayload,
)

DEMO_ORIGIN = "Ratnagiri harbour"
DEMO_DEPARTURE = datetime(2026, 9, 28, 23, 30, tzinfo=UTC)  # 05:00 IST
DEMO_RETURN = datetime(2026, 9, 29, 7, 50, tzinfo=UTC)  # 13:20 IST
DEMO_SAFE_WINDOW_END = datetime(2026, 9, 29, 9, 30, tzinfo=UTC)  # 15:00 IST

_HOURLY = (
    (5, 0.8, 5.0, None),
    (7, 0.9, 6.0, None),
    (9, 0.9, 6.4, None),
    (11, 1.0, 8.0, None),
    (13, 1.1, 10.0, None),
    (14, 1.3, 12.0, None),
    (15, 1.5, 15.0, None),
    (16, 1.7, 17.0, 24.0),
    (18, 1.9, 18.0, None),
)


def _timestamp(hour_ist: int) -> str:
    return (DEMO_DEPARTURE + timedelta(hours=hour_ist - 5)).isoformat()


def hourly_forecast() -> list[dict[str, Any]]:
    return [
        {
            "observation_time": _timestamp(hour),
            "wave_height_m": wave,
            "swh": wave,
            "wind_speed_knots": wind,
            "wind_gust_knots": gust,
            "wind_direction_deg": 306.0,
            "visibility_km": 8.0,
        }
        for hour, wave, wind, gust in _HOURLY
    ]


def marine() -> MarineConditionsPayload:
    return MarineConditionsPayload(
        harbor=DEMO_ORIGIN,
        significant_wave_height_m=0.8,
        swell_height_m=0.5,
        swell_period_sec=6.0,
        wave_direction_deg=229.5,
        surface_current_knots=0.6,
        sea_surface_temp_c=29.6,
        sea_level_height_m=1.2,
        tide_phase="rising",
        tide_is_estimated=True,
        observed_at=DEMO_DEPARTURE.isoformat(),
        valid_to=(DEMO_DEPARTURE + timedelta(hours=72)).isoformat(),
        source_name="Open-Meteo Marine (DEMO)",
        source_url="https://open-meteo.com/en/docs/marine-weather-api",
        freshness_flags={
            "retrieved_at": DEMO_DEPARTURE.isoformat(),
            "coverage_status": "DEMO",
            "provenance_mode": "DEMO",
        },
        hourly_forecast=hourly_forecast(),
    )


def weather() -> WeatherConditionsPayload:
    return WeatherConditionsPayload(
        harbor=DEMO_ORIGIN,
        wind_speed_knots=5.0,
        wind_gust_knots=8.0,
        wind_direction_deg=306.0,
        visibility_km=8.0,
        observed_at=DEMO_DEPARTURE.isoformat(),
        valid_to=(DEMO_DEPARTURE + timedelta(hours=72)).isoformat(),
        source_name="Open-Meteo Weather (DEMO)",
        source_url="https://open-meteo.com/en/docs",
        freshness_flags={
            "retrieved_at": DEMO_DEPARTURE.isoformat(),
            "coverage_status": "DEMO",
            "provenance_mode": "DEMO",
        },
        hourly_forecast=hourly_forecast(),
    )


def hazard() -> HazardBulletinPayload:
    return HazardBulletinPayload(
        harbor=DEMO_ORIGIN,
        cyclone_warning_active=False,
        squall_alert=False,
        bulletin_id="IMD-DEMO-NORMAL-01",
        severity="NORMAL",
        headline="No active marine hazard bulletin.",
        valid_from=DEMO_DEPARTURE.isoformat(),
        valid_to=(DEMO_DEPARTURE + timedelta(hours=72)).isoformat(),
        source_name="IMD Bulletin (DEMO)",
        source_url="https://mausam.imd.gov.in/",
    )


def pfz_features() -> list[dict[str, Any]]:
    # Coordinates are stable display anchors; the pinned geodesic values below
    # are authoritative for this recording scenario.
    return [
        {
            "id": "PFZ-ZONE-1",
            "lat": 16.70,
            "lon": 72.88,
            "distance_nautical_miles": 25.3,
            "bearing_degrees": 229.5,
            "depth_m": 35.0,
            "sst": 28.9,
            "chlorophyll": 1.6,
            "location_reference": "PFZ zone 1",
        },
        {
            "id": "PFZ-ZONE-2",
            "lat": 17.00,
            "lon": 73.78,
            "distance_nautical_miles": 30.9,
            "bearing_degrees": 276.3,
            "depth_m": 42.0,
            "sst": 29.2,
            "chlorophyll": 1.2,
            "location_reference": "PFZ zone 2",
        },
        {
            "id": "PFZ-ZONE-3",
            "lat": 16.45,
            "lon": 73.20,
            "distance_nautical_miles": 33.0,
            "bearing_degrees": 188.5,
            "depth_m": 28.0,
            "sst": 29.7,
            "chlorophyll": 0.9,
            "location_reference": "PFZ zone 3",
        },
    ]


def route_constants() -> list[dict[str, Any]]:
    routes = [
        ("ROUTE-B-DIRECT", "Direct open sea", 46.9, 1.1, 3 + 10 / 60, 9.5, "LOW", True),
        ("ROUTE-C-BALANCED", "Coastal balanced", 49.8, 0.9, 3 + 22 / 60, 10.1, "LOW", False),
        ("ROUTE-A-INSHORE", "Inshore sheltered", 55.4, 0.7, 3 + 45 / 60, 11.3, "LOW", False),
    ]
    return [
        {
            "route_id": route_id,
            "name": name,
            "distance_km": distance_km,
            "one_way_distance_km": distance_km,
            "round_trip_distance_km": round(distance_km * 2, 1),
            "max_wave_height_m": wave,
            "eta_hours": eta,
            "risk_rating": risk,
            "exposure_score": round(wave * 1.5, 2),
            "fuel_estimate_liters": fuel,
            "one_way_fuel_liters": fuel,
            "round_trip_fuel_liters": round(fuel * 2, 1),
            "fuel_assumptions": "Pinned demo estimate for motorboat",
            "eta_assumptions": "Pinned demo transit time",
            "is_feasible": True,
            "is_recommended": recommended,
            "is_synthetic": True,
            "waypoints": [],
            "infeasibility_reasons": [],
        }
        for route_id, name, distance_km, wave, eta, fuel, risk, recommended in routes
    ]
