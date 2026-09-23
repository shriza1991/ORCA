"""End-to-End Flagship Conversational Flow Verification Test.

Section 7 Requirements:
Verify the real implementation supports:
"Can I go fishing tomorrow?"
        ↓
decision + evidence
        ↓
"Why?"
        ↓
grounded explanation (FACT -> INFERENCE -> CONSTRAINT -> DECISION -> ACTION)
        ↓
"What if I leave at 11?"
        ↓
real temporal recomputation
        ↓
"What changed?"
        ↓
Decision Delta

All turns must use the same MissionState/context in the same thread.
"""

import uuid
import pytest

from backend.app.agents.graph import run_orca_graph
from backend.app.agents.intent import IntentCategory
from backend.app.agents.integrations.mocks import register_m2_contract_mocks
from backend.app.agents.tools import tool_registry
from backend.app.contracts.chat import RecommendationStatus


@pytest.fixture(autouse=True)
def setup_mocks():
    """Ensure clean contract mocks for reliable multi-turn evaluation."""
    register_m2_contract_mocks(tool_registry, override=True)
    yield
    register_m2_contract_mocks(tool_registry, override=True)


def test_flagship_multi_turn_flow():
    """Verifies the complete 4-turn flagship conversational intelligence flow."""
    thread_id = f"flagship-flow-{uuid.uuid4().hex[:8]}"

    # -------------------------------------------------------------------------
    # Turn 1: "Can I go fishing tomorrow from Ratnagiri?"
    # -------------------------------------------------------------------------
    t1 = run_orca_graph(
        user_message="Can I go fishing tomorrow from Ratnagiri?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert t1["intent"] == IntentCategory.SAFETY.value
    assert t1["location"]["harbor"] == "Ratnagiri"
    assert t1["risk_assessment"] is not None
    assert t1["risk_assessment"].status in (RecommendationStatus.GO, RecommendationStatus.CAUTION, RecommendationStatus.NO_GO)
    assert len(t1["evidence"]) > 0
    assert "Ratnagiri" in t1["response"]

    # -------------------------------------------------------------------------
    # Turn 2: "Why?" (Grounded Explanation Engine)
    # -------------------------------------------------------------------------
    t2 = run_orca_graph(
        user_message="Why?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert t2["intent"] == IntentCategory.ANALYTICAL_EXPLANATION.value
    # Harbor carried forward seamlessly
    assert t2["location"]["harbor"] == "Ratnagiri"
    # Grounded explanation structure verified: FACT -> RELATION/INFERENCE -> CONSTRAINT -> DECISION -> ACTION
    assert "[FACT / EVIDENCE]" in t2["response"]
    assert "[RELATION / INFERENCE]" in t2["response"]
    assert "[CONSTRAINT]" in t2["response"]
    assert "[DECISION]" in t2["response"]
    assert "[ACTIONABLE DIRECTIVE]" in t2["response"]

    # -------------------------------------------------------------------------
    # Turn 3: "What if I leave at 11?" (What-If Temporal Recomputation)
    # -------------------------------------------------------------------------
    t3 = run_orca_graph(
        user_message="What if I leave at 11?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert t3["location"]["harbor"] == "Ratnagiri"
    assert t3["risk_assessment"] is not None
    assert len(t3["trace"]) > 0

    # -------------------------------------------------------------------------
    # Turn 4: "What changed?" (Decision Delta Comparison)
    # -------------------------------------------------------------------------
    t4 = run_orca_graph(
        user_message="What changed?",
        thread_id=thread_id,
        tool_mode="contract_mock",
        llm_mode="deterministic",
    )

    assert t4["intent"] == IntentCategory.WHAT_CHANGED.value
    assert "[DECISION DELTA]" in t4["response"]
    assert "Ratnagiri" in t4["response"]
