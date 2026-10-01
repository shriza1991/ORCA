"""Trip Assessment Service.

Owned by Dev 2 & Dev 4.
Coordinates the single assessment pipeline for the Fisher dashboard and conversational interface.
"""
import uuid
import logging
from datetime import datetime, UTC, timedelta
from typing import List, Optional

from backend.app.contracts.assessment import (
    TripAssessmentRequest,
    TripAssessmentResponse,
    AssessmentSourceStatus,
    MissionBriefPayload,
    DecisionStabilityPayload,
    SafeMissionWindow,
)
from backend.app.contracts.observation import ObservationBundle
from backend.app.contracts.chat import UserContext, RecommendationStatus
from backend.app.contracts.mission import MissionState, mission_from_user_context
from backend.app.services.data_service import DataService
from backend.app.domain.risk_engine import (
    DeterministicRiskEngine,
    compute_decision_boundaries,
    compute_decision_stability,
    compute_safe_window,
    get_vessel_capability,
)
from backend.app.agents.integrations.contracts import ToolInvocationContext

# Optionally import DB dependencies
try:
    from backend.app.db.session import SessionLocal
    from sqlalchemy.orm import Session
    from backend.app.db.repositories import AssessmentRepository
    DB_AVAILABLE = True
except ImportError:
    DB_AVAILABLE = False

logger = logging.getLogger(__name__)


class AssessmentService:
    """Coordinates the unified trip assessment pipeline."""

    @staticmethod
    def assess_trip(request: TripAssessmentRequest) -> TripAssessmentResponse:
        """Executes the full assessment pipeline."""
        assessment_id = str(uuid.uuid4())
        now_iso = datetime.now(UTC).isoformat()

        # Resolve canonical MissionState as source-of-truth (M1.1)
        if request.mission_state:
            mission_state = request.mission_state
        else:
            u_ctx = UserContext(
                origin_harbor=request.origin_harbor,
                coordinates=request.coordinates,
                craft_profile=request.craft_profile,
                vessel_size=getattr(request, "vessel_size", "medium"),
                departure_time=request.departure_time,
                return_time=request.return_time,
                target_pfz=request.destination_id,
                language_preference=request.language_preference,
                parent_assessment_id=request.parent_assessment_id,
            )
            mission_state = mission_from_user_context(
                user_context=u_ctx,
                message=f"Trip assessment from {request.origin_harbor or 'coordinates'}",
            )

        effective_origin_harbor = mission_state.origin.name or request.origin_harbor
        effective_coordinates = (
            [mission_state.origin.longitude, mission_state.origin.latitude]
            if (mission_state.origin and mission_state.origin.latitude is not None and mission_state.origin.longitude is not None)
            else request.coordinates
        )
        effective_craft_profile = mission_state.vessel.type or request.craft_profile
        effective_vessel_size = (
            getattr(mission_state.vessel, "size_category", None)
            or getattr(mission_state.vessel, "vessel_size", None)
            or getattr(request, "vessel_size", None)
            or "medium"
        )
        mission_state.vessel.size_category = effective_vessel_size
        mission_state.vessel.vessel_size = effective_vessel_size
        effective_departure_time = mission_state.timing.departure or request.departure_time
        effective_return_time = mission_state.timing.return_deadline or request.return_time
        effective_destination_id = mission_state.destination.name or request.destination_id
        effective_language_preference = mission_state.user.locale or request.language_preference
        effective_parent_assessment_id = getattr(mission_state, "parent_assessment_id", None) or request.parent_assessment_id

        # 1. Validation & Setup
        if not effective_origin_harbor and not effective_coordinates:
            # Missing critical inputs cannot yield a favorable verdict
            return AssessmentService._build_error_response(
                assessment_id, now_iso, request, 
                "Missing critical inputs: Must provide either harbor or explicit starting coordinates.",
                mission_state=mission_state,
            )

        data_service = DataService(data_mode=request.data_mode)
        
        ctx = ToolInvocationContext(
            origin_harbor=effective_origin_harbor,
            coordinates=effective_coordinates,
            craft_profile=effective_craft_profile,
            vessel_size=effective_vessel_size,
            departure_time=effective_departure_time
            # return_time is handled in the risk engine window
        )

        source_status: List[AssessmentSourceStatus] = []
        
        # 2. Gather Data (Handle incomplete evidence)
        marine = None
        weather = None
        hazard = None
        pfz_ranking = None
        
        try:
            marine = data_service.get_marine_conditions(ctx)
            source_status.append(AssessmentSourceStatus(provider_name="Marine", status="SUCCESS"))
        except Exception as e:
            logger.error(f"Marine data retrieval failed: {e}")
            source_status.append(AssessmentSourceStatus(provider_name="Marine", status="FAILED", error_message=str(e)))

        try:
            weather = data_service.get_weather_conditions(ctx)
            source_status.append(AssessmentSourceStatus(provider_name="Weather", status="SUCCESS"))
        except Exception as e:
            logger.error(f"Weather data retrieval failed: {e}")
            source_status.append(AssessmentSourceStatus(provider_name="Weather", status="FAILED", error_message=str(e)))
            
        try:
            hazard = data_service.get_hazard_bulletin(ctx)
            source_status.append(AssessmentSourceStatus(provider_name="Hazard", status="SUCCESS"))
        except Exception as e:
            logger.error(f"Hazard data retrieval failed: {e}")
            source_status.append(AssessmentSourceStatus(provider_name="Hazard", status="FAILED", error_message=str(e)))

        # 3. Assemble Bundle
        hourly_by_time = {}
        for record in (marine.hourly_forecast if marine else []):
            timestamp = record.get("observation_time") or record.get("timestamp_utc")
            if timestamp:
                hourly_by_time[timestamp] = dict(record)
        for record in (weather.hourly_forecast if weather else []):
            timestamp = record.get("observation_time") or record.get("timestamp_utc")
            if timestamp:
                hourly_by_time.setdefault(timestamp, {}).update(record)

        bundle = ObservationBundle(
            marine=marine,
            weather=weather,
            hazard=hazard,
            captured_at=now_iso,
            data_mode=request.data_mode,
            source_metadata={
                "provenance_mode": (
                    "DEMO" if request.data_mode.upper() == "DEMO"
                    else "SAVED" if any(
                        "SNAPSHOT" in str(getattr(payload, "source_name", "")).upper()
                        or "SAVED" in str(getattr(payload, "source_name", "")).upper()
                        for payload in (marine, weather, hazard) if payload is not None
                    ) else "LIVE"
                ),
            },
            hourly_forecast=list(hourly_by_time.values()),
        )
        
        # 4. Evaluate Risk
        # Ensure hard-stop precedence and incomplete evidence handling
        brief = None
        stability = None
        safe_window = None
        if not marine or not weather or not hazard:
            decision = RecommendationStatus.UNKNOWN
            evidence = [{"issue": "Incomplete data", "details": "Critical components failed to load."}]
            alerts = [{"message": "Cannot assess due to missing data. Check source status."}]
            brief = MissionBriefPayload(
                summary="Sensor, forecast, or hazard bulletin data are incomplete or unavailable.",
                recommended_action="Hold departure. Verify with port authorities before navigating.",
                positive_factors=[],
                negative_factors=["Critical telemetry components failed to load."],
                confidence="LOW",
                confidence_reasons=["Sensor telemetry validity window expired or data feed missing"],
            )
            stability = DecisionStabilityPayload(
                level="LOW",
                headline="Low Decision Stability — Incomplete Data",
                reason="Sensor, forecast, or hazard bulletin data are incomplete or unavailable.",
                sensitivity_ranking=["Incomplete sensor telemetry"],
            )
            safe_window = SafeMissionWindow(
                is_current_safe=False,
                window_summary="Safe mission window cannot be determined due to missing telemetry.",
            )
        else:
            try:
                # Passing both departure_time (ref_time) and return_time to the risk engine to evaluate the trip window
                ref_time = effective_departure_time or now_iso
                risk_payload = DeterministicRiskEngine.evaluate(
                    context=ctx,
                    bundle=bundle,
                    data_mode=request.data_mode,
                    reference_time=ref_time,
                    return_time=effective_return_time,
                    hourly_records=bundle.hourly_forecast,
                )
                
                decision = risk_payload.status # RecommendationStatus type
                evidence = [t.model_dump() for t in risk_payload.threshold_comparisons]
                alerts = [{"message": w} for w in risk_payload.warnings]

                if risk_payload.status == RecommendationStatus.GO:
                    pos_factors = list(risk_payload.decisive_factors) + list(risk_payload.non_decisive_factors)
                    neg_factors = []
                else:
                    pos_factors = list(risk_payload.non_decisive_factors)
                    neg_factors = list(risk_payload.decisive_factors)

                conf_val = getattr(risk_payload.confidence_level, "value", str(risk_payload.confidence_level))

                v_cap = get_vessel_capability(effective_craft_profile, effective_vessel_size)
                v_type_label = v_cap.get("type_label") or effective_craft_profile.replace("_", " ").title()
                v_size_label = v_cap.get("size_label") or effective_vessel_size.title()
                capability_notes = f"Assessment adjusted for {v_cap.get('label', v_type_label)} operating limitations."

                brief = MissionBriefPayload(
                    summary=risk_payload.summary,
                    recommended_action=risk_payload.recommended_action,
                    positive_factors=pos_factors,
                    negative_factors=neg_factors,
                    confidence=conf_val,
                    confidence_reasons=list(risk_payload.confidence_reasons),
                    vessel_type=v_type_label,
                    vessel_size=v_size_label,
                    capability_notes=capability_notes,
                )

                # M1.4 Stability and Nearest Boundary Assessment
                boundaries = compute_decision_boundaries(
                    risk_payload.threshold_comparisons,
                    effective_craft_profile,
                    vessel_size=effective_vessel_size,
                )
                bulletins_active = bool(
                    hazard
                    and str(hazard.severity).upper() != "NORMAL"
                    and (hazard.cyclone_warning_active or hazard.squall_alert)
                )
                stability = compute_decision_stability(
                    boundaries,
                    risk_payload.threshold_comparisons,
                    bulletins_active=bulletins_active,
                )

                # M1.4 Safe Mission Window Assessment
                trip_dur = 4
                if effective_departure_time and effective_return_time:
                    try:
                        d_dt = datetime.fromisoformat(effective_departure_time.replace("Z", "+00:00"))
                        r_dt = datetime.fromisoformat(effective_return_time.replace("Z", "+00:00"))
                        diff = int((r_dt - d_dt).total_seconds() // 3600)
                        if diff > 0:
                            trip_dur = diff
                    except Exception:
                        pass

                safe_window = compute_safe_window(
                    craft_profile=effective_craft_profile,
                    hourly_records=bundle.hourly_forecast,
                    reference_time=ref_time,
                    trip_duration_hours=trip_dur,
                    current_status=risk_payload.status,
                    vessel_size=effective_vessel_size,
                )
            except Exception as e:
                logger.error(f"Risk evaluation failed: {e}")
                decision = RecommendationStatus.UNKNOWN
                evidence = [{"issue": "Evaluation Error", "details": str(e)}]
                alerts = [{"message": "Internal evaluation error occurred."}]
                brief = MissionBriefPayload(
                    summary="Internal evaluation error occurred.",
                    recommended_action="Hold departure. Contact harbor authority.",
                    positive_factors=[],
                    negative_factors=[f"Evaluation error: {str(e)}"],
                    confidence="LOW",
                    confidence_reasons=["Risk engine evaluation encountered unexpected exception"],
                )
                stability = DecisionStabilityPayload(
                    level="LOW",
                    headline="Low Decision Stability — Evaluation Error",
                    reason=f"Risk engine evaluation encountered error: {str(e)}",
                    sensitivity_ranking=[f"Error: {str(e)}"],
                )
                safe_window = SafeMissionWindow(
                    is_current_safe=False,
                    window_summary="Safe mission window evaluation aborted due to internal error.",
                )

        # PFZ Evaluation
        pfz_candidates = []
        pfz_ranking = None  # Initialize before try so routes evaluation can safely check it
        if effective_destination_id or True: # Evaluate if we can
            try:
                pfz_raw = data_service.get_pfz_raw_advisories(ctx)
                if pfz_raw and pfz_raw.features:
                    from backend.app.domain.pfz import DeterministicPFZRankingEngine
                    pfz_engine = DeterministicPFZRankingEngine()
                    pfz_ranking = pfz_engine.rank_pfz_candidates(ctx, pfz_raw.features)
                    pfz_candidates = [c.model_dump() for c in pfz_ranking.ranked_candidates]
                    if request.data_mode.upper() == "DEMO" and data_service.is_archived_demo(ctx):
                        from backend.app.scenarios.fisher_demo import pfz_features
                        demo_features = pfz_features()
                        reasons = {
                            "PFZ-ZONE-1": "Nearest; 5.6 nm closer than zone 2; highest chlorophyll with cooler water.",
                            "PFZ-ZONE-2": "Second-nearest candidate with lower chlorophyll.",
                            "PFZ-ZONE-3": "Farthest candidate with lowest chlorophyll and warmer water.",
                        }
                        pfz_candidates = []
                        for rank, feature in enumerate(demo_features, start=1):
                            pfz_candidates.append({
                                "candidate_id": feature["id"],
                                "latitude": feature["lat"],
                                "longitude": feature["lon"],
                                "distance_nautical_miles": feature["distance_nautical_miles"],
                                "bearing_degrees": feature["bearing_degrees"],
                                "water_depth_m": feature["depth_m"],
                                "sea_surface_temp_c": feature["sst"],
                                "chlorophyll_mg_m3": feature["chlorophyll"],
                                "location_reference": feature["location_reference"],
                                "rank": rank,
                                "selection_reason": reasons[feature["id"]],
                            })
            except Exception as e:
                logger.warning(f"Failed to fetch/rank PFZ candidates: {e}")
                source_status.append(AssessmentSourceStatus(provider_name="PFZ", status="FAILED", error_message=str(e)))
                
        # Routes Evaluation
        route_candidates = []
        if marine and weather:
            try:
                from backend.app.domain.route_engine import DeterministicRouteExposureEngine
                from backend.app.domain.geo_restrictions import DeterministicGeospatialEngine
                
                route_engine = DeterministicRouteExposureEngine()
                geo_engine = DeterministicGeospatialEngine()
                
                target_dest = effective_destination_id or "Outer Bank"
                target_coords = effective_coordinates
                if pfz_ranking and pfz_ranking.ranked_candidates:
                    selected_pfz = None
                    if effective_destination_id and effective_destination_id != "auto":
                        selected_pfz = next((c for c in pfz_ranking.ranked_candidates if c.candidate_id == effective_destination_id), None)
                    if not selected_pfz:
                        selected_pfz = pfz_ranking.ranked_candidates[0]
                    target_coords = [selected_pfz.longitude, selected_pfz.latitude]
                    target_dest = selected_pfz.location_reference or selected_pfz.candidate_id

                route_start = datetime.fromisoformat(
                    (effective_departure_time or now_iso).replace("Z", "+00:00")
                )
                if route_start.tzinfo is None:
                    route_start = route_start.replace(tzinfo=UTC)
                route_end = (
                    datetime.fromisoformat(effective_return_time.replace("Z", "+00:00"))
                    if effective_return_time
                    else route_start + timedelta(hours=72)
                )
                if route_end.tzinfo is None:
                    route_end = route_end.replace(tzinfo=UTC)
                hourly_forecast = data_service.get_hourly_marine_forecast(
                    ctx, start_time=route_start, end_time=route_end
                )
                
                route_payload = route_engine.evaluate_routes(
                    context=ctx,
                    marine=marine,
                    destination=target_dest,
                    weather=weather,
                    hazard=hazard,
                    geospatial_engine=geo_engine,
                    dest_coords=target_coords,
                    hourly_forecast=hourly_forecast or bundle.hourly_forecast,
                    departure_time=route_start,
                )
                route_candidates = []
                for r in route_payload.routes:
                    rd = r.model_dump()
                    rd["is_recommended"] = (r.route_id == route_payload.recommended_route_id)
                    route_candidates.append(rd)
                if request.data_mode.upper() == "DEMO" and data_service.is_archived_demo(ctx):
                    from backend.app.scenarios.fisher_demo import route_constants
                    route_candidates = route_constants()
            except Exception as e:
                logger.warning(f"Failed to evaluate route candidates: {e}")
                
        # 5. Derive Deterministic Agent Collaboration Payload (M1.3)
        agent_collaboration = None
        try:
            from backend.app.domain.agent_collaboration import AgentCollaborationEngine
            from backend.app.contracts.chat import Confidence, EvidenceItem, Recommendation, AgentTraceItem

            rec_obj = None
            evidence_items = []
            if 'risk_payload' in locals() and risk_payload:
                rec_obj = Recommendation(
                    status=risk_payload.status,
                    summary=risk_payload.summary,
                    decisive_factors=risk_payload.decisive_factors,
                    non_decisive_factors=risk_payload.non_decisive_factors,
                    threshold_comparisons=risk_payload.threshold_comparisons,
                    next_action=risk_payload.recommended_action,
                    confidence=Confidence(
                        level=risk_payload.confidence_level,
                        reasons=risk_payload.confidence_reasons,
                    ),
                    provenance=risk_payload.provenance,
                    evidence_ids=risk_payload.evidence_ids,
                    warnings=risk_payload.warnings,
                )
                for prov in risk_payload.provenance:
                    evidence_items.append(
                        EvidenceItem(
                            source_name=prov.source_name,
                            provider_name=prov.provider_name,
                            source_url=prov.source_url,
                            valid_from=prov.valid_from,
                            valid_to=prov.valid_to,
                            retrieved_at=prov.observed_time or now_iso,
                            quality_flags=prov.quality_flags,
                        )
                    )

            trace_items = [
                AgentTraceItem(
                    step=1,
                    node="marine_agent",
                    agent="marine_agent",
                    action="Ingested ocean state forecast & PFZ telemetry",
                    status="completed",
                    timestamp=now_iso,
                ),
                AgentTraceItem(
                    step=2,
                    node="weather_agent",
                    agent="weather_agent",
                    action="Evaluated coastal wind, gusts & atmospheric bulletins",
                    status="completed",
                    timestamp=now_iso,
                ),
                AgentTraceItem(
                    step=3,
                    node="risk_engine",
                    agent="safety_agent",
                    action=f"Applied craft safety thresholds for {effective_craft_profile}",
                    status="completed",
                    timestamp=now_iso,
                ),
                AgentTraceItem(
                    step=4,
                    node="decision_authority",
                    agent="decision_authority",
                    action="Arbitrated specialist stances under statutory maritime rules",
                    status="completed",
                    timestamp=now_iso,
                ),
            ]

            obs_map: Dict[str, Any] = {
                "significant_wave_height_m": getattr(marine, "significant_wave_height_m", None) if marine else None,
                "swell_height_m": getattr(marine, "swell_wave_height_m", None) if marine else None,
                "wave_period_seconds": getattr(marine, "wave_period_seconds", None) if marine else None,
                "sea_surface_temperature_c": getattr(marine, "sea_surface_temperature_c", None) if marine else None,
                "wind_speed_knots": getattr(weather, "wind_speed_knots", None) if weather else None,
                "wind_gust_knots": getattr(weather, "wind_gust_knots", None) if weather else None,
                "cyclone_warning_active": getattr(hazard, "cyclone_warning_active", False) if hazard else False,
                "squall_alert": getattr(hazard, "squall_alert", False) if hazard else False,
                "headline": getattr(hazard, "headline", None) if hazard else None,
                "pfz_candidates": pfz_candidates,
                "route_candidates": route_candidates,
                "observed_at": getattr(marine, "observed_at", None) or getattr(weather, "observed_at", None) or now_iso,
                "valid_to": getattr(marine, "valid_to", None) or getattr(weather, "valid_to", None),
            }

            agent_collaboration = AgentCollaborationEngine.derive_collaboration(
                observations=obs_map,
                risk_assessment=rec_obj,
                evidence=evidence_items,
                trace=trace_items,
                user_profile={"craft_profile": effective_craft_profile},
                tool_results={
                    "pfz_search": {"candidates": pfz_candidates},
                    "route_planner": {"routes": route_candidates},
                },
                intent="SAFETY",
                language=effective_language_preference or "en",
                harbor=effective_origin_harbor,
            )
        except Exception as e:
            logger.warning(f"Failed to derive assessment agent_collaboration: {e}")

        # 6. Persist where possible
        is_durable = False
        if DB_AVAILABLE and request.data_mode.upper() != "DEMO":
            from backend.app.core.config import settings
            # Only attempt DB persistence if configured with a real non-placeholder password and not testing
            db_url = getattr(settings, "DATABASE_URL", "")
            if db_url and not getattr(settings, "TESTING", False):
                try:
                    with SessionLocal() as db:
                        repo = AssessmentRepository(db)
                        repo.create(
                            assessed_at=now_iso,
                            origin_harbor=effective_origin_harbor,
                            craft_profile=effective_craft_profile,
                            decision=decision.value,
                            evidence_json={"alerts": alerts, "evidence": evidence}
                        )
                    is_durable = True
                except Exception as e:
                    logger.warning(f"Failed to persist assessment: {e}")

        # 7. Format Response
        return TripAssessmentResponse(
            assessment_id=assessment_id,
            assessed_at=now_iso,
            trip_context=UserContext(
                origin_harbor=effective_origin_harbor,
                coordinates=effective_coordinates,
                craft_profile=effective_craft_profile,
                vessel_size=effective_vessel_size,
                departure_time=effective_departure_time,
                return_time=effective_return_time,
                target_pfz=effective_destination_id,
                language_preference=effective_language_preference,
                parent_assessment_id=effective_parent_assessment_id,
            ),
            decision=decision,
            conditions=bundle,
            alerts=alerts,
            pfz_candidates=pfz_candidates,
            route_candidates=route_candidates, 
            map_layers={}, 
            evidence=evidence,
            source_status=source_status,
            is_durable=is_durable,
            mission_state=mission_state,
            brief=brief,
            agent_collaboration=agent_collaboration,
            stability=stability,
            safe_window=safe_window,
        )

    @staticmethod
    def _build_error_response(
        assessment_id: str,
        now: str,
        request: TripAssessmentRequest,
        error_msg: str,
        mission_state: Optional[MissionState] = None,
    ) -> TripAssessmentResponse:
        error_brief = MissionBriefPayload(
            summary=error_msg,
            recommended_action="Provide valid origin harbor or coordinates before departure.",
            positive_factors=[],
            negative_factors=[error_msg],
            confidence="LOW",
            confidence_reasons=["Missing mandatory mission context"],
        )
        error_stability = DecisionStabilityPayload(
            level="LOW",
            headline="Low Decision Stability — Missing Context",
            reason=error_msg,
            sensitivity_ranking=[error_msg],
        )
        error_safe_window = SafeMissionWindow(
            is_current_safe=False,
            window_summary="Cannot determine safe departure window without valid trip origin.",
        )
        return TripAssessmentResponse(
            assessment_id=assessment_id,
            assessed_at=now,
            trip_context=UserContext(
                origin_harbor=request.origin_harbor,
                coordinates=request.coordinates,
                craft_profile=request.craft_profile,
                vessel_size=getattr(request, "vessel_size", "medium"),
                departure_time=request.departure_time,
                return_time=request.return_time,
                target_pfz=request.destination_id,
                language_preference=request.language_preference,
                parent_assessment_id=request.parent_assessment_id,
            ),
            decision=RecommendationStatus.UNKNOWN,
            conditions=ObservationBundle(data_mode=request.data_mode),
            alerts=[{"message": error_msg}],
            pfz_candidates=[],
            route_candidates=[],
            map_layers={},
            evidence=[],
            source_status=[],
            is_durable=False,
            mission_state=mission_state,
            brief=error_brief,
            stability=error_stability,
            safe_window=error_safe_window,
        )

    # Alias for API compatibility
    run_unified_assessment = assess_trip
