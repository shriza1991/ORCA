"""Actionable Alerts Router."""

from fastapi import APIRouter, HTTPException, status
from typing import Any

from backend.app.contracts.alerts import (
    AcknowledgeResponse,
    ActiveAlertsResponse,
    SavedTripRequest,
    SavedTripResponse,
)
from backend.app.services.alert_service import AlertService

router = APIRouter(prefix="/alerts", tags=["alerts"])

@router.post(
    "/monitor",
    response_model=SavedTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Register a trip for active monitoring"
)
def register_trip(request: SavedTripRequest) -> Any:
    try:
        return AlertService.register_trip_monitoring(request)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid trip inputs: {str(exc)}"
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to register trip: {str(exc)}"
        )


@router.get(
    "/{subscription_id}",
    response_model=ActiveAlertsResponse,
    status_code=status.HTTP_200_OK,
    summary="Poll for active alerts for a monitored trip"
)
def get_alerts(subscription_id: str) -> Any:
    try:
        alerts, monitoring_mode = AlertService.get_active_alerts(subscription_id)
        return ActiveAlertsResponse(
            subscription_id=subscription_id,
            alerts=alerts,
            monitoring_mode=monitoring_mode,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get alerts: {str(exc)}"
        )


@router.post(
    "/{alert_id}/acknowledge",
    response_model=AcknowledgeResponse,
    status_code=status.HTTP_200_OK,
    summary="Acknowledge an actionable alert"
)
def acknowledge_alert(alert_id: str) -> Any:
    try:
        success = AlertService.acknowledge_alert(alert_id)
        if not success:
            raise HTTPException(status_code=404, detail="Alert not found")
        return AcknowledgeResponse(
            success=True,
            alert_id=alert_id,
            is_acknowledged=True
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to acknowledge alert: {str(exc)}"
        )


@router.post("/{subscription_id}/stop")
def stop_monitoring(subscription_id: str):
    """Stop a durable subscription; foreground session monitoring is managed by its client."""
    if not AlertService.stop_monitoring(subscription_id):
        raise HTTPException(status_code=503, detail="Monitoring stop could not be confirmed; retry when connected.")
    return {"subscription_id": subscription_id, "success": True, "is_active": False}
