"""Harbor Coordinate Resolver & Reference Data Loaders.

Owned by Dev 2 (Backend Platform).

Provides:
1. Deterministic mapping and lookup for Indian coastal landing centres (harbors).
2. Typed loaders for reference catalogs (`landing_centres.json`, `vessel_profiles.json`).
3. Coordinate resolver supporting explicit coordinates or harbor name fallback.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field, field_validator

from backend.app.connectors.base import validate_coordinates, validate_iso8601

if TYPE_CHECKING:
    from backend.app.agents.integrations.contracts import ToolInvocationContext

logger = logging.getLogger(__name__)

# =============================================================================
# Canonical Pydantic Reference Models
# =============================================================================


class LandingCentreRecord(BaseModel):
    """Canonical Landing Centre reference record."""

    id: str = Field(..., description="Unique landing centre ID, e.g. HARB-RAT-01")
    name: str = Field(..., description="Landing centre / harbor name")
    state: str = Field(..., description="Coastal state or UT")
    latitude: float = Field(..., description="Latitude coordinate in EPSG:4326")
    longitude: float = Field(..., description="Longitude coordinate in EPSG:4326")
    source: str = Field(..., description="Issuing authority / data source")
    updated_at: str = Field(..., description="ISO-8601 UTC timestamp")

    @field_validator("latitude")
    @classmethod
    def check_lat(cls, v: float) -> float:
        if not (-90.0 <= v <= 90.0):
            raise ValueError(f"Latitude {v} out of range [-90, 90]")
        return v

    @field_validator("longitude")
    @classmethod
    def check_lon(cls, v: float) -> float:
        if not (-180.0 <= v <= 180.0):
            raise ValueError(f"Longitude {v} out of range [-180, 180]")
        return v

    @field_validator("updated_at")
    @classmethod
    def check_ts(cls, v: str) -> str:
        return validate_iso8601(v)


class VesselLimits(BaseModel):
    """Operational wave and wind limits for a vessel profile."""

    wave_caution_m: float = Field(..., ge=0.0)
    wave_nogo_m: float = Field(..., ge=0.0)
    wind_caution_knots: float = Field(..., ge=0.0)
    wind_nogo_knots: float = Field(..., ge=0.0)
    gust_caution_knots: float = Field(..., ge=0.0)
    gust_nogo_knots: float = Field(..., ge=0.0)
    swell_caution_m: float = Field(..., ge=0.0)
    swell_nogo_m: float = Field(..., ge=0.0)

    @field_validator("wave_nogo_m")
    @classmethod
    def check_wave_limits(cls, v: float, info: Any) -> float:
        caution = info.data.get("wave_caution_m")
        if caution is not None and v < caution:
            raise ValueError(f"wave_nogo_m ({v}) cannot be less than wave_caution_m ({caution})")
        return v

    @field_validator("wind_nogo_knots")
    @classmethod
    def check_wind_limits(cls, v: float, info: Any) -> float:
        caution = info.data.get("wind_caution_knots")
        if caution is not None and v < caution:
            raise ValueError(f"wind_nogo_knots ({v}) cannot be less than wind_caution_knots ({caution})")
        return v

    @field_validator("gust_nogo_knots")
    @classmethod
    def check_gust_limits(cls, v: float, info: Any) -> float:
        caution = info.data.get("gust_caution_knots")
        if caution is not None and v < caution:
            raise ValueError(f"gust_nogo_knots ({v}) cannot be less than gust_caution_knots ({caution})")
        return v

    @field_validator("swell_nogo_m")
    @classmethod
    def check_swell_limits(cls, v: float, info: Any) -> float:
        caution = info.data.get("swell_caution_m")
        if caution is not None and v < caution:
            raise ValueError(f"swell_nogo_m ({v}) cannot be less than swell_caution_m ({caution})")
        return v


class VesselProfileRecord(BaseModel):
    """Canonical Vessel Profile reference record."""

    profile_id: str = Field(..., description="Unique profile identifier, e.g. motorized_boat")
    category: str = Field(..., description="Craft classification description")
    length_overall_m: float = Field(..., gt=0.0)
    beam_m: float = Field(..., gt=0.0)
    draft_m: float = Field(..., gt=0.0)
    engine_type: str = Field(..., description="Engine type description")
    operational_range_nm: float = Field(..., gt=0.0)
    max_crew: int = Field(..., gt=0)
    safety_limits: VesselLimits
    source: str = Field(..., description="Authoritative classification source")
    version: str = Field(..., description="Schema or dataset version")


# =============================================================================
# In-Memory Cache and Catalog Indexes
# =============================================================================

_LANDING_CENTRES_BY_KEY: Dict[str, LandingCentreRecord] = {}
_VESSEL_PROFILES_BY_ID: Dict[str, VesselProfileRecord] = {}
_REFERENCE_INITIALIZED = False

_DEFAULT_LAT = 16.99
_DEFAULT_LON = 73.28  # Ratnagiri


def load_landing_centres(file_path: str | Path | None = None) -> List[LandingCentreRecord]:
    """Loads and validates landing centre records from JSON file.

    Raises FileNotFoundError if file is missing.
    Raises ValueError if records are malformed or invalid.
    """
    path = Path(file_path or "data/reference/landing_centres.json")
    if not path.exists():
        raise FileNotFoundError(f"Landing centres reference catalog not found: {path}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Malformed JSON in landing centres catalog {path}: {exc}") from exc

    if not isinstance(raw_data, list):
        raise ValueError(f"Expected list of landing centres in {path}, got {type(raw_data).__name__}")

    records = [LandingCentreRecord(**item) for item in raw_data]
    return records


def load_vessel_profiles(file_path: str | Path | None = None) -> List[VesselProfileRecord]:
    """Loads and validates vessel profiles from JSON file.

    Raises FileNotFoundError if file is missing.
    Raises ValueError if records are malformed or invalid.
    """
    path = Path(file_path or "data/reference/vessel_profiles.json")
    if not path.exists():
        raise FileNotFoundError(f"Vessel profiles reference catalog not found: {path}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Malformed JSON in vessel profiles catalog {path}: {exc}") from exc

    if not isinstance(raw_data, list):
        raise ValueError(f"Expected list of vessel profiles in {path}, got {type(raw_data).__name__}")

    records = [VesselProfileRecord(**item) for item in raw_data]
    return records


def init_reference_catalogs(
    landing_centres_path: str | Path | None = None,
    vessel_profiles_path: str | Path | None = None,
    force_reload: bool = False,
) -> None:
    """Initializes in-memory lookup indexes for harbors and vessel profiles."""
    global _LANDING_CENTRES_BY_KEY, _VESSEL_PROFILES_BY_ID, _REFERENCE_INITIALIZED

    if _REFERENCE_INITIALIZED and not force_reload:
        return

    # Load Landing Centres
    try:
        centres = load_landing_centres(landing_centres_path)
        new_centres: Dict[str, LandingCentreRecord] = {}
        for c in centres:
            new_centres[c.name.strip().lower()] = c
            new_centres[c.id.strip().lower()] = c
        _LANDING_CENTRES_BY_KEY = new_centres
    except Exception as exc:
        logger.warning(f"Could not load canonical landing_centres.json: {exc}")
        if force_reload:
            raise

    # Load Vessel Profiles
    try:
        profiles = load_vessel_profiles(vessel_profiles_path)
        _VESSEL_PROFILES_BY_ID = {p.profile_id.strip().lower(): p for p in profiles}
    except Exception as exc:
        logger.warning(f"Could not load canonical vessel_profiles.json: {exc}")
        if force_reload:
            raise

    _REFERENCE_INITIALIZED = True


def get_landing_centre(name_or_id: str) -> Optional[LandingCentreRecord]:
    """Deterministically looks up a landing centre by name or id."""
    if not _REFERENCE_INITIALIZED:
        init_reference_catalogs()
    key = name_or_id.strip().lower()
    return _LANDING_CENTRES_BY_KEY.get(key)


def get_vessel_profile(profile_id: str) -> Optional[VesselProfileRecord]:
    """Deterministically looks up a vessel profile by profile_id."""
    if not _REFERENCE_INITIALIZED:
        init_reference_catalogs()
    key = profile_id.strip().lower()
    return _VESSEL_PROFILES_BY_ID.get(key)


# Standard reference coordinates for major Indian coastal harbors (fallback lookup)
HARBOR_COORDINATES: dict[str, tuple[float, float]] = {
    "ratnagiri": (16.99, 73.28),
    "mumbai": (18.92, 72.87),
    "goa": (15.299, 73.911),
    "mangalore": (12.872, 74.842),
    "kochi": (9.931, 76.267),
    "chennai": (13.082, 80.270),
    "visakhapatnam": (17.685, 83.218),
    "kolkata": (22.572, 88.363),
    "veraval": (20.905, 70.365),
    "puri": (19.810, 85.832),
    "tuticorin": (8.804, 78.135),
    "porbandar": (21.64, 69.60),
    "malpe": (13.35, 74.70),
    "panaji": (15.49, 73.83),
    "paradip": (20.32, 86.67),
}


def resolve_coordinates(context: ToolInvocationContext) -> tuple[float, float]:
    """Resolve (latitude, longitude) from context, with landing centre catalog lookup fallback.

    Returns:
        (latitude, longitude)

    Raises:
        ValueError if coordinates cannot be resolved.
    """
    if context.coordinates and len(context.coordinates) >= 2:
        lon, lat = float(context.coordinates[0]), float(context.coordinates[1])
        validate_coordinates(lon, lat)
        return lat, lon

    harbor_key = (context.origin_harbor or "").strip().lower()
    if not harbor_key:
        raise ValueError("Cannot resolve coordinates: both coordinates and origin_harbor are missing.")

    # 1. Try canonical landing centre catalog
    record = get_landing_centre(harbor_key)
    if record is not None:
        return record.latitude, record.longitude

    # 2. Try static fallback table
    if harbor_key in HARBOR_COORDINATES:
        return HARBOR_COORDINATES[harbor_key]

    # 3. Default fallback to Ratnagiri baseline
    return (_DEFAULT_LAT, _DEFAULT_LON)
