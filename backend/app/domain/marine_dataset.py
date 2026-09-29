"""In-Memory Deterministic Marine & Weather Dataset for ORCA.

Provides deterministic baseline marine conditions, atmospheric weather,
and safety statuses for coastal landing centers / harbors (e.g. Ratnagiri,
Mumbai, Goa, Malvan, Veraval).

Used as a reliable in-memory data source when LIVE/HYBRID providers are unavailable,
preserving the existing connector/provider architecture as a snapshot fallback.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

# Canonical In-Memory Marine & Weather Records for Key Indian Ports
IN_MEMORY_MARINE_DATASET: dict[str, dict[str, Any]] = {
    "ratnagiri": {
        "harbor": "Ratnagiri",
        "coordinates": [73.28, 16.99],
        "significant_wave_height_m": 1.2,
        "maximum_wave_height_m": 1.8,
        "swell_height_m": 0.8,
        "swell_period_sec": 8.0,
        "surface_current_knots": 1.0,
        "sea_surface_temp_c": 28.0,
        "sea_condition": "Calm to Moderate",
        "wind_speed_knots": 12.0,
        "wind_gust_knots": 16.0,
        "wind_direction_deg": 240.0,
        "visibility_km": 10.0,
        "cyclone_warning_active": False,
        "squall_alert": False,
        "bulletin_severity": "NORMAL",
        "safety_status": "GO",
        "safety_summary": "Simulated conditions are calm and favorable for motorized craft departure.",
        "decisive_factors": [
            "Significant wave height: 1.2m (below 2.0m motorized boat ceiling)",
            "Sustained wind speed: 12.0 knots (favorable)",
            "Swell period: 8.0 seconds (stable sea state)",
            "No active cyclone or squall warnings",
        ],
        "next_action": "Standard coastal departure permitted. Maintain continuous VHF channel 16 watch.",
        "source_name": "INCOIS OSF / IMD In-Memory Marine Dataset",
    },
    "mumbai": {
        "harbor": "Mumbai",
        "coordinates": [72.87, 18.92],
        "significant_wave_height_m": 1.5,
        "maximum_wave_height_m": 2.1,
        "swell_height_m": 1.0,
        "swell_period_sec": 8.5,
        "surface_current_knots": 1.2,
        "sea_surface_temp_c": 28.5,
        "sea_condition": "Moderate",
        "wind_speed_knots": 15.0,
        "wind_gust_knots": 20.0,
        "wind_direction_deg": 250.0,
        "visibility_km": 8.0,
        "cyclone_warning_active": False,
        "squall_alert": False,
        "bulletin_severity": "NORMAL",
        "safety_status": "GO",
        "safety_summary": "Moderate wave heights observed; within operational limits for motorized craft.",
        "decisive_factors": [
            "Significant wave height: 1.5m",
            "Wind speed: 15.0 knots",
            "Swell period: 8.5 seconds",
        ],
        "next_action": "Proceed with voyage under standard harbor watch.",
        "source_name": "INCOIS OSF / IMD In-Memory Marine Dataset",
    },
    "goa": {
        "harbor": "Goa",
        "coordinates": [73.83, 15.49],
        "significant_wave_height_m": 1.1,
        "maximum_wave_height_m": 1.6,
        "swell_height_m": 0.7,
        "swell_period_sec": 7.5,
        "surface_current_knots": 0.9,
        "sea_surface_temp_c": 28.8,
        "sea_condition": "Calm",
        "wind_speed_knots": 10.0,
        "wind_gust_knots": 14.0,
        "wind_direction_deg": 230.0,
        "visibility_km": 12.0,
        "cyclone_warning_active": False,
        "squall_alert": False,
        "bulletin_severity": "NORMAL",
        "safety_status": "GO",
        "safety_summary": "Calm coastal sea state ideal for all fishing operations.",
        "decisive_factors": [
            "Significant wave height: 1.1m",
            "Wind speed: 10.0 knots",
            "Swell period: 7.5 seconds",
        ],
        "next_action": "Departure clear. Proceed with planned voyage.",
        "source_name": "INCOIS OSF / IMD In-Memory Marine Dataset",
    },
    "malvan": {
        "harbor": "Malvan",
        "coordinates": [73.47, 16.06],
        "significant_wave_height_m": 1.3,
        "maximum_wave_height_m": 1.9,
        "swell_height_m": 0.9,
        "swell_period_sec": 8.0,
        "surface_current_knots": 1.0,
        "sea_surface_temp_c": 28.2,
        "sea_condition": "Calm to Moderate",
        "wind_speed_knots": 11.0,
        "wind_gust_knots": 15.0,
        "wind_direction_deg": 235.0,
        "visibility_km": 10.0,
        "cyclone_warning_active": False,
        "squall_alert": False,
        "bulletin_severity": "NORMAL",
        "safety_status": "GO",
        "safety_summary": "Favorable marine conditions near Malvan waters.",
        "decisive_factors": [
            "Significant wave height: 1.3m",
            "Wind speed: 11.0 knots",
            "Swell period: 8.0 seconds",
        ],
        "next_action": "Standard navigation clear.",
        "source_name": "INCOIS OSF / IMD In-Memory Marine Dataset",
    },
    "veraval": {
        "harbor": "Veraval",
        "coordinates": [70.37, 20.90],
        "significant_wave_height_m": 2.2,
        "maximum_wave_height_m": 3.0,
        "swell_height_m": 1.6,
        "swell_period_sec": 9.5,
        "surface_current_knots": 1.6,
        "sea_surface_temp_c": 27.5,
        "sea_condition": "Rough",
        "wind_speed_knots": 22.0,
        "wind_gust_knots": 28.0,
        "wind_direction_deg": 260.0,
        "visibility_km": 7.0,
        "cyclone_warning_active": False,
        "squall_alert": True,
        "bulletin_severity": "ALERT",
        "safety_status": "CAUTION",
        "safety_summary": "Elevated wave heights and gusty winds off Saurashtra coast.",
        "decisive_factors": [
            "Significant wave height: 2.2m (exceeds 2.0m ceiling for small motorized craft)",
            "Wind speed: 22.0 knots with gusts to 28.0 knots",
            "Squall alert active in coastal sector",
        ],
        "next_action": "Artisanal/small craft avoid departure. Large trawlers exercise heightened vigilance.",
        "source_name": "INCOIS OSF / IMD In-Memory Marine Dataset",
    },
}


def _normalize_harbor_key(harbor: str | None) -> str:
    if not harbor:
        return "ratnagiri"
    return harbor.strip().lower().replace(" ", "_")


def get_marine_record(harbor: str | None) -> dict[str, Any]:
    """Returns deterministic marine conditions for a given harbor (defaults to Ratnagiri)."""
    key = _normalize_harbor_key(harbor)
    rec = IN_MEMORY_MARINE_DATASET.get(key, IN_MEMORY_MARINE_DATASET["ratnagiri"])
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "harbor": rec["harbor"],
        "significant_wave_height_m": rec["significant_wave_height_m"],
        "swell_height_m": rec["swell_height_m"],
        "swell_period_sec": rec["swell_period_sec"],
        "surface_current_knots": rec["surface_current_knots"],
        "sea_surface_temp_c": rec["sea_surface_temp_c"],
        "sea_condition": rec["sea_condition"],
        "observed_at": now_iso,
        "valid_to": "2030-01-01T00:00:00Z",
        "source_name": rec["source_name"],
        "source_url": "https://incois.gov.in/portal/osf",
    }


def get_weather_record(harbor: str | None) -> dict[str, Any]:
    """Returns deterministic weather conditions for a given harbor (defaults to Ratnagiri)."""
    key = _normalize_harbor_key(harbor)
    rec = IN_MEMORY_MARINE_DATASET.get(key, IN_MEMORY_MARINE_DATASET["ratnagiri"])
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "harbor": rec["harbor"],
        "wind_speed_knots": rec["wind_speed_knots"],
        "wind_gust_knots": rec["wind_gust_knots"],
        "wind_direction_deg": rec["wind_direction_deg"],
        "visibility_km": rec["visibility_km"],
        "observed_at": now_iso,
        "valid_to": "2030-01-01T00:00:00Z",
        "source_name": rec["source_name"],
        "source_url": "https://mausam.imd.gov.in",
    }


def get_hazard_record(harbor: str | None) -> dict[str, Any]:
    """Returns deterministic hazard bulletins for a given harbor (defaults to Ratnagiri)."""
    key = _normalize_harbor_key(harbor)
    rec = IN_MEMORY_MARINE_DATASET.get(key, IN_MEMORY_MARINE_DATASET["ratnagiri"])
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "harbor": rec["harbor"],
        "cyclone_warning_active": rec["cyclone_warning_active"],
        "squall_alert": rec["squall_alert"],
        "bulletin_id": f"IMD-{rec['harbor'].upper()}-01",
        "severity": rec["bulletin_severity"],
        "headline": f"Coastal Weather Watch - {rec['harbor']}",
        "valid_from": now_iso,
        "valid_to": "2030-01-01T00:00:00Z",
        "source_name": "IMD Hazard Division (In-Memory Dataset)",
        "source_url": "https://mausam.imd.gov.in/hazard",
    }
