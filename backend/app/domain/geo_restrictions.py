"""Deterministic Maritime Geofence and Restricted Zone Intersection Engine.

Owned by Dev 4 (Marine, Geo, Risk & Route Intelligence).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

CRITICAL INVARIANTS:
1. Deterministic GIS evaluation using Shapely geometry.
2. The LLM NEVER evaluates whether a coordinate or route breaches a restricted boundary.
3. Supports point-in-polygon and trajectory line-string intersection checks.
4. Checks validity time windows and distinguishes hard stops (NO_GO) from advisory alerts (CAUTION).
"""

from __future__ import annotations

import json
import logging
import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from shapely.geometry import LineString, Point, Polygon, shape

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev4 import (
    GeospatialHazardEngine,
    GeospatialHazardPayload,
)
from backend.app.connectors.harbors import resolve_coordinates

logger = logging.getLogger(__name__)

# Approximate km per degree latitude
KM_PER_DEG_LAT = 111.139


class DeterministicGeospatialEngine(GeospatialHazardEngine):
    """Deterministic geospatial hazard and boundary evaluation engine."""

    def __init__(
        self,
        restrictions_path: str | Path | None = None,
        geofences_path: str | Path | None = None,
    ) -> None:
        self.restrictions_path = Path(restrictions_path or "data/reference/marine_restrictions.geojson")
        self.geofences_path = Path(geofences_path or "data/fixtures/geofences_india.geojson")
        self._polygons: List[Dict[str, Any]] = []
        self._load_features()

    def _load_features(self) -> None:
        features: List[Dict[str, Any]] = []

        # 1. Load canonical reference restrictions if present
        if self.restrictions_path.exists():
            try:
                with open(self.restrictions_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    features.extend(data.get("features", []))
            except Exception as exc:
                logger.warning(f"Failed to load marine restrictions from {self.restrictions_path}: {exc}")

        # 2. Fall back / supplement with geofences fixture
        if self.geofences_path.exists():
            try:
                with open(self.geofences_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for feat in data.get("features", []):
                        # Avoid duplicates by id
                        fid = feat.get("id") or feat.get("properties", {}).get("polygon_id")
                        existing_ids = {
                            x.get("id") or x.get("properties", {}).get("restriction_id")
                            for x in features
                        }
                        if fid not in existing_ids:
                            features.append(feat)
            except Exception as exc:
                logger.warning(f"Failed to load geofences from {self.geofences_path}: {exc}")

        parsed_polygons: List[Dict[str, Any]] = []
        for feat in features:
            geom_data = feat.get("geometry")
            if not geom_data:
                continue
            try:
                props = feat.get("properties", {})
                level = str(props.get("restriction_level", "NO_GO")).upper()
                poly_type = str(props.get("type") or props.get("polygon_type", "RESTRICTED_ZONE")).upper()

                # Informational national boundaries (EEZ, Territorial Waters) are sovereign base map layers,
                # NOT hazardous or prohibited restriction zones.
                if level == "INFORMATIONAL" or poly_type in ("EEZ_BOUNDARY", "TERRITORIAL_WATERS", "NATIONAL_BOUNDARY"):
                    continue

                geom = shape(geom_data)
                parsed_polygons.append({
                    "id": feat.get("id") or props.get("restriction_id") or props.get("polygon_id"),
                    "name": props.get("name", "Restricted Sector"),
                    "type": poly_type,
                    "restriction_level": level,
                    "is_hard_restriction": bool(props.get("is_hard_restriction", False) or level == "NO_GO"),
                    "valid_from": props.get("valid_from"),
                    "valid_to": props.get("valid_to"),
                    "geometry": geom,
                })
            except Exception as exc:
                logger.warning(f"Skipping malformed polygon geometry: {exc}")

        self._polygons = parsed_polygons

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
            # Check validity window if specified
            vt_str = poly_item.get("valid_to")
            if vt_str:
                try:
                    vt = datetime.fromisoformat(vt_str.replace("Z", "+00:00"))
                    if vt < now_utc:
                        continue  # Expired restriction
                except Exception:
                    pass

            poly_geom = poly_item["geometry"]
            if poly_geom.intersects(geom):
                intersected_poly = poly_item
                min_distance_km = 0.0
                break

            # Distance calculation (in degrees converted to approximate km)
            dist_deg = poly_geom.distance(point_for_dist)
            dist_km = dist_deg * KM_PER_DEG_LAT
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
        is_near = min_distance_km is not None and min_distance_km < 10.0
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
        # Heading: 0=N, 90=E, 180=S, 270=W
        theta = math.radians(heading_degrees)
        d_sigma = dist_km / 6371.0  # angular distance in radians
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
            vt_str = poly_item.get("valid_to")
            if vt_str:
                try:
                    vt = datetime.fromisoformat(vt_str.replace("Z", "+00:00"))
                    if vt < now_utc:
                        continue
                except Exception:
                    pass

            poly_geom = poly_item["geometry"]
            if poly_geom.intersects(proj_line):
                # Calculate distance from origin to intersection
                intersection = proj_line.intersection(poly_geom)
                if intersection.is_empty:
                    continue

                if poly_geom.contains(start_pt):
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

                    deg_dist = math.hypot(pt_closest.x - lon1, pt_closest.y - lat1)
                    d_entry_km = deg_dist * KM_PER_DEG_LAT
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
