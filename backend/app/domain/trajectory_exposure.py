"""Dynamic Trajectory Exposure Engine (Phase 5 / P4 GIS & Temporal).

Evaluates marine conditions, sea states, and risk exposure dynamically along a
vessel's journey trajectory based on waypoint ETA timestamps.

CRITICAL INVARIANTS:
1. Deterministic pure-Python timeline calculation.
2. Wave heights and wind are resolved against the forecast hour corresponding to the
   calculated ETA at that waypoint, not a single static departure snapshot.
3. Epistemic honesty: missing hourly forecasts are explicitly identified in missing_data_state.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.agents.integrations.dev2 import MarineConditionsPayload


class WaypointTimelineItem(BaseModel):
    """Time-indexed meteorological and exposure data at a specific route waypoint."""

    waypoint_index: int = Field(..., description="0-indexed waypoint sequence number")
    coordinates: List[float] = Field(..., description="[longitude, latitude] coordinates")
    distance_from_origin_km: float = Field(..., description="Cumulative distance from departure harbor in km")
    eta_hours: float = Field(..., description="Transit time from departure in hours")
    eta_iso: str = Field(..., description="Estimated arrival time at waypoint in ISO 8601 UTC")
    wave_height_m: float = Field(..., description="Significant wave height forecast at this waypoint and time")
    wind_knots: float = Field(..., description="Wind speed forecast at this waypoint and time")
    exposure_score: float = Field(..., description="Localized risk exposure score for this segment")


class TrajectoryExposureResult(BaseModel):
    """Aggregate trajectory exposure metrics along an evaluated passage."""

    waypoint_timeline: List[WaypointTimelineItem] = Field(default_factory=list)
    total_distance_km: float = Field(..., ge=0.0)
    total_transit_hours: float = Field(..., ge=0.0)
    peak_wave_height_m: float = Field(..., ge=0.0)
    peak_exposure_point: Optional[Dict[str, Any]] = None
    integrated_exposure_score: float = Field(..., ge=0.0)
    risk_rating: str = Field("LOW", description="LOW | MODERATE | HIGH")
    missing_data_state: Optional[str] = None


class TrajectoryExposureEngine:
    """Pure Python deterministic engine for time-dependent trajectory exposure."""

    CRAFT_SPEEDS_KNOTS: Dict[str, float] = {
        "traditional_non_motorized": 3.0,
        "motorized_boat": 8.0,
        "mechanized_trawler": 10.0,
    }

    @staticmethod
    def _haversine(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
        R = 6371.0  # Earth radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    def _get_craft_speed(self, craft_profile: str, vessel_size: Optional[str] = "medium") -> float:
        try:
            from backend.app.domain.risk_engine import get_vessel_capability
            cap = get_vessel_capability(craft_profile, vessel_size)
            if cap and "speed_knots" in cap:
                return float(cap["speed_knots"])
        except Exception:
            pass
        return self.CRAFT_SPEEDS_KNOTS.get(craft_profile, 8.0)

    def _match_forecast_for_time(
        self,
        target_time: datetime,
        hourly_forecast: List[MarineConditionsPayload | Dict[str, Any]],
        fallback_wave_m: float = 1.0,
        fallback_wind_kn: float = 12.0,
    ) -> tuple[float, float, bool]:
        """Finds closest forecast record for target_time. Returns (wave_m, wind_kn, is_matched)."""
        if not hourly_forecast:
            return fallback_wave_m, fallback_wind_kn, False

        best_diff_seconds = float("inf")
        best_payload: Optional[MarineConditionsPayload] = None

        for item in hourly_forecast:
            observed_at = item.get("observation_time") if isinstance(item, dict) else item.observed_at
            if not observed_at:
                continue
            try:
                t_item = datetime.fromisoformat(str(observed_at).replace("Z", "+00:00"))
                diff = abs((t_item - target_time).total_seconds())
                if diff < best_diff_seconds:
                    best_diff_seconds = diff
                    best_payload = item
            except Exception:
                continue

        # If matched within 3 hours, use it; otherwise fallback
        if best_payload and best_diff_seconds <= 10800:
            wave = best_payload.get("wave_height_m", best_payload.get("swh")) if isinstance(best_payload, dict) else best_payload.significant_wave_height_m
            wave = wave if wave is not None else fallback_wave_m
            wind = best_payload.get("wind_speed_knots") if isinstance(best_payload, dict) else getattr(best_payload, "wind_speed_knots", None)
            wind = wind if wind is not None else fallback_wind_kn
            return wave, wind, True

        return fallback_wave_m, fallback_wind_kn, False

    def evaluate_trajectory(
        self,
        waypoints: List[List[float]],
        craft_profile: str = "motorized_boat",
        departure_time: Optional[datetime] = None,
        hourly_forecast: Optional[List[MarineConditionsPayload]] = None,
        fallback_wave_height_m: float = 1.0,
        fallback_wind_knots: float = 12.0,
        vessel_size: Optional[str] = "medium",
    ) -> TrajectoryExposureResult:
        """Evaluates time-indexed marine weather at each waypoint along the vessel's journey."""
        if not waypoints:
            return TrajectoryExposureResult(
                waypoint_timeline=[],
                total_distance_km=0.0,
                total_transit_hours=0.0,
                peak_wave_height_m=fallback_wave_height_m,
                integrated_exposure_score=fallback_wave_height_m * 1.5,
                risk_rating="LOW",
                missing_data_state="Empty waypoints provided.",
            )

        dep_time = departure_time or datetime.now(timezone.utc)
        speed_knots = self._get_craft_speed(craft_profile, vessel_size)
        forecast_list = hourly_forecast or []

        timeline: List[WaypointTimelineItem] = []
        cumulative_dist_km = 0.0
        peak_wave = 0.0
        peak_point: Optional[Dict[str, Any]] = None
        peak_exposure = 0.0
        has_matched_forecast = False

        for i, pt in enumerate(waypoints):
            if i > 0:
                prev = waypoints[i - 1]
                seg_km = self._haversine(prev[0], prev[1], pt[0], pt[1])
                cumulative_dist_km += seg_km

            dist_nm = cumulative_dist_km / 1.852
            eta_h = round(dist_nm / speed_knots, 2)
            wp_time = dep_time + timedelta(hours=eta_h)

            wave_m, wind_kn, matched = self._match_forecast_for_time(
                target_time=wp_time,
                hourly_forecast=forecast_list,
                fallback_wave_m=fallback_wave_height_m,
                fallback_wind_kn=fallback_wind_knots,
            )
            if matched:
                has_matched_forecast = True

            # Local exposure formula: wave penalty + progressive distance penalty
            seg_exposure = round(wave_m * 1.5 + (cumulative_dist_km / 10.0), 2)

            timeline_item = WaypointTimelineItem(
                waypoint_index=i,
                coordinates=[round(pt[0], 4), round(pt[1], 4)],
                distance_from_origin_km=round(cumulative_dist_km, 2),
                eta_hours=eta_h,
                eta_iso=wp_time.isoformat(),
                wave_height_m=round(wave_m, 2),
                wind_knots=round(wind_kn, 1),
                exposure_score=seg_exposure,
            )
            timeline.append(timeline_item)

            if wave_m > peak_wave:
                peak_wave = wave_m

            if seg_exposure >= peak_exposure:
                peak_exposure = seg_exposure
                peak_point = {
                    "coordinates": [round(pt[0], 4), round(pt[1], 4)],
                    "waypoint_index": i,
                    "eta_hours": eta_h,
                    "eta_iso": wp_time.isoformat(),
                    "wave_height_m": round(wave_m, 2),
                    "wind_speed_knots": round(wind_kn, 1),
                    "exposure_score": seg_exposure,
                }

        # Integrated exposure score
        avg_wave = sum(t.wave_height_m for t in timeline) / len(timeline)
        integrated_score = round(peak_wave * 1.2 + avg_wave * 0.3 + (cumulative_dist_km / 10.0), 2)

        if integrated_score > 6.0 or peak_wave >= 2.5:
            risk_rating = "HIGH"
        elif integrated_score > 3.0 or peak_wave >= 1.8:
            risk_rating = "MODERATE"
        else:
            risk_rating = "LOW"

        total_hours = timeline[-1].eta_hours if timeline else 0.0
        missing_state = None
        if not forecast_list or not has_matched_forecast:
            missing_state = (
                f"Missing hourly forecast data; evaluated using baseline wave height {fallback_wave_height_m}m."
            )

        return TrajectoryExposureResult(
            waypoint_timeline=timeline,
            total_distance_km=round(cumulative_dist_km, 2),
            total_transit_hours=total_hours,
            peak_wave_height_m=round(peak_wave, 2),
            peak_exposure_point=peak_point,
            integrated_exposure_score=integrated_score,
            risk_rating=risk_rating,
            missing_data_state=missing_state,
        )
