"""ObservationBundle Domain Contract for SAMUDRA.

Owned by Dev 2 (Backend Platform) & Dev 4 (Domain Intelligence).
Represents the immutable snapshot bundle of domain observations (marine, weather, hazard)
for a single analysis run.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, Optional
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from backend.app.agents.integrations.dev2 import (
        HazardBulletinPayload,
        MarineConditionsPayload,
        WeatherConditionsPayload,
    )
else:
    HazardBulletinPayload = Any
    MarineConditionsPayload = Any
    WeatherConditionsPayload = Any


class ObservationBundle(BaseModel):
    """Immutable snapshot bundle of normalized observations for one analysis run."""

    marine: Optional[MarineConditionsPayload] = Field(
        None, description="Normalized marine ocean state (INCOIS OSF / SWAN)"
    )
    weather: Optional[WeatherConditionsPayload] = Field(
        None, description="Normalized coastal atmospheric weather (IMD AWS)"
    )
    hazard: Optional[HazardBulletinPayload] = Field(
        None, description="Severe weather, cyclone, or squall warnings (IMD/INCOIS)"
    )
    captured_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="Timestamp when the snapshot bundle was assembled (ISO-8601 UTC)",
    )
    data_mode: str = Field(
        "SYNTHETIC", description="Operational data mode (SYNTHETIC | SNAPSHOT | LIVE | HYBRID)"
    )
    source_metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional provenance and quality metadata"
    )
