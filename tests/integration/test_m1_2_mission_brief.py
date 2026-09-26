"""Acceptance Tests for M1.2 Mission Brief / Why Panel.

Validates:
1. TripAssessmentResponse contains complete MissionBriefPayload.
2. GO assessments show positive factors and no negative factors.
3. CAUTION / NO_GO assessments show breached-threshold factors inside negative factors.
4. Deterministic projection from RiskAssessmentPayload (zero LLM involved).
"""

import pytest
from backend.app.contracts.assessment import TripAssessmentRequest, TripAssessmentResponse
from backend.app.services.assessment_service import AssessmentService


def test_m1_2_acceptance_test_1_trip_assessment_contains_mission_brief():
    """Test 1: TripAssessmentResponse contains complete MissionBriefPayload for every assessment."""
    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        departure_time="2026-09-12T07:00:00Z",
        return_time="2026-09-12T11:00:00Z",
        data_mode="SNAPSHOT",
    )

    res = AssessmentService.assess_trip(req)
    assert isinstance(res, TripAssessmentResponse)
    assert res.brief is not None

    b = res.brief
    assert isinstance(b.summary, str) and len(b.summary) > 0
    assert isinstance(b.recommended_action, str) and len(b.recommended_action) > 0
    assert isinstance(b.positive_factors, list)
    assert isinstance(b.negative_factors, list)
    assert isinstance(b.confidence, str) and b.confidence in ("HIGH", "MEDIUM", "LOW")
    assert isinstance(b.confidence_reasons, list) and len(b.confidence_reasons) > 0


def test_m1_2_acceptance_test_2_go_decision_brief_factors():
    """Test 2: GO assessments show positive factors and no negative factors."""
    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        departure_time="2026-09-12T07:00:00Z",
        return_time="2026-09-12T11:00:00Z",
        data_mode="SNAPSHOT",
    )

    res = AssessmentService.assess_trip(req)
    assert res.decision.value == "GO"
    assert res.brief is not None
    assert len(res.brief.positive_factors) > 0
    assert len(res.brief.negative_factors) == 0


def test_m1_2_acceptance_test_3_caution_or_nogo_shows_breached_threshold_factors():
    """Test 3: CAUTION / NO_GO assessments show breached-threshold factors inside negative factors."""
    # Using traditional non-motorized craft which has very sensitive thresholds (< 0.8m wave caution, 1.2m nogo)
    # Ratnagiri snapshot wave height is ~1.2m, triggering CAUTION or NO_GO for traditional craft
    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        craft_profile="traditional_non_motorized",
        departure_time="2026-09-12T07:00:00Z",
        return_time="2026-09-12T11:00:00Z",
        data_mode="SNAPSHOT",
    )

    res = AssessmentService.assess_trip(req)
    assert res.decision.value in ("CAUTION", "NO_GO")
    assert res.brief is not None
    assert len(res.brief.negative_factors) > 0
    # Negative factors contain breached thresholds
    assert any("wave" in f.lower() or "wind" in f.lower() or "alert" in f.lower() for f in res.brief.negative_factors)
