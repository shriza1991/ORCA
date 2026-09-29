"""Agent Evaluation Schema & Test Case Definitions for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Defines the structure for future evaluation test cases to benchmark:
- Intent classification accuracy
- Language & locale detection
- Tool selection planning
- Safety decision immutability
- Evidence claim backing
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.agents.intent import IntentCategory
from backend.app.contracts.chat import RecommendationStatus


class AgentEvalCase(BaseModel):
    """Normalized evaluation test fixture specification."""

    case_id: str = Field(..., description="Unique test case identifier (e.g. 'EVAL-S1-NORMAL')")
    scenario_ref: Optional[str] = Field(None, description="Reference canonical scenario (S1 - S8)")
    query: str = Field(..., description="Natural language user input string")
    context: Optional[Dict[str, Any]] = Field(
        default_factory=dict, description="Session context (origin harbor, craft profile, etc.)"
    )
    expected_language: str = Field("en", description="Expected detected ISO language code")
    expected_intent: IntentCategory = Field(..., description="Expected classified IntentCategory")
    expected_tools: List[str] = Field(
        default_factory=list, description="List of specialist tool identifiers that should be scheduled"
    )
    expected_safety_behavior: RecommendationStatus = Field(
        ..., description="Expected deterministic safety recommendation status (GO/CAUTION/NO_GO/UNKNOWN)"
    )
    expected_evidence_requirements: List[str] = Field(
        default_factory=list, description="List of metric names that must be substantiated by evidence"
    )
    is_implemented: bool = Field(
        False, description="Flag indicating if M1 agent pipeline implementation is active for this case"
    )
    notes: Optional[str] = Field(None, description="Evaluation rationale, edge conditions, or testing notes")
