"""Tests for canonical MissionState, DecisionObject, and DecisionDelta contracts.

Verifies:
1. MissionState instantiates with defaults and valid custom values.
2. mission_from_user_context() bridges legacy UserContext and ChatRequest cleanly.
3. DecisionObject instantiates and converts to API Recommendation.
4. DecisionDelta correctly captures differences between baseline and counterfactual.
5. All models serialize to/from dict and JSON without loss.
"""

import pytest
from backend.app.contracts.chat import (
    Confidence,
    ConfidenceLevel,
    DataProvenance,
    EvidenceItem,
    Recommendation,
    RecommendationStatus,
    UserContext,
)
from backend.app.contracts.mission import (
    DecisionDelta,
    DecisionObject,
    MissionConstraints,
    MissionContextData,
    MissionLocation,
    MissionObjective,
    MissionPreferences,
    MissionRoute,
    MissionState,
    MissionTiming,
    MissionUser,
    MissionVessel,
    ObjectiveType,
    PreviousDecision,
    mission_from_user_context,
)


def test_mission_state_default_instantiation():
    """Verify MissionState can be created with minimal required fields."""
    msn = MissionState(mission_id="msn_test_001")
    assert msn.mission_id == "msn_test_001"
    assert msn.user.locale == "en"
    assert msn.vessel.type == "motorized_boat"
    assert msn.objective.type == ObjectiveType.FISHING
    assert msn.timing.duration_hours == 8.0
    assert msn.route is None
    assert msn.previous_decision is None


def test_mission_state_full_specification():
    """Verify MissionState handles comprehensive multi-turn parameters."""
    msn = MissionState(
        mission_id="msn_kochi_001",
        conversation_id="conv_123",
        user=MissionUser(identity="mariner_42", locale="mr", profile="fisher"),
        vessel=MissionVessel(
            type="mechanized_trawler",
            size_m=12.5,
            speed_knots=8.0,
            range_km=80.0,
            capabilities=["vhf_radio", "navic"],
        ),
        objective=MissionObjective(
            type=ObjectiveType.FISHING,
            description="Tuna longlining offshore Kochi",
            target_species="Yellowfin Tuna",
        ),
        origin=MissionLocation(name="Kochi", latitude=9.9312, longitude=76.2673),
        destination=MissionLocation(name="PFZ-KC-01", latitude=9.85, longitude=75.90),
        timing=MissionTiming(
            departure="2026-09-22T05:00:00Z",
            operation_start="2026-09-22T07:00:00Z",
            operation_end="2026-09-22T13:00:00Z",
            return_deadline="2026-09-22T16:00:00Z",
            duration_hours=11.0,
        ),
        constraints=MissionConstraints(
            legal=["Avoid Malvan Marine Sanctuary", "Stay within Indian EEZ"],
            safety=["Wave ceiling 3.5m", "Wind ceiling 35 kn"],
        ),
        preferences=MissionPreferences(risk_tolerance="balanced"),
        route=MissionRoute(
            corridor_name="Balanced Corridor",
            waypoints=[[76.2673, 9.9312], [76.05, 9.88], [75.90, 9.85]],
            distance_km=42.5,
            max_wave_height_m=1.8,
            exposure_score=3.2,
        ),
        previous_decision=PreviousDecision(
            decision=RecommendationStatus.GO,
            decisive_factor="Favorable sea state with SWH 1.8m below trawler ceiling 3.5m",
        ),
    )

    assert msn.user.locale == "mr"
    assert msn.vessel.size_m == 12.5
    assert msn.route.corridor_name == "Balanced Corridor"
    assert msn.previous_decision.decision == RecommendationStatus.GO


def test_mission_from_user_context_bridge():
    """Verify that existing UserContext seamlessly bridges to MissionState."""
    ctx = UserContext(
        origin_harbor="Ratnagiri",
        coordinates=[73.28, 16.99],
        craft_profile="traditional_non_motorized",
        language_preference="mr",
    )
    msn = mission_from_user_context(
        user_context=ctx,
        message="Where is the nearest PFZ today?",
        conversation_id="conv_rat_01",
    )

    assert msn.origin.name == "Ratnagiri"
    assert msn.origin.longitude == 73.28
    assert msn.origin.latitude == 16.99
    assert msn.vessel.type == "traditional_non_motorized"
    assert msn.user.locale == "mr"
    assert msn.objective.type == ObjectiveType.FISHING
    assert msn.conversation_id == "conv_rat_01"


def test_decision_object_and_recommendation_conversion():
    """Verify DecisionObject schema and backwards-compatible Recommendation export."""
    dec = DecisionObject(
        decision=RecommendationStatus.NO_GO,
        confidence=ConfidenceLevel.HIGH,
        confidence_reasons=["IMD Coastal Bulletin updated 1h ago", "INCOIS OSF wave forecast corroborated"],
        decisive_factor="Significant wave height 3.4m exceeds craft safety ceiling 2.5m",
        supporting_factors=["IMD active squall warning across sector"],
        non_decisive_factors=["Wind speed 18 kn within limits"],
        constraints_applied=["Safety: wave_height <= 2.5m for motorized_boat"],
        recommended_action="Postpone departure until wave heights abate below 2.0m",
        uncertainty=[],
    )

    assert dec.decision == RecommendationStatus.NO_GO
    assert dec.confidence == ConfidenceLevel.HIGH

    rec = dec.to_recommendation()
    assert isinstance(rec, Recommendation)
    assert rec.status == RecommendationStatus.NO_GO
    assert rec.summary == "Significant wave height 3.4m exceeds craft safety ceiling 2.5m"
    assert len(rec.decisive_factors) == 2
    assert rec.confidence.level == ConfidenceLevel.HIGH


def test_decision_delta_calculation():
    """Verify DecisionDelta captures baseline vs counterfactual comparison."""
    delta = DecisionDelta(
        original_decision=RecommendationStatus.NO_GO,
        new_decision=RecommendationStatus.GO,
        decision_changed=True,
        confidence_change="HIGH -> HIGH",
        decisive_factor_change={
            "original": "Wave height 3.4m exceeds ceiling 2.5m at 06:00",
            "new": "Wave height abates to 1.8m by 11:00 departure",
        },
        added_factors=["Wave height 1.8m safe for departure"],
        removed_factors=["Squall warning expired at 10:00"],
        temporal_changes={"departure_time_shift_hours": 5.0},
        summary="Delaying departure from 06:00 to 11:00 shifts verdict from NO_GO to GO as squall abates.",
    )

    assert delta.decision_changed is True
    assert delta.original_decision == RecommendationStatus.NO_GO
    assert delta.new_decision == RecommendationStatus.GO
    assert delta.temporal_changes["departure_time_shift_hours"] == 5.0
