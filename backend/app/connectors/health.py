"""Health Checks for Connectors.

Owned by Dev 2 (Backend Platform).
"""

from typing import Any, Literal
from pydantic import BaseModel

SourceHealthStatus = Literal["CONFIGURED", "UNAVAILABLE", "FAILED", "STALE", "CACHED", "SUCCESS"]

class SourceHealth(BaseModel):
    """Explicit health check result for a genuine data source."""
    source_name: str
    status: SourceHealthStatus
    details: str | None = None
    last_retrieved: str | None = None
    is_live: bool = False

def get_connector_health(manager: Any) -> dict[str, Any]:
    """Returns the operational status of the ConnectorManager and its modes."""
    # We maintain the legacy schema for existing dashboard elements
    # but actual connectors will now implement methods to return SourceHealth instances.
    return {
        "mode": getattr(manager, "mode", getattr(manager, "data_mode", "UNKNOWN")),
        "snapshot_configured": getattr(manager, "snapshot", None) is not None,
        "marine_live_configured": getattr(manager, "marine_live", getattr(manager, "_incois", None)) is not None,
        "weather_live_configured": getattr(manager, "weather_live", getattr(manager, "_imd_weather", None)) is not None,
        "hazard_live_configured": getattr(manager, "hazard_live", getattr(manager, "_imd_hazard", None)) is not None,
        "pfz_live_configured": getattr(manager, "pfz_live", getattr(manager, "_incois", None)) is not None,
    }
