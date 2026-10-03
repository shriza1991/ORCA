"""Deterministic Maritime Geofence and Restricted Zone Intersection Engine.

Owned by Dev 4 (Marine, Geo, Risk & Route Intelligence).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

CRITICAL INVARIANTS:
1. Deterministic GIS evaluation using Shapely geometry and geodesic/metric projection.
2. The LLM NEVER evaluates whether a coordinate or route breaches a restricted boundary.
3. Supports point-in-polygon, boundary proximity, and trajectory line-string intersection checks.
4. Checks validity time windows and distinguishes hard stops (NO_GO) from advisory alerts (CAUTION).
5. State taxonomy: CLEAR, APPROACHING, INSIDE, UNKNOWN.
"""

from __future__ import annotations

import json
import logging
import math
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from pydantic import BaseModel, Field
import shapely.ops
from shapely.geometry import LineString, Point, Polygon, MultiPolygon, shape

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev4 import (
    GeospatialHazardEngine,
    GeospatialHazardPayload,
)
from backend.app.connectors.harbors import resolve_coordinates

logger = logging.getLogger(__name__)

# Mean Earth radius in kilometers for WGS84 / great-circle calculations
EARTH_RADIUS_KM = 6371.0088


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two geographic coordinates in kilometers."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    r_lat1 = math.radians(lat1)
    r_lat2 = math.radians(lat2)

    a = math.sin(dlat / 2.0) ** 2 + math.cos(r_lat1) * math.cos(r_lat2) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return EARTH_RADIUS_KM * c


def compute_metric_distance_km(geom: Union[Point, LineString], poly_geom: Any) -> float:
    """Computes exact metric distance in kilometers from a point or line to a polygon or multipolygon.

    If the geometry intersects or is covered by the polygon (inside or touching boundary),
    returns 0.0. Otherwise, uses an equirectangular metric projection centered at the query
    coordinates, preserving geodesic fidelity across coastal operational scales.
    Handles Polygon and MultiPolygon with interior rings (holes) deterministically.
    """
    if poly_geom.intersects(geom) or poly_geom.covers(geom):
        return 0.0

    if isinstance(geom, Point):
        lon0, lat0 = geom.x, geom.y
    else:
        coords = list(geom.coords)
        lon0, lat0 = coords[0][0], coords[0][1]

    lat0_rad = math.radians(lat0)
    cos_lat0 = math.cos(lat0_rad)
    scale_x = math.radians(1.0) * EARTH_RADIUS_KM * cos_lat0
    scale_y = math.radians(1.0) * EARTH_RADIUS_KM

    # Project to local metric Cartesian plane centered at (lon0, lat0)
    p_poly = shapely.ops.transform(
        lambda x, y, *args: ((x - lon0) * scale_x, (y - lat0) * scale_y),
        poly_geom,
    )
    p_geom = shapely.ops.transform(
        lambda x, y, *args: ((x - lon0) * scale_x, (y - lat0) * scale_y),
        geom,
    )
    return float(p_poly.distance(p_geom))


def validate_coordinates(lon: Any, lat: Any) -> Tuple[float, float]:
    """Validates finite numerical longitude and latitude within legal EPSG:4326 ranges."""
    if lon is None or lat is None or isinstance(lon, bool) or isinstance(lat, bool):
        raise ValueError("Coordinates must be non-null numerical values")
    try:
        f_lon = float(lon)
        f_lat = float(lat)
    except (TypeError, ValueError):
        raise ValueError("Coordinates must be valid floats")
    if not math.isfinite(f_lon) or not math.isfinite(f_lat):
        raise ValueError("Coordinates must be finite numbers")
    if not (-180.0 <= f_lon <= 180.0):
        raise ValueError(f"Longitude {f_lon} out of range [-180, 180]")
    if not (-90.0 <= f_lat <= 90.0):
        raise ValueError(f"Latitude {f_lat} out of range [-90, 90]")
    return (f_lon, f_lat)


def parse_validity_datetime(val: Any) -> Optional[datetime]:
    """Parses an ISO datetime string into UTC datetime, returning None if absent or raising ValueError."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo is not None else val.replace(tzinfo=UTC)
    if isinstance(val, str):
        cleaned = val.strip()
        if not cleaned:
            return None
        cleaned = cleaned.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)
    raise ValueError(f"Unsupported datetime representation: {type(val)}")


def is_restriction_active(
    poly_item: Dict[str, Any],
    evaluation_time: datetime,
) -> Tuple[bool, Optional[str]]:
    """Evaluates whether a restriction polygon is temporally effective at evaluation_time.

    Returns:
        (is_active, status_reason)
        status_reason is one of:
        - "ACTIVE": effective
        - "FUTURE": valid_from > evaluation_time
        - "EXPIRED": valid_to < evaluation_time
        - "MALFORMED_VALIDITY": parse failure
    """
    raw_from = poly_item.get("valid_from")
    raw_to = poly_item.get("valid_to")

    parsed_from: Optional[datetime] = None
    parsed_to: Optional[datetime] = None

    if raw_from:
        try:
            parsed_from = parse_validity_datetime(raw_from)
        except Exception:
            return False, "MALFORMED_VALIDITY"

    if raw_to:
        try:
            parsed_to = parse_validity_datetime(raw_to)
        except Exception:
            return False, "MALFORMED_VALIDITY"

    if parsed_from and parsed_to and parsed_from > parsed_to:
        return False, "MALFORMED_VALIDITY"

    if parsed_from and evaluation_time < parsed_from:
        return False, "FUTURE"

    if parsed_to and evaluation_time > parsed_to:
        return False, "EXPIRED"

    return True, "ACTIVE"


class BoundaryWarning(BaseModel):
    """Structured advisory/warning record for a specific evaluated maritime boundary."""

    boundary_id: str = Field(..., description="Unique boundary polygon or restriction identifier")
    boundary_name: str = Field(..., description="Human-readable boundary or zone name")
    boundary_type: str = Field(..., description="Classification (e.g. NAVAL_FIRING_RANGE, MPA_SANCTUARY_CORE)")
    distance_km: float = Field(..., ge=0.0, description="Exact metric distance to perimeter in km (0.0 if inside/touching)")
    is_inside: bool = Field(False, description="True if coordinates are geometrically inside or on perimeter")
    is_hard_restriction: bool = Field(False, description="True if boundary is a hard exclusion zone")
    restriction_level: str = Field("CAUTION", description="NO_GO | CAUTION | INFORMATIONAL")
    time_to_cross_hours: Optional[float] = Field(None, description="Projected time-to-cross if heading/speed intercept")
    projected_crossing: bool = Field(False, description="True if forward trajectory intercepts boundary within lookahead")
    source_mode: str = Field("OFFLINE_FIXTURE", description="Data provenance (OFFLINE_FIXTURE | REFERENCE | DEMO)")
    coverage_limitation: Optional[str] = Field(
        default=None,
        description="Explicit limitation notice regarding evaluated region coverage",
    )


class LocationEvaluationResult(BaseModel):
    """Authoritative deterministic location evaluation response produced by Dev 4."""

    evaluation_state: str = Field(..., description="CLEAR | APPROACHING | INSIDE | UNKNOWN")
    evaluated_at: str = Field(..., description="ISO UTC timestamp of evaluation execution")
    location_timestamp: Optional[float] = Field(None, description="Location fix timestamp (ms) if provided")
    coordinates: Optional[List[float]] = Field(None, description="[longitude, latitude] evaluated")
    approach_threshold_km: float = Field(10.0, description="Authoritative distance threshold in km for APPROACHING warnings")
    warnings: List[BoundaryWarning] = Field(default_factory=list, description="Sorted list of applicable boundary warnings")
    primary_warning: Optional[BoundaryWarning] = Field(None, description="Highest-severity boundary warning if present")
    coverage_scope: str = Field(
        default="Evaluated against reference maritime restrictions and geofence polygons. CLEAR indicates no restrictions within evaluated coverage; not a certified navigational clearance.",
        description="Epistemic coverage statement",
    )
    unknown_reason: Optional[str] = Field(None, description="Reason if evaluation_state is UNKNOWN")
    data_mode: str = Field("DEMO", description="Operational or fixture data mode")


class DeterministicGeospatialEngine(GeospatialHazardEngine):
    """Deterministic geospatial hazard and boundary evaluation engine."""

    APPROACH_THRESHOLD_KM: float = 10.0

    def __init__(
        self,
        restrictions_path: str | Path | None = None,
        geofences_path: str | Path | None = None,
    ) -> None:
        self.restrictions_path = Path(restrictions_path or "data/reference/marine_restrictions.geojson")
        self.geofences_path = Path(geofences_path or "data/fixtures/geofences_india.geojson")
        self._polygons: List[Dict[str, Any]] = []
        self._loaded_successfully: bool = False
        self._load_error: Optional[str] = None
        self._load_features()

    def _load_features(self) -> None:
        features: List[Dict[str, Any]] = []
        files_attempted = 0
        files_loaded = 0

        # 1. Load canonical reference restrictions if present
        if self.restrictions_path.exists():
            files_attempted += 1
            try:
                with open(self.restrictions_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    features.extend(data.get("features", []))
                    files_loaded += 1
            except Exception as exc:
                logger.warning(f"Failed to load marine restrictions from {self.restrictions_path}: {exc}")
                self._load_error = str(exc)

        # 2. Fall back / supplement with geofences fixture
        if self.geofences_path.exists():
            files_attempted += 1
            try:
                with open(self.geofences_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for feat in data.get("features", []):
                        fid = feat.get("id") or feat.get("properties", {}).get("polygon_id")
                        existing_ids = {
                            x.get("id") or x.get("properties", {}).get("restriction_id")
                            for x in features
                        }
                        if fid not in existing_ids:
                            features.append(feat)
                    files_loaded += 1
            except Exception as exc:
                logger.warning(f"Failed to load geofences from {self.geofences_path}: {exc}")
                self._load_error = str(exc)

        if files_attempted == 0:
            self._load_error = f"Neither {self.restrictions_path} nor {self.geofences_path} exists."

        parsed_polygons: List[Dict[str, Any]] = []
        canonical_ids = set()
        for feat in features:
            geom_data = feat.get("geometry")
            if not geom_data:
                continue
            try:
                props = feat.get("properties", {})
                level = str(props.get("restriction_level", "NO_GO")).upper()
                poly_type = str(props.get("type") or props.get("polygon_type", "RESTRICTED_ZONE")).upper()

                # Informational national boundaries (EEZ, Territorial Waters) are sovereign base map layers,
                # NOT hazardous or prohibited civilian exclusion zones.
                if level == "INFORMATIONAL" or poly_type in ("EEZ_BOUNDARY", "TERRITORIAL_WATERS", "NATIONAL_BOUNDARY"):
                    continue

                geom = shape(geom_data)
                boundary_id = feat.get("id") or props.get("restriction_id") or props.get("polygon_id")
                # REST and POLY are source prefixes for the same canonical seeded zone.
                # Reference records are loaded first and retain their validity metadata.
                canonical_id = props.get("canonical_id") or re.sub(r"^(REST|POLY)-", "", str(boundary_id))
                if boundary_id and canonical_id in canonical_ids:
                    continue
                if boundary_id:
                    canonical_ids.add(canonical_id)
                parsed_polygons.append({
                    "id": feat.get("id") or props.get("restriction_id") or props.get("polygon_id"),
                    "name": props.get("name", "Restricted Sector"),
                    "type": poly_type,
                    "restriction_level": level,
                    "is_hard_restriction": bool(props.get("is_hard_restriction", False) or level == "NO_GO"),
                    "valid_from": props.get("valid_from"),
                    "valid_to": props.get("valid_to"),
                    "geometry": geom,
                    "source": "reference" if self.restrictions_path.name in str(self.restrictions_path) else "fixture",
                })
            except Exception as exc:
                logger.warning(f"Skipping malformed polygon geometry: {exc}")

        self._polygons = parsed_polygons
        self._loaded_successfully = len(self._polygons) > 0 or (files_loaded > 0 and len(features) == 0)

    def evaluate_location(
        self,
        coordinates: Optional[Union[List[float], Tuple[float, float]]],
        heading_degrees: Optional[float] = None,
        speed_knots: Optional[float] = None,
        evaluation_time: Optional[datetime] = None,
        lookahead_hours: float = 2.0,
        location_timestamp: Optional[float] = None,
    ) -> LocationEvaluationResult:
        """Evaluates a live vessel coordinate against active restricted boundaries.

        Returns an authoritative deterministic LocationEvaluationResult with:
        - CLEAR: successfully evaluated with no active restrictions within proximity threshold
        - APPROACHING: outside, but within approach_threshold_km or on an intercept course
        - INSIDE: confirmed geometrically inside or touching perimeter
        - UNKNOWN: missing/invalid coordinates or boundary dataset failure
        """
        now_utc = evaluation_time or datetime.now(UTC)
        eval_time_iso = now_utc.isoformat()

        # Check boundary data availability
        if not self._loaded_successfully and not self._polygons:
            return LocationEvaluationResult(
                evaluation_state="UNKNOWN",
                evaluated_at=eval_time_iso,
                location_timestamp=location_timestamp,
                coordinates=None,
                approach_threshold_km=self.APPROACH_THRESHOLD_KM,
                warnings=[],
                primary_warning=None,
                unknown_reason="RESTRICTION_DATASET_UNAVAILABLE",
            )

        # Validate coordinates
        if coordinates is None:
            return LocationEvaluationResult(
                evaluation_state="UNKNOWN",
                evaluated_at=eval_time_iso,
                location_timestamp=location_timestamp,
                coordinates=None,
                approach_threshold_km=self.APPROACH_THRESHOLD_KM,
                warnings=[],
                primary_warning=None,
                unknown_reason="COORDINATES_MISSING",
            )

        try:
            if len(coordinates) < 2:
                raise ValueError("Expected at least [lon, lat]")
            lon, lat = validate_coordinates(coordinates[0], coordinates[1])
        except Exception as exc:
            return LocationEvaluationResult(
                evaluation_state="UNKNOWN",
                evaluated_at=eval_time_iso,
                location_timestamp=location_timestamp,
                coordinates=None,
                approach_threshold_km=self.APPROACH_THRESHOLD_KM,
                warnings=[],
                primary_warning=None,
                unknown_reason=f"INVALID_COORDINATES: {exc}",
            )

        pt = Point(lon, lat)
        evaluated_coords = [lon, lat]

        # Calculate projected course if heading and speed are supplied
        has_trajectory = (
            heading_degrees is not None
            and speed_knots is not None
            and speed_knots > 0.1
            and math.isfinite(heading_degrees)
            and math.isfinite(speed_knots)
        )
        proj_line: Optional[LineString] = None
        if has_trajectory:
            dist_km = max(0.1, speed_knots * 1.852 * lookahead_hours)
            theta = math.radians(heading_degrees % 360.0)
            d_sigma = dist_km / EARTH_RADIUS_KM
            lat1_rad = math.radians(lat)
            lon1_rad = math.radians(lon)

            lat2_rad = math.asin(
                math.sin(lat1_rad) * math.cos(d_sigma)
                + math.cos(lat1_rad) * math.sin(d_sigma) * math.cos(theta)
            )
            lon2_rad = lon1_rad + math.atan2(
                math.sin(theta) * math.sin(d_sigma) * math.cos(lat1_rad),
                math.cos(d_sigma) - math.sin(lat1_rad) * math.sin(lat2_rad),
            )
            lon2 = math.degrees(lon2_rad)
            lat2 = math.degrees(lat2_rad)
            proj_line = LineString([(lon, lat), (lon2, lat2)])

        applicable_warnings: List[BoundaryWarning] = []
        malformed_nearby = False

        for poly_item in self._polygons:
            is_active, reason = is_restriction_active(poly_item, now_utc)
            if not is_active:
                if reason == "MALFORMED_VALIDITY":
                    geometry = poly_item["geometry"]
                    if compute_metric_distance_km(pt, geometry) <= self.APPROACH_THRESHOLD_KM or (proj_line is not None and geometry.intersects(proj_line)):
                        malformed_nearby = True
                continue

            poly_geom = poly_item["geometry"]
            is_inside = bool(poly_geom.intersects(pt) or poly_geom.covers(pt))
            raw_dist_km = compute_metric_distance_km(pt, poly_geom)

            # Check projected intersection if trajectory exists
            projected_crossing = False
            time_to_cross_hours: Optional[float] = None
            if proj_line is not None and not is_inside and poly_geom.intersects(proj_line):
                # Calculate entry intersection
                boundary_intersect = poly_geom.boundary.intersection(proj_line)
                if hasattr(boundary_intersect, "geoms") and len(boundary_intersect.geoms) > 0:
                    pt_closest = min(boundary_intersect.geoms, key=lambda p: pt.distance(p))
                elif hasattr(boundary_intersect, "x"):
                    pt_closest = boundary_intersect
                else:
                    pt_closest = pt

                entry_dist_km = haversine_distance_km(lat, lon, pt_closest.y, pt_closest.x)
                speed_kmh = max(0.5, speed_knots * 1.852)
                ttc = entry_dist_km / speed_kmh
                if ttc <= lookahead_hours:
                    projected_crossing = True
                    time_to_cross_hours = round(ttc, 2)

            is_near = raw_dist_km <= self.APPROACH_THRESHOLD_KM

            if is_inside or is_near or projected_crossing:
                display_dist = 0.0 if is_inside else round(raw_dist_km, 2)
                applicable_warnings.append(
                    BoundaryWarning(
                        boundary_id=poly_item["id"],
                        boundary_name=poly_item["name"],
                        boundary_type=poly_item["type"],
                        distance_km=display_dist,
                        is_inside=is_inside,
                        is_hard_restriction=poly_item["is_hard_restriction"],
                        restriction_level=poly_item["restriction_level"],
                        time_to_cross_hours=time_to_cross_hours,
                        projected_crossing=projected_crossing,
                        source_mode="OFFLINE_FIXTURE",
                        coverage_limitation="Evaluated against Maharashtra / Goa / Gujarat coastal reference data.",
                    )
                )

        # Deterministic sorting:
        # 1. is_inside (0 for inside, 1 for outside)
        # 2. is_hard_restriction (0 for hard, 1 for soft)
        # 3. distance_km
        # 4. boundary_id
        applicable_warnings.sort(
            key=lambda w: (
                0 if w.is_inside else 1,
                0 if w.is_hard_restriction else 1,
                w.distance_km,
                w.boundary_id,
            )
        )

        # Deterministic state precedence:
        # - Any confirmed inside -> INSIDE
        # - Else any approaching or projected crossing -> APPROACHING
        # - Else -> CLEAR
        has_inside = any(w.is_inside for w in applicable_warnings)
        has_approaching = any(
            (not w.is_inside and (w.distance_km <= self.APPROACH_THRESHOLD_KM or w.projected_crossing))
            for w in applicable_warnings
        )

        if has_inside:
            state = "INSIDE"
        elif malformed_nearby:
            state = "UNKNOWN"
        elif has_approaching:
            state = "APPROACHING"
        else:
            state = "CLEAR"

        primary = applicable_warnings[0] if applicable_warnings else None

        return LocationEvaluationResult(
            evaluation_state=state,
            evaluated_at=eval_time_iso,
            location_timestamp=location_timestamp,
            coordinates=evaluated_coords,
            approach_threshold_km=self.APPROACH_THRESHOLD_KM,
            warnings=applicable_warnings,
            primary_warning=primary,
            coverage_scope="Evaluated against available reference marine restrictions and geofence polygons. CLEAR indicates no applicable restrictions within evaluated coverage; not a certified navigational clearance.",
            unknown_reason="MALFORMED_RESTRICTION_VALIDITY" if state == "UNKNOWN" else None,
            data_mode="DEMO",
        )

    def check_geofence_hazards(
        self,
        context: ToolInvocationContext,
        coordinates: Union[List[float], List[List[float]]],
    ) -> GeospatialHazardPayload:
        """Performs deterministic spatial intersection for a point [lon, lat] or passage line [[lon, lat], ...]."""
        if not coordinates:
            try:
                lat, lon = resolve_coordinates(context)
                coordinates = [lon, lat]
            except Exception:
                coordinates = [73.28, 16.99]

        now_utc = datetime.now(UTC)

        # Determine if coordinates is a point [lon, lat] or a route line [[lon, lat], ...]
        geom: Union[Point, LineString]
        if isinstance(coordinates[0], (int, float)):
            lon, lat = float(coordinates[0]), float(coordinates[1])
            geom = Point(lon, lat)
            point_for_dist = geom
        else:
            line_coords = [(float(pt[0]), float(pt[1])) for pt in coordinates]
            if len(line_coords) == 1:
                geom = Point(line_coords[0][0], line_coords[0][1])
                point_for_dist = geom
            else:
                geom = LineString(line_coords)
                point_for_dist = Point(line_coords[0][0], line_coords[0][1])

        min_distance_km: Optional[float] = None
        intersected_poly: Optional[Dict[str, Any]] = None

        for poly_item in self._polygons:
            is_active, _ = is_restriction_active(poly_item, now_utc)
            if not is_active:
                continue

            poly_geom = poly_item["geometry"]
            if poly_geom.intersects(geom):
                intersected_poly = poly_item
                min_distance_km = 0.0
                break

            # Exact metric projection distance calculation
            dist_km = compute_metric_distance_km(geom, poly_geom)
            if min_distance_km is None or dist_km < min_distance_km:
                min_distance_km = dist_km

        if intersected_poly is not None:
            is_hard = intersected_poly["is_hard_restriction"]
            return GeospatialHazardPayload(
                intersected=True,
                restriction_name=intersected_poly["name"],
                restriction_type=intersected_poly["type"],
                distance_to_boundary_km=0.0,
                hard_stop=is_hard,
                restricted=True,
            )

        # Proximity threshold: within 10 km triggers advisory restriction
        is_near = min_distance_km is not None and min_distance_km < self.APPROACH_THRESHOLD_KM
        return GeospatialHazardPayload(
            intersected=False,
            restriction_name=None,
            restriction_type=None,
            distance_to_boundary_km=round(min_distance_km, 1) if min_distance_km is not None else None,
            hard_stop=False,
            restricted=is_near,
        )

    def check_projected_trajectory_hazards(
        self,
        context: ToolInvocationContext,
        current_coordinates: List[float],
        speed_knots: float,
        heading_degrees: float,
        lookahead_hours: float = 2.0,
    ) -> GeospatialHazardPayload:
        """Projects vessel course forward by lookahead_hours and checks if it intercepts any restricted boundary."""
        if not current_coordinates:
            try:
                lat, lon = resolve_coordinates(context)
                current_coordinates = [lon, lat]
            except Exception:
                current_coordinates = [73.28, 16.99]

        lon1, lat1 = float(current_coordinates[0]), float(current_coordinates[1])
        start_pt = Point(lon1, lat1)

        # Distance projected along heading
        dist_km = max(0.1, speed_knots * 1.852 * lookahead_hours)

        # Geodesic direct forward projection
        theta = math.radians(heading_degrees % 360.0)
        d_sigma = dist_km / EARTH_RADIUS_KM
        lat1_rad = math.radians(lat1)
        lon1_rad = math.radians(lon1)

        lat2_rad = math.asin(
            math.sin(lat1_rad) * math.cos(d_sigma)
            + math.cos(lat1_rad) * math.sin(d_sigma) * math.cos(theta)
        )
        lon2_rad = lon1_rad + math.atan2(
            math.sin(theta) * math.sin(d_sigma) * math.cos(lat1_rad),
            math.cos(d_sigma) - math.sin(lat1_rad) * math.sin(lat2_rad),
        )

        lon2 = math.degrees(lon2_rad)
        lat2 = math.degrees(lat2_rad)

        proj_line = LineString([(lon1, lat1), (lon2, lat2)])
        now_utc = datetime.now(UTC)

        closest_poly = None
        closest_ttc_hours = None
        closest_dist_km = None

        for poly_item in self._polygons:
            is_active, _ = is_restriction_active(poly_item, now_utc)
            if not is_active:
                continue

            poly_geom = poly_item["geometry"]
            if poly_geom.intersects(proj_line):
                intersection = proj_line.intersection(poly_geom)
                if intersection.is_empty:
                    continue

                if poly_geom.contains(start_pt) or poly_geom.covers(start_pt):
                    d_entry_km = 0.0
                    ttc = 0.0
                else:
                    boundary_intersect = poly_geom.boundary.intersection(proj_line)
                    if hasattr(boundary_intersect, "geoms") and len(boundary_intersect.geoms) > 0:
                        pt_closest = min(boundary_intersect.geoms, key=lambda p: start_pt.distance(p))
                    elif hasattr(boundary_intersect, "x"):
                        pt_closest = boundary_intersect
                    else:
                        pt_closest = start_pt

                    d_entry_km = haversine_distance_km(lat1, lon1, pt_closest.y, pt_closest.x)
                    speed_kmh = max(0.5, speed_knots * 1.852)
                    ttc = d_entry_km / speed_kmh

                if closest_ttc_hours is None or ttc < closest_ttc_hours:
                    closest_ttc_hours = ttc
                    closest_dist_km = d_entry_km
                    closest_poly = poly_item

        if closest_poly is not None and closest_ttc_hours is not None and closest_ttc_hours <= lookahead_hours:
            is_hard = closest_poly["is_hard_restriction"]
            return GeospatialHazardPayload(
                intersected=True,
                restriction_name=closest_poly["name"],
                restriction_type=closest_poly["type"],
                distance_to_boundary_km=round(closest_dist_km, 1),
                hard_stop=is_hard,
                restricted=True,
                time_to_cross_hours=round(closest_ttc_hours, 2),
                projected_intersection=True,
            )

        # No projected intersection within lookahead; return static check
        return self.check_geofence_hazards(context=context, coordinates=current_coordinates)
