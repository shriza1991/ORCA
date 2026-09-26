"""Alert Service.

Manages saved trips, active actionable alerts, and background reassessment.
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, List

from backend.app.contracts.alerts import ActionableAlertDto, SavedTripRequest, SavedTripResponse
from backend.app.contracts.assessment import TripAssessmentRequest
from backend.app.contracts.chat import UserContext
from backend.app.contracts.mission import MissionState, mission_from_user_context
from backend.app.db.models import ActionableAlert, SavedTripSubscription
from backend.app.db.session import SessionLocal
from backend.app.services.assessment_service import AssessmentService

logger = logging.getLogger(__name__)


def utcnow():
    return datetime.now(timezone.utc)


class AlertService:
    # In-memory attachment for monitored trips' canonical MissionState (M1.1)
    _monitored_trips_mission_state: dict[str, Any] = {}

    @staticmethod
    def register_trip_monitoring(request: SavedTripRequest) -> SavedTripResponse:
        # Resolve canonical MissionState context
        if request.mission_state:
            mission_state = request.mission_state
        else:
            u_ctx = UserContext(
                origin_harbor=request.origin_harbor,
                craft_profile=request.craft_profile,
                departure_time=request.departure_time,
                return_time=request.return_time,
                language_preference=request.language,
            )
            mission_state = mission_from_user_context(
                user_context=u_ctx,
                message=f"Monitored trip for {request.origin_harbor}",
            )

        # Fix UI bug where return_time might equal departure_time
        departure_time_val = request.departure_time
        return_time_val = request.return_time
        
        if departure_time_val and return_time_val:
            try:
                from datetime import datetime, timedelta
                dep_dt = datetime.fromisoformat(departure_time_val.replace("Z", "+00:00"))
                ret_dt = datetime.fromisoformat(return_time_val.replace("Z", "+00:00"))
                if ret_dt <= dep_dt:
                    ret_dt = dep_dt + timedelta(hours=12)
                    return_time_val = ret_dt.isoformat()
            except Exception:
                pass

        try:
            with SessionLocal() as session:
                sub = SavedTripSubscription(
                    origin_harbor=request.origin_harbor,
                    craft_profile=request.craft_profile,
                    departure_time=departure_time_val,
                    return_time=return_time_val,
                    language=request.language,
                    is_active=True
                )
                session.add(sub)
                session.commit()
                session.refresh(sub)
                sub_id = str(sub.public_id)
                AlertService._monitored_trips_mission_state[sub_id] = mission_state
                return SavedTripResponse(
                    subscription_id=sub_id,
                    origin_harbor=sub.origin_harbor,
                    craft_profile=sub.craft_profile,
                    is_active=sub.is_active,
                    created_at=sub.created_at,
                    mission_state=mission_state,
                )
        except Exception as e:
            logger.warning(f"Database unavailable for register_trip_monitoring: {e}")
            import uuid
            sub_id = f"fallback-{uuid.uuid4()}"
            AlertService._monitored_trips_mission_state[sub_id] = mission_state
            return SavedTripResponse(
                subscription_id=sub_id,
                origin_harbor=request.origin_harbor,
                craft_profile=request.craft_profile,
                is_active=True,
                created_at=utcnow(),
                mission_state=mission_state,
            )

    @staticmethod
    def get_active_alerts(subscription_id: str) -> List[ActionableAlertDto]:
        if subscription_id.startswith("fallback-"):
            return []
            
        try:
            with SessionLocal() as session:
                sub = session.query(SavedTripSubscription).filter(SavedTripSubscription.public_id == subscription_id).first()
                if not sub:
                    return []
                
                alerts = session.query(ActionableAlert).filter(
                    ActionableAlert.subscription_id == sub.id,
                    ActionableAlert.status == "ACTIVE"
                ).order_by(ActionableAlert.created_at.desc()).all()

                return [
                    ActionableAlertDto(
                        id=str(a.id),
                        alert_type=a.alert_type,
                        severity=a.severity,
                        title=a.title,
                        description=a.description,
                        recommended_action=a.recommended_action,
                        status=a.status,
                        is_acknowledged=a.is_acknowledged,
                        valid_from=a.valid_from,
                        valid_to=a.valid_to,
                        created_at=a.created_at
                    ) for a in alerts
                ]
        except Exception as e:
            logger.warning(f"Database unavailable for get_active_alerts: {e}")
            return []

    @staticmethod
    def acknowledge_alert(alert_id: str) -> bool:
        try:
            with SessionLocal() as session:
                alert = session.query(ActionableAlert).filter(ActionableAlert.id == alert_id).first()
                if not alert:
                    return False
                alert.is_acknowledged = True
                alert.updated_at = utcnow()
                session.commit()
                return True
        except Exception as e:
            logger.warning(f"Database unavailable for acknowledge_alert: {e}")
            return True # Pretend it succeeded for offline mode

    @staticmethod
    def reassess_saved_trips():
        """Worker function to reassess all active trips and generate alerts."""
        logger.info("Running saved trips reassessment...")
        with SessionLocal() as session:
            active_subs = session.query(SavedTripSubscription).filter(SavedTripSubscription.is_active == True).all()
            for sub in active_subs:
                try:
                    # Catch the return_time validation error early and deactivate the bad trip
                    if sub.departure_time and sub.return_time and sub.return_time <= sub.departure_time:
                        logger.warning(f"Deactivating invalid trip {sub.public_id}: return_time ({sub.return_time}) is not after departure_time ({sub.departure_time})")
                        sub.is_active = False
                        session.commit()
                        continue
                        
                    req = TripAssessmentRequest(
                        origin_harbor=sub.origin_harbor,
                        craft_profile=sub.craft_profile,
                        departure_time=sub.departure_time.isoformat() if sub.departure_time else None,
                        return_time=sub.return_time.isoformat() if sub.return_time else None,
                        language_preference=sub.language,
                        data_mode="SNAPSHOT",
                        mission_state=AlertService._monitored_trips_mission_state.get(str(sub.public_id)),
                    )
                    assessment = AssessmentService.assess_trip(req)

                    for alert in assessment.alerts:
                        # The risk engine currently yields {"message": "..."} dicts for warnings
                        # We must ensure no None values are passed to the DB to prevent NotNullViolations
                        raw_msg = alert.get("message", "") if isinstance(alert, dict) else ""
                        
                        title = alert.get("title") if isinstance(alert, dict) else getattr(alert, "title", None)
                        severity = alert.get("severity") if isinstance(alert, dict) else getattr(alert, "severity", None)
                        description = alert.get("description") if isinstance(alert, dict) else getattr(alert, "description", None)
                        action = alert.get("action") if isinstance(alert, dict) else getattr(alert, "action", None)
                        
                        title = title or "Insufficient Evidence"
                        severity = severity or "medium"
                        description = description or raw_msg or "Assessment returned incomplete data for this timeframe."
                        action = action or "Verify real-time data sources before departure."
                        
                        identity_str = f"{sub.id}_{title}_{severity}"
                        identity_hash = hashlib.sha256(identity_str.encode("utf-8")).hexdigest()

                        existing = session.query(ActionableAlert).filter(ActionableAlert.identity_hash == identity_hash).first()
                        if not existing:
                            new_alert = ActionableAlert(
                                subscription_id=sub.id,
                                assessment_id=assessment.assessment_id,
                                alert_type="ASSESSMENT_ALERT",
                                severity=severity,
                                title=title,
                                description=description,
                                recommended_action=action,
                                status="ACTIVE",
                                is_acknowledged=False,
                                identity_hash=identity_hash,
                                valid_from=utcnow(),
                            )
                            session.add(new_alert)
                    
                    decision_val = assessment.decision.value if hasattr(assessment.decision, "value") else assessment.decision
                    
                    if decision_val in ["NO_GO", "CAUTION"]:
                        identity_str = f"{sub.id}_DECISION_{decision_val}"
                        identity_hash = hashlib.sha256(identity_str.encode("utf-8")).hexdigest()
                        existing = session.query(ActionableAlert).filter(ActionableAlert.identity_hash == identity_hash).first()
                        if not existing:
                            new_alert = ActionableAlert(
                                subscription_id=sub.id,
                                assessment_id=assessment.assessment_id,
                                alert_type="ASSESSMENT_DECISION",
                                severity="high" if decision_val == "NO_GO" else "medium",
                                title=f"Trip Decision: {decision_val}",
                                description=f"The system has evaluated your trip as {decision_val}.",
                                recommended_action="Review alerts and consider delaying departure.",
                                status="ACTIVE",
                                is_acknowledged=False,
                                identity_hash=identity_hash,
                                valid_from=utcnow(),
                            )
                            session.add(new_alert)

                    session.commit()
                    logger.info(f"Successfully reassessed trip {sub.public_id}.")
                except Exception as e:
                    logger.error(f"Error reassessing trip {sub.public_id}: {e}")
                    session.rollback()
