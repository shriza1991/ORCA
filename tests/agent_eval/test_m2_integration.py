"""M2 Integration Test Suite — Integration Contracts, Tool Interfaces & Orchestration Hardening.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Validates:
1. ToolDefinition ownership (Dev 2, Dev 3, Dev 4) and capability metadata.
2. Capability discovery, availability checks, and catalog consistency.
3. ProviderToolAdapter normalization for Dev 2 (data) and Dev 4 (intelligence) providers.
4. Contract mock registration, execution, and deterministic payload adherence.
5. Evidence provenance tracking with M2_CONTRACT_MOCK quality flags.
6. Error handling semantics: MISSING_CONTEXT, TOOL_UNAVAILABLE, UPSTREAM_FAILURE.
7. LangGraph execution in tool_mode="contract_mock" with dependency ordering.
8. Safety invariance preservation under contract mocks.
9. Execution trace telemetry without leaking private CoT.
10. Backward compatibility with M1 tool_mode="demo".
"""


from backend.app.contracts.chat import (
    ConfidenceLevel,
    EvidenceItem,
    RecommendationStatus,
)
from backend.app.contracts.tools import ToolResult, ToolStatus
from backend.app.agents.intent import IntentCategory
from backend.app.agents.graph import (
    run_orca_graph,
)
from backend.app.agents.integrations import (
    MockHazardProvider,
    MockMarineConditionsProvider,
    MockPFZRankingEngine,
    MockPFZSourceProvider,
    MockRiskEngine,
    MockRouteExposureEngine,
    MockWeatherProvider,
    ProviderToolAdapter,
    ToolErrorCode,
    ToolInvocationContext,
    ToolOwner,
    register_m2_contract_mocks,
)
from backend.app.agents.tools import (
    AgentToolRegistry,
    ToolDefinition,
    ToolParameter,
)


# =============================================================================
# Test 1: ToolDefinition Ownership and Capability Metadata
# =============================================================================

def test_tool_definition_has_owner_and_capability():
    """Verify ToolDefinition carries explicit Dev ownership, capability tags, and context requirements."""
    tool = ToolDefinition(
        name="marine_conditions",
        description="Retrieves sea surface observations from INCOIS",
        category="marine",
        owner=ToolOwner.DEV2,
        capability="marine_conditions",
        parameters=[ToolParameter(name="origin_harbor", type_name="str", description="Harbor name", required=True)],
        required_context_fields=["origin_harbor"],
        dependencies=[],
        requires_evidence=True,
    )

    assert tool.owner == ToolOwner.DEV2
    assert tool.capability == "marine_conditions"
    assert "origin_harbor" in tool.required_context_fields
    assert tool.is_available is True
    assert tool.requires_evidence is True


# =============================================================================
# Test 2: ToolDefinition Validation
# =============================================================================

def test_tool_definition_validation():
    """Verify ToolDefinition validates fields properly and allows custom ownership."""
    tool_dev4 = ToolDefinition(
        name="risk_evaluation",
        description="Deterministic risk calculation",
        category="risk",
        owner=ToolOwner.DEV4,
        capability="risk_evaluation",
        parameters=[ToolParameter(name="origin_harbor", type_name="str", description="Harbor name", required=True)],
        required_context_fields=["origin_harbor", "craft_profile"],
        dependencies=["marine_conditions"],
        requires_evidence=True,
    )

    assert tool_dev4.owner == ToolOwner.DEV4
    assert "marine_conditions" in tool_dev4.dependencies
    assert len(tool_dev4.required_context_fields) == 2


# =============================================================================
# Test 3: ToolResult Serialization with M2 Fields
# =============================================================================

def test_tool_result_serialization_with_m2_fields():
    """Verify ToolResult serializes status, data, evidence citations, warnings, and error_code."""
    result = ToolResult(
        status=ToolStatus.FAILED,
        data={},
        evidence=[],
        warnings=["Upstream INCOIS gateway timeout."],
        error_code=ToolErrorCode.UPSTREAM_FAILURE.value,
    )

    result_dict = result.model_dump()
    assert result_dict["status"] == "failed"
    assert result_dict["error_code"] == "UPSTREAM_FAILURE"
    assert len(result_dict["warnings"]) == 1
    assert result_dict["data"] == {}


# =============================================================================
# Test 4: Capability Discovery and Dynamic Availability
# =============================================================================

def test_capability_discovery_and_registration():
    """Verify capability catalog listing, status checks, and dynamic availability toggling."""
    registry = AgentToolRegistry()
    register_m2_contract_mocks(registry)

    # 1. Discover registered capabilities
    capabilities = registry.list_capabilities()
    assert "marine_conditions" in capabilities
    assert "weather_conditions" in capabilities
    assert "hazard_search" in capabilities
    assert "risk_evaluation" in capabilities
    assert "pfz_search" in capabilities
    assert "route_analysis" in capabilities

    # 2. Check all are initially available
    assert registry.is_capability_available("marine_conditions") is True
    assert registry.get_unavailable_capabilities(["marine_conditions", "risk_evaluation"]) == []

    # 3. Dynamically mark capability unavailable
    registry.set_capability_availability("marine_conditions", False)
    assert registry.is_capability_available("marine_conditions") is False
    assert "marine_conditions" in registry.get_unavailable_capabilities(["marine_conditions", "risk_evaluation"])

    # 4. Restore capability
    registry.set_capability_availability("marine_conditions", True)
    assert registry.is_capability_available("marine_conditions") is True


# =============================================================================
# Test 5: Contract Mocks Registration
# =============================================================================

def test_contract_mocks_registration():
    """Verify register_m2_contract_mocks properly configures tools with correct owners and contracts."""
    registry = AgentToolRegistry()
    register_m2_contract_mocks(registry)

    tools = registry.list_tools()
    assert len(tools) >= 6

    # Verify Dev 2 tools
    marine_tool = registry.get_tool("marine_conditions")
    assert marine_tool is not None
    assert marine_tool.owner == ToolOwner.DEV2
    assert marine_tool.capability == "marine_conditions"

    hazard_tool = registry.get_tool("hazard_search")
    assert hazard_tool is not None
    assert hazard_tool.owner == ToolOwner.DEV2

    # Verify Dev 4 tools
    risk_tool = registry.get_tool("risk_evaluation")
    assert risk_tool is not None
    assert risk_tool.owner == ToolOwner.DEV4
    assert "marine_conditions" in risk_tool.dependencies

    route_tool = registry.get_tool("route_analysis")
    assert route_tool is not None
    assert route_tool.owner == ToolOwner.DEV4


# =============================================================================
# Test 6: Mock Dev 2 Tools Execution
# =============================================================================

def test_mock_dev2_tools_execution():
    """Verify execution of mock Dev 2 data providers returns valid schemas and tags."""
    marine_provider = MockMarineConditionsProvider()
    weather_provider = MockWeatherProvider()
    hazard_provider = MockHazardProvider()
    pfz_source_provider = MockPFZSourceProvider()

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")

    # 1. Marine Conditions
    marine_data = marine_provider.get_marine_conditions(ctx)
    assert marine_data.harbor == "Ratnagiri"
    assert marine_data.significant_wave_height_m > 0
    assert marine_data.sea_surface_temp_c > 0

    # 2. Weather Conditions
    weather_data = weather_provider.get_weather_conditions(ctx)
    assert weather_data.harbor == "Ratnagiri"
    assert weather_data.wind_speed_knots >= 0
    assert weather_data.visibility_km == 10.0

    # 3. Hazard Bulletins
    hazard_data = hazard_provider.get_hazard_bulletin(ctx)
    assert hazard_data.harbor == "Ratnagiri"
    assert hazard_data.cyclone_warning_active is False
    assert hazard_data.bulletin_id == "IMD-MOCK-ALERT-01"

    # 4. PFZ Source Data
    pfz_source = pfz_source_provider.get_pfz_raw_advisories(ctx)
    assert len(pfz_source.features) >= 1


# =============================================================================
# Test 7: Mock Dev 4 Tools Execution
# =============================================================================

def test_mock_dev4_tools_execution():
    """Verify execution of mock Dev 4 engines returns deterministic decisions and ranking."""
    marine_provider = MockMarineConditionsProvider()
    weather_provider = MockWeatherProvider()
    hazard_provider = MockHazardProvider()
    risk_engine = MockRiskEngine()
    pfz_ranking_engine = MockPFZRankingEngine()
    route_engine = MockRouteExposureEngine()

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    marine = marine_provider.get_marine_conditions(ctx)
    weather = weather_provider.get_weather_conditions(ctx)
    hazard = hazard_provider.get_hazard_bulletin(ctx)

    # 1. Risk Evaluation
    risk_assessment = risk_engine.evaluate_risk(ctx, marine, weather, hazard)
    assert risk_assessment.status in [RecommendationStatus.GO, RecommendationStatus.CAUTION, RecommendationStatus.NO_GO]
    assert len(risk_assessment.decisive_factors) >= 1
    assert risk_assessment.confidence_level == ConfidenceLevel.MEDIUM
    assert any("demonstration" in reason.lower() for reason in risk_assessment.confidence_reasons)
    assert any(prov.data_mode in ("MOCK", "DEMO", "M2_CONTRACT_MOCK") for prov in risk_assessment.provenance)

    # 2. PFZ Ranking
    pfz_ranking = pfz_ranking_engine.rank_pfz_candidates(ctx, [])
    assert len(pfz_ranking.ranked_candidates) >= 1
    top_candidate = pfz_ranking.ranked_candidates[0]
    assert top_candidate.distance_nautical_miles > 0
    assert top_candidate.rank == 1

    # 3. Route Analysis
    route_exposure = route_engine.evaluate_routes(ctx, marine, "Outer Bank")
    assert len(route_exposure.routes) >= 1
    assert route_exposure.recommended_route_id == "ROUTE-A-INSHORE"


# =============================================================================
# Test 8: ProviderToolAdapter Normalization
# =============================================================================

def test_provider_tool_adapter_normalizes_output():
    """Verify ProviderToolAdapter normalizes provider objects into ToolResults."""
    marine_prov = MockMarineConditionsProvider()
    ctx = ToolInvocationContext(origin_harbor="Veraval")

    # Invoke adapter function
    res = ProviderToolAdapter.adapt_marine_conditions(marine_prov.get_marine_conditions, ctx, is_mock=True)
    assert isinstance(res, ToolResult)
    assert res.status == ToolStatus.OK
    assert res.data["harbor"] == "Veraval"
    assert "significant_wave_height_m" in res.data
    assert len(res.evidence) >= 1


# =============================================================================
# Test 9: Evidence Provenance through Adapter
# =============================================================================

def test_evidence_provenance_through_adapter():
    """Verify all evidence citations produced by adapters carry M2_CONTRACT_MOCK quality flags."""
    weather_prov = MockWeatherProvider()
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")

    res = ProviderToolAdapter.adapt_weather_conditions(weather_prov.get_weather_conditions, ctx, is_mock=True)
    assert len(res.evidence) >= 1

    for ev in res.evidence:
        assert isinstance(ev, EvidenceItem)
        assert "M2_CONTRACT_MOCK" in ev.quality_flags
        assert "SIMULATED" in ev.quality_flags
        assert ev.retrieved_at is not None


# =============================================================================
# Test 10: Missing Context Handling
# =============================================================================

def test_missing_context_handling():
    """Verify tool execution fails gracefully when required context fields are missing."""
    registry = AgentToolRegistry()
    register_m2_contract_mocks(registry)

    # marine_conditions requires 'origin_harbor'
    res = registry.execute_tool("marine_conditions", {})
    assert res.status == ToolStatus.FAILED
    assert res.error_code == ToolErrorCode.MISSING_CONTEXT.value
    assert "missing required context fields" in res.warnings[0]


# =============================================================================
# Test 11: Unavailable Capability Handling in Registry and Graph
# =============================================================================

def test_unavailable_capability_handling():
    """Verify registry rejects unavailable tool and graph aborts dispatch safely."""
    registry = AgentToolRegistry()
    register_m2_contract_mocks(registry)

    # Disable risk_evaluation
    registry.set_capability_availability("risk_evaluation", False)

    res = registry.execute_tool("risk_evaluation", {"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat"})
    assert res.status == ToolStatus.FAILED
    assert res.error_code == ToolErrorCode.TOOL_UNAVAILABLE.value

    # Re-enable
    registry.set_capability_availability("risk_evaluation", True)


def test_unavailable_capability_in_orca_graph():
    """Verify supervisor detects missing capability and composer returns safe UNKNOWN advisory."""
    from backend.app.agents.tools import tool_registry

    # Register contract mocks into global registry
    register_m2_contract_mocks(tool_registry)

    # Disable weather capability
    tool_registry.set_capability_availability("weather_conditions", False)

    try:
        final_state = run_orca_graph(
            user_message="Is it safe to go fishing tomorrow from Ratnagiri?",
            tool_mode="contract_mock",
        )

        assert final_state["risk_assessment"].status == RecommendationStatus.UNKNOWN
        assert "unavailable" in final_state["response"].lower()
        assert final_state["confidence"].level == ConfidenceLevel.LOW
    finally:
        # Restore availability
        tool_registry.set_capability_availability("weather_conditions", True)


# =============================================================================
# Test 12: Tool Failure Handling (Upstream / Execution)
# =============================================================================

def test_tool_failure_handling():
    """Verify execution error in tool handler produces ToolStatus.FAILED without unhandled crash."""
    registry = AgentToolRegistry()

    def faulty_handler(**kwargs):
        raise RuntimeError("Simulated internal gateway crash")

    registry.register_tool(
        ToolDefinition(
            name="faulty_tool",
            description="Faulty test tool",
            category="test",
            owner=ToolOwner.DEV2,
            capability="test_fault",
            parameters=[],
        ),
        faulty_handler,
    )

    res = registry.execute_tool("faulty_tool", {})
    assert res.status == ToolStatus.FAILED
    assert res.error_code == "RuntimeError"
    assert "Simulated internal gateway crash" in res.warnings[0]


# =============================================================================
# Test 13: Partial Result Handling
# =============================================================================

def test_partial_result_handling():
    """Verify partial data returns PARTIAL_DATA error code and records warning."""
    result = ToolResult(
        status=ToolStatus.PARTIAL,
        data={"wave_height_m": 1.2},
        evidence=[
            EvidenceItem(
                source_name="INCOIS",
                metric_name="significant_wave_height",
                metric_value=1.2,
                metric_unit="meters",
                quality_flags=["M2_CONTRACT_MOCK"],
            )
        ],
        warnings=["Current velocity sensor offline, returning wave data only."],
        error_code=ToolErrorCode.PARTIAL_DATA.value,
    )

    assert result.status == ToolStatus.PARTIAL
    assert result.error_code == "PARTIAL_DATA"
    assert len(result.warnings) == 1
    assert "offline" in result.warnings[0]


# =============================================================================
# Test 14: Dependency Ordering Enforced in TaskPlan
# =============================================================================

def test_dependency_ordering_enforced():
    """Verify supervisor constructs task plan respecting dependencies (e.g. marine before risk)."""
    from backend.app.agents.tools import tool_registry

    register_m2_contract_mocks(tool_registry)

    final_state = run_orca_graph(
        user_message="Is it safe to sail from Ratnagiri tomorrow morning?",
        tool_mode="contract_mock",
    )

    task_plan = final_state.get("task_plan", [])
    assert "marine_conditions" in task_plan
    assert "risk_evaluation" in task_plan

    marine_idx = task_plan.index("marine_conditions")
    risk_idx = task_plan.index("risk_evaluation")
    assert marine_idx < risk_idx, "marine_conditions must execute before risk_evaluation"


# =============================================================================
# Test 15: Execution Trace Records Tool Ownership and Telemetry
# =============================================================================

def test_trace_records_tool_ownership_and_telemetry():
    """Verify execution trace logs tool executions without leaking private reasoning."""
    from backend.app.agents.tools import tool_registry

    register_m2_contract_mocks(tool_registry)

    final_state = run_orca_graph(
        user_message="Where is the nearest PFZ zone from Ratnagiri?",
        tool_mode="contract_mock",
    )

    trace = final_state.get("trace", [])
    assert len(trace) >= 6

    # Verify trace nodes
    nodes_executed = [item.node for item in trace]
    assert "Intent / Locale" in nodes_executed
    assert "Supervisor / Planner" in nodes_executed
    assert "Evidence Validator" in nodes_executed
    assert "Response Composer" in nodes_executed
    assert "Terminal" in nodes_executed

    # Verify no private thoughts leaked in action text
    for item in trace:
        action_lower = item.action.lower()
        assert "private_cot" not in action_lower
        assert "hidden_prompt" not in action_lower


# =============================================================================
# Test 16: Backward Compatibility with M1 Demo Tools
# =============================================================================

def test_backward_compatibility_m1_demo_tools():
    """Verify run_orca_graph with default tool_mode='demo' continues executing M1 stubs."""
    final_state = run_orca_graph(
        user_message="What are the wave conditions in Ratnagiri?",
        tool_mode="demo",
    )

    assert final_state["intent"] == IntentCategory.CONDITIONS.value
    assert "M1 DEMO DATA" in final_state["response"]
    assert len(final_state["evidence"]) >= 1
    assert any("INCOIS" in ev.source_name for ev in final_state["evidence"])
