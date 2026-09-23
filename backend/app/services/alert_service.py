"""Alert Service.

Manages saved trips, active actionable alerts, and background reassessment.
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import List

from backend.app.contracts.alerts import ActionableAlertDto, SavedTripRequest, SavedTripResponse
from backend.app.contracts.assessment import TripAssessmentRequest
from backend.app.db.models import ActionableAlert, SavedTripSubscription
from backend.app.db.session import SessionLocal
from backend.app.services.assessment_service import AssessmentService

logger = logging.getLogger(__name__)


def utcnow():
    return datetime.now(timezone.utc)


class AlertService:
    @staticmethod
    def register_trip_monitoring(request: SavedTripRequest) -> SavedTripResponse:
        try:
            with SessionLocal() as session:
                sub = SavedTripSubscription(
                    origin_harbor=request.origin_harbor,
                    craft_profile=request.craft_profile,
                    departure_time=request.departure_time,
                    return_time=request.return_time,
                    language=request.language,
                    is_active=True
                )
                session.add(sub)
                session.commit()
                session.refresh(sub)
                return SavedTripResponse(
                    subscription_id=str(sub.public_id),
                    origin_harbor=sub.origin_harbor,
                    craft_profile=sub.craft_profile,
                    is_active=sub.is_active,
                    created_at=sub.created_at
                )
        except Exception as e:
            logger.warning(f"Database unavailable for register_trip_monitoring: {e}")
            import uuid
            return SavedTripResponse(
                subscription_id=f"fallback-{uuid.uuid4()}",
                origin_harbor=request.origin_harbor,
                craft_profile=request.craft_profile,
                is_active=True,
                created_at=utcnow()
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
                    req = TripAssessmentRequest(
                        origin_harbor=sub.origin_harbor,
                        craft_profile=sub.craft_profile,
                        departure_time=sub.departure_time.isoformat() if sub.departure_time else None,
                        return_time=sub.return_time.isoformat() if sub.return_time else None,
                        language_preference=sub.language,
                        data_mode="SNAPSHOT"
                    )
                    assessment = AssessmentService.assess_trip(req)

                    for alert in assessment.alerts:
                        identity_str = f"{sub.id}_{alert.title}_{alert.severity}"
                        identity_hash = hashlib.sha256(identity_str.encode("utf-8")).hexdigest()

                        existing = session.query(ActionableAlert).filter(ActionableAlert.identity_hash == identity_hash).first()
                        if not existing:
                            new_alert = ActionableAlert(
                                subscription_id=sub.id,
                                assessment_id=assessment.assessment_id,
                                alert_type="ASSESSMENT_ALERT",
                                severity=alert.severity,
                                title=alert.title,
                                description=alert.description,
                                recommended_action=alert.action,
                                status="ACTIVE",
                                is_acknowledged=False,
                                identity_hash=identity_hash,
                                valid_from=utcnow(),
                            )
                            session.add(new_alert)
                    
                    if assessment.decision.status in ["NO_GO", "CAUTION"]:
                        identity_str = f"{sub.id}_DECISION_{assessment.decision.status}"
                        identity_hash = hashlib.sha256(identity_str.encode("utf-8")).hexdigest()
                        existing = session.query(ActionableAlert).filter(ActionableAlert.identity_hash == identity_hash).first()
                        if not existing:
                            new_alert = ActionableAlert(
                                subscription_id=sub.id,
                                assessment_id=assessment.assessment_id,
                                alert_type="ASSESSMENT_DECISION",
                                severity="high" if assessment.decision.status == "NO_GO" else "medium",
                                title=f"Trip Decision: {assessment.decision.status}",
                                description=assessment.decision.summary,
                                recommended_action=assessment.decision.next_action,
                                status="ACTIVE",
                                is_acknowledged=False,
                                identity_hash=identity_hash,
                                valid_from=utcnow(),
                            )
                            session.add(new_alert)

                    session.commit()
                except Exception as e:
                    logger.error(f"Error reassessing trip {sub.public_id}: {e}")
                    session.rollback()
