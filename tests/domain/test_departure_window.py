"""Unit tests for Temporal Departure Window Recommendation Engine (Phase 5 / P0-P1 §12–13 / P4)."""

from datetime import datetime, timezone, timedelta
import pytest

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    MarineConditionsPayload,
    WeatherConditionsPayload,
    HazardBulletinPayload,
)
from backend.app.contracts.chat import RecommendationStatus
from backend.app.domain.departure_window import (
    DepartureWindowEvaluator,
    DepartureWindowCandidate,
    DepartureWindowScanResult,
)


def _make_forecast_timeline(base_time: datetime) -> list[MarineConditionsPayload]:
    """Simulates a squall event: rough at T+0 to T+3h (2.8m waves, NO_GO for motorized boat),

    then drops to calm sea state at T+6h (1.3m waves, GO).
    """
    forecasts = []
    # T+0h: 2.8m (NO_GO for motorized boat ceiling 2.0m)
    # T+3h: 2.4m (CAUTION/NO_GO)
    # T+6h: 1.3m (GO)
    # T+9h: 1.2m (GO)
    # T+12h: 1.1m (GO)
    waves = [2.8, 2.5, 2.3, 1.8, 1.4, 1.3, 1.2, 1.1, 1.2]
    for i, w in enumerate(waves):
        t = base_time + timedelta(hours=i * 3)
        forecasts.append(
            MarineConditionsPayload(
                significant_wave_height_m=w,
                surface_current_knots=1.0,
                observed_at=t.isoformat(),
                source_name="INCOIS OSF Forecast",
            )
        )
    return forecasts


def test_departure_window_recommends_waiting_when_now_is_unsafe():
    """When departure now is NO_GO due to high swell, scans forward and recommends the first safe GO window."""
    base_time = datetime(2026, 9, 26, 6, 0, tzinfo=timezone.utc)
    hourly = _make_forecast_timeline(base_time)
    
    ctx = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",  # 2.0m wave ceiling
        departure_time=base_time.isoformat(),
    )
    
    evaluator = DepartureWindowEvaluator()
    scan = evaluator.scan_departure_windows(
        context=ctx,
        hourly_forecast=hourly,
        earliest_departure=base_time,
        search_window_hours=24,
        step_hours=3,
    )
    
    assert isinstance(scan, DepartureWindowScanResult)
    assert len(scan.windows) > 3
    
    # First window (T+0) is NO_GO or CAUTION due to 2.8m waves exceeding 2.0m ceiling
    assert scan.windows[0].status in (RecommendationStatus.NO_GO, RecommendationStatus.CAUTION)
    
    # Optimal window should recommend waiting until waves drop (T+12h or T+15h where wave <= 1.4m)
    assert scan.optimal_window is not None
    assert scan.optimal_window.status == RecommendationStatus.GO
    assert scan.optimal_window.wave_height_m <= 1.5
    assert scan.recommendation_text is not None
    assert "drop" in scan.recommendation_text.lower() or "safe" in scan.recommendation_text.lower()


def test_departure_window_immediate_go():
    """When current conditions are already calm, confirms immediate departure is optimal."""
    base_time = datetime(2026, 9, 26, 6, 0, tzinfo=timezone.utc)
    # Calm forecasts (all 1.0m to 1.2m)
    hourly = [
        MarineConditionsPayload(
            significant_wave_height_m=1.0 + (i * 0.05),
            surface_current_knots=0.5,
            observed_at=(base_time + timedelta(hours=i * 3)).isoformat(),
            source_name="INCOIS OSF Forecast",
        )
        for i in range(8)
    ]
    
    ctx = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        departure_time=base_time.isoformat(),
    )
    
    evaluator = DepartureWindowEvaluator()
    scan = evaluator.scan_departure_windows(
        context=ctx,
        hourly_forecast=hourly,
        earliest_departure=base_time,
    )
    
    assert scan.windows[0].status == RecommendationStatus.GO
    assert scan.optimal_window is not None
    assert scan.optimal_window.offset_hours == 0
    assert "immediate" in scan.recommendation_text.lower() or "safe" in scan.recommendation_text.lower()
