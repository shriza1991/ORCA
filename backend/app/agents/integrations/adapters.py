"""Provider & Engine Tool Adapters for SAMUDRA / ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

ADAPTER ARCHITECTURE:
===============================================================================
The agent graph ONLY consumes normalized ToolResult objects.
Adapters sit between external providers (Dev 2 / Dev 4) and the LangGraph graph:
- Validates typed provider responses
- Normalizes data into ToolResult.data
- Formulates standardized EvidenceItem citations with proper quality badges
- Handles exceptions, timeouts, and missing context gracefully
- Maps errors to canonical ToolErrorCode
===============================================================================
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional

from backend.app.agents.integrations.contracts import (
    ToolErrorCode,
    ToolInvocationContext,
)
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    SVASAdvisoryPayload,
    WeatherConditionsPayload,
)
if TYPE_CHECKING:
    from backend.app.contracts.observation import ObservationBundle
from backend.app.agents.integrations.dev4 import (
    GeospatialHazardPayload,
    PFZRankingPayload,
    RiskAssessmentPayload,
    RouteExposurePayload,
)
from backend.app.contracts.chat import (
    Confidence,
    EvidenceItem,
    Recommendation,
)
from backend.app.connectors.errors import ConnectorError
from backend.app.contracts.tools import ToolResult, ToolStatus


class ProviderToolAdapter:
    """Utility class providing normalization adapters for Dev 2 and Dev 4 providers."""

    @staticmethod
    def _resolve_data_mode(is_mock: bool, source_name: str) -> str:
        if is_mock:
            return "MOCK"
        source_upper = (source_name or "").upper()
        if "UNAVAILABLE" in source_upper or "DEGRADED" in source_upper:
            return "UNAVAILABLE"
        if "SNAPSHOT" in source_upper or "HISTORICAL" in source_upper:
            return "HISTORICAL"
        if "HYBRID" in source_upper or "CACHED" in source_upper:
            return "CACHED_REAL"
        return "LIVE"

    @staticmethod
    def adapt_marine_conditions(
        provider_fn: Callable[[ToolInvocationContext], MarineConditionsPayload],
        context: ToolInvocationContext,
        is_mock: bool = False,
    ) -> ToolResult:
        """Adapts Dev 2 MarineConditionsProvider output into normalized ToolResult."""
        if not context.origin_harbor:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=["Missing required origin harbor in context."],
                error_code=ToolErrorCode.MISSING_CONTEXT.value,
            )

        try:
            payload = provider_fn(context)
            quality_flags = ["M2_CONTRACT_MOCK", "SIMULATED"] if is_mock else ["REAL_SOURCE", "OFFICIAL"]

            data_mode_val = ProviderToolAdapter._resolve_data_mode(is_mock, payload.source_name)
            lineage_val = "mock_fixture" if is_mock else getattr(payload, "bulletin_id", "live_api")
            coverage_val = payload.harbor or context.origin_harbor

            evidence = [
                EvidenceItem(
                    source_name=payload.source_name,
                    source_url=payload.source_url,
                    observed_time=payload.observed_at,
                    valid_to=payload.valid_to,
                    retrieved_at=datetime.now(timezone.utc).isoformat(),
                    metric_name="significant_wave_height",
                    metric_value=payload.significant_wave_height_m,
                    metric_unit="meters",
                    quality_flags=quality_flags,
                    coverage=coverage_val,
                    data_mode=data_mode_val,
                    lineage_id=lineage_val,
                    resolved_conflicts=getattr(payload, "resolved_conflicts", None) or [],
                )
            ]

            if payload.swell_period_sec is not None:
                evidence.append(
                    EvidenceItem(
                        source_name=payload.source_name,
                        source_url=payload.source_url,
                        observed_time=payload.observed_at,
                        valid_to=payload.valid_to,
                        retrieved_at=datetime.now(timezone.utc).isoformat(),
                        metric_name="swell_period_sec",
                        metric_value=payload.swell_period_sec,
                        metric_unit="seconds",
                        quality_flags=quality_flags,
                        coverage=coverage_val,
                        data_mode=data_mode_val,
                        lineage_id=lineage_val,
                    )
                )

            warnings = []
            if payload.source_name and (
                "[HYBRID" in payload.source_name
                or "Fallback" in payload.source_name
                or "Transient Error" in payload.source_name
            ):
                warnings.append(f"Data source degraded: {payload.source_name}")

            return ToolResult(
                status=ToolStatus.OK,
                data=payload.model_dump(),
                evidence=evidence,
                warnings=warnings,
            )

        except ConnectorError:
            raise
        except Exception as exc:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=[f"Marine conditions provider failed: {str(exc)}"],
                error_code=ToolErrorCode.UPSTREAM_FAILURE.value,
            )

    @staticmethod
    def adapt_weather_conditions(
        provider_fn: Callable[[ToolInvocationContext], WeatherConditionsPayload],
        context: ToolInvocationContext,
        is_mock: bool = False,
    ) -> ToolResult:
        """Adapts Dev 2 WeatherConditionsProvider output into normalized ToolResult."""
        if not context.origin_harbor:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=["Missing required origin harbor in context."],
                error_code=ToolErrorCode.MISSING_CONTEXT.value,
            )

        try:
            payload = provider_fn(context)
            quality_flags = ["M2_CONTRACT_MOCK", "SIMULATED"] if is_mock else ["REAL_SOURCE", "OFFICIAL"]

            data_mode_val = ProviderToolAdapter._resolve_data_mode(is_mock, payload.source_name)
            lineage_val = "mock_fixture" if is_mock else getattr(payload, "bulletin_id", "live_api")
            coverage_val = payload.harbor or context.origin_harbor

            evidence = [
                EvidenceItem(
                    source_name=payload.source_name,
                    source_url=payload.source_url,
                    observed_time=payload.observed_at,
                    valid_to=payload.valid_to,
                    retrieved_at=datetime.now(timezone.utc).isoformat(),
                    metric_name="wind_speed_knots",
                    metric_value=payload.wind_speed_knots,
                    metric_unit="knots",
                    quality_flags=quality_flags,
                    coverage=coverage_val,
                    data_mode=data_mode_val,
                    lineage_id=lineage_val,
                    resolved_conflicts=getattr(payload, "resolved_conflicts", None) or [],
                )
            ]

            warnings = []
            if payload.source_name and (
                "[HYBRID" in payload.source_name
                or "Fallback" in payload.source_name
                or "Transient Error" in payload.source_name
            ):
                warnings.append(f"Data source degraded: {payload.source_name}")

            return ToolResult(
                status=ToolStatus.OK,
                data=payload.model_dump(),
                evidence=evidence,
                warnings=warnings,
            )

        except ConnectorError:
            raise
        except Exception as exc:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=[f"Weather conditions provider failed: {str(exc)}"],
                error_code=ToolErrorCode.UPSTREAM_FAILURE.value,
            )

    @staticmethod
    def adapt_hazard_bulletin(
        provider_fn: Callable[[ToolInvocationContext], HazardBulletinPayload],
        context: ToolInvocationContext,
        is_mock: bool = False,
    ) -> ToolResult:
        """Adapts Dev 2 HazardBulletinsProvider output into normalized ToolResult."""
        if not context.origin_harbor:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=["Missing required origin harbor in context."],
                error_code=ToolErrorCode.MISSING_CONTEXT.value,
            )

        try:
            payload = provider_fn(context)
            quality_flags = ["M2_CONTRACT_MOCK", "SIMULATED"] if is_mock else ["REAL_SOURCE", "OFFICIAL"]

            data_mode_val = ProviderToolAdapter._resolve_data_mode(is_mock, payload.source_name)
            lineage_val = "mock_fixture" if is_mock else getattr(payload, "bulletin_id", "live_api")
            coverage_val = payload.harbor or context.origin_harbor

            evidence = [
                EvidenceItem(
                    source_name=payload.source_name,
                    source_url=payload.source_url,
                    valid_from=payload.valid_from,
                    valid_to=payload.valid_to,
                    retrieved_at=datetime.now(timezone.utc).isoformat(),
                    metric_name="cyclone_warning_active",
                    metric_value=payload.cyclone_warning_active,
                    quality_flags=quality_flags,
                    coverage=coverage_val,
                    data_mode=data_mode_val,
                    lineage_id=lineage_val,
                )
            ]

            warnings = []
            if payload.source_name and (
                "[HYBRID" in payload.source_name
                or "Fallback" in payload.source_name
                or "Transient Error" in payload.source_name
            ):
                warnings.append(f"Data source degraded: {payload.source_name}")

            return ToolResult(
                status=ToolStatus.OK,
                data=payload.model_dump(),
                evidence=evidence,
                warnings=warnings,
            )

        except ConnectorError:
            raise
        except Exception as exc:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=[f"Hazard bulletins provider failed: {str(exc)}"],
                error_code=ToolErrorCode.UPSTREAM_FAILURE.value,
            )

    @staticmethod
    def adapt_svas_advisory(
        provider_fn: Callable[[ToolInvocationContext], SVASAdvisoryPayload],
        context: ToolInvocationContext,
        is_mock: bool = False,
    ) -> ToolResult:
        """Adapts Dev 2 SVASAdvisoryProvider output into normalized ToolResult."""
        if not context.origin_harbor:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=["Missing required origin harbor in context."],
                error_code=ToolErrorCode.MISSING_CONTEXT.value,
            )

        try:
            payload = provider_fn(context)
            quality_flags = ["M2_CONTRACT_MOCK", "SIMULATED"] if is_mock else ["REAL_SOURCE", "OFFICIAL"]

            data_mode_val = ProviderToolAdapter._resolve_data_mode(is_mock, payload.source_name)
            lineage_val = "mock_fixture" if is_mock else getattr(payload, "bulletin_id", "live_api")
            coverage_val = payload.harbor or context.origin_harbor

            evidence = [
                EvidenceItem(
                    source_name=payload.source_name,
                    source_url=payload.source_url,
                    observed_time=payload.issued_at,
                    valid_to=payload.valid_to,
                    retrieved_at=datetime.now(timezone.utc).isoformat(),
                    metric_name="svas_safety_index",
                    metric_value=payload.safety_index if payload.safety_index is not None else 0.0,
                    quality_flags=quality_flags,
                    coverage=coverage_val,
                    data_mode=data_mode_val,
                    lineage_id=lineage_val,
                )
            ]

            warnings = []
            if payload.source_name and (
                "[HYBRID" in payload.source_name
                or "Fallback" in payload.source_name
                or "CACHED_REAL" in payload.source_name
                or "Transient Error" in payload.source_name
            ):
                warnings.append(f"Data source degraded: {payload.source_name}")

            return ToolResult(
                status=ToolStatus.OK,
                data=payload.model_dump(),
                evidence=evidence,
                warnings=warnings,
            )

        except ConnectorError:
            raise
        except Exception as exc:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=[f"SVAS advisory provider failed: {str(exc)}"],
                error_code=ToolErrorCode.UPSTREAM_FAILURE.value,
            )


    @staticmethod
    def adapt_risk_evaluation(
        engine_fn: Callable[..., RiskAssessmentPayload],
        context: ToolInvocationContext,
        marine: Optional[MarineConditionsPayload] = None,
        weather: Optional[WeatherConditionsPayload] = None,
        hazard: Optional[HazardBulletinPayload] = None,
        bundle: Optional[ObservationBundle] = None,
        is_mock: bool = False,
    ) -> ToolResult:
        """Adapts Dev 4 RiskEvaluationEngine output into normalized ToolResult."""
        try:
            if bundle is not None:
                if marine is None:
                    marine = bundle.marine
                if weather is None:
                    weather = bundle.weather
                if hazard is None:
                    hazard = bundle.hazard

            data_mode_val = "MOCK" if is_mock else "LIVE"
            
            payload = engine_fn(
                context, 
                marine=marine, 
                weather=weather, 
                hazard=hazard, 
                bundle=bundle,
                data_mode=data_mode_val
            )
            quality_flags = ["M2_CONTRACT_MOCK", "SIMULATED"] if is_mock else ["REAL_SOURCE", "DETERMINISTIC_EVAL"]

            rec = Recommendation(
                status=payload.status,
                summary=payload.summary,
                decisive_factors=payload.decisive_factors,
                non_decisive_factors=payload.non_decisive_factors,
                threshold_comparisons=payload.threshold_comparisons,
                next_action=payload.recommended_action,
                provenance=payload.provenance,
                evidence_ids=payload.evidence_ids,
                warnings=payload.warnings,
            )
            confidence = Confidence(
                level=payload.confidence_level,
                reasons=payload.confidence_reasons,
            )
            rec.confidence = confidence

            data_mode_val = "MOCK" if is_mock else "LIVE"
            lineage_val = "risk_engine_eval"
            coverage_val = context.origin_harbor or "Global"

            evidence = [
                EvidenceItem(
                    evidence_id="EV-RISK-STATUS-01",
                    source_name="SAMUDRA Risk Engine (Dev 4)",
                    retrieved_at=datetime.now(timezone.utc).isoformat(),
                    metric_name="risk_status",
                    metric_value=payload.status.value,
                    quality_flags=quality_flags,
                    coverage=coverage_val,
                    data_mode=data_mode_val,
                    lineage_id=lineage_val,
                )
            ]

            data = payload.model_dump()
            data["recommendation"] = rec.model_dump()
            data["confidence"] = confidence.model_dump()

            return ToolResult(
                status=ToolStatus.OK,
                data=data,
                evidence=evidence,
                warnings=payload.warnings,
            )

        except Exception as exc:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=[f"Risk evaluation engine failed: {str(exc)}"],
                error_code=ToolErrorCode.INVALID_RESULT.value,
            )

    @staticmethod
    def adapt_pfz_ranking(
        engine_fn: Callable[[ToolInvocationContext, List[Dict[str, Any]]], PFZRankingPayload],
        context: ToolInvocationContext,
        raw_features: List[Dict[str, Any]],
        is_mock: bool = False,
    ) -> ToolResult:
        """Adapts Dev 4 PFZRankingEngine output into normalized ToolResult."""
        try:
            payload = engine_fn(context, raw_features)
            quality_flags = ["M2_CONTRACT_MOCK", "SIMULATED"] if is_mock else ["REAL_SOURCE", "GEOSPATIAL_EVAL"]

            data_mode_val = "MOCK" if is_mock else "LIVE"
            lineage_val = "pfz_ranking_eval"
            coverage_val = context.origin_harbor or "Coastal"

            evidence: List[EvidenceItem] = []
            if payload.ranked_candidates:
                top_cand = payload.ranked_candidates[0]
                evidence.append(
                    EvidenceItem(
                        source_name="PFZ Ranking Engine (Dev 4)",
                        retrieved_at=datetime.now(timezone.utc).isoformat(),
                        metric_name="pfz_distance_nm",
                        metric_value=top_cand.distance_nautical_miles,
                        metric_unit="nautical_miles",
                        quality_flags=quality_flags,
                        coverage=coverage_val,
                        data_mode=data_mode_val,
                        lineage_id=lineage_val,
                    )
                )

            return ToolResult(
                status=ToolStatus.OK,
                data=payload.model_dump(),
                evidence=evidence,
                warnings=[],
            )

        except Exception as exc:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=[f"PFZ ranking engine failed: {str(exc)}"],
                error_code=ToolErrorCode.UPSTREAM_FAILURE.value,
            )

    @staticmethod
    def adapt_route_exposure(
        engine_fn: Callable[[ToolInvocationContext, MarineConditionsPayload, str], RouteExposurePayload],
        context: ToolInvocationContext,
        marine: MarineConditionsPayload,
        destination: str,
        is_mock: bool = False,
    ) -> ToolResult:
        """Adapts Dev 4 RouteExposureEngine output into normalized ToolResult."""
        try:
            payload = engine_fn(context, marine, destination)
            quality_flags = ["M2_CONTRACT_MOCK", "SIMULATED"] if is_mock else ["REAL_SOURCE", "ROUTE_EVAL"]

            data_mode_val = "MOCK" if is_mock else "LIVE"
            lineage_val = "route_exposure_eval"
            coverage_val = f"{context.origin_harbor} to {destination}"

            evidence = [
                EvidenceItem(
                    source_name="Route Exposure Engine (Dev 4)",
                    retrieved_at=datetime.now(timezone.utc).isoformat(),
                    metric_name="recommended_route_id",
                    metric_value=payload.recommended_route_id,
                    quality_flags=quality_flags,
                    coverage=coverage_val,
                    data_mode=data_mode_val,
                    lineage_id=lineage_val,
                )
            ]

            return ToolResult(
                status=ToolStatus.OK,
                data=payload.model_dump(),
                evidence=evidence,
                warnings=[],
            )

        except Exception as exc:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=[f"Route exposure engine failed: {str(exc)}"],
                error_code=ToolErrorCode.UPSTREAM_FAILURE.value,
            )

    @staticmethod
    def adapt_geospatial_hazard(
        engine_fn: Callable[[ToolInvocationContext, List[float]], GeospatialHazardPayload],
        context: ToolInvocationContext,
        coordinates: Optional[List[float]] = None,
        is_mock: bool = False,
    ) -> ToolResult:
        """Adapts Dev 4 GeospatialHazardEngine output into normalized ToolResult."""
        try:
            coords = coordinates or context.coordinates or [73.28, 16.99]
            payload = engine_fn(context, coords)
            quality_flags = ["M2_CONTRACT_MOCK", "SIMULATED"] if is_mock else ["REAL_SOURCE", "GEOSPATIAL_EVAL"]

            data_mode_val = "MOCK" if is_mock else "LIVE"
            lineage_val = "geospatial_hazard_eval"
            coverage_val = f"Coords: {coords}" if coords else (context.origin_harbor or "Unknown")

            evidence = [
                EvidenceItem(
                    source_name="Geospatial Hazard Engine (Dev 4)",
                    retrieved_at=datetime.now(timezone.utc).isoformat(),
                    metric_name="geofence_intersection",
                    metric_value=str(payload.intersected),
                    quality_flags=quality_flags,
                    coverage=coverage_val,
                    data_mode=data_mode_val,
                    lineage_id=lineage_val,
                )
            ]
            if payload.distance_to_boundary_km is not None:
                evidence.append(
                    EvidenceItem(
                        source_name="Geospatial Hazard Engine (Dev 4)",
                        retrieved_at=datetime.now(timezone.utc).isoformat(),
                        metric_name="distance_to_boundary_km",
                        metric_value=payload.distance_to_boundary_km,
                        metric_unit="km",
                        quality_flags=quality_flags,
                        coverage=coverage_val,
                        data_mode=data_mode_val,
                        lineage_id=lineage_val,
                    )
                )

            return ToolResult(
                status=ToolStatus.OK,
                data=payload.model_dump(),
                evidence=evidence,
                warnings=[],
            )

        except Exception as exc:
            return ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=[f"Geospatial hazard engine failed: {str(exc)}"],
                error_code=ToolErrorCode.UPSTREAM_FAILURE.value,
            )

