"""Dev 3 Test Suite: PFZ Origin Resolution & Conversational Clarification.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Validates the 3-tier origin resolution order for spatial PFZ questions:
1. Explicit origin in current user message.
2. Valid active harbor from current ThreadContext.
3. Otherwise request clarification (DO NOT fall back to Ratnagiri or any hard-coded harbor).
"""

import uuid

from backend.app.agents.graph import run_orca_graph
from backend.app.agents.intent import IntentCategory
from backend.app.agents.llm import FakeLLMProvider
from backend.app.agents.memory import memory_manager
from backend.app.contracts.chat import RecommendationStatus


# ==============================================================================
# 1. CASE A: EXPLICIT ORIGIN IN USER MESSAGE
# ==============================================================================

def test_case_a_explicit_origin_ratnagiri():
    """Case A: User specifies explicit harbor in query ('Where is the nearest PFZ from Ratnagiri?')."""
    thread_id = f"pfz-explicit-{uuid.uuid4().hex[:6]}"
    state = run_orca_graph(
        user_message="Where is the nearest PFZ from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )

    assert state["intent"] == IntentCategory.PFZ.value
    assert state.get("origin_harbor") == "Ratnagiri"
    assert state["clarification_needed"] is False
    assert state["location"] is not None
    assert state["location"]["harbor"] == "Ratnagiri"
    assert state["location"]["coordinates"] == [73.2847, 16.9942]
    assert "pfz_stub" in state["tool_results"]
    assert len(state["evidence"]) > 0

    # Ensure thread context was updated with the explicit harbor
    ctx = memory_manager.load_context(thread_id)
    assert ctx.active_harbor == "Ratnagiri"


def test_case_a_explicit_origin_other_harbors():
    """Verify explicit origin extraction works across multiple Indian coastal harbors."""
    test_cases = [
        ("Where is the nearest PFZ from Veraval?", "Veraval", [70.3689, 20.9022]),
        ("Find the closest fishing zone from Malvan", "Malvan", [73.4658, 16.0583]),
        ("Nearest PFZ from Mumbai today", "Mumbai", [72.8258, 18.9158]),
        ("Where is the nearest PFZ from Porbandar?", "Porbandar", [69.60, 21.64]),
    ]

    for query, expected_harbor, expected_coords in test_cases:
        thread_id = f"pfz-h-{uuid.uuid4().hex[:6]}"
        state = run_orca_graph(
            user_message=query,
            thread_id=thread_id,
            tool_mode="demo",
            llm_mode="deterministic",
        )
        assert state["intent"] == IntentCategory.PFZ.value
        assert state.get("origin_harbor") == expected_harbor
        assert state["clarification_needed"] is False
        assert state["location"]["harbor"] == expected_harbor
        assert state["location"]["coordinates"] == expected_coords
        assert "pfz_stub" in state["tool_results"]


# ==============================================================================
# 2. CASE B: CONTEXT ORIGIN FROM THREADCONTEXT
# ==============================================================================

def test_case_b_context_origin_from_previous_turn():
    """Case B: User asks spatial PFZ question without origin, but ThreadContext has active_harbor."""
    thread_id = f"pfz-ctx-{uuid.uuid4().hex[:6]}"

    # Turn 1: Safety check establishes active harbor "Malvan"
    t1 = run_orca_graph(
        user_message="Is it safe to sail from Malvan tomorrow?",
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )
    assert t1.get("origin_harbor") == "Malvan" or t1["location"]["harbor"] == "Malvan"
    ctx1 = memory_manager.load_context(thread_id)
    assert ctx1.active_harbor == "Malvan"

    # Turn 2: Spatial PFZ question with NO explicit origin in message
    t2 = run_orca_graph(
        user_message="Where is the nearest PFZ?",
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )

    # Must resolve to Malvan from context, NOT default to Ratnagiri
    assert t2["intent"] == IntentCategory.PFZ.value
    assert t2.get("origin_harbor") == "Malvan"
    assert t2["clarification_needed"] is False
    assert t2["location"]["harbor"] == "Malvan"
    assert "pfz_stub" in t2["tool_results"]

    # Verify trace logs memory carry-forward
    actions = [item.action for item in t2["trace"]]
    assert any("Harbor: Malvan" in a for a in actions)


def test_case_b_context_origin_from_user_profile():
    """Case B: ThreadContext initialized with active_harbor via user profile."""
    thread_id = f"pfz-profile-{uuid.uuid4().hex[:6]}"
    state = run_orca_graph(
        user_message="Where is the nearest PFZ?",
        thread_id=thread_id,
        user_context={"active_harbor": "Veraval"},
        tool_mode="demo",
        llm_mode="deterministic",
    )

    assert state["intent"] == IntentCategory.PFZ.value
    assert state.get("origin_harbor") == "Veraval"
    assert state["clarification_needed"] is False
    assert state["location"]["harbor"] == "Veraval"
    assert "pfz_stub" in state["tool_results"]


# ==============================================================================
# 3. CASE C: MISSING ORIGIN REQUESTS CLARIFICATION
# ==============================================================================

def test_case_c_missing_origin_requests_clarification():
    """Case C: No origin in user message and no active harbor in ThreadContext.
    MUST request clarification and MUST NOT fall back to Ratnagiri.
    """
    thread_id = f"pfz-missing-{uuid.uuid4().hex[:6]}"
    state = run_orca_graph(
        user_message="Where is the nearest PFZ?",
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )

    # 1. Verification of origin resolution state
    assert state["intent"] == IntentCategory.PFZ.value
    assert state.get("origin_harbor") is None
    assert state["location"] is None
    assert state["clarification_needed"] is True
    assert "origin_harbor" in state["missing_fields"]

    # 2. Verification that NO specialist tools were executed
    assert "pfz_stub" not in state.get("tool_results", {})
    assert "marine_stub" not in state.get("tool_results", {})
    assert len(state.get("evidence", [])) == 0

    # 3. Verification of Clarification Node outputs
    assert state["response"] is not None
    assert "departure harbor" in state["response"].lower() or "harbor" in state["response"].lower()
    assert state["risk_assessment"] is not None
    assert state["risk_assessment"].status == RecommendationStatus.INFORMATIONAL
    assert len(state.get("suggested_followups", [])) > 0
    assert "Ratnagiri" in state["suggested_followups"]
    assert "Malvan" in state["suggested_followups"]

    # 4. Verification that trace contains Clarification node execution
    node_names = [item.node for item in state["trace"]]
    assert "Clarification" in node_names
    assert "Specialist Tool: pfz_stub" not in node_names


def test_no_hardcoded_ratnagiri_fallback_on_unresolved_pfz():
    """Verify that asking spatial PFZ question with missing origin NEVER defaults to Ratnagiri."""
    thread_id = f"pfz-nofallback-{uuid.uuid4().hex[:6]}"
    state = run_orca_graph(
        user_message="Can you find the nearest fishing zone?",
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )

    assert state["clarification_needed"] is True
    assert state.get("origin_harbor") is None
    assert state.get("location") is None
    # ThreadContext must remain unassigned, not polluted by Ratnagiri
    ctx = memory_manager.load_context(thread_id)
    assert ctx.active_harbor is None


# ==============================================================================
# 4. MULTI-TURN CLARIFICATION & COMPLETION FLOW
# ==============================================================================

def test_multiturn_clarification_then_origin_supply():
    """Verify Turn 1 requests clarification, Turn 2 supplies harbor, and pipeline unblocks."""
    thread_id = f"pfz-multiturn-{uuid.uuid4().hex[:6]}"

    # Turn 1: Missing origin
    t1 = run_orca_graph(
        user_message="Where is the nearest PFZ?",
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )
    assert t1["clarification_needed"] is True
    assert "pfz_stub" not in t1.get("tool_results", {})

    # Turn 2: Mariner replies with harbor name
    t2 = run_orca_graph(
        user_message="Ratnagiri",
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )

    # Turn 2 must maintain PFZ intent, resolve origin, and execute tools
    assert t2["intent"] == IntentCategory.PFZ.value
    assert t2.get("origin_harbor") == "Ratnagiri"
    assert t2["clarification_needed"] is False
    assert t2["location"]["harbor"] == "Ratnagiri"
    assert "pfz_stub" in t2["tool_results"]
    assert len(t2["evidence"]) > 0

    # Turn 3: Follow-up query carries forward Ratnagiri automatically
    t3 = run_orca_graph(
        user_message="What are the wave conditions?",
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )
    assert t3["location"]["harbor"] == "Ratnagiri"


# ==============================================================================
# 5. EXPLICIT OVERRIDE PRECEDENCE
# ==============================================================================

def test_explicit_origin_overrides_thread_context():
    """Verify explicit origin in message (Priority 1) unconditionally overrides context (Priority 2)."""
    thread_id = f"pfz-override-{uuid.uuid4().hex[:6]}"

    # Turn 1: Established harbor is Ratnagiri
    t1 = run_orca_graph(
        user_message="Where is the nearest PFZ from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )
    assert t1.get("origin_harbor") == "Ratnagiri"

    # Turn 2: Explicitly asks from Veraval
    t2 = run_orca_graph(
        user_message="Where is the nearest PFZ from Veraval?",
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )
    assert t2.get("origin_harbor") == "Veraval"
    assert t2["location"]["harbor"] == "Veraval"
    ctx = memory_manager.load_context(thread_id)
    assert ctx.active_harbor == "Veraval"


# ==============================================================================
# 6. MULTILINGUAL CLARIFICATION
# ==============================================================================

def test_multilingual_clarification_marathi():
    """Verify Marathi spatial PFZ query without harbor triggers Marathi clarification."""
    thread_id = f"pfz-mr-{uuid.uuid4().hex[:6]}"
    state = run_orca_graph(
        user_message="जवळचे PFZ कुठे आहे?",  # "Where is the nearest PFZ?" in Marathi
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )

    assert state["intent"] == IntentCategory.PFZ.value
    assert state["clarification_needed"] is True
    assert state["language"] == "mr"
    assert "प्रस्थान बंदर" in state["response"]
    assert "रत्नागिरी" in state["suggested_followups"]
    assert "मालवण" in state["suggested_followups"]


def test_multilingual_clarification_hindi():
    """Verify Hindi spatial PFZ query without harbor triggers Hindi clarification."""
    thread_id = f"pfz-hi-{uuid.uuid4().hex[:6]}"
    state = run_orca_graph(
        user_message="निकटतम मछली पकड़ने का क्षेत्र कहाँ है?",  # Nearest fishing zone in Hindi
        thread_id=thread_id,
        tool_mode="demo",
        llm_mode="deterministic",
    )

    assert state["intent"] == IntentCategory.PFZ.value
    assert state["clarification_needed"] is True
    assert state["language"] == "hi"
    assert "प्रस्थान बंदरगाह" in state["response"]


# ==============================================================================
# 7. LLM-ASSISTED PFZ FLOW WITH FAKE PROVIDER
# ==============================================================================

def test_llm_assisted_pfz_explicit_origin():
    """Verify LLM extraction populates explicit origin correctly."""
    fake_llm = FakeLLMProvider(
        canned_responses={
            "IntentExtractionResult": {
                "intent": IntentCategory.PFZ.value,
                "detected_language": "en",
                "confidence": 0.95,
                "entities": {
                    "origin_harbor": "Malpe",
                    "coordinates": [74.70, 13.35],
                    "departure_time": "now",
                },
                "missing_critical_fields": [],
                "clarification_needed": False,
            }
        }
    )

    thread_id = f"pfz-llm-exp-{uuid.uuid4().hex[:6]}"
    result = run_orca_graph(
        user_message="Where is the nearest PFZ from Malpe?",
        thread_id=thread_id,
        llm_provider=fake_llm,
        tool_mode="contract_mock",
    )

    assert result["intent"] == IntentCategory.PFZ.value
    assert result.get("origin_harbor") == "Malpe"
    assert result["clarification_needed"] is False
    assert result["location"]["harbor"] == "Malpe"


def test_llm_assisted_pfz_missing_origin_clarification():
    """Verify LLM extraction correctly routes to clarification when origin is absent."""
    fake_llm = FakeLLMProvider(
        canned_responses={
            "IntentExtractionResult": {
                "intent": IntentCategory.PFZ.value,
                "detected_language": "en",
                "confidence": 0.90,
                "entities": {},
                "missing_critical_fields": ["origin_harbor"],
                "clarification_needed": True,
                "clarification_prompt": "Please let me know which harbor you are sailing from.",
            }
        }
    )

    thread_id = f"pfz-llm-missing-{uuid.uuid4().hex[:6]}"
    result = run_orca_graph(
        user_message="Where is the nearest PFZ?",
        thread_id=thread_id,
        llm_provider=fake_llm,
        tool_mode="contract_mock",
    )

    assert result["intent"] == IntentCategory.PFZ.value
    assert result.get("origin_harbor") is None
    assert result["clarification_needed"] is True
    assert "origin_harbor" in result["missing_fields"]
    assert "Please let me know which harbor" in result["response"]
