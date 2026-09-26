"""Trip Assessment Service.

Owned by Dev 2 & Dev 4.
Coordinates the single assessment pipeline for the Fisher dashboard and conversational interface.
"""
import uuid
import logging
from datetime import datetime, UTC
from typing import List, Optional

from backend.app.contracts.assessment import TripAssessmentRequest, TripAssessmentResponse, AssessmentSourceStatus
from backend.app.contracts.observation import ObservationBundle
from backend.app.contracts.chat import UserContext, RecommendationStatus
from backend.app.contracts.mission import MissionState, mission_from_user_context
from backend.app.services.data_service import DataService
from backend.app.domain.risk_engine import DeterministicRiskEngine
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
            departure_time=effective_departure_time
            # return_time is handled in the risk engine window
        )

        source_status: List[AssessmentSourceStatus] = []
        
        # 2. Gather Data (Handle incomplete evidence)
        marine = None
        weather = None
        hazard = None
        
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
        bundle = ObservationBundle(
            marine=marine,
            weather=weather,
            hazard=hazard,
            captured_at=now_iso,
            data_mode=request.data_mode,
            source_metadata={}
        )
        
        # 4. Evaluate Risk
        # Ensure hard-stop precedence and incomplete evidence handling
        if not marine or not weather or not hazard:
            decision = RecommendationStatus.UNKNOWN
            evidence = [{"issue": "Incomplete data", "details": "Critical components failed to load."}]
            alerts = [{"message": "Cannot assess due to missing data. Check source status."}]
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
                )
                
                decision = risk_payload.status # RecommendationStatus type
                evidence = [t.model_dump() for t in risk_payload.threshold_comparisons]
                alerts = [{"message": w} for w in risk_payload.warnings]
            except Exception as e:
                logger.error(f"Risk evaluation failed: {e}")
                decision = RecommendationStatus.UNKNOWN
                evidence = [{"issue": "Evaluation Error", "details": str(e)}]
                alerts = [{"message": "Internal evaluation error occurred."}]

        # PFZ Evaluation
        pfz_candidates = []
        if effective_destination_id or True: # Evaluate if we can
            try:
                pfz_raw = data_service.get_pfz_raw_advisories(ctx)
                if pfz_raw and pfz_raw.features:
                    from backend.app.domain.pfz import DeterministicPFZRankingEngine
                    pfz_engine = DeterministicPFZRankingEngine()
                    pfz_ranking = pfz_engine.rank_pfz_candidates(ctx, pfz_raw.features)
                    pfz_candidates = [c.model_dump() for c in pfz_ranking.ranked_candidates]
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
                
                route_payload = route_engine.evaluate_routes(
                    context=ctx,
                    marine=marine,
                    destination=target_dest,
                    weather=weather,
                    hazard=hazard,
                    geospatial_engine=geo_engine,
                    dest_coords=target_coords,
                )
                route_candidates = [r.model_dump() for r in route_payload.routes]
            except Exception as e:
                logger.warning(f"Failed to evaluate route candidates: {e}")
                
        # 5. Persist where possible
        is_durable = False
        if DB_AVAILABLE:
            from backend.app.core.config import settings
            # Only attempt DB persistence if configured with a real non-placeholder password and not testing
            db_url = getattr(settings, "DATABASE_URL", "")
            if db_url and "placeholder" not in db_url and not getattr(settings, "TESTING", False):
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

        # 6. Format Response
        return TripAssessmentResponse(
            assessment_id=assessment_id,
            assessed_at=now_iso,
            trip_context=UserContext(
                origin_harbor=effective_origin_harbor,
                coordinates=effective_coordinates,
                craft_profile=effective_craft_profile,
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
        )

    @staticmethod
    def _build_error_response(
        assessment_id: str,
        now: str,
        request: TripAssessmentRequest,
        error_msg: str,
        mission_state: Optional[MissionState] = None,
    ) -> TripAssessmentResponse:
        return TripAssessmentResponse(
            assessment_id=assessment_id,
            assessed_at=now,
            trip_context=UserContext(
                origin_harbor=request.origin_harbor,
                coordinates=request.coordinates,
                craft_profile=request.craft_profile,
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
        )
