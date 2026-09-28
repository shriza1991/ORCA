"""Integration tests for M1.4 Decision Delta & Counterfactual Intelligence.

Verifies:
1. Decision Boundary Analysis (margin, margin_percent, nearest_boundary).
2. Recommendation Stability Assessment (HIGH, MEDIUM, LOW).
3. Minimal Safe Adjustment (smallest required delta to revert).
4. Deterministic Sensitivity Ranking (Tier 1, Tier 2, Tier 3).
5. Counterfactual Flip Attribution (exact causal metric, crossed threshold, explanation).
6. Earliest Safe Mission Window (contiguous GO blocks, IST formatting).
7. Unified Trip Assessment Integration (response.stability & response.safe_window populated).
"""
import pytest
from datetime import datetime, timezone, timedelta

from backend.app.contracts.chat import (
    ConfidenceLevel,
    RecommendationStatus,
    ThresholdComparison,
)
from backend.app.contracts.assessment import (
    TripAssessmentRequest,
    DecisionBoundaryItem,
    DecisionStabilityPayload,
    SafeMissionWindow,
    CounterfactualFlipExplanation,
)
from backend.app.domain.risk_engine import (
    compute_decision_boundaries,
    compute_decision_stability,
    compute_minimal_safe_adjustment,
    compute_sensitivity_ranking,
    attribute_counterfactual_flip,
    compute_safe_window,
)
from backend.app.services.assessment_service import AssessmentService
from backend.app.domain.synthetic.generator import REFERENCE_TIME


def test_decision_boundary_analysis_nearest_selection():
    """Verify that nearest boundary is selected as the smallest positive safe margin."""
    tc_wave = ThresholdComparison(
        metric_name="significant_wave_height_m",
        observed_value=1.2,
        threshold_value=1.5,
        operator=">=",
        unit="meters",
        exceeded=False,
        impact="SAFE",
        description="Wave height test",
    )
    tc_wind = ThresholdComparison(
        metric_name="wind_speed_knots",
        observed_value=12.0,
        threshold_value=18.0,
        operator=">=",
        unit="knots",
        exceeded=False,
        impact="SAFE",
        description="Wind speed test",
    )
    boundaries = compute_decision_boundaries([tc_wave, tc_wind], craft_profile="motorized_boat")

    assert len(boundaries) == 2
    # Wave: 1.5 - 1.2 = 0.3m margin, 0.3 / 1.5 = 20.0%
    # Wind: 18.0 - 12.0 = 6.0 kt margin, 6.0 / 18.0 = 33.3%
    wave_b = next(b for b in boundaries if b.metric_name == "significant_wave_height_m")
    wind_b = next(b for b in boundaries if b.metric_name == "wind_speed_knots")

    assert wave_b.margin == 0.3
    assert wave_b.margin_percent == 20.0
    assert wave_b.is_nearest_boundary is True
    assert wind_b.margin == 6.0
    assert wind_b.is_nearest_boundary is False


def test_stability_levels_high_medium_low():
    """Verify deterministic stability levels based on margins and active hazard bulletins."""
    # HIGH: all margins > 25% and no active bulletins
    tc_safe_high = ThresholdComparison(
        metric_name="significant_wave_height_m",
        observed_value=1.0,
        threshold_value=1.5,
        operator=">=",
        unit="meters",
        exceeded=False,
        impact="SAFE",
        description="Calm sea",
    )
    b_high = compute_decision_boundaries([tc_safe_high])
    s_high = compute_decision_stability(b_high, [tc_safe_high], bulletins_active=False)
    assert s_high.level == "HIGH"
    assert "High" in s_high.headline

    # MEDIUM: nearest margin between 10% and 25%
    tc_med = ThresholdComparison(
        metric_name="significant_wave_height_m",
        observed_value=1.25,
        threshold_value=1.5,
        operator=">=",
        unit="meters",
        exceeded=False,
        impact="SAFE",
        description="Moderate sea",
    )
    b_med = compute_decision_boundaries([tc_med])
    s_med = compute_decision_stability(b_med, [tc_med], bulletins_active=False)
    assert s_med.level == "MEDIUM"

    # LOW: nearest margin < 10%
    tc_low_margin = ThresholdComparison(
        metric_name="significant_wave_height_m",
        observed_value=1.45,
        threshold_value=1.5,
        operator=">=",
        unit="meters",
        exceeded=False,
        impact="SAFE",
        description="Borderline sea",
    )
    b_low = compute_decision_boundaries([tc_low_margin])
    s_low = compute_decision_stability(b_low, [tc_low_margin], bulletins_active=False)
    assert s_low.level == "LOW"

    # LOW: active breached metric
    tc_breached = ThresholdComparison(
        metric_name="significant_wave_height_m",
        observed_value=1.8,
        threshold_value=1.5,
        operator=">=",
        unit="meters",
        exceeded=True,
        impact="CAUTION_TRIGGER",
        description="Breached sea",
    )
    b_breached = compute_decision_boundaries([tc_breached])
    s_breached = compute_decision_stability(b_breached, [tc_breached], bulletins_active=False)
    assert s_breached.level == "LOW"


def test_minimal_safe_adjustment_calculation():
    """Verify minimal safe adjustment selects smallest required reduction."""
    tc_wave_breach = ThresholdComparison(
        metric_name="significant_wave_height_m",
        observed_value=1.9,
        threshold_value=1.5,
        operator=">=",
        unit="meters",
        exceeded=True,
        impact="CAUTION_TRIGGER",
        description="Breached wave",
    )
    tc_wind_breach = ThresholdComparison(
        metric_name="wind_speed_knots",
        observed_value=25.0,
        threshold_value=18.0,
        operator=">=",
        unit="knots",
        exceeded=True,
        impact="CAUTION_TRIGGER",
        description="Breached wind",
    )
    # Delta wave = 0.4m, delta wind = 7.0 kt -> smallest is wave (0.4m)
    adj = compute_minimal_safe_adjustment([tc_wave_breach, tc_wind_breach])
    assert adj is not None
    assert "Reduce wave height by 0.4m to reach GO threshold." in adj


def test_deterministic_sensitivity_ranking():
    """Verify 3-tier sensitivity ranking rules."""
    tc_cyclone = ThresholdComparison(
        metric_name="cyclone_warning_active",
        observed_value=True,
        threshold_value=False,
        operator="==",
        unit="boolean",
        exceeded=True,
        impact="NO_GO_TRIGGER",
        description="Cyclone warning",
    )
    tc_breach = ThresholdComparison(
        metric_name="significant_wave_height_m",
        observed_value=2.0,
        threshold_value=1.5,
        operator=">=",
        unit="meters",
        exceeded=True,
        impact="CAUTION_TRIGGER",
        description="Breached wave",
    )
    tc_safe = ThresholdComparison(
        metric_name="wind_speed_knots",
        observed_value=12.0,
        threshold_value=18.0,
        operator=">=",
        unit="knots",
        exceeded=False,
        impact="SAFE",
        description="Safe wind",
    )
    ranking = compute_sensitivity_ranking([tc_safe, tc_cyclone, tc_breach])

    assert len(ranking) == 3
    # Tier 1 (severe hazard) must be first
    assert "Cyclone" in ranking[0]
    # Tier 2 (breached metric) must be second
    assert "Wave Height" in ranking[1]
    assert "breach" in ranking[1]
    # Tier 3 (safe metric) must be third
    assert "Wind Speed" in ranking[2]
    assert "safe margin" in ranking[2]


def test_counterfactual_flip_attribution():
    """Verify causal attribution when a simulation flips GO -> CAUTION."""
    tc_baseline = ThresholdComparison(
        metric_name="significant_wave_height_m",
        observed_value=1.2,
        threshold_value=1.5,
        operator=">=",
        unit="meters",
        exceeded=False,
        impact="SAFE",
        description="Baseline wave",
    )
    tc_simulated = ThresholdComparison(
        metric_name="significant_wave_height_m",
        observed_value=1.9,
        threshold_value=1.5,
        operator=">=",
        unit="meters",
        exceeded=True,
        impact="CAUTION_TRIGGER",
        description="Simulated wave",
    )

    flip = attribute_counterfactual_flip(
        baseline_decision="GO",
        simulated_decision="CAUTION",
        baseline_evidence=[tc_baseline],
        simulated_evidence=[tc_simulated],
    )

    assert flip.decision_flipped is True
    assert flip.primary_cause_metric == "Significant Wave Height"
    assert flip.observed_before == 1.2
    assert flip.observed_after == 1.9
    assert flip.threshold_crossed == 1.5
    assert "Decision flipped GO" in flip.explanation_text
    assert "CAUTION" in flip.explanation_text
    assert "Reduce significant wave height by 0.4m to revert to GO." in flip.minimal_adjustment_to_revert


def test_safe_mission_window_computation():
    """Verify safe mission window classification and contiguous GO blocks."""
    # 1. Currently safe scenario
    safe_window = compute_safe_window(
        craft_profile="motorized_boat",
        reference_time="2026-09-12T06:00:00+00:00",
        trip_duration_hours=4,
        current_status=RecommendationStatus.GO,
    )
    assert isinstance(safe_window, SafeMissionWindow)
    assert safe_window.is_current_safe is True
    assert "safe until" in safe_window.window_summary

    # 2. Currently unsafe scenario
    synthetic_hourly = [
        {"observation_time": "2026-09-12T06:00:00+00:00", "swh": 3.0, "wind_speed_knots": 30.0},
        {"observation_time": "2026-09-12T07:00:00+00:00", "swh": 2.8, "wind_speed_knots": 28.0},
        {"observation_time": "2026-09-12T08:00:00+00:00", "swh": 1.2, "wind_speed_knots": 12.0},
        {"observation_time": "2026-09-12T09:00:00+00:00", "swh": 1.1, "wind_speed_knots": 11.0},
        {"observation_time": "2026-09-12T10:00:00+00:00", "swh": 1.0, "wind_speed_knots": 10.0},
        {"observation_time": "2026-09-12T11:00:00+00:00", "swh": 1.0, "wind_speed_knots": 10.0},
    ]
    unsafe_window = compute_safe_window(
        craft_profile="motorized_boat",
        hourly_records=synthetic_hourly,
        reference_time="2026-09-12T06:00:00+00:00",
        trip_duration_hours=3,
        current_status=RecommendationStatus.NO_GO,
    )
    assert unsafe_window.is_current_safe is False
    assert unsafe_window.earliest_safer_departure is not None
    assert "Earliest safer departure window" in unsafe_window.window_summary


def test_assessment_service_populates_stability_and_safe_window():
    """Verify that unified trip assessment response populates M1.4 stability and safe_window."""
    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        data_mode="SNAPSHOT",
        departure_time=REFERENCE_TIME.isoformat(),
        return_time=(REFERENCE_TIME + timedelta(hours=6)).isoformat(),
    )
    response = AssessmentService.assess_trip(req)

    assert response.stability is not None
    assert response.stability.level in ("HIGH", "MEDIUM", "LOW")
    assert response.stability.headline is not None
    assert len(response.stability.sensitivity_ranking) > 0

    assert response.safe_window is not None
    assert isinstance(response.safe_window.is_current_safe, bool)
    assert response.safe_window.window_summary is not None
