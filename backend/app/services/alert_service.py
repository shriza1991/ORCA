"""Alert Service.

Manages saved trips, active actionable alerts, and background reassessment.
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, List, Tuple

from sqlalchemy import or_

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
        # Validate trip window strictly - never invent 12 hours
        departure_time_val = request.departure_time
        return_time_val = request.return_time

        def parse_time(value):
            if not value:
                return None
            try:
                result = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)
            except (ValueError, TypeError) as exc:
                raise ValueError("Invalid departure or return time format") from exc
        dep_dt, ret_dt = parse_time(departure_time_val), parse_time(return_time_val)
        if dep_dt and ret_dt and ret_dt <= dep_dt:
            raise ValueError("return_time must be strictly after departure_time")

        # Resolve canonical MissionState context
        if request.mission_state:
            mission_state = MissionState.model_validate(request.mission_state)
        else:
            u_ctx = UserContext(
                origin_harbor=request.origin_harbor,
                coordinates=request.coordinates, target_pfz=request.destination_id,
                craft_profile=request.craft_profile,
                vessel_size=request.vessel_size or "medium",
                departure_time=request.departure_time,
                return_time=request.return_time,
                language_preference=request.language,
            )
            mission_state = mission_from_user_context(
                user_context=u_ctx,
                message=f"Monitored trip for {request.origin_harbor}",
            )

        # Keep explicit registration inputs authoritative while preserving mission identity/route.
        if request.coordinates:
            mission_state.origin.longitude, mission_state.origin.latitude = request.coordinates
        if request.destination_id:
            mission_state.destination.name = request.destination_id
        mission_state.origin.name = request.origin_harbor
        mission_state.vessel.type = request.craft_profile
        mission_state.vessel.size_category = request.vessel_size or "medium"
        if dep_dt: mission_state.timing.departure = dep_dt.isoformat()
        if ret_dt: mission_state.timing.return_deadline = ret_dt.isoformat()
        mission_state.user.locale = request.language

        mission_dict = None
        if mission_state:
            if hasattr(mission_state, "model_dump"):
                mission_dict = mission_state.model_dump(mode="json")
            elif isinstance(mission_state, dict):
                mission_dict = mission_state

        vessel_size_val = request.vessel_size or "medium"
        data_mode_val = request.data_mode or "LIVE"

        try:
            with SessionLocal() as session:
                sub = SavedTripSubscription(
                    origin_harbor=request.origin_harbor,
                    craft_profile=request.craft_profile,
                    vessel_size=vessel_size_val,
                    data_mode=data_mode_val,
                    mission_context_json=mission_dict,
                    departure_time=dep_dt,
                    return_time=ret_dt,
                    language=request.language,
                    is_active=True,
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
                    vessel_size=sub.vessel_size,
                    data_mode=sub.data_mode,
                    monitoring_mode="durable",
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
                vessel_size=vessel_size_val,
                data_mode=data_mode_val,
                monitoring_mode="unavailable",
                is_active=False,
                created_at=utcnow(),
                mission_state=mission_state,
            )

    @staticmethod
    def get_active_alerts(subscription_id: str) -> Tuple[List[ActionableAlertDto], str]:
        if subscription_id.startswith("fallback-"):
            return [], "unavailable"

        try:
            with SessionLocal() as session:
                sub = session.query(SavedTripSubscription).filter(SavedTripSubscription.public_id == subscription_id).first()
                if not sub or sub.is_active is False:
                    return [], "unavailable"

                now = utcnow()
                # Exclude expired alerts and resolve alerts that no longer apply
                alerts = session.query(ActionableAlert).filter(
                    ActionableAlert.subscription_id == sub.id,
                    ActionableAlert.status == "ACTIVE",
                    or_(ActionableAlert.valid_to == None, ActionableAlert.valid_to > now),
                    or_(ActionableAlert.valid_from == None, ActionableAlert.valid_from <= now)
                ).order_by(ActionableAlert.created_at.desc()).all()

                dtos = [
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
                    ) for a in alerts if AlertService._alert_is_current(a, now)
                ]
                return dtos, "durable"
        except Exception as e:
            logger.warning(f"Database unavailable for get_active_alerts: {e}")
            return [], "unavailable"

    @staticmethod
    def _alert_is_current(alert, now):
        def aware(value):
            return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value
        start, end = aware(alert.valid_from), aware(alert.valid_to)
        return (alert.status == "ACTIVE" and (start is None or start <= now)
                and (end is None or end > now) and (start is None or end is None or start < end))

    @staticmethod
    def _renew_alert(alert, assessment_id):
        # A recurring warning is a new acknowledgement episode after resolution/expiry.
        if alert.status != "ACTIVE" or (alert.valid_to and not AlertService._alert_is_current(alert, utcnow())):
            alert.status = "ACTIVE"
            alert.is_acknowledged = False
            alert.valid_from = utcnow()
            alert.valid_to = None
        alert.assessment_id = assessment_id
        alert.updated_at = utcnow()

    @staticmethod
    def stop_monitoring(subscription_id: str) -> bool:
        try:
            with SessionLocal() as session:
                sub = session.query(SavedTripSubscription).filter(SavedTripSubscription.public_id == subscription_id).first()
                if not sub:
                    return False
                sub.is_active = False
                for alert in session.query(ActionableAlert).filter(ActionableAlert.subscription_id == sub.id, ActionableAlert.status == "ACTIVE").all():
                    alert.status = "EXPIRED"
                    alert.valid_to = utcnow()
                    alert.updated_at = utcnow()
                session.commit()
                AlertService._monitored_trips_mission_state.pop(subscription_id, None)
                return True
        except Exception as exc:
            logger.warning("Could not stop monitoring: %s", exc)
            return False

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
            return False

    @staticmethod
    def reassess_saved_trips():
        """Worker function to reassess all active trips and generate alerts."""
        logger.info("Running saved trips reassessment...")
        try:
            session_ctx = SessionLocal()
        except Exception as e:
            logger.warning(f"Database unavailable for reassess_saved_trips (skipping): {e}")
            return

        with session_ctx as session:
            try:
                active_subs = session.query(SavedTripSubscription).filter(SavedTripSubscription.is_active == True).all()
            except Exception as e:
                logger.warning(f"Database query unavailable for reassess_saved_trips (skipping): {e}")
                return

            for sub in active_subs:
                try:
                    # Deactivate trip if departure/return time is invalid
                    if sub.departure_time and sub.return_time and sub.return_time <= sub.departure_time:
                        logger.warning(f"Deactivating invalid trip {sub.public_id}: return_time ({sub.return_time}) is not after departure_time ({sub.departure_time})")
                        sub.is_active = False
                        session.commit()
                        continue

                    stored_ms = sub.mission_context_json or AlertService._monitored_trips_mission_state.get(str(sub.public_id))
                    if stored_ms:
                        stored_ms = MissionState.model_validate(stored_ms)

                    req = TripAssessmentRequest(
                        origin_harbor=sub.origin_harbor,
                        coordinates=(stored_ms.origin.longitude, stored_ms.origin.latitude) if stored_ms and stored_ms.origin.longitude is not None and stored_ms.origin.latitude is not None else None,
                        destination_id=stored_ms.destination.name if stored_ms else None,
                        craft_profile=sub.craft_profile,
                        vessel_size=sub.vessel_size or "medium",
                        departure_time=sub.departure_time.isoformat() if sub.departure_time else None,
                        return_time=sub.return_time.isoformat() if sub.return_time else None,
                        language_preference=sub.language,
                        data_mode=sub.data_mode or "LIVE",
                        mission_state=stored_ms,
                    )
                    assessment = AssessmentService.assess_trip(req)

                    seen_hashes: set[str] = set()

                    for alert in assessment.alerts:
                        raw_msg = alert.get("message", "") if isinstance(alert, dict) else ""
                        title = alert.get("title") if isinstance(alert, dict) else getattr(alert, "title", None)
                        severity = alert.get("severity") if isinstance(alert, dict) else getattr(alert, "severity", None)
                        description = alert.get("description") if isinstance(alert, dict) else getattr(alert, "description", None)
                        action = alert.get("action") if isinstance(alert, dict) else getattr(alert, "action", None)
                        if not action and isinstance(alert, dict):
                            action = alert.get("recommended_action")

                        title = title or "Insufficient Evidence"
                        severity = severity or "medium"
                        description = description or raw_msg or "Assessment returned incomplete data for this timeframe."
                        action = action or "Verify real-time data sources before departure."

                        # Include action and severity so changing warnings are not suppressed
                        identity_str = f"{sub.id}_ASSESSMENT_ALERT_{title}_{severity}_{description}_{action}"
                        identity_hash = hashlib.sha256(identity_str.encode("utf-8")).hexdigest()
                        seen_hashes.add(identity_hash)

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
                        else:
                            AlertService._renew_alert(existing, assessment.assessment_id)

                    decision_value = assessment.decision.value if hasattr(assessment.decision, "value") else str(assessment.decision)
                    if decision_value in ("NO_GO", "CAUTION", "UNKNOWN"):
                        decision_summary = (
                            assessment.brief.summary if assessment.brief else f"Trip decision: {decision_value}"
                        )
                        decision_action = (
                            assessment.brief.recommended_action
                            if assessment.brief
                            else (
                                "Consult harbor authority before departure."
                                if decision_value != "UNKNOWN"
                                else "Clearance unavailable. Reassessment required before departure."
                            )
                        )
                        severity = "high" if decision_value == "NO_GO" else "medium"

                        identity_str = f"{sub.id}_ASSESSMENT_DECISION_{decision_value}_{decision_summary}_{decision_action}"
                        identity_hash = hashlib.sha256(identity_str.encode("utf-8")).hexdigest()
                        seen_hashes.add(identity_hash)

                        existing = session.query(ActionableAlert).filter(ActionableAlert.identity_hash == identity_hash).first()
                        if not existing:
                            new_alert = ActionableAlert(
                                subscription_id=sub.id,
                                assessment_id=assessment.assessment_id,
                                alert_type="ASSESSMENT_DECISION",
                                severity=severity,
                                title=f"Trip Decision: {decision_value}",
                                description=decision_summary,
                                recommended_action=decision_action,
                                status="ACTIVE",
                                is_acknowledged=False,
                                identity_hash=identity_hash,
                                valid_from=utcnow(),
                            )
                            session.add(new_alert)
                        else:
                            AlertService._renew_alert(existing, assessment.assessment_id)

                    # Expire previous active alerts for this trip that no longer apply in current assessment
                    old_active_alerts = session.query(ActionableAlert).filter(
                        ActionableAlert.subscription_id == sub.id,
                        ActionableAlert.status == "ACTIVE"
                    ).all()
                    for old_a in old_active_alerts:
                        if old_a.identity_hash not in seen_hashes:
                            old_a.status = "EXPIRED"
                            old_a.valid_to = utcnow()
                            old_a.updated_at = utcnow()

                    session.commit()
                    logger.info(f"Successfully reassessed trip {sub.public_id}.")
                except Exception as e:
                    logger.error(f"Error reassessing trip {sub.public_id}: {e}")
                    session.rollback()
