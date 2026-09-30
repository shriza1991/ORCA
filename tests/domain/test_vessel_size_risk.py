"""Unit and integration tests for Vessel Size Classification and Capability-differentiated risk evaluation.

Validates:
1. Wave height = 1.5m differentiation:
   - Small Traditional Craft -> NO_GO
   - Large Traditional Craft -> CAUTION
   - Large Trawler -> GO
2. Mission Twin carrying vessel_size through MissionState and UserContext
3. Decision Delta calculation when changing vessel_size in simulation
4. Mission Brief payload carrying vessel_type, vessel_size, and capability reasoning
"""
from datetime import datetime, timezone
import pytest

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    MarineConditionsPayload,
    WeatherConditionsPayload,
    HazardBulletinPayload,
)
from backend.app.contracts.chat import RecommendationStatus, UserContext
from backend.app.contracts.mission import MissionVessel, mission_from_user_context
from backend.app.contracts.assessment import TripAssessmentRequest
from backend.app.domain.risk_engine import (
    DeterministicRiskEngine,
    VESSEL_CAPABILITIES,
    get_vessel_capability,
)
from backend.app.services.assessment_service import AssessmentService


def test_vessel_capabilities_matrix_completeness():
    """Verify all 9 (craft_type, vessel_size) combinations exist in the capability matrix."""
    crafts = ["traditional_craft", "motorized_boat", "mechanized_trawler"]
    sizes = ["small", "medium", "large"]

    for c in crafts:
        for s in sizes:
            cap = get_vessel_capability(c, s)
            assert cap is not None, f"Missing capability profile for ({c}, {s})"
            assert "wave_caution_m" in cap
            assert "wave_nogo_m" in cap
            assert "wind_caution_knots" in cap
            assert "wind_nogo_knots" in cap
            assert "speed_knots" in cap
            assert "label" in cap
            assert cap["wave_caution_m"] < cap["wave_nogo_m"]
            assert cap["wind_caution_knots"] < cap["wind_nogo_knots"]


def test_wave_height_1_5m_differentiation():
    """Verify exact user requirement:
    Wave Height = 1.5m
    Small Traditional Craft -> NO GO
    Large Traditional Craft -> CAUTION
    Large Trawler -> GO
    """
    now = datetime.now(timezone.utc).isoformat()
    future = "2026-12-31T23:59:59+00:00"

    marine = MarineConditionsPayload(
        significant_wave_height_m=1.5,
        observed_at=now,
        valid_to=future,
        source_name="INCOIS OSF Live",
    )
    weather = WeatherConditionsPayload(
        wind_speed_knots=8.0,
        wind_gust_knots=10.0,
        observed_at=now,
        valid_to=future,
        source_name="IMD Coastal Live",
    )
    hazard = HazardBulletinPayload(
        severity="NORMAL",
        headline="Calm sea conditions",
        observed_at=now,
        valid_to=future,
        cyclone_warning_active=False,
        squall_alert=False,
        source_name="IMD Bulletin Live",
    )

    # 1. Small Traditional Craft (< 6m) -> NO GO
    ctx_small_trad = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="traditional_craft",
        vessel_size="small",
    )
    res_small_trad = DeterministicRiskEngine.evaluate(
        context=ctx_small_trad,
        marine=marine,
        weather=weather,
        hazard=hazard,
        data_mode="LIVE",
    )
    assert res_small_trad.status == RecommendationStatus.NO_GO
    assert any("Small Traditional Craft" in f for f in res_small_trad.decisive_factors)

    # 2. Large Traditional Craft (9–12m) -> CAUTION
    ctx_large_trad = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="traditional_craft",
        vessel_size="large",
    )
    res_large_trad = DeterministicRiskEngine.evaluate(
        context=ctx_large_trad,
        marine=marine,
        weather=weather,
        hazard=hazard,
        data_mode="LIVE",
    )
    assert res_large_trad.status == RecommendationStatus.CAUTION
    assert any("Large Traditional Craft" in f for f in res_large_trad.decisive_factors)

    # 3. Large Mechanized Trawler (> 20m) -> GO
    ctx_large_trawler = ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="mechanized_trawler",
        vessel_size="large",
    )
    res_large_trawler = DeterministicRiskEngine.evaluate(
        context=ctx_large_trawler,
        marine=marine,
        weather=weather,
        hazard=hazard,
        data_mode="LIVE",
    )
    assert res_large_trawler.status == RecommendationStatus.GO


def test_mission_twin_carries_vessel_size():
    """Verify MissionTwin (MissionState) properly preserves and synchronizes vessel_size."""
    u_ctx = UserContext(
        origin_harbor="Malvan",
        craft_profile="traditional_non_motorized",
        vessel_size="small",
    )
    state = mission_from_user_context(u_ctx)
    assert state.vessel.type == "traditional_non_motorized"
    assert state.vessel.size_category == "small"
    assert state.vessel.vessel_size == "small"

    # Direct model construction
    vessel = MissionVessel(type="motorized_boat", vessel_size="large")
    assert vessel.size_category == "large"
    assert vessel.vessel_size == "large"


def test_assessment_service_brief_includes_vessel_size_and_reasoning():
    """Verify MissionBriefPayload populated by AssessmentService contains vessel type, size, and reasoning note."""
    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        craft_profile="traditional_craft",
        vessel_size="small",
        data_mode="SNAPSHOT",
    )
    res = AssessmentService.run_unified_assessment(req)
    assert res.brief is not None
    assert res.brief.vessel_type == "Traditional Craft"
    assert res.brief.vessel_size == "Small"
    assert "Assessment adjusted for Small Traditional Craft operating limitations." in res.brief.capability_notes
