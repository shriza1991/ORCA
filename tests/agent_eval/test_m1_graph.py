"""Milestone M1 Executable Graph Tests for ORCA.

Validates the first end-to-end vertical slice of the Bounded Agent Graph:
1. PFZ vertical slice flow (Where is the nearest PFZ?)
2. SAFETY vertical slice flow (Is it safe to go fishing tomorrow?)
3. CONDITIONS vertical slice flow (What are the wave conditions?)
4. UNSUPPORTED query flow (Tell me a joke / non-marine queries)
5. Tool registry integration and telemetry logging
6. Evidence validation coverage gate
7. Deterministic safety status invariance
8. Sanitized execution trace generation (no private CoT)
9. Graph termination guarantee
"""

import pytest

from backend.app.agents.graph import run_orca_graph
from backend.app.agents.intent import IntentCategory
from backend.app.agents.response import ResponseComposer, ResponseCompositionInput
from backend.app.agents.tools import tool_registry
from backend.app.contracts.chat import (
    Confidence,
    ConfidenceLevel,
    Recommendation,
    RecommendationStatus,
)


def test_m1_pfz_vertical_slice():
    """Verify S1: 'Where is the nearest PFZ?' executes end-to-end through the graph."""
    query = "Where is the nearest PFZ from Ratnagiri?"
    state = run_orca_graph(user_message=query, thread_id="test-pfz-thread")

    # 1. Intent & Locale
    assert state["intent"] == IntentCategory.PFZ.value
    assert state["language"] == "en"

    # 2. Supervisor & TaskPlan
    assert "pfz_stub" in state["task_plan"]

    # 3. Specialist Tool Results
    assert "pfz_stub" in state["tool_results"]
    assert state["tool_results"]["pfz_stub"]["candidates_found"] >= 1
    assert "candidates_found" in state["observations"]

    # 4. Evidence
    assert len(state["evidence"]) >= 1
    assert any(ev.metric_name == "pfz_distance_nm" for ev in state["evidence"])
    assert any("M1_DEMO_DATA" in ev.quality_flags for ev in state["evidence"])

    # 5. Response & Trace
    assert state["response"] is not None
    assert "Potential Fishing Zone" in state["response"]
    assert "M1 DEMO DATA" in state["response"]
    assert len(state["trace"]) >= 6

    # 6. Verify all nodes in trace
    node_names = [item.node for item in state["trace"]]
    assert "Intent / Locale" in node_names
    assert "Supervisor / Planner" in node_names
    assert any("Specialist Tool" in n for n in node_names)
    assert "Evidence Validator" in node_names
    assert "Response Composer" in node_names
    assert "Terminal" in node_names


def test_m1_safety_vertical_slice():
    """Verify S2: 'Is it safe to go fishing tomorrow?' executes through the risk evaluator."""
    query = "Is it safe to go fishing tomorrow morning from Ratnagiri?"
    state = run_orca_graph(
        user_message=query,
        thread_id="test-safety-thread",
        user_context={"craft_profile": "motorized_boat"},
    )

    # 1. Intent
    assert state["intent"] == IntentCategory.SAFETY.value

    # 2. Supervisor TaskPlan
    assert "marine_stub" in state["task_plan"]
    assert "weather_stub" in state["task_plan"]
    assert "risk_stub" in state["task_plan"]

    # 3. Observations collected
    assert state["observations"]["significant_wave_height_m"] == 1.8
    assert state["observations"]["wind_speed_knots"] == 16.0

    # 4. Deterministic Risk Assessment
    rec = state["risk_assessment"]
    assert rec is not None
    assert rec.status == RecommendationStatus.CAUTION
    assert len(rec.decisive_factors) >= 2
    assert "1.8m" in rec.decisive_factors[0]

    # 5. Response reflects exact status
    assert state["response"].startswith("[CAUTION]")
    assert "M1 simulated" in state["response"] or "M1 demonstration" in state["response"]


def test_m1_conditions_vertical_slice():
    """Verify S3: 'What are the wave conditions?' queries marine observations."""
    query = "What are the wave conditions tomorrow around Ratnagiri?"
    state = run_orca_graph(user_message=query, thread_id="test-conditions-thread")

    assert state["intent"] == IntentCategory.CONDITIONS.value
    assert "marine_stub" in state["task_plan"]
    assert state["observations"]["significant_wave_height_m"] == 1.8
    assert "Wave Height: 1.8 meters" in state["response"]


def test_m1_unsupported_query():
    """Verify S4: Unsupported input triggers no tools and returns graceful guidance."""
    query = "Tell me a joke about dogs."
    state = run_orca_graph(user_message=query, thread_id="test-unsupported-thread")

    assert state["intent"] == IntentCategory.UNSUPPORTED.value
    assert state["task_plan"] == []
    assert state["tool_results"] == {}
    assert "ORCA is focused exclusively on marine intelligence" in state["response"]


def test_m1_tool_registry_execution():
    """Verify tools are dispatched through AgentToolRegistry and record telemetry."""
    # List registered stub tools
    tools = tool_registry.list_tools()
    tool_names = [t.name for t in tools]
    assert "pfz_stub" in tool_names
    assert "marine_stub" in tool_names
    assert "weather_stub" in tool_names
    assert "risk_stub" in tool_names

    # Check telemetry history is populated
    history = tool_registry.execution_history
    assert len(history) > 0
    latest = history[-1]
    assert latest.duration_ms >= 0.0
    assert latest.status.value in ["ok", "failed", "partial"]


def test_m1_evidence_validation():
    """Verify evidence validation gate confirms presence of citations."""
    state = run_orca_graph(user_message="Where is the nearest PFZ from Ratnagiri?", thread_id="test-ev-thread")
    assert len(state["evidence"]) > 0

    # Ensure evidence source matches simulated tag
    for ev in state["evidence"]:
        assert "M1_DEMO_DATA" in ev.quality_flags
        assert "SIMULATED" in ev.quality_flags


def test_m1_safety_invariance():
    """Verify response composer cannot override a deterministic CAUTION or NO_GO recommendation."""
    original_rec = Recommendation(
        status=RecommendationStatus.NO_GO,
        summary="Severe 3.5m waves prohibit safe departure.",
        decisive_factors=["3.5m wave height"],
        next_action="Stay in port.",
    )

    comp_input = ResponseCompositionInput(
        run_id="run-inv-1",
        conversation_id="conv-inv-1",
        language="en",
        intent="SAFETY",
        recommendation=original_rec,
        confidence=Confidence(level=ConfidenceLevel.HIGH, reasons=["Simulated"]),
    )

    # Valid response preserves NO_GO
    valid = ResponseComposer.build_chat_response(
        composition_input=comp_input,
        synthesized_answer="[NO_GO] Conditions are hazardous.",
    )
    assert valid.recommendation.status == RecommendationStatus.NO_GO

    # Tampered response changing NO_GO -> GO triggers safety exception
    tampered_rec = Recommendation(
        status=RecommendationStatus.GO,
        summary="Tampered to GO",
        decisive_factors=[],
        next_action="Go anyway",
    )
    tampered_resp = valid.model_copy(update={"recommendation": tampered_rec})

    with pytest.raises(ValueError, match="SAFETY INVARIANT VIOLATION"):
        ResponseComposer.validate_safety_invariance(tampered_resp, original_rec)


def test_m1_trace_generation():
    """Verify trace events are sequential, sanitized, and contain no private CoT."""
    state = run_orca_graph(user_message="Is it safe to go fishing tomorrow?", thread_id="test-trace-thread")
    trace = state["trace"]

    assert len(trace) >= 6
    steps = [item.step for item in trace]
    assert steps == list(range(1, len(trace) + 1))

    # Assert no private chain-of-thought tokens
    for item in trace:
        assert "<think>" not in item.action
        assert "thought:" not in item.action.lower()
        assert item.status == "completed"


def test_m1_graph_terminates():
    """Verify graph reaches terminal node deterministically without cycles."""
    state = run_orca_graph(user_message="Which route is safer?", thread_id="test-term-thread")

    assert state["intent"] == IntentCategory.ROUTE.value
    assert state["response"] is not None
    assert state["trace"][-1].node == "Terminal"
    assert "finalized" in state["trace"][-1].action
