"""Dev 2 Interface Protocols & Payload Schemas (External Data & Connectors).

Owned by Dev 3 (Architecture & Interface Definition).
Implemented by Dev 2 (Backend Platform & External Connectors).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

CRITICAL ARCHITECTURAL BOUNDARY:
===============================================================================
Dev 2 implements connectors to external authorities (INCOIS, IMD, MOSDAC).
Dev 2 MUST satisfy these typed interface protocols and return standardized
payloads with authentic UTC timestamps and source names.
Dev 3 consumes these through adapters that normalize them into ToolResult.
===============================================================================
"""

from typing import Any, Dict, List, Optional, Protocol, runtime_checkable, TYPE_CHECKING
from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from backend.app.agents.integrations.contracts import ToolInvocationContext


# =============================================================================
# 1. Dev 2 Output Payload Schemas
# =============================================================================

class MarineConditionsPayload(BaseModel):
    """Normalized marine ocean state retrieved by Dev 2 connectors (INCOIS)."""

    harbor: Optional[str] = Field(None, description="Target coastal harbor or station")
    significant_wave_height_m: Optional[float] = Field(None, ge=0.0, description="Wave height in meters")
    swell_height_m: Optional[float] = Field(None, ge=0.0, description="Swell wave height in meters")
    swell_period_sec: Optional[float] = Field(None, ge=0.0, description="Swell period in seconds")
    wave_direction_deg: Optional[float] = Field(
        None, ge=0.0, le=360.0,
        description="Dominant wave direction in degrees (0=N, 90=E, 180=S, 270=W)",
    )
    surface_current_knots: Optional[float] = Field(None, description="Surface current speed in knots")
    sea_surface_temp_c: Optional[float] = Field(None, description="Sea surface temperature in Celsius")
    tide_level_m: Optional[float] = Field(None, description="Observed/model tide height in meters above the source datum")
    sea_level_height_m: Optional[float] = Field(None, description="Sea level height above mean sea level in meters")
    tide_phase: Optional[str] = Field(None, description="Tidal flow phase or estimated tide direction: rising | falling | unknown")
    tide_is_estimated: bool = Field(False, description="True when tide direction/height comes from forecast inference")
    hourly_forecast: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Canonical hourly marine records used by risk, route, and what-if evaluation",
    )
    observed_at: Optional[str] = Field(None, description="Sensor or satellite measurement timestamp (ISO-8601 UTC)")
    valid_to: Optional[str] = Field(None, description="Forecast window expiration (ISO-8601 UTC)")
    source_name: str = Field("INCOIS Ocean State Forecast", description="Official issuing authority")
    source_url: Optional[str] = Field(None, description="Direct URL to official bulletin or feed")
    freshness_flags: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Structured freshness and coverage metadata for frontend display. "
            "Keys: forecast_valid_time (ISO-8601), source_issue_time (ISO-8601 or null), "
            "retrieved_at (ISO-8601), cache_time (ISO-8601 or null), "
            "coverage_status (OK | GEOGRAPHIC_FALLBACK | WINDOW_UNAVAILABLE | SYNTHETIC_TIMESTAMPS)."
        ),
    )
    resolved_conflicts: Optional[List[Dict[str, Any]]] = Field(
        None, description="Records of resolved conflicts from other sources (source, value, reason)."
    )


class WeatherConditionsPayload(BaseModel):
    """Normalized coastal atmospheric weather retrieved by Dev 2 connectors (IMD)."""

    harbor: Optional[str] = Field(None, description="Target coastal station or harbor")
    wind_speed_knots: Optional[float] = Field(None, ge=0.0, description="Sustained wind speed in knots")
    wind_gust_knots: Optional[float] = Field(None, ge=0.0, description="Peak wind gust speed in knots")
    wind_direction_deg: Optional[float] = Field(None, ge=0.0, le=360.0, description="Wind direction in degrees")
    visibility_km: Optional[float] = Field(None, ge=0.0, description="Horizontal visibility in kilometers")
    observed_at: Optional[str] = Field(None, description="Observation timestamp (ISO-8601 UTC)")
    valid_to: Optional[str] = Field(None, description="Advisory expiration (ISO-8601 UTC)")
    source_name: str = Field("IMD Coastal Weather Bulletin", description="Official issuing authority")
    source_url: Optional[str] = Field(None, description="Direct URL to official bulletin")
    hourly_forecast: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Canonical hourly weather records, including visibility in kilometers",
    )
    freshness_flags: Optional[Dict[str, Any]] = Field(default=None, description="Forecast provenance metadata")
    resolved_conflicts: Optional[List[Dict[str, Any]]] = Field(
        None, description="Records of resolved conflicts from other sources (source, value, reason)."
    )


class HazardBulletinPayload(BaseModel):
    """Severe weather and cyclone warnings retrieved by Dev 2 connectors (IMD)."""

    harbor: Optional[str] = Field(None, description="Monitored coastal zone or harbor")
    cyclone_warning_active: bool = Field(False, description="True if cyclone alert or depression is active")
    squall_alert: bool = Field(False, description="True if squall or high wind gale warning issued")
    bulletin_id: Optional[str] = Field(None, description="Official bulletin reference identifier")
    severity: str = Field("NORMAL", description="Severity category: NORMAL | WATCH | ALERT | WARNING")
    headline: Optional[str] = Field(None, description="Official headline from issuing authority")
    valid_from: Optional[str] = Field(None, description="Advisory start timestamp (ISO-8601 UTC)")
    valid_to: Optional[str] = Field(None, description="Advisory expiration timestamp (ISO-8601 UTC)")
    source_name: str = Field("IMD Cyclone Warning Division", description="Official issuing authority")
    source_url: Optional[str] = Field(None, description="Direct URL to warning bulletin")
    freshness_flags: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Structured freshness and coverage metadata for frontend display and verification.",
    )


class PFZSourceDataPayload(BaseModel):
    """Raw Potential Fishing Zone satellite vectors retrieved by Dev 2 connectors (INCOIS)."""

    features: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="GeoJSON features or records of thermal fronts and chlorophyll gradients",
    )
    bulletin_date: str = Field(..., description="Date of INCOIS PFZ advisory release (ISO-8601 UTC)")
    valid_to: str = Field(..., description="Validity expiration (ISO-8601 UTC)")
    source_name: str = Field("INCOIS PFZ Mission", description="Official issuing authority")
    source_url: Optional[str] = Field(None, description="Direct URL to PFZ geospatial layer")
    source_data_mode: Optional[str] = Field(None, description="Original source mode: LIVE | SNAPSHOT | DEMO | MOCK")
    data_mode: Optional[str] = Field(None, description="Data provenance mode: LIVE | SNAPSHOT | DEMO | MOCK")


class SVASAdvisoryPayload(BaseModel):
    """Normalized Small Vessel Advisory Services (SVAS) data retrieved by Dev 2 connectors (INCOIS)."""

    harbor: str = Field(..., description="Target coastal station or harbor")
    craft_profile: str = Field(..., description="Vessel class: traditional_non_motorized | motorized_boat | mechanized_trawler")
    advisory_status: str = Field("SAFE", description="Advisory status: SAFE | CAUTION | DANGER | NO_SAILING")
    safety_index: Optional[float] = Field(None, ge=0.0, le=10.0, description="Dimensionless composite risk index (0.0 - 10.0)")
    capsizing_risk: Optional[str] = Field("LOW", description="Capsizing risk rating: LOW | MODERATE | HIGH | VERY_HIGH")
    warning_statement: str = Field(..., description="Official safety advisory statement")
    issued_at: str = Field(..., description="Advisory release timestamp (ISO-8601 UTC)")
    valid_to: str = Field(..., description="Advisory expiration timestamp (ISO-8601 UTC)")
    source_name: str = Field("INCOIS SVAS", description="Official issuing authority")
    source_url: Optional[str] = Field(None, description="Direct URL to official SVAS bulletin")


# =============================================================================
# 2. Dev 2 Interface Protocols
# =============================================================================

@runtime_checkable
class MarineConditionsProvider(Protocol):
    """Interface that Dev 2's marine connector module must implement."""

    def get_marine_conditions(self, context: 'ToolInvocationContext') -> MarineConditionsPayload:
        """Fetches ocean state observations for the given operational context."""
        ...


@runtime_checkable
class WeatherConditionsProvider(Protocol):
    """Interface that Dev 2's weather connector module must implement."""

    def get_weather_conditions(self, context: 'ToolInvocationContext') -> WeatherConditionsPayload:
        """Fetches coastal atmospheric conditions for the given operational context."""
        ...


@runtime_checkable
class HazardBulletinsProvider(Protocol):
    """Interface that Dev 2's hazard/bulletin connector module must implement."""

    def get_hazard_bulletin(self, context: 'ToolInvocationContext') -> HazardBulletinPayload:
        """Fetches active storm, depression, and squall alerts for the given harbor."""
        ...


@runtime_checkable
class PFZSourceDataProvider(Protocol):
    """Interface that Dev 2's PFZ connector module must implement."""

    def get_pfz_raw_advisories(self, context: 'ToolInvocationContext') -> PFZSourceDataPayload:
        """Fetches raw INCOIS PFZ advisories for maritime analysis."""
        ...


@runtime_checkable
class SVASAdvisoryProvider(Protocol):
    """Interface that Dev 2's SVAS connector module must implement."""

    def get_svas_advisories(self, context: 'ToolInvocationContext') -> SVASAdvisoryPayload:
        """Fetches INCOIS Small Vessel Advisory Services advisory for vessel craft and harbor."""
        ...
