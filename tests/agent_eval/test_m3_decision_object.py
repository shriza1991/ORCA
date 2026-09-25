"""M3 Canonical DecisionObject and DecisionDelta Regression Suite.

Verifies:
1. SAFETY emits DecisionObject.
2. DecisionObject required fields are populated.
3. DecisionObject decision matches DeterministicRiskEngine.
4. NO_GO / unsafe result propagates correctly.
5. DecisionObject preserves evidence and provenance.
6. DecisionObject preserves confidence.
7. WHAT_CHANGED emits DecisionDelta.
8. DecisionDelta has all structured fields.
9. WHAT_IF emits structured DecisionDelta.
10. ALTERNATIVE returns structured response.
11. ALTERNATIVE never falls into demo fallback.
12. Route exposure appears when route_candidates exist.
13. Missing route candidates do not crash.
14. Missing baseline does not crash.
15. DecisionObject construction failure does not crash.
16. Existing Recommendation remains unchanged.
17. Existing flagship multi-turn flow passes.
"""

import uuid
import pytest
from unittest.mock import patch

from backend.app.agents.graph import run_orca_graph
from backend.app.agents.intent import IntentCategory
from backend.app.agents.integrations.mocks import register_m2_contract_mocks
from backend.app.agents.tools import tool_registry
from backend.app.contracts.chat import (
    ConfidenceLevel,
    Recommendation,
    RecommendationStatus,
)
from backend.app.contracts.mission import DecisionDelta, DecisionObject


@pytest.fixture(autouse=True)
def setup_mocks():
    """Ensure clean contract mocks for reliable evaluation."""
    register_m2_contract_mocks(tool_registry, override=True)
    yield
    register_m2_contract_mocks(tool_registry, override=True)


def test_safety_emits_decision_object():
    """1. Verify SAFETY query produces a canonical DecisionObject."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="Can I safely sail from Ratnagiri tomorrow morning?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert state.get("decision_object") is not None
    assert isinstance(state["decision_object"], DecisionObject)


def test_decision_object_required_fields_populated():
    """2. Verify all required Pydantic fields of DecisionObject are populated."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="Is it safe to depart Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    dob = state["decision_object"]
    assert dob.decision in (RecommendationStatus.GO, RecommendationStatus.CAUTION, RecommendationStatus.NO_GO, RecommendationStatus.UNKNOWN)
    assert dob.confidence in (ConfidenceLevel.HIGH, ConfidenceLevel.MEDIUM, ConfidenceLevel.LOW)
    assert isinstance(dob.confidence_reasons, list)
    assert dob.decisive_factor is not None and len(dob.decisive_factor) > 0
    assert isinstance(dob.supporting_factors, list)
    assert isinstance(dob.constraints_applied, list)
    assert isinstance(dob.evidence, list)
    assert isinstance(dob.inferences, list)
    assert dob.recommended_action is not None and len(dob.recommended_action) > 0
    assert dob.timestamp is not None


def test_decision_object_decision_matches_deterministic_risk_engine():
    """3. Verify DecisionObject decision strictly matches risk_assessment status."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="Check departure safety from Malpe.",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert state["decision_object"].decision == state["risk_assessment"].status


def test_no_go_unsafe_result_propagates_correctly():
    """4. Verify NO_GO verdict propagates into DecisionObject and recommendation."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    # Traditional non-motorized craft under typical coastal waves triggers NO_GO or CAUTION
    state = run_orca_graph(
        user_message="Can I go fishing from Ratnagiri in a small rowboat non-motorized boat?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert state["risk_assessment"].status in (RecommendationStatus.NO_GO, RecommendationStatus.CAUTION)
    assert state["decision_object"].decision == state["risk_assessment"].status


def test_decision_object_preserves_evidence_and_provenance():
    """5. Verify DecisionObject preserves evidence items and provenance lineage."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="Can I depart from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    dob = state["decision_object"]
    assert len(dob.evidence) > 0
    for ev in dob.evidence:
        assert ev.source_name is not None
        assert ev.evidence_id is not None


def test_decision_object_preserves_confidence():
    """6. Verify DecisionObject accurately mirrors derived confidence and reasons."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="Can I go sailing from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    dob = state["decision_object"]
    conf = state["confidence"]
    assert dob.confidence == conf.level
    assert dob.confidence_reasons == conf.reasons


def test_what_changed_emits_decision_delta():
    """7. Verify WHAT_CHANGED query produces a structured DecisionDelta."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    # Turn 1: Baseline
    run_orca_graph(
        user_message="Can I go fishing tomorrow from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    # Turn 2: What changed
    t2 = run_orca_graph(
        user_message="What changed?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert t2["intent"] == IntentCategory.WHAT_CHANGED.value
    assert t2.get("decision_delta") is not None
    assert isinstance(t2["decision_delta"], DecisionDelta)


def test_decision_delta_has_all_structured_fields():
    """8. Verify all fields of DecisionDelta schema are populated."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    run_orca_graph(
        user_message="Can I go fishing from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )
    t2 = run_orca_graph(
        user_message="What changed?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    delta = t2["decision_delta"]
    assert isinstance(delta.original_decision, RecommendationStatus)
    assert isinstance(delta.new_decision, RecommendationStatus)
    assert isinstance(delta.decision_changed, bool)
    assert isinstance(delta.added_factors, list)
    assert isinstance(delta.removed_factors, list)
    assert isinstance(delta.summary, str) and len(delta.summary) > 0


def test_what_if_emits_structured_decision_delta():
    """9. Verify WHAT_IF query emits structured DecisionDelta and DecisionObject."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    # Turn 1: Baseline
    run_orca_graph(
        user_message="Can I go fishing tomorrow from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    # Turn 2: What If
    t2 = run_orca_graph(
        user_message="What if I leave at 11?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert t2["intent"] == IntentCategory.WHAT_IF.value
    assert t2.get("decision_delta") is not None
    assert isinstance(t2["decision_delta"], DecisionDelta)
    assert t2.get("decision_object") is not None
    assert isinstance(t2["decision_object"], DecisionObject)
    assert "[What-If Comparison]" in t2["response"]


def test_alternative_returns_structured_response():
    """10. Verify ALTERNATIVE intent produces a real structured advisory."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="What is an alternative departure time or route from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert state["intent"] == IntentCategory.ALTERNATIVE.value
    assert state.get("risk_assessment") is not None
    assert state.get("decision_object") is not None
    assert "Operational Alternatives Analysis" in state["response"]


def test_alternative_never_falls_into_demo_fallback():
    """11. Verify ALTERNATIVE never falls into '[M1 DEMO DATA]' fallback."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="Suggest alternative sailing times from Ratnagiri",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert "[M1 DEMO DATA]" not in state["response"]
    assert state["risk_assessment"].status != RecommendationStatus.UNKNOWN or "No validated alternative" in state["response"]


def test_route_exposure_appears_when_route_candidates_exist():
    """12. Verify route exposure is represented in DecisionObject inferences when route candidates exist."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="Compare safe route options from Ratnagiri to Outer Bank",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    dob = state.get("decision_object")
    assert dob is not None
    if state.get("route_candidates"):
        # Corridor exposure should be surfaced in inferences or alternatives
        has_route_inference = any("route corridor" in inf.lower() for inf in dob.inferences)
        has_route_alt = any(alt.get("type") == "route" for alt in dob.alternatives)
        assert has_route_inference or has_route_alt


def test_missing_route_candidates_do_not_crash():
    """13. Verify safety evaluation without route candidates completes cleanly."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="Can I sail from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert state.get("decision_object") is not None
    assert state["response"] is not None


def test_missing_baseline_does_not_crash():
    """14. Verify WHAT_CHANGED in a fresh thread with no baseline handles gracefully."""
    fresh_thread_id = f"fresh-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="What changed?",
        thread_id=fresh_thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert state.get("decision_delta") is not None
    assert state["decision_delta"].original_decision == RecommendationStatus.UNKNOWN
    assert state["response"] is not None


def test_decision_object_construction_failure_does_not_crash():
    """15. Verify that if DecisionObject construction fails, Recommendation is preserved."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    with patch("backend.app.agents.graph.DecisionObject", side_effect=ValueError("Simulated M3 schema error")):
        state = run_orca_graph(
            user_message="Can I go fishing from Ratnagiri?",
            thread_id=thread_id,
            tool_mode="contract_mock",
            llm_mode="deterministic",
        )

        assert state["risk_assessment"] is not None
        assert state["risk_assessment"].status in (RecommendationStatus.GO, RecommendationStatus.CAUTION, RecommendationStatus.NO_GO)
        assert state.get("decision_object") is None
        assert state["response"] is not None


def test_existing_recommendation_remains_unchanged():
    """16. Verify existing Recommendation structure and compatibility bridge remain intact."""
    thread_id = f"m3-test-{uuid.uuid4().hex[:8]}"
    state = run_orca_graph(
        user_message="Can I sail from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    rec = state["risk_assessment"]
    assert isinstance(rec, Recommendation)
    assert hasattr(rec, "status")
    assert hasattr(rec, "summary")
    assert hasattr(rec, "decisive_factors")
    assert hasattr(rec, "next_action")
    assert hasattr(rec, "confidence")

    # Bridge test: to_recommendation preserves values
    dob = state["decision_object"]
    bridged_rec = dob.to_recommendation()
    assert bridged_rec.status == rec.status
    assert bridged_rec.next_action == rec.next_action


def test_existing_flagship_flow_still_passes():
    """17. Verify flagship multi-turn flow passes with M3 contracts."""
    thread_id = f"flagship-m3-{uuid.uuid4().hex[:8]}"

    # Turn 1
    t1 = run_orca_graph(
        user_message="Can I go fishing tomorrow from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )
    assert t1["decision_object"] is not None

    # Turn 2
    t2 = run_orca_graph(
        user_message="Why?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )
    assert "[FACT / EVIDENCE]" in t2["response"]

    # Turn 3
    t3 = run_orca_graph(
        user_message="What if I leave at 11?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )
    assert t3["decision_delta"] is not None

    # Turn 4
    t4 = run_orca_graph(
        user_message="What changed?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )
    assert t4["decision_delta"] is not None
    assert "[DECISION DELTA]" in t4["response"]
