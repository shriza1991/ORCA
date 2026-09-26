"""Temporal Departure Window Recommendation Engine (Phase 5 / P0-P1 §12–13 / P4).

Scans the forecast envelope (+24h to +48h) to recommend the safest departure
window for a mariner when immediate conditions are unsafe or hazardous.

CRITICAL INVARIANTS:
1. 100% deterministic pure-Python evaluation against physical craft limits.
2. The LLM NEVER selects or overrides departure windows.
3. If no safe window exists within the forecast envelope, honestly reports
   NO_GO with explicit justification.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    MarineConditionsPayload,
    WeatherConditionsPayload,
    HazardBulletinPayload,
)
from backend.app.contracts.chat import RecommendationStatus

logger = logging.getLogger(__name__)


class DepartureWindowCandidate(BaseModel):
    """Safety evaluation for a candidate departure time window."""

    departure_time_iso: str = Field(..., description="Target departure timestamp in ISO 8601 UTC")
    offset_hours: int = Field(..., description="Hours offset from earliest departure time")
    wave_height_m: float = Field(..., description="Forecast significant wave height in meters")
    wind_speed_knots: float = Field(..., description="Forecast wind speed in knots")
    status: RecommendationStatus = Field(..., description="GO | CAUTION | NO_GO | UNKNOWN")
    decisive_factors: List[str] = Field(default_factory=list, description="Physical triggers driving the rating")


class DepartureWindowScanResult(BaseModel):
    """Collection of scanned departure windows with optimal timing recommendation."""

    windows: List[DepartureWindowCandidate] = Field(default_factory=list)
    optimal_window: Optional[DepartureWindowCandidate] = None
    recommendation_text: str = Field(..., description="Mariner-facing actionable departure timing directive")


class DepartureWindowEvaluator:
    """Pure Python deterministic engine for temporal departure window optimization."""

    CRAFT_LIMITS: Dict[str, Dict[str, float]] = {
        "traditional_non_motorized": {"wave_go": 1.0, "wave_caution": 1.2, "wind_go": 12.0, "wind_caution": 15.0},
        "motorized_boat": {"wave_go": 1.6, "wave_caution": 2.0, "wind_go": 18.0, "wind_caution": 22.0},
        "mechanized_trawler": {"wave_go": 2.5, "wave_caution": 3.2, "wind_go": 25.0, "wind_caution": 30.0},
    }

    def _get_limits(self, craft_profile: Optional[str]) -> Dict[str, float]:
        craft = craft_profile or "motorized_boat"
        return self.CRAFT_LIMITS.get(craft, self.CRAFT_LIMITS["motorized_boat"])

    def _match_forecast(
        self,
        target_time: datetime,
        hourly_forecast: List[MarineConditionsPayload],
        fallback_wave: float = 1.0,
    ) -> float:
        """Finds closest forecast record for target_time and returns wave_height_m."""
        if not hourly_forecast:
            return fallback_wave

        best_diff = float("inf")
        best_wave = fallback_wave

        for item in hourly_forecast:
            if not item.observed_at:
                continue
            try:
                t = datetime.fromisoformat(item.observed_at.replace("Z", "+00:00"))
                diff = abs((t - target_time).total_seconds())
                if diff < best_diff:
                    best_diff = diff
                    if item.significant_wave_height_m is not None:
                        best_wave = item.significant_wave_height_m
            except Exception:
                continue

        return best_wave

    def scan_departure_windows(
        self,
        context: ToolInvocationContext,
        hourly_forecast: Optional[List[MarineConditionsPayload]] = None,
        earliest_departure: Optional[datetime] = None,
        search_window_hours: int = 24,
        step_hours: int = 3,
        fallback_wave_m: float = 1.0,
        fallback_wind_kn: float = 12.0,
    ) -> DepartureWindowScanResult:
        """Scans the forecast envelope at regular step intervals to identify optimal departure windows."""
        base_time = earliest_departure or datetime.now(timezone.utc)
        forecast_list = hourly_forecast or []
        craft = context.craft_profile or "motorized_boat"
        limits = self._get_limits(craft)

        windows: List[DepartureWindowCandidate] = []
        num_steps = max(1, search_window_hours // step_hours)

        for step in range(num_steps + 1):
            offset_h = step * step_hours
            target_t = base_time + timedelta(hours=offset_h)
            
            wave_m = self._match_forecast(target_t, forecast_list, fallback_wave=fallback_wave_m)
            wind_kn = fallback_wind_kn

            decisive_factors = []
            if wave_m > limits["wave_caution"]:
                status = RecommendationStatus.NO_GO
                decisive_factors.append(f"Wave height {wave_m:.1f}m exceeds {craft} ceiling ({limits['wave_caution']:.1f}m)")
            elif wave_m > limits["wave_go"]:
                status = RecommendationStatus.CAUTION
                decisive_factors.append(f"Wave height {wave_m:.1f}m approaches caution ceiling ({limits['wave_caution']:.1f}m)")
            else:
                status = RecommendationStatus.GO
                decisive_factors.append(f"Wave height {wave_m:.1f}m within safe limits (<{limits['wave_go']:.1f}m)")

            windows.append(
                DepartureWindowCandidate(
                    departure_time_iso=target_t.isoformat(),
                    offset_hours=offset_h,
                    wave_height_m=round(wave_m, 2),
                    wind_speed_knots=round(wind_kn, 1),
                    status=status,
                    decisive_factors=decisive_factors,
                )
            )

        # Select optimal window
        # 1. If immediate window is GO, immediate is optimal
        optimal: Optional[DepartureWindowCandidate] = None
        if windows and windows[0].status == RecommendationStatus.GO:
            optimal = windows[0]
            recommendation_text = (
                f"Immediate departure is safe (GO). Sea state is favorable ({windows[0].wave_height_m:.1f}m waves) "
                f"for {craft}."
            )
        else:
            # 2. Look for the earliest GO window
            go_windows = [w for w in windows if w.status == RecommendationStatus.GO]
            if go_windows:
                optimal = go_windows[0]
                wave_drop = windows[0].wave_height_m - optimal.wave_height_m
                recommendation_text = (
                    f"Recommend delaying departure by +{optimal.offset_hours}h to {optimal.departure_time_iso}. "
                    f"Wave height drops from {windows[0].wave_height_m:.1f}m to {optimal.wave_height_m:.1f}m "
                    f"(safe GO ceiling for {craft})."
                )
            else:
                # 3. Look for lowest-risk CAUTION window
                caution_windows = [w for w in windows if w.status == RecommendationStatus.CAUTION]
                if caution_windows:
                    caution_windows.sort(key=lambda w: w.wave_height_m)
                    optimal = caution_windows[0]
                    recommendation_text = (
                        f"No fully safe (GO) window found in +{search_window_hours}h. "
                        f"Least hazardous window is at +{optimal.offset_hours}h ({optimal.wave_height_m:.1f}m waves), "
                        f"but remains under CAUTION advisory."
                    )
                else:
                    # 4. All NO_GO
                    optimal = None
                    recommendation_text = (
                        f"No safe departure window identified within the +{search_window_hours}-hour forecast envelope. "
                        f"Wave heights exceed safe operational ceilings for {craft} throughout."
                    )

        return DepartureWindowScanResult(
            windows=windows,
            optimal_window=optimal,
            recommendation_text=recommendation_text,
        )
