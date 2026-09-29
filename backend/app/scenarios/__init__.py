"""ORCA First-Class Canonical Scenario Framework.

Owned by Dev 3 (Agent Orchestration & Explainability) & Dev 4 (Domain Intelligence).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.
"""

from backend.app.scenarios.models import (
    PolygonType,
    ScenarioCategory,
    ScenarioDefinition,
    ScenarioExecutionResult,
    ScenarioExpectedOutcome,
    ScenarioInputData,
    ScenarioManifestItem,
    ScenarioPolygon,
)
from backend.app.scenarios.registry import (
    ADDITIONAL_EVAL_SCENARIOS,
    CANONICAL_SCENARIOS,
    get_scenario,
    get_scenario_manifest,
    list_all_scenarios,
    list_canonical_scenarios,
)
from backend.app.scenarios.runner import ScenarioRunner

__all__ = [
    "PolygonType",
    "ScenarioCategory",
    "ScenarioDefinition",
    "ScenarioExecutionResult",
    "ScenarioExpectedOutcome",
    "ScenarioInputData",
    "ScenarioManifestItem",
    "ScenarioPolygon",
    "CANONICAL_SCENARIOS",
    "ADDITIONAL_EVAL_SCENARIOS",
    "get_scenario",
    "get_scenario_manifest",
    "list_all_scenarios",
    "list_canonical_scenarios",
    "ScenarioRunner",
]
