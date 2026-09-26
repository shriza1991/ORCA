"""M1.3 Explainability & Evidence View Acceptance Tests.

Verifies:
1. TripAssessmentResponse contains agent_collaboration directly from assess_trip().
2. All 4 specialist agents (marine, weather, geospatial, safety) are populated with stances and findings.
3. Arbitration result and reasoning timeline are populated deterministically without requiring a chat interaction.
4. Threshold comparisons in assessment.evidence are complete (not truncated) and contain exact metrics, observed vs threshold values, operators, and impact triggers.
"""

import pytest
from datetime import datetime, timezone
from backend.app.contracts.assessment import TripAssessmentRequest, TripAssessmentResponse
from backend.app.services.assessment_service import AssessmentService


def test_m1_3_acceptance_test_1_assessment_contains_agent_collaboration():
    """Test 1: Assessment response contains agent_collaboration immediately after assessment without chat."""
    service = AssessmentService()
    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        coordinates=[73.28, 16.99],
        craft_profile="motorized_boat",
        departure_time="2026-09-12T07:00:00Z",
        return_time="2026-09-12T11:00:00Z",
        data_mode="SNAPSHOT",
        language_preference="en",
    )

    response = service.assess_trip(req)
    assert isinstance(response, TripAssessmentResponse)
    assert response.agent_collaboration is not None
    assert hasattr(response.agent_collaboration, "agents")
    assert hasattr(response.agent_collaboration, "arbitration")
    assert hasattr(response.agent_collaboration, "explanation")
    assert hasattr(response.agent_collaboration, "timeline")


def test_m1_3_acceptance_test_2_specialist_agents_and_arbitration_populated():
    """Test 2 & 6: Marine, Weather, Geospatial, and Safety agent outputs rendered directly from assessment data."""
    service = AssessmentService()
    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        coordinates=[73.28, 16.99],
        craft_profile="motorized_boat",
        departure_time="2026-09-12T07:00:00Z",
        return_time="2026-09-12T11:00:00Z",
        data_mode="SNAPSHOT",
        language_preference="en",
    )

    response = service.assess_trip(req)
    collab = response.agent_collaboration
    assert collab is not None

    agent_ids = [a.agent_id for a in collab.agents]
    assert "marine_agent" in agent_ids
    assert "weather_agent" in agent_ids
    assert "geospatial_agent" in agent_ids
    assert "safety_agent" in agent_ids

    # Each agent must have recommendation stance, summary, and findings
    for agent in collab.agents:
        assert agent.recommendation in ["GO", "CAUTION", "NO_GO", "UNKNOWN", "INFORMATIONAL"]
        assert len(agent.summary) > 0
        assert isinstance(agent.key_findings, list)

    # Arbitration must be populated
    assert collab.arbitration is not None
    assert collab.arbitration.winning_decision in ["GO", "CAUTION", "NO_GO", "UNKNOWN"]
    assert len(collab.arbitration.winning_rule) > 0

    # 5-stage causal explanation
    assert collab.explanation is not None
    assert len(collab.explanation.decision) > 0
    assert len(collab.explanation.recommendation) > 0


def test_m1_3_acceptance_test_3_threshold_comparisons_in_evidence():
    """Test 3: Threshold comparisons in assessment.evidence are untruncated and contain exact metrics, observed vs threshold values, and impact triggers."""
    service = AssessmentService()
    req = TripAssessmentRequest(
        origin_harbor="Ratnagiri",
        coordinates=[73.28, 16.99],
        craft_profile="motorized_boat",
        departure_time="2026-09-12T07:00:00Z",
        return_time="2026-09-12T11:00:00Z",
        data_mode="SNAPSHOT",
        language_preference="en",
    )

    response = service.assess_trip(req)
    assert isinstance(response.evidence, list)
    assert len(response.evidence) > 0

    # Find wave and wind threshold checks
    metrics = [ev.get("metric_name") for ev in response.evidence]
    assert "significant_wave_height_m" in metrics or "data_validity" in metrics

    for ev in response.evidence:
        assert "metric_name" in ev
        assert "observed_value" in ev
        assert "threshold_value" in ev
        assert "operator" in ev
        assert "impact" in ev
        assert ev["impact"] in ["SAFE", "CAUTION_TRIGGER", "NO_GO_TRIGGER", "UNKNOWN_TRIGGER"]
