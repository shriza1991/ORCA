"""Supervisor & Task Planning Contracts for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Defines the task planning contracts, tool dependency resolution rules,
and bounded planning policies for the Supervisor node.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.agents.intent import IntentCategory


class ToolExecutionStep(BaseModel):
    """Specification of an individual specialist tool step in an execution plan."""

    step_number: int = Field(..., description="1-indexed sequence order")
    tool_name: str = Field(..., description="Canonical tool identifier from registry")
    purpose: str = Field(..., description="Justification for running this tool")
    depends_on: List[str] = Field(
        default_factory=list,
        description="List of tool_names that must complete before this step runs",
    )
    is_parallelizable: bool = Field(
        False, description="True if step can run concurrently with other independent steps"
    )


class TaskPlan(BaseModel):
    """Structured output contract of the Supervisor / Planner node."""

    intent: IntentCategory = Field(..., description="Classified intent guiding the plan")
    steps: List[ToolExecutionStep] = Field(
        default_factory=list, description="Ordered sequence of specialist tool steps"
    )
    requires_risk_evaluation: bool = Field(
        True,
        description="True if the plan must terminate with deterministic risk evaluation",
    )
    planning_notes: Optional[str] = Field(
        None, description="Short rationale for selected tools (for telemetry, not user-facing)"
    )


# Standard canonical tool sequencing patterns by intent
STANDARD_TOOL_PLANS: Dict[IntentCategory, List[str]] = {
    IntentCategory.SAFETY: [
        "marine_weather_forecast",
        "cyclone_hazard_bulletin",
        "evaluate_safety_risk",
    ],
    IntentCategory.PFZ: [
        "fetch_pfz_advisories",
        "marine_weather_forecast",
        "compute_pfz_distances",
        "evaluate_safety_risk",
    ],
    IntentCategory.CONDITIONS: [
        "marine_weather_forecast",
        "ocean_state_observations",
    ],
    IntentCategory.HAZARDS: [
        "cyclone_hazard_bulletin",
        "check_geofence_hazards",
        "evaluate_safety_risk",
    ],
    IntentCategory.ROUTE: [
        "generate_candidate_routes",
        "marine_weather_forecast",
        "evaluate_route_exposure",
        "evaluate_safety_risk",
    ],
    IntentCategory.ANALYTICAL_EXPLANATION: [
        "fetch_active_evidence_context",
    ],
    IntentCategory.UNSUPPORTED: [],
}


def get_default_plan_for_intent(intent: IntentCategory) -> List[str]:
    """Returns the deterministic baseline tool sequence for a given intent."""
    return STANDARD_TOOL_PLANS.get(intent, []).copy()
