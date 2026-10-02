"""Dev 2 Connector Registration.

Owned by Dev 2 (Backend Platform).
Registers Dev 2 connectors with the Dev 3 AgentToolRegistry.
"""

from typing import Any

from backend.app.agents.integrations.adapters import ProviderToolAdapter
from backend.app.agents.integrations.contracts import (
    CAPABILITIES_CATALOG,
    ToolInvocationContext,
    ToolOwner,
)
from backend.app.agents.tools import AgentToolRegistry, ToolDefinition
from backend.app.connectors.manager import ConnectorManager


def register_dev2_provider_tools(
    registry: AgentToolRegistry, connector_manager: ConnectorManager
) -> None:
    """Registers Dev 2 external data connectors as agent tools.

    Args:
        registry: The Dev 3 AgentToolRegistry instance.
        connector_manager: The configured Dev 2 ConnectorManager.
    """
    is_mock = False  # Set to false for provider mode (no M2 contract mocks)

    # 1. Register Marine Conditions
    marine_cap = CAPABILITIES_CATALOG["marine_conditions"]
    marine_def = ToolDefinition(
        name="marine_conditions",
        description=marine_cap.description,
        parameters=[],  # The adapter currently just pulls from ToolInvocationContext
        category="marine",
        owner=ToolOwner.DEV2,
        capability="marine_conditions",
        required_context_fields=marine_cap.required_context_fields,
        dependencies=marine_cap.dependencies,
        requires_evidence=marine_cap.requires_evidence,
        is_available=True,  # Will update below
        authority="INCOIS",
        coverage="Indian Coast",
        resolution="0.25 deg",
        freshness="Hourly",
        access="API",
        data_mode="HYBRID",
        supported_intents=["SAFETY", "ROUTE", "PFZ", "CONDITIONS", "HAZARDS", "WHAT_CHANGED", "WHAT_IF", "ALTERNATIVE", "ANALYTICAL_EXPLANATION"],
    )

    def handle_marine(**kwargs: Any) -> Any:
        context = ToolInvocationContext(**kwargs)
        return ProviderToolAdapter.adapt_marine_conditions(
            connector_manager.get_marine_conditions, context, is_mock=is_mock
        )

    registry.register_tool(marine_def, handle_marine, override=True)

    # 2. Register Weather Conditions
    weather_cap = CAPABILITIES_CATALOG["weather_conditions"]
    weather_def = ToolDefinition(
        name="weather_conditions",
        description=weather_cap.description,
        parameters=[],
        category="weather",
        owner=ToolOwner.DEV2,
        capability="weather_conditions",
        required_context_fields=weather_cap.required_context_fields,
        dependencies=weather_cap.dependencies,
        requires_evidence=weather_cap.requires_evidence,
        is_available=True,
        authority="IMD",
        coverage="Indian Coast",
        resolution="10 km",
        freshness="Hourly",
        access="API",
        data_mode="HYBRID",
        supported_intents=["SAFETY", "ROUTE", "WHAT_IF", "ALTERNATIVE", "ANALYTICAL_EXPLANATION", "WHAT_CHANGED"],
    )

    def handle_weather(**kwargs: Any) -> Any:
        context = ToolInvocationContext(**kwargs)
        return ProviderToolAdapter.adapt_weather_conditions(
            connector_manager.get_weather_conditions, context, is_mock=is_mock
        )

    registry.register_tool(weather_def, handle_weather, override=True)

    # 3. Register Hazard Search
    hazard_cap = CAPABILITIES_CATALOG["hazard_search"]
    hazard_def = ToolDefinition(
        name="hazard_search",
        description=hazard_cap.description,
        parameters=[],
        category="marine",
        owner=ToolOwner.DEV2,
        capability="hazard_search",
        required_context_fields=hazard_cap.required_context_fields,
        dependencies=hazard_cap.dependencies,
        requires_evidence=hazard_cap.requires_evidence,
        is_available=True,
        authority="IMD",
        coverage="Indian Coast",
        resolution="Point",
        freshness="Real-time",
        access="API",
        data_mode="MOCK" if is_mock else "LIVE",
        supported_intents=["SAFETY", "ROUTE", "HAZARDS", "WHAT_IF", "ALTERNATIVE", "ANALYTICAL_EXPLANATION", "WHAT_CHANGED"],
    )

    def handle_hazard(**kwargs: Any) -> Any:
        context = ToolInvocationContext(**kwargs)
        return ProviderToolAdapter.adapt_hazard_bulletin(
            connector_manager.get_hazard_bulletin, context, is_mock=is_mock
        )

    registry.register_tool(hazard_def, handle_hazard, override=True)

    # 4. Register SVAS Advisory
    svas_cap = CAPABILITIES_CATALOG["svas_advisory"]
    svas_def = ToolDefinition(
        name="svas_advisory",
        description=svas_cap.description,
        parameters=[],
        category="marine",
        owner=ToolOwner.DEV2,
        capability="svas_advisory",
        required_context_fields=svas_cap.required_context_fields,
        dependencies=svas_cap.dependencies,
        requires_evidence=svas_cap.requires_evidence,
        is_available=True,
        authority="INCOIS",
        coverage="Indian Coast",
        resolution="Point",
        freshness="Daily",
        access="API",
        data_mode="MOCK" if is_mock else "LIVE",
        supported_intents=["SAFETY", "HAZARDS"],
    )

    def handle_svas(**kwargs: Any) -> Any:
        context = ToolInvocationContext(**kwargs)
        return ProviderToolAdapter.adapt_svas_advisory(
            connector_manager.get_svas_advisories, context, is_mock=is_mock
        )

    registry.register_tool(svas_def, handle_svas, override=True)

    # 5. Availability Check (update registry capability availability)
    # The requirement is: "Connector availability must update registry capability availability."
    # Since snapshot mode is always available, and hybrid falls back to snapshot,
    # the capability is available if the manager can fulfill it. For now, it's True.
    registry.set_capability_availability("marine_conditions", True)
    registry.set_capability_availability("weather_conditions", True)
    registry.set_capability_availability("hazard_search", True)
    
    from backend.app.core.config import settings
    from backend.app.connectors.modes import DataMode
    svas_available = True
    if connector_manager.current_mode in (DataMode.LIVE, DataMode.HYBRID) and not settings.INCOIS_API_KEY:
        svas_available = False
    registry.set_capability_availability("svas_advisory", svas_available)

    # PFZ BOUNDARY requirement:
    # Expose the PFZSourceDataProvider implementation for Dev 4.
    # Do not register Dev 4's pfz_search ranking engine.
    # By passing connector_manager, Dev 4 can call connector_manager.get_pfz_raw_advisories()


def register_dev4_operational_engines(
    registry: AgentToolRegistry, connector_manager: ConnectorManager
) -> None:
    """Registers Dev 4 deterministic engines for operational provider mode."""
    is_mock = False

    from backend.app.domain.pfz import DeterministicPFZRankingEngine
    from backend.app.domain.risk_engine import DeterministicRiskEngine
    from backend.app.domain.geo_restrictions import DeterministicGeospatialEngine
    from backend.app.agents.tools import ToolDefinition, ToolParameter
    from backend.app.agents.integrations.contracts import ToolOwner, CAPABILITIES_CATALOG, ToolInvocationContext
    from backend.app.agents.integrations.adapters import ProviderToolAdapter

    # 1. PFZ Ranking
    pfz_cap = CAPABILITIES_CATALOG["pfz_search"]
    pfz_def = ToolDefinition(
        name="pfz_search",
        description=pfz_cap.description,
        parameters=[
            ToolParameter(name="origin_harbor", type_name="str", description="Departure harbor", required=True),
        ],
        category="marine",
        owner=ToolOwner.DEV4,
        capability="pfz_search",
        required_context_fields=pfz_cap.required_context_fields,
        dependencies=pfz_cap.dependencies,
        requires_evidence=pfz_cap.requires_evidence,
        is_available=True,
        authority="INCOIS",
        coverage="Indian Coast",
        resolution="Point",
        freshness="Daily",
        access="API",
        data_mode="MOCK" if is_mock else "LIVE",
        supported_intents=["PFZ"],
    )
    pfz_engine = DeterministicPFZRankingEngine()
    def handle_pfz(**kwargs: Any) -> Any:
        context = ToolInvocationContext(**kwargs)
        raw_advisories = connector_manager.get_pfz_raw_advisories(context)
        source_mode = getattr(raw_advisories, "source_data_mode", None) or getattr(connector_manager, "current_mode", None)
        if hasattr(source_mode, "value"):
            source_mode = source_mode.value
        return ProviderToolAdapter.adapt_pfz_ranking(
            pfz_engine.rank_pfz_candidates,
            context,
            raw_features=raw_advisories.features,
            is_mock=is_mock,
            source_data_mode=str(source_mode).upper() if source_mode else None,
            observed_time=getattr(raw_advisories, "bulletin_date", None),
            valid_from=getattr(raw_advisories, "bulletin_date", None),
            valid_to=getattr(raw_advisories, "valid_to", None),
        )
    registry.register_tool(pfz_def, handle_pfz, override=True)
    registry.set_capability_availability("pfz_search", True)

    # 2. Risk Evaluation
    risk_cap = CAPABILITIES_CATALOG["risk_evaluation"]
    risk_def = ToolDefinition(
        name="risk_evaluation",
        description=risk_cap.description,
        parameters=[
            ToolParameter(name="origin_harbor", type_name="str", description="Departure harbor", required=True),
            ToolParameter(name="craft_profile", type_name="str", description="Vessel class", required=True),
        ],
        category="risk",
        owner=ToolOwner.DEV4,
        capability="risk_evaluation",
        required_context_fields=risk_cap.required_context_fields,
        dependencies=risk_cap.dependencies,
        requires_evidence=risk_cap.requires_evidence,
        is_available=True,
        authority="ORCA",
        coverage="Global",
        resolution="N/A",
        freshness="Real-time",
        access="Local",
        data_mode="MOCK" if is_mock else "LIVE",
        supported_intents=["SAFETY", "ROUTE", "WHAT_IF", "ALTERNATIVE", "ANALYTICAL_EXPLANATION", "WHAT_CHANGED"],
    )
    def handle_risk(**kwargs: Any) -> Any:
        context = ToolInvocationContext(**{k: v for k, v in kwargs.items() if k not in ("observation_bundle", "bundle", "marine", "weather", "hazard")})
        marine = kwargs.get("marine")
        weather = kwargs.get("weather")
        hazard = kwargs.get("hazard")
        bundle = kwargs.get("observation_bundle") or kwargs.get("bundle")
        
        if not bundle and not marine:
            marine = connector_manager.get_marine_conditions(context)
            weather = connector_manager.get_weather_conditions(context)
            hazard = connector_manager.get_hazard_bulletin(context)

        return ProviderToolAdapter.adapt_risk_evaluation(
            DeterministicRiskEngine.evaluate,
            context,
            marine=marine,
            weather=weather,
            hazard=hazard,
            bundle=bundle,
            is_mock=is_mock,
        )
    registry.register_tool(risk_def, handle_risk, override=True)
    registry.set_capability_availability("risk_evaluation", True)

    # 2A. Trip Assessment Pipeline (Unified Dashboard/Chat)
    trip_cap = CAPABILITIES_CATALOG["trip_assessment"]
    trip_def = ToolDefinition(
        name="trip_assessment",
        description=trip_cap.description,
        parameters=[
            ToolParameter(name="origin_harbor", type_name="str", description="Departure harbor", required=False),
            ToolParameter(name="coordinates", type_name="list", description="[lon, lat]", required=False),
            ToolParameter(name="craft_profile", type_name="str", description="Vessel class", required=False, default="motorized_boat"),
            ToolParameter(name="departure_time", type_name="str", description="Departure time ISO or offset", required=False),
            ToolParameter(name="destination_id", type_name="str", description="Optional destination", required=False),
            ToolParameter(name="data_mode", type_name="str", description="Data mode", required=False),
        ],
        category="risk",
        owner=ToolOwner.DEV2,
        capability="trip_assessment",
        required_context_fields=trip_cap.required_context_fields,
        dependencies=trip_cap.dependencies,
        requires_evidence=trip_cap.requires_evidence,
        is_available=True,
        authority="ORCA",
        coverage="Global",
        resolution="N/A",
        freshness="Real-time",
        access="Local",
        data_mode="MOCK" if is_mock else "LIVE",
        supported_intents=["SAFETY"],
    )
    def handle_trip_assessment(**kwargs: Any) -> Any:
        from backend.app.services.assessment_service import AssessmentService
        from backend.app.contracts.assessment import TripAssessmentRequest
        from backend.app.agents.contracts import ToolResult, ToolStatus
        from backend.app.contracts.chat import Confidence, ConfidenceLevel
        
        request = TripAssessmentRequest(
            origin_harbor=kwargs.get("origin_harbor"),
            coordinates=kwargs.get("coordinates"),
            craft_profile=kwargs.get("craft_profile", "motorized_boat"),
            departure_time=kwargs.get("departure_time"),
            destination_id=kwargs.get("destination_id"),
            data_mode=kwargs.get("data_mode") or connector_manager.current_mode.value,
        )
        
        try:
            response = AssessmentService.assess_trip(request)
            data = {
                "source_type": "ASSESSMENT_PIPELINE",
                "recommendation": response.decision.model_dump() if not isinstance(response.decision, str) else {"status": response.decision},
                "conditions": response.conditions.model_dump() if response.conditions else {},
            }
            if not isinstance(response.decision, str):
                pass
            else:
                data["recommendation"] = {
                    "status": response.decision,
                    "summary": "Unified trip assessment completed.",
                    "decisive_factors": ["Pipeline execution"],
                    "next_action": "Check local sources.",
                }
            
            # The actual Recommendation uses RecommendationStatus, the `response.decision` is a RecommendationStatus enum.
            from backend.app.contracts.chat import Recommendation, RecommendationStatus
            rec_obj = Recommendation(
                status=response.decision,
                summary=f"Unified trip assessment: {response.decision.value}",
                decisive_factors=["Pipeline execution"],
                next_action="See full details."
            )
            data["recommendation"] = rec_obj.model_dump()

            confidence = Confidence(
                level=ConfidenceLevel.MEDIUM,
                reasons=["Generated from Unified Pipeline"],
            )
            data["confidence"] = confidence.model_dump()
            
            # Extract evidence properly
            from backend.app.contracts.chat import EvidenceItem
            evidence_items = []
            for ev in response.evidence:
                if isinstance(ev, dict):
                    evidence_items.append(
                        EvidenceItem(
                            source_name="Unified Assessment Pipeline",
                            metric_name=ev.get("issue", "risk_factor"),
                            metric_value=ev.get("details", ""),
                        )
                    )
            
            warnings = [a.get("message", "") for a in response.alerts if isinstance(a, dict)]

            return ToolResult(
                status=ToolStatus.OK,
                data=data,
                evidence=evidence_items,
                warnings=warnings,
            )
        except Exception as exc:
            from backend.app.contracts.tools import ToolErrorCode
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=[f"Trip assessment failed: {str(exc)}"],
                error_code=ToolErrorCode.UPSTREAM_FAILURE.value,
            )

    registry.register_tool(trip_def, handle_trip_assessment, override=True)
    registry.set_capability_availability("trip_assessment", True)

    # 3. Geospatial Hazard
    geo_cap = CAPABILITIES_CATALOG["geospatial_hazard"]
    geo_def = ToolDefinition(
        name="geospatial_hazard",
        description=geo_cap.description,
        parameters=[
            ToolParameter(name="origin_harbor", type_name="str", description="Departure harbor", required=True),
        ],
        category="marine",
        owner=ToolOwner.DEV4,
        capability="geospatial_hazard",
        required_context_fields=geo_cap.required_context_fields,
        dependencies=geo_cap.dependencies,
        requires_evidence=geo_cap.requires_evidence,
        is_available=True,
        authority="Flanders",
        coverage="Indian Coast",
        resolution="High",
        freshness="Monthly",
        access="Database",
        data_mode="MOCK" if is_mock else "LIVE",
        supported_intents=["ROUTE", "HAZARDS", "SAFETY", "ANALYTICAL_EXPLANATION", "WHAT_CHANGED"],
    )
    geo_engine = DeterministicGeospatialEngine()
    def handle_geo(**kwargs: Any) -> Any:
        context = ToolInvocationContext(**kwargs)
        return ProviderToolAdapter.adapt_geospatial_hazard(
            geo_engine.check_geofence_hazards,
            context,
            coordinates=kwargs.get("coordinates"),
            is_mock=is_mock,
        )
    registry.register_tool(geo_def, handle_geo, override=True)
    registry.set_capability_availability("geospatial_hazard", True)

    # 4. Route Exposure (Unavailable in Operational Mode)
    route_cap = CAPABILITIES_CATALOG["route_analysis"]
    route_def = ToolDefinition(
        name="route_analysis",
        description=route_cap.description,
        parameters=[
            ToolParameter(name="origin_harbor", type_name="str", description="Departure harbor", required=True),
            ToolParameter(name="destination", type_name="str", description="Target destination", required=True),
        ],
        category="route",
        owner=ToolOwner.DEV4,
        capability="route_analysis",
        required_context_fields=route_cap.required_context_fields,
        dependencies=route_cap.dependencies,
        requires_evidence=route_cap.requires_evidence,
        is_available=False,
        authority="ORCA",
        coverage="Global",
        resolution="N/A",
        freshness="Real-time",
        access="Local",
        data_mode="MOCK" if is_mock else "LIVE",
        supported_intents=["ROUTE", "HAZARDS"],
    )
    def handle_route(**kwargs: Any) -> Any:
        raise RuntimeError("Real route evaluator is explicitly unavailable in operational mode.")
    registry.register_tool(route_def, handle_route, override=True)
    registry.set_capability_availability("route_analysis", False)

