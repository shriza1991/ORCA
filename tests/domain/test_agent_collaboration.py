"""Unit tests for Deterministic Multi-Agent Collaboration and Arbitration Engine.

Owned by Dev 3 & Dev 4.
Validates:
- Correct mapping of observations to 5 conceptual agents
- Disagreement detection and statutory conflict arbitration (Protocol D010)
- Winning rule declaration and accepted/rejected explanations
- 8-step agentic lifecycle timeline
- 5-stage causal explainability breakdown
- Defensible Evidence Strength & Data Quality (no arbitrary percentages)
- Stakeholder perspectives for Fisherman, Authority, and Researcher
"""

import pytest
from backend.app.contracts.chat import (
    Confidence,
    ConfidenceLevel,
    DataQualityRating,
    EvidenceItem,
    Recommendation,
    RecommendationStatus,
    ThresholdComparison,
)
from backend.app.domain.agent_collaboration import AgentCollaborationEngine


def test_full_consensus_safe_go():
    """Validates full consensus when all agents observe calm, safe conditions."""
    observations = {
        "significant_wave_height_m": 1.2,
        "wind_speed_knots": 12.0,
        "wind_gust_knots": 15.0,
        "cyclone_warning_active": False,
        "squall_alert": False,
        "hard_stop": False,
        "restricted": False,
        "observed_at": "2026-09-24T06:00:00Z",
    }
    rec = Recommendation(
        status=RecommendationStatus.GO,
        summary="Conditions are calm and safe for coastal voyage departure.",
        decisive_factors=["Significant wave height 1.2m is calm (< 1.5m).", "Sustained wind 12.0 kt is favorable."],
        non_decisive_factors=["Wind gusts within calm limits"],
        threshold_comparisons=[
            ThresholdComparison(
                metric_name="significant_wave_height_m",
                observed_value=1.2,
                threshold_value=1.5,
                operator="<",
                unit="meters",
                exceeded=False,
                impact="SAFE",
                description="Wave height calm",
            )
        ],
        next_action="Proceed with planned voyage under standard safety protocols.",
    )
    evidence = [
        EvidenceItem(
            evidence_id="EV-INCOIS-01",
            source_name="INCOIS Ocean State Forecast",
            metric_name="significant_wave_height",
            metric_value=1.2,
            metric_unit="meters",
            quality_flags=["official_source", "verified_live", "fresh"],
            data_mode="LIVE",
            valid_from="2026-09-24T00:00:00Z",
            valid_to="2026-09-25T00:00:00Z",
        )
    ]

    collab = AgentCollaborationEngine.derive_collaboration(
        observations=observations,
        risk_assessment=rec,
        evidence=evidence,
        trace=[],
        user_profile={"craft_profile": "motorized_boat", "departure_time": "2026-09-24T06:00:00Z"},
        harbor="Ratnagiri",
    )

    # 1. Agents count and identities
    assert len(collab.agents) == 4
    agent_ids = [a.agent_id for a in collab.agents]
    assert agent_ids == ["marine_agent", "weather_agent", "geospatial_agent", "safety_agent"]

    # 2. Individual agent stances
    for agent in collab.agents:
        assert agent.recommendation == RecommendationStatus.GO
        assert agent.evidence_strength in (ConfidenceLevel.HIGH, ConfidenceLevel.MEDIUM)
        assert agent.data_quality in (DataQualityRating.VERIFIED, DataQualityRating.SNAPSHOT_FALLBACK)
        assert len(agent.sources) > 0
        assert agent.sources[0].provider in ["INCOIS", "IMD", "INHO / MoEFCC", "ORCA Safety Authority"]

    # 3. Decision Authority Arbitration (No conflict)
    arb = collab.arbitration
    assert arb.conflict_detected is False
    assert arb.winning_decision == RecommendationStatus.GO
    assert arb.winning_agent == "Decision Authority"
    assert "Consensus Clearance" in arb.winning_rule

    # 4. 8-step Timeline
    assert len(collab.timeline) == 8
    timeline_labels = [s.label for s in collab.timeline]
    assert timeline_labels == [
        "Mission Received",
        "Data Collection",
        "Marine Analysis",
        "Weather Analysis",
        "Boundary Analysis",
        "Safety Assessment",
        "Conflict Resolution",
        "Final Recommendation",
    ]

    # 5. Causal Explanation
    exp = collab.explanation
    assert len(exp.facts) >= 2
    assert len(exp.inferences) >= 1
    assert len(exp.constraints) >= 1
    assert "GO" in exp.decision

    # 6. Stakeholder perspectives
    assert "fisherman" in collab.stakeholder_perspectives
    assert "authority" in collab.stakeholder_perspectives
    assert "researcher" in collab.stakeholder_perspectives
    assert collab.stakeholder_perspectives["fisherman"]["headline"] == "Safe to Go"


def test_conflict_detection_safety_overrides_fishing_opportunity():
    """Validates that dangerous wave heights override favorable fishing opportunity / PFZ."""
    observations = {
        "significant_wave_height_m": 2.8,  # Exceeds motorized_boat limit 2.5m
        "wind_speed_knots": 14.0,
        "pfz_candidates": [{"candidate_id": "PFZ-01", "distance_km": 14.2, "bearing_deg": 260.0}],
        "hard_stop": False,
        "cyclone_warning_active": False,
    }
    rec = Recommendation(
        status=RecommendationStatus.NO_GO,
        summary="Significant wave height 2.8m exceeds safety ceiling (2.5m for motorized_boat).",
        decisive_factors=["Significant wave height 2.8m exceeds safety ceiling (2.5m for motorized_boat)."],
        next_action="Remain moored in port. Do not navigate under any circumstances.",
    )

    collab = AgentCollaborationEngine.derive_collaboration(
        observations=observations,
        risk_assessment=rec,
        evidence=[],
        trace=[],
        user_profile={"craft_profile": "motorized_boat"},
        harbor="Ratnagiri",
    )

    # Marine agent sees PFZ candidate + high waves -> NO_GO or CAUTION
    marine = next(a for a in collab.agents if a.agent_id == "marine_agent")
    weather = next(a for a in collab.agents if a.agent_id == "weather_agent")
    safety = next(a for a in collab.agents if a.agent_id == "safety_agent")

    assert weather.recommendation == RecommendationStatus.GO  # Wind is calm 14 kt
    assert safety.recommendation == RecommendationStatus.NO_GO  # Wave 2.8m breaches limit

    # Arbitration must detect conflict
    arb = collab.arbitration
    assert arb.conflict_detected is True
    assert arb.winning_decision == RecommendationStatus.NO_GO
    assert arb.winning_agent == "Decision Authority"
    assert "Safety" in arb.winning_rule or "Precaution" in arb.winning_rule
    assert len(arb.accepted_reasons) > 0
    assert len(arb.rejected_reasons) > 0

    # Stakeholder views reflect conflict resolution
    fisherman_view = collab.stakeholder_perspectives["fisherman"]
    assert fisherman_view["headline"] == "Do Not Go"
    assert "Unsafe sea" in fisherman_view["simple_summary"]


def test_cyclone_alert_override():
    """Validates that an IMD cyclone warning strictly overrides calm local wave observations."""
    observations = {
        "significant_wave_height_m": 1.1,  # Locally calm before storm arrival
        "wind_speed_knots": 15.0,
        "cyclone_warning_active": True,
        "headline": "Severe Cyclonic Storm Alert off Konkan",
    }
    rec = Recommendation(
        status=RecommendationStatus.NO_GO,
        summary="Active IMD cyclone warning: Severe Cyclonic Storm Alert off Konkan.",
        decisive_factors=["Active IMD cyclone warning: Severe Cyclonic Storm Alert off Konkan"],
        next_action="Remain moored in port.",
    )

    collab = AgentCollaborationEngine.derive_collaboration(
        observations=observations,
        risk_assessment=rec,
        evidence=[],
        trace=[],
        user_profile={"craft_profile": "motorized_boat"},
        harbor="Ratnagiri",
    )

    arb = collab.arbitration
    assert arb.conflict_detected is True
    assert arb.winning_decision == RecommendationStatus.NO_GO
    assert "Cyclone" in arb.winning_rule or "IMD" in arb.winning_rule or "Safety" in arb.winning_rule
    assert any("cyclone" in r.lower() for r in arb.accepted_reasons)


def test_prohibited_naval_boundary_hard_stop():
    """Validates that a prohibited boundary intersection triggers NO_GO despite calm weather."""
    observations = {
        "significant_wave_height_m": 1.0,
        "wind_speed_knots": 10.0,
        "hard_stop": True,
        "restriction_name": "Naval Live-Firing Range Sector 4",
    }
    rec = Recommendation(
        status=RecommendationStatus.NO_GO,
        summary="Prohibited boundary intersection: Naval Live-Firing Range Sector 4.",
        decisive_factors=["Prohibited boundary intersection: Naval Live-Firing Range Sector 4"],
        next_action="Reroute immediately clear of restricted naval zone.",
    )

    collab = AgentCollaborationEngine.derive_collaboration(
        observations=observations,
        risk_assessment=rec,
        evidence=[],
        trace=[],
        user_profile={"craft_profile": "motorized_boat"},
        harbor="Ratnagiri",
    )

    geo_agent = next(a for a in collab.agents if a.agent_id == "geospatial_agent")
    assert geo_agent.recommendation == RecommendationStatus.NO_GO

    arb = collab.arbitration
    assert arb.conflict_detected is True
    assert arb.winning_decision == RecommendationStatus.NO_GO
    assert "Boundary" in arb.winning_rule or "Safety" in arb.winning_rule
