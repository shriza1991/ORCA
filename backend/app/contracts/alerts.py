"""Alert contracts.

Owned by Dev 2 (Backend Platform).
"""

from typing import Any, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class SavedTripRequest(BaseModel):
    origin_harbor: str = Field(..., description="Origin harbor name")
    craft_profile: str = Field(..., description="Vessel craft profile")
    vessel_size: Optional[str] = Field("medium", description="Vessel size classification: small | medium | large")
    departure_time: Optional[str] = Field(None, description="ISO-8601 departure time")
    return_time: Optional[str] = Field(None, description="ISO-8601 return time")
    language: str = Field("en", description="Preferred language for alerts")
    data_mode: Optional[str] = Field("LIVE", description="Intended data mode")
    coordinates: Optional[tuple[float, float]] = None
    destination_id: Optional[str] = None
    mission_state: Optional[Any] = Field(None, description="Canonical MissionState context")


class SavedTripResponse(BaseModel):
    subscription_id: str
    origin_harbor: str
    craft_profile: str
    vessel_size: Optional[str] = Field("medium", description="Vessel size classification: small | medium | large")
    data_mode: Optional[str] = Field("LIVE", description="Intended data mode")
    monitoring_mode: str = Field("durable", description="Truthful monitoring mode: durable | session-only | unavailable")
    is_active: bool
    created_at: datetime
    mission_state: Optional[Any] = Field(None, description="Canonical MissionState context")


class ActionableAlertDto(BaseModel):
    id: str
    alert_type: str
    severity: str
    title: str
    description: str
    recommended_action: str
    status: str
    is_acknowledged: bool
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    created_at: datetime


class ActiveAlertsResponse(BaseModel):
    subscription_id: str
    alerts: List[ActionableAlertDto]
    monitoring_mode: str = Field("durable", description="Truthful monitoring mode: durable | session-only | unavailable | degraded")


class AcknowledgeResponse(BaseModel):
    success: bool
    alert_id: str
    is_acknowledged: bool
