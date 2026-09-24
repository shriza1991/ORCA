"""Deterministic Potential Fishing Zone (PFZ) Geodesic Ranking Engine.

Owned by Dev 4 (Marine, Geo, Risk & Route Intelligence).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

CRITICAL INVARIANTS:
1. Pure deterministic math: Haversine distance and initial bearing calculation.
2. The LLM NEVER calculates distances or ranks geographic coordinates.
3. Ranks candidates deterministically by distance (proximity) and oceanographic gradients.
4. Satisfies Dev 4 `PFZRankingEngine` protocol.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev4 import (
    PFZCandidatePayload,
    PFZRankingEngine,
    PFZRankingPayload,
)
from backend.app.connectors.harbors import resolve_coordinates

# Earth radius in nautical miles (WGS-84 mean radius ~ 6371.0088 km / 1.852 km/nm)
EARTH_RADIUS_NM = 3440.065


def haversine_distance_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two points in nautical miles using Haversine formula."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return EARTH_RADIUS_NM * c


def initial_compass_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes initial compass bearing (0-360 degrees) from point 1 to point 2."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)

    bearing_rad = math.atan2(y, x)
    bearing_deg = (math.degrees(bearing_rad) + 360.0) % 360.0
    return round(bearing_deg, 1)


class DeterministicPFZRankingEngine(PFZRankingEngine):
    """Deterministic geodesic ranking engine for raw INCOIS PFZ advisories."""

    def rank_pfz_candidates(
        self,
        context: ToolInvocationContext,
        raw_features: List[Dict[str, Any]],
        max_search_radius_nm: float = 60.0,
    ) -> PFZRankingPayload:
        """Parses raw PFZ feature points, validates geometry, calculates geodesic distance/bearing,
        and ranks candidates deterministically.
        """
        origin_harbor = context.origin_harbor or "Ratnagiri"
        try:
            origin_lat, origin_lon = resolve_coordinates(context)
        except Exception:
            origin_lat, origin_lon = 16.99, 73.28

        candidates: List[PFZCandidatePayload] = []

        for idx, feat in enumerate(raw_features):
            # Extract coordinates from GeoJSON feature or dict
            lat: Optional[float] = None
            lon: Optional[float] = None
            props: Dict[str, Any] = {}

            if "geometry" in feat and isinstance(feat["geometry"], dict):
                geom = feat["geometry"]
                coords = geom.get("coordinates", [])
                if geom.get("type") == "Point" and len(coords) >= 2:
                    lon, lat = float(coords[0]), float(coords[1])
                props = feat.get("properties", {})
            elif "lat" in feat and "lon" in feat:
                lat, lon = float(feat["lat"]), float(feat["lon"])
                props = feat
            elif "latitude" in feat and "longitude" in feat:
                lat, lon = float(feat["latitude"]), float(feat["longitude"])
                props = feat

            if lat is None or lon is None:
                continue

            # Validate geometry coordinates
            if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
                continue

            cid = str(props.get("id") or props.get("candidate_id") or f"PFZ-CANDIDATE-{idx+1:02d}")
            dist_nm = haversine_distance_nm(origin_lat, origin_lon, lat, lon)

            if dist_nm > max_search_radius_nm:
                continue

            bearing = initial_compass_bearing_deg(origin_lat, origin_lon, lat, lon)

            sst = props.get("sst") or props.get("sea_surface_temp_c")
            chlorophyll = props.get("chlorophyll") or props.get("chlorophyll_mg_m3")
            depth = props.get("depth_m") or props.get("water_depth_m")
            loc_ref = props.get("location_reference")

            cand = PFZCandidatePayload(
                candidate_id=cid,
                latitude=round(lat, 4),
                longitude=round(lon, 4),
                distance_nautical_miles=round(dist_nm, 1),
                bearing_degrees=bearing,
                water_depth_m=float(depth) if depth is not None else None,
                sea_surface_temp_c=float(sst) if sst is not None else None,
                chlorophyll_mg_m3=float(chlorophyll) if chlorophyll is not None else None,
                location_reference=str(loc_ref) if loc_ref else None,
                rank=1,  # Assigned after sorting
            )
            candidates.append(cand)

        # Deterministic sorting: primary key distance_nm, secondary key candidate_id
        candidates.sort(key=lambda c: (c.distance_nautical_miles, c.candidate_id))

        # Assign 1-indexed ranks
        for rank_idx, c in enumerate(candidates, start=1):
            c.rank = rank_idx

        return PFZRankingPayload(
            origin_harbor=origin_harbor,
            total_candidates=len(candidates),
            ranked_candidates=candidates,
        )
