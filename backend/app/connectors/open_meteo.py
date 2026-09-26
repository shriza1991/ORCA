"""Open-Meteo Marine API Connector.

Owned by Dev 2 (Backend Platform).

Open-Meteo is a free, no-key marine weather API used as the primary
live data source.

Unit contract (Open-Meteo defaults unless overridden):
  - wave_height              : metres
  - swell_wave_height        : metres
  - swell_wave_period        : seconds
  - wave_period              : seconds
  - wave_direction           : degrees
  - ocean_current_velocity   : km/h   (NOT m/s — convert with ÷ 1.852 for knots)
  - sea_surface_temperature  : °C
  - wind_speed_10m           : knots  (we request wind_speed_unit=kn explicitly)
  - wind_gusts_10m           : knots  (follows wind_speed_unit)
  - wind_direction_10m       : degrees
  - visibility               : metres (divide by 1000 for km)

Open-Meteo forecast horizon is 16 days (hourly). Requests beyond 16 days
return an COVERAGE_UNAVAILABLE payload rather than silently returning
unrelated data.

D-series Decision context:
  - D005 : LIVE / HYBRID / SNAPSHOT mode awareness
  - D012 : Snapshot fallback and provenance tagging
  - D015 : No invented observation times or fabricated defaults
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from backend.app.connectors.base import BaseLiveConnector
from backend.app.connectors.harbors import resolve_coordinates

if TYPE_CHECKING:
    from backend.app.agents.integrations.contracts import ToolInvocationContext
    from backend.app.agents.integrations.dev2 import (
        MarineConditionsPayload,
        WeatherConditionsPayload,
    )

logger = logging.getLogger(__name__)

# Open-Meteo publishes hourly forecasts up to 16 days ahead.
_OPEN_METEO_MAX_HORIZON_DAYS = 16

# Conversion factor: km/h → knots (exact: 1 knot = 1.852 km/h)
_KMH_TO_KNOTS = 1.0 / 1.852


def _parse_departure_utc(departure_time: str | None) -> datetime | None:
    """Parse context.departure_time into a UTC-aware datetime.

    Returns None if departure_time is None or unparseable.
    """
    if not departure_time:
        return None
    try:
        dt = datetime.fromisoformat(departure_time.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            # Assume UTC if naive
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)
    except (ValueError, TypeError):
        logger.warning("open_meteo: could not parse departure_time %r", departure_time)
        return None


def _select_hour_index(times: list[str], target_utc: datetime | None) -> int:
    """Return the index in the hourly time array whose slot covers target_utc.

    Open-Meteo hourly slots are on the hour; a slot at T covers [T, T+1h).
    When target_utc is None, returns index 0 (current/first slot).
    When target_utc falls exactly on a slot boundary, that index is returned.
    When target_utc falls between two slots, the earlier (floor) index is
    returned so the slot that covers the requested time is chosen.

    Args:
        times: List of ISO-8601 strings from hourly.time (e.g. "2026-09-22T06:00").
        target_utc: The desired forecast valid time in UTC.

    Returns:
        Best-matching index (defaults to 0 on any parse failure).
    """
    if not times:
        return 0
    if target_utc is None:
        return 0

    best_idx = 0
    best_delta: timedelta | None = None

    for i, t in enumerate(times):
        try:
            slot = datetime.fromisoformat(t.replace("Z", "+00:00"))
            if slot.tzinfo is None:
                slot = slot.replace(tzinfo=UTC)
            slot = slot.astimezone(UTC)
        except (ValueError, TypeError):
            continue

        # We want the latest slot that is ≤ target_utc (floor match).
        if slot <= target_utc:
            delta = target_utc - slot
            if best_delta is None or delta < best_delta:
                best_delta = delta
                best_idx = i

    return best_idx


def _safe_float(values: list, idx: int) -> float | None:
    """Return values[idx] as float, or None if index is out of range or value is None."""
    if not values or idx >= len(values):
        return None
    v = values[idx]
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


class OpenMeteoConnector(BaseLiveConnector):
    """Marine and weather data from Open-Meteo.

    Implements:
    - MarineConditionsProvider
    - WeatherConditionsProvider

    Trip-window selection
    ---------------------
    When ``context.departure_time`` is provided (ISO-8601 UTC), the connector
    selects the hourly record whose time slot covers that departure instant.
    All variables are extracted at the SAME index so no cross-hour mixing occurs.

    When ``departure_time`` is absent, index 0 (the next available hour) is used.

    Unit handling
    -------------
    ocean_current_velocity is returned by Open-Meteo in km/h by default.
    We convert using the exact factor: knots = km/h ÷ 1.852.
    (The factor 1.94384 applies to m/s, not km/h, and must not be used here.)
    """

    MARINE_API_URL = "https://marine-api.open-meteo.com/v1/marine"
    WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast"

    def __init__(self) -> None:
        super().__init__()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _check_horizon(
        self, departure_utc: datetime | None, retrieved_at: datetime
    ) -> str | None:
        """Return an error label if the requested horizon exceeds Open-Meteo limits.

        Returns None when the request is within the supported horizon.
        """
        if departure_utc is None:
            return None
        delta_days = (departure_utc - retrieved_at).days
        if delta_days > _OPEN_METEO_MAX_HORIZON_DAYS:
            return (
                f"Requested departure {departure_utc.isoformat()} is "
                f"{delta_days} days ahead — beyond Open-Meteo's "
                f"{_OPEN_METEO_MAX_HORIZON_DAYS}-day forecast horizon."
            )
        return None

    def _make_unavailable_marine(
        self,
        harbor: str,
        reason: str,
        retrieved_at: datetime,
        coverage_status: str,
    ) -> "MarineConditionsPayload":
        """Return an explicitly labeled unavailable marine payload."""
        from backend.app.agents.integrations.dev2 import MarineConditionsPayload

        return MarineConditionsPayload(
            harbor=harbor,
            significant_wave_height_m=None,
            swell_height_m=None,
            swell_period_sec=None,
            wave_direction_deg=None,
            surface_current_knots=None,
            sea_surface_temp_c=None,
            observed_at=None,
            valid_to=None,
            source_name=f"Open-Meteo Marine API ({coverage_status})",
            source_url="https://open-meteo.com/en/docs/marine-weather-api",
            freshness_flags={
                "forecast_valid_time": None,
                "source_issue_time": None,
                "retrieved_at": retrieved_at.isoformat(),
                "cache_time": None,
                "coverage_status": coverage_status,
                "reason": reason,
            },
        )

    def _make_unavailable_weather(
        self,
        harbor: str,
        reason: str,
        retrieved_at: datetime,
        coverage_status: str,
    ) -> "WeatherConditionsPayload":
        """Return an explicitly labeled unavailable weather payload."""
        from backend.app.agents.integrations.dev2 import WeatherConditionsPayload

        return WeatherConditionsPayload(
            harbor=harbor,
            wind_speed_knots=None,
            wind_gust_knots=None,
            wind_direction_deg=None,
            visibility_km=None,
            observed_at=None,
            valid_to=None,
            source_name=f"Open-Meteo Weather API ({coverage_status})",
            source_url="https://open-meteo.com/en/docs",
        )

    # ------------------------------------------------------------------
    # MarineConditionsProvider
    # ------------------------------------------------------------------

    def get_marine_conditions(self, context: "ToolInvocationContext") -> "MarineConditionsPayload":
        from backend.app.agents.integrations.dev2 import MarineConditionsPayload

        lat, lon = resolve_coordinates(context)
        harbor = context.origin_harbor or "Unknown"
        retrieved_at = datetime.now(UTC)
        departure_utc = _parse_departure_utc(getattr(context, "departure_time", None))

        # Reject out-of-horizon requests
        horizon_error = self._check_horizon(departure_utc, retrieved_at)
        if horizon_error:
            return self._make_unavailable_marine(
                harbor, horizon_error, retrieved_at, "WINDOW_UNAVAILABLE"
            )

        # Detect geographic fallback (harbor resolved to default Ratnagiri coords)
        from backend.app.connectors.harbors import _DEFAULT_LAT, _DEFAULT_LON
        geographic_fallback = (
            context.origin_harbor is not None
            and abs(lat - _DEFAULT_LAT) < 1e-6
            and abs(lon - _DEFAULT_LON) < 1e-6
            and context.origin_harbor.strip().lower() not in ("ratnagiri",)
        )

        data = self._get(
            self.MARINE_API_URL,
            latitude=lat,
            longitude=lon,
            hourly=(
                "wave_height,wave_direction,wave_period,"
                "swell_wave_height,swell_wave_period,ocean_current_velocity,"
                "sea_surface_temperature"
            ),
            forecast_days=7,
            timezone="UTC",
        )

        hourly = data.get("hourly", {})
        times: list[str] = hourly.get("time", [])

        # Select the ONE index that covers the requested departure time.
        # ALL variables are read at this same index — no cross-hour mixing.
        idx = _select_hour_index(times, departure_utc)

        wave_height = _safe_float(hourly.get("wave_height"), idx)
        wave_direction = _safe_float(hourly.get("wave_direction"), idx)
        # wave_period from Open-Meteo = dominant wave period (seconds)
        swell_height = _safe_float(hourly.get("swell_wave_height"), idx)
        swell_period = _safe_float(hourly.get("swell_wave_period"), idx)
        # ocean_current_velocity: Open-Meteo returns km/h — convert to knots (÷ 1.852)
        ocean_current_kmh = _safe_float(hourly.get("ocean_current_velocity"), idx)
        ocean_current_knots = (ocean_current_kmh * _KMH_TO_KNOTS) if ocean_current_kmh is not None else None
        sst = _safe_float(hourly.get("sea_surface_temperature"), idx)

        # Derive timestamps from the actual forecast time slot, not from the clock.
        forecast_valid_time: str | None = times[idx] if times and idx < len(times) else None
        if forecast_valid_time:
            # Open-Meteo times may lack TZ (e.g. "2026-09-22T06:00"); normalise to UTC.
            try:
                fvt_dt = datetime.fromisoformat(forecast_valid_time.replace("Z", "+00:00"))
                if fvt_dt.tzinfo is None:
                    fvt_dt = fvt_dt.replace(tzinfo=UTC)
                observed_at_str = fvt_dt.isoformat()
                valid_to_str = (fvt_dt + timedelta(hours=1)).isoformat()
            except (ValueError, TypeError):
                observed_at_str = None
                valid_to_str = None
        else:
            observed_at_str = None
            valid_to_str = None

        coverage_status = "GEOGRAPHIC_FALLBACK" if geographic_fallback else "OK"

        return MarineConditionsPayload(
            harbor=harbor,
            significant_wave_height_m=wave_height,
            swell_height_m=swell_height,
            swell_period_sec=swell_period,
            wave_direction_deg=wave_direction,
            surface_current_knots=ocean_current_knots,
            sea_surface_temp_c=sst,
            observed_at=observed_at_str,
            valid_to=valid_to_str,
            source_name="Open-Meteo Marine API",
            source_url="https://open-meteo.com/en/docs/marine-weather-api",
            freshness_flags={
                "forecast_valid_time": forecast_valid_time,
                "source_issue_time": None,  # Open-Meteo does not expose model run time
                "retrieved_at": retrieved_at.isoformat(),
                "cache_time": None,
                "coverage_status": coverage_status,
            },
        )

    # ------------------------------------------------------------------
    # WeatherConditionsProvider
    # ------------------------------------------------------------------

    def get_weather_conditions(self, context: "ToolInvocationContext") -> "WeatherConditionsPayload":
        from backend.app.agents.integrations.dev2 import WeatherConditionsPayload

        lat, lon = resolve_coordinates(context)
        harbor = context.origin_harbor or "Unknown"
        retrieved_at = datetime.now(UTC)
        departure_utc = _parse_departure_utc(getattr(context, "departure_time", None))

        # Reject out-of-horizon requests
        horizon_error = self._check_horizon(departure_utc, retrieved_at)
        if horizon_error:
            return self._make_unavailable_weather(
                harbor, horizon_error, retrieved_at, "WINDOW_UNAVAILABLE"
            )

        data = self._get(
            self.WEATHER_API_URL,
            latitude=lat,
            longitude=lon,
            hourly="wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility",
            wind_speed_unit="kn",  # Request knots directly — no post-conversion needed
            forecast_days=7,
            timezone="UTC",
        )

        hourly = data.get("hourly", {})
        times: list[str] = hourly.get("time", [])

        # Select the ONE index that covers the requested departure time.
        idx = _select_hour_index(times, departure_utc)

        wind_speed = _safe_float(hourly.get("wind_speed_10m"), idx)
        gusts = _safe_float(hourly.get("wind_gusts_10m"), idx)
        direction = _safe_float(hourly.get("wind_direction_10m"), idx)
        visibility_m = _safe_float(hourly.get("visibility"), idx)
        # visibility: Open-Meteo returns metres — convert to km
        visibility_km = (visibility_m / 1000.0) if visibility_m is not None else None

        # Derive timestamps from the actual forecast slot
        forecast_valid_time: str | None = times[idx] if times and idx < len(times) else None
        if forecast_valid_time:
            try:
                fvt_dt = datetime.fromisoformat(forecast_valid_time.replace("Z", "+00:00"))
                if fvt_dt.tzinfo is None:
                    fvt_dt = fvt_dt.replace(tzinfo=UTC)
                observed_at_str = fvt_dt.isoformat()
                valid_to_str = (fvt_dt + timedelta(hours=1)).isoformat()
            except (ValueError, TypeError):
                observed_at_str = None
                valid_to_str = None
        else:
            observed_at_str = None
            valid_to_str = None

        return WeatherConditionsPayload(
            harbor=harbor,
            wind_speed_knots=wind_speed,
            wind_gust_knots=gusts,
            wind_direction_deg=direction,
            visibility_km=visibility_km,
            observed_at=observed_at_str,
            valid_to=valid_to_str,
            source_name="Open-Meteo Weather API",
            source_url="https://open-meteo.com/en/docs",
        )
