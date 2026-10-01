"""Provider & Engine Tool Adapters for ORCA.

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
    def _resolve_data_mode(is_mock: bool, payload: Any, freshness: Optional[Dict[str, Any]] = None) -> str:
        if is_mock:
            return "MOCK"
        freshness = freshness if isinstance(freshness, dict) else (getattr(payload, "freshness_flags", None) or {})

        # 1. Authoritative structured metadata from payload and freshness_flags
        raw_dm = freshness.get("data_mode") or getattr(payload, "data_mode", None)
        cov_status = str(getattr(payload, "coverage_status", None) or freshness.get("coverage_status", "")).upper()

        if raw_dm:
            dm_upper = str(raw_dm).upper()
            if dm_upper in ("MOCK", "SYNTHETIC", "SIMULATED"):
                return "MOCK" if is_mock else dm_upper
            if dm_upper == "UNAVAILABLE" or cov_status == "UNAVAILABLE":
                return "UNAVAILABLE"
            if dm_upper in ("SNAPSHOT", "HISTORICAL"):
                return "SNAPSHOT"
            if dm_upper == "DEMO":
                return "DEMO"
            if dm_upper in ("CACHED", "CACHED_REAL", "CACHED_LOCAL"):
                return "CACHED"
            if dm_upper in ("HYBRID", "FALLBACK_MODEL"):
                return "HYBRID"
            if dm_upper == "LIVE":
                return "LIVE"
            return dm_upper

        if cov_status in ("SYNTHETIC_DATA", "SIMULATED", "DEMO"):
            return "MOCK" if is_mock else "DEMO"
        if cov_status == "SNAPSHOT":
            return "SNAPSHOT"
        if cov_status == "FALLBACK_MODEL":
            return "HYBRID"
        if cov_status == "UNAVAILABLE" or getattr(payload, "severity", None) == "UNKNOWN":
            return "UNAVAILABLE"
        if freshness.get("is_cached"):
            return "CACHED"

        # 2. Compatibility fallback: source-name string inspection ONLY if structured metadata is absent
        source_name = getattr(payload, "source_name", "") or ""
        source_upper = source_name.upper()
        if "UNAVAILABLE" in source_upper or "DEGRADED" in source_upper or "MISSING" in source_upper:
            return "UNAVAILABLE"
        if "SNAPSHOT" in source_upper or "HISTORICAL" in source_upper:
            return "SNAPSHOT"
        if any(marker in source_upper for marker in ("DEMO", "SYNTHETIC", "MOCK", "FIXTURE", "SIMULATION")):
            return "MOCK" if is_mock else "DEMO"
        if "CACHED" in source_upper:
            return "CACHED"
        if "HYBRID" in source_upper or "OPEN-METEO" in source_upper:
            return "HYBRID"
        if "INCOIS" in source_upper or "IMD" in source_upper:
            if freshness.get("coverage_status") in ("LIVE", "OFFICIAL_STATION") or freshness.get("is_live") or freshness.get("verified_live"):
                return "LIVE"
            return "UNVERIFIED"
        return "UNKNOWN_SOURCE"

    @staticmethod
    def _resolve_provenance(
        payload: Any,
        is_mock: bool = False,
        eval_time_iso: Optional[str] = None,
    ) -> Tuple[str, List[str]]:
        """Resolves structured data_mode and quality_flags from payload metadata, freshness_flags, and validity.
        
        Structured metadata from the payload takes precedence over source-name parsing.
        Source identity is kept separate from application execution mode.
        """
        freshness = getattr(payload, "freshness_flags", None)
        if not isinstance(freshness, dict):
            freshness = {}

        data_mode = ProviderToolAdapter._resolve_data_mode(is_mock, payload, freshness)

        # 2. Collect and normalize quality flags
        quality_flags: List[str] = []
        # Inherit any existing quality_flags on payload or freshness
        existing_flags = getattr(payload, "quality_flags", None) or freshness.get("quality_flags")
        if isinstance(existing_flags, list):
            for f in existing_flags:
                if f and str(f) not in quality_flags:
                    quality_flags.append(str(f))

        # Add classified flags based on data_mode
        if is_mock or data_mode == "MOCK":
            for f in ("deterministic_demo", "SIMULATED"):
                if f not in quality_flags:
                    quality_flags.append(f)
            if (is_mock or (isinstance(existing_flags, list) and "M2_CONTRACT_MOCK" in existing_flags)) and "M2_CONTRACT_MOCK" not in quality_flags:
                quality_flags.append("M2_CONTRACT_MOCK")
        elif data_mode == "SNAPSHOT":
            for f in ("deterministic_demo", "SNAPSHOT_SOURCE", "SIMULATED"):
                if f not in quality_flags:
                    quality_flags.append(f)
            # Never attach M2_CONTRACT_MOCK to real snapshot fixtures
            quality_flags = [f for f in quality_flags if f != "M2_CONTRACT_MOCK"]
        elif data_mode in ("DEMO", "SYNTHETIC", "SIMULATED"):
            for f in ("deterministic_demo", "SIMULATED"):
                if f not in quality_flags:
                    quality_flags.append(f)
            quality_flags = [f for f in quality_flags if f != "M2_CONTRACT_MOCK"]
        elif data_mode == "UNAVAILABLE":
            for f in ("UNAVAILABLE", "degraded", "stale_telemetry"):
                if f not in quality_flags:
                    quality_flags.append(f)
        elif data_mode == "CACHED":
            for f in ("CACHED_SOURCE", "cached_provider_data", "cached"):
                if f not in quality_flags:
                    quality_flags.append(f)
        elif data_mode == "HYBRID":
            for f in ("fallback_model", "FALLBACK"):
                if f not in quality_flags:
                    quality_flags.append(f)

        source_name = getattr(payload, "source_name", "") or ""
        source_upper = source_name.upper()
        cov_status = str(getattr(payload, "coverage_status", None) or freshness.get("coverage_status", "")).upper()

        # Geographic Fallback handling
        is_geo_fb = (
            cov_status == "GEOGRAPHIC_FALLBACK"
            or bool(freshness.get("is_fallback"))
            or "GEOGRAPHIC_FALLBACK" in source_upper
        )
        if is_geo_fb:
            for f in ("GEOGRAPHIC_FALLBACK", "FALLBACK"):
                if f not in quality_flags:
                    quality_flags.append(f)

        # Fallback model handling
        is_fb_model = bool(freshness.get("fallback_model")) or cov_status == "FALLBACK_MODEL" or "OPEN-METEO" in source_upper
        if is_fb_model:
            for f in ("fallback_model", "FALLBACK"):
                if f not in quality_flags:
                    quality_flags.append(f)

        # Cache handling
        is_cached = bool(freshness.get("is_cached") or freshness.get("cached") or data_mode == "CACHED" or "CACHED" in source_upper)
        if is_cached:
            for f in ("cached", "CACHED_SOURCE"):
                if f not in quality_flags:
                    quality_flags.append(f)

        is_simulated = bool(
            data_mode in ("MOCK", "SNAPSHOT", "DEMO", "SYNTHETIC", "SIMULATED")
            or is_mock
            or any(f in quality_flags for f in ("SIMULATED", "SNAPSHOT_SOURCE", "deterministic_demo"))
        )

        # Official source classification:
        is_official = (
            bool(freshness.get("is_official"))
            or cov_status in ("OFFICIAL_STATION", "OFFICIAL_BULLETIN")
            or "official_source" in quality_flags
            or (any(auth in source_upper for auth in ("IMD", "INCOIS")) and not is_fb_model and not is_simulated)
        )
        if is_official and not is_fb_model and not is_simulated:
            if "official_source" not in quality_flags:
                quality_flags.append("official_source")

        # Strip unearned official/live claims:
        # Cached official data retains official_source, but MUST NOT claim verified_live.
        if is_cached:
            quality_flags = [f for f in quality_flags if f != "verified_live"]
        # Fallback data must never claim official_source or verified_live
        if is_fb_model:
            quality_flags = [f for f in quality_flags if f not in ("official_source", "verified_live")]
        # Simulated data must never claim official_source or verified_live
        if is_simulated:
            quality_flags = [f for f in quality_flags if f not in ("official_source", "verified_live")]

        has_verified_live_flag = (
            "verified_live" in (getattr(payload, "quality_flags", []) or [])
            or "verified_live" in (freshness.get("quality_flags", []) or [])
            or bool(freshness.get("verified_live"))
            or bool(freshness.get("is_live"))
            or cov_status in ("OFFICIAL_STATION", "OFFICIAL_BULLETIN", "OFFICIAL")
        )

        # Verified live is preserved/added ONLY when genuinely live, official, uncached, non-fallback, non-simulated
        if (
            data_mode == "LIVE"
            and not is_cached
            and not is_fb_model
            and not is_simulated
            and is_official
            and has_verified_live_flag
        ):
            if "verified_live" not in quality_flags:
                quality_flags.append("verified_live")
        else:
            quality_flags = [f for f in quality_flags if f != "verified_live"]

        # Validity expiration check
        valid_to = getattr(payload, "valid_to", None)
        if valid_to:
            try:
                vt = datetime.fromisoformat(str(valid_to).replace("Z", "+00:00"))
                target_dt = (
                    datetime.fromisoformat(str(eval_time_iso).replace("Z", "+00:00"))
                    if eval_time_iso
                    else datetime.now(timezone.utc)
                )
                if vt < target_dt:
                    for f in ("EXPIRED", "stale", "stale_telemetry"):
                        if f not in quality_flags:
                            quality_flags.append(f)
            except Exception:
                pass

        return data_mode, quality_flags

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
            data_mode_val, quality_flags = ProviderToolAdapter._resolve_provenance(
                payload, is_mock, getattr(context, "departure_time", None)
            )
            lineage_val = "mock_fixture" if is_mock else getattr(payload, "bulletin_id", "live_api")
            coverage_val = payload.harbor or context.origin_harbor

            evidence = [
                EvidenceItem(
                    source_name=payload.source_name,
                    source_url=payload.source_url,
                    observed_time=payload.observed_at,
                    valid_from=getattr(payload, "valid_from", None) or getattr(payload, "observed_at", None),
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
            freshness = getattr(payload, "freshness_flags", None)
            if freshness and isinstance(freshness, dict):
                ws = freshness.get("warnings")
                if ws and isinstance(ws, list):
                    warnings.extend(ws)

            if payload.source_name and (
                "[HYBRID" in payload.source_name
                or "Fallback" in payload.source_name
                or "FALLBACK" in payload.source_name
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
            data_mode_val, quality_flags = ProviderToolAdapter._resolve_provenance(
                payload, is_mock, getattr(context, "departure_time", None)
            )
            lineage_val = "mock_fixture" if is_mock else getattr(payload, "bulletin_id", "live_api")
            coverage_val = payload.harbor or context.origin_harbor

            evidence = [
                EvidenceItem(
                    source_name=payload.source_name,
                    source_url=payload.source_url,
                    observed_time=payload.observed_at,
                    valid_from=getattr(payload, "valid_from", None) or getattr(payload, "observed_at", None),
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
            freshness = getattr(payload, "freshness_flags", None)
            if freshness and isinstance(freshness, dict):
                ws = freshness.get("warnings")
                if ws and isinstance(ws, list):
                    warnings.extend(ws)

            if payload.source_name and (
                "[HYBRID" in payload.source_name
                or "Fallback" in payload.source_name
                or "FALLBACK" in payload.source_name
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
            data_mode_val, quality_flags = ProviderToolAdapter._resolve_provenance(
                payload, is_mock, getattr(context, "departure_time", None)
            )
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
            freshness = getattr(payload, "freshness_flags", None)
            if freshness and isinstance(freshness, dict):
                ws = freshness.get("warnings")
                if ws and isinstance(ws, list):
                    warnings.extend(ws)

            if payload.source_name and (
                "[HYBRID" in payload.source_name
                or "Fallback" in payload.source_name
                or "FALLBACK" in payload.source_name
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
            data_mode_val, quality_flags = ProviderToolAdapter._resolve_provenance(
                payload, is_mock, getattr(context, "departure_time", None)
            )
            lineage_val = "mock_fixture" if is_mock else getattr(payload, "bulletin_id", "live_api")
            coverage_val = payload.harbor or context.origin_harbor

            evidence = [
                EvidenceItem(
                    source_name=payload.source_name,
                    source_url=payload.source_url,
                    observed_time=payload.issued_at,
                    valid_from=payload.issued_at,
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
                data_mode_val = "MOCK" if is_mock else (getattr(bundle, "data_mode", None) or getattr(context, "data_mode", None) or getattr(settings, "DATA_MODE", "LIVE").upper())
            else:
                data_mode_val = "MOCK" if is_mock else (getattr(context, "data_mode", None) or getattr(settings, "DATA_MODE", "LIVE").upper())

            payload = engine_fn(
                context, 
                marine=marine, 
                weather=weather, 
                hazard=hazard, 
                bundle=bundle,
                data_mode=data_mode_val
            )
            if is_mock:
                quality_flags = ["M2_CONTRACT_MOCK", "SIMULATED"]
            else:
                quality_flags = ["REAL_SOURCE", "DETERMINISTIC_EVAL"]
                for prov in payload.provenance or []:
                    for qf in prov.quality_flags:
                        if qf not in quality_flags:
                            quality_flags.append(qf)

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

            lineage_val = "risk_engine_eval"
            coverage_val = context.origin_harbor or "Global"

            evidence = [
                EvidenceItem(
                    evidence_id="EV-RISK-STATUS-01",
                    source_name="ORCA Risk Engine (Dev 4)",
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
        source_data_mode: Optional[str] = None,
    ) -> ToolResult:
        """Adapts Dev 4 PFZRankingEngine output into normalized ToolResult."""
        try:
            payload = engine_fn(context, raw_features)

            resolved_mode = str(
                source_data_mode
                or getattr(context, "data_mode", None)
                or getattr(settings, "DATA_MODE", "LIVE")
            ).upper()

            if is_mock or resolved_mode == "MOCK":
                data_mode_val = "MOCK"
                quality_flags = ["M2_CONTRACT_MOCK", "SIMULATED", "GEOSPATIAL_CALCULATION"]
                lineage_val = "mock_fixture"
                src_name = "PFZ Ranking Engine (Dev 4) [Contract Mock]"
            elif resolved_mode == "SNAPSHOT":
                data_mode_val = "SNAPSHOT"
                quality_flags = ["GEOSPATIAL_CALCULATION", "SNAPSHOT_SOURCE", "SIMULATED"]
                lineage_val = "pfz_ranking_eval:snapshot_inputs"
                src_name = "PFZ Ranking Engine (Dev 4) [SNAPSHOT inputs]"
            elif resolved_mode in ("DEMO", "SYNTHETIC", "SIMULATED"):
                data_mode_val = resolved_mode
                quality_flags = ["GEOSPATIAL_CALCULATION", "SIMULATED", "deterministic_demo"]
                lineage_val = f"pfz_ranking_eval:{resolved_mode.lower()}_inputs"
                src_name = f"PFZ Ranking Engine (Dev 4) [{resolved_mode} inputs]"
            else:
                data_mode_val = "LIVE"
                quality_flags = ["GEOSPATIAL_CALCULATION", "REAL_SOURCE"]
                lineage_val = "pfz_ranking_eval:live_inputs"
                src_name = "PFZ Ranking Engine (Dev 4)"

            coverage_val = context.origin_harbor or "Coastal"

            evidence: List[EvidenceItem] = []
            if payload.ranked_candidates:
                top_cand = payload.ranked_candidates[0]
                evidence.append(
                    EvidenceItem(
                        source_name=src_name,
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

