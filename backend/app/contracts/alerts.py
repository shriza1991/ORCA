"""Alert contracts.

Owned by Dev 2 (Backend Platform).
"""

from typing import Any, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class SavedTripRequest(BaseModel):
    origin_harbor: str = Field(..., description="Origin harbor name")
    craft_profile: str = Field(..., description="Vessel craft profile")
    departure_time: Optional[str] = Field(None, description="ISO-8601 departure time")
    return_time: Optional[str] = Field(None, description="ISO-8601 return time")
    language: str = Field("en", description="Preferred language for alerts")
    mission_state: Optional[Any] = Field(None, description="Canonical MissionState context")


class SavedTripResponse(BaseModel):
    subscription_id: str
    origin_harbor: str
    craft_profile: str
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


class AcknowledgeResponse(BaseModel):
    success: bool
    alert_id: str
    is_acknowledged: bool
