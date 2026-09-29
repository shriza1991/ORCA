"""Deterministic GeoJSON MapLayer Generator for ORCA.

Owned by Dev 4 (Marine, Geo, Risk & Route Intelligence) & Dev 2 (Platform Contracts).
Transforms existing deterministic domain observations, risk recommendations,
and geospatial outputs into canonical MapLayer GeoJSON contracts for MapLibre consumption.

CRITICAL INVARIANTS:
1. Pure transformation: Does NOT recompute risk scores, thresholds, distances, or geofences.
2. Provider-independent: Consumes normalized domain models (not raw IMD/INCOIS payloads).
3. Selective layer generation: Only generates layers relevant to current query/intent.
4. Semantic separation: Exposes semantic properties and default styling tokens while
   leaving interactive visual rendering logic to the frontend.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.app.connectors.harbors import HARBOR_COORDINATES
from backend.app.contracts.chat import MapLayer


def _get_harbor_lon_lat(harbor_name: Optional[str]) -> List[float]:
    """Resolves standard [longitude, latitude] for a harbor (defaults to Ratnagiri)."""
    if not harbor_name:
        return [73.28, 16.99]
    key = harbor_name.strip().lower()
    if key in HARBOR_COORDINATES:
        lat, lon = HARBOR_COORDINATES[key]
        return [float(lon), float(lat)]
    fallback_map = {
        "ratnagiri": [73.28, 16.99],
        "veraval": [70.365, 20.905],
        "porbandar": [69.609, 21.642],
        "mumbai": [72.87, 18.92],
        "goa": [73.911, 15.299],
        "panaji": [73.83, 15.49],
        "malpe": [74.70, 13.35],
        "malvan": [73.47, 16.06],
        "kochi": [76.267, 9.931],
        "chennai": [80.270, 13.082],
        "visakhapatnam": [83.218, 17.685],
    }
    return fallback_map.get(key, [73.28, 16.99])


def _create_circular_polygon(lon: float, lat: float, radius_nm: float = 8.0, points: int = 24) -> List[List[float]]:
    """Creates a simple approximate circular polygon around a coordinate in EPSG:4326."""
    import math

    coords = []
    deg_lat = radius_nm * (1.0 / 60.0)
    rad_lat = math.radians(lat)
    deg_lon = deg_lat / max(math.cos(rad_lat), 0.1)

    for i in range(points):
        angle = (2 * math.pi * i) / points
        pt_lon = round(lon + deg_lon * math.cos(angle), 5)
        pt_lat = round(lat + deg_lat * math.sin(angle), 5)
        coords.append([pt_lon, pt_lat])
    coords.append(coords[0])  # Close ring
    return coords


def _load_base_geofence_features() -> List[Dict[str, Any]]:
    """Loads standard Indian maritime geofence polygons from the canonical fixture file."""
    try:
        path = Path("data/fixtures/geofences_india.geojson")
        if path.exists():
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
                return data.get("features", [])
    except Exception:
        pass

    # Fallback in-memory Naval Firing Range polygon
    return [
        {
            "type": "Feature",
            "id": "POLY-NAV-GOA-01",
            "properties": {
                "polygon_id": "POLY-NAV-GOA-01",
                "name": "Naval Firing Range Foxtrot (Goa Sector)",
                "polygon_type": "NAVAL_FIRING_RANGE",
                "is_hard_restriction": True,
                "restriction_level": "NO_GO",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [73.18, 15.30],
                        [73.35, 15.28],
                        [73.42, 15.36],
                        [73.42, 15.48],
                        [73.38, 15.54],
                        [73.25, 15.55],
                        [73.15, 15.52],
                        [73.08, 15.45],
                        [73.06, 15.38],
                        [73.12, 15.32],
                        [73.18, 15.30],
                    ]
                ],
            },
        }
    ]


def generate_map_layers(state: Dict[str, Any]) -> List[MapLayer]:
    """Transforms completed ORCA state observations and recommendations into relevant MapLayers.

    Parameters
    ----------
    state:
        Completed ORCAState dictionary containing location, observations,
        risk_assessment, intent, etc.

    Returns
    -------
    List[MapLayer]
        Zero, one, or more relevant GeoJSON MapLayers for the query.
    """
    layers: List[MapLayer] = []

    location = state.get("location") or {}
    harbor_name = location.get("harbor") or (state.get("user_profile") or {}).get("origin_harbor") or "Ratnagiri"
    coords = location.get("coordinates") or _get_harbor_lon_lat(harbor_name)
    craft_profile = (state.get("user_profile") or {}).get("craft_profile") or "motorized_boat"
    observations = state.get("observations") or {}
    intent = state.get("intent") or "SAFETY"
    risk_rec = state.get("risk_assessment")
    status_val = risk_rec.status.value if hasattr(risk_rec, "status") and hasattr(risk_rec.status, "value") else str(getattr(risk_rec, "status", "UNKNOWN"))

    lon, lat = coords[0], coords[1]

    # -------------------------------------------------------------------------
    # 1. Vessel / Departure Harbor Position Layer
    # -------------------------------------------------------------------------
    if coords and len(coords) >= 2:
        layers.append(
            MapLayer(
                layer_id="layer_vessel_position",
                name=f"Vessel Position ({harbor_name})",
                layer_type="geojson",
                visible=True,
                style={
                    "color": "#0ea5e9",
                    "opacity": 1.0,
                    "circle_radius": 9,
                    "layer_category": "navigation",
                },
                geojson={
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat],
                    },
                    "properties": {
                        "harbor": harbor_name,
                        "craft_profile": craft_profile,
                        "role": "vessel_origin",
                        "status": status_val,
                        "longitude": lon,
                        "latitude": lat,
                        "label": f"{harbor_name} Departure Station",
                    },
                },
            )
        )

    # -------------------------------------------------------------------------
    # 2. Potential Fishing Zone (PFZ) Advisories Layer
    # -------------------------------------------------------------------------
    pfz_obs = observations.get("pfz_search")
    if pfz_obs:
        candidates = getattr(pfz_obs, "ranked_candidates", []) or pfz_obs.get("ranked_candidates", [])
        if candidates:
            features = []
            for cand in candidates:
                cand_id = getattr(cand, "candidate_id", None) or cand.get("candidate_id", "PFZ-01")
                c_lat = getattr(cand, "latitude", None) or cand.get("latitude", lat)
                c_lon = getattr(cand, "longitude", None) or cand.get("longitude", lon)
                c_rank = getattr(cand, "rank", 1) or cand.get("rank", 1)
                c_dist = getattr(cand, "distance_nautical_miles", None) or cand.get("distance_nautical_miles", 0.0)
                c_bearing = getattr(cand, "bearing_degrees", None) or cand.get("bearing_degrees", 0.0)
                c_depth = getattr(cand, "water_depth_m", None) or cand.get("water_depth_m", 0.0)
                c_sst = getattr(cand, "sea_surface_temp_c", None) or cand.get("sea_surface_temp_c", 28.0)
                c_chlo = getattr(cand, "chlorophyll_mg_m3", None) or cand.get("chlorophyll_mg_m3", 1.5)

                features.append(
                    {
                        "type": "Feature",
                        "id": cand_id,
                        "geometry": {
                            "type": "Point",
                            "coordinates": [float(c_lon), float(c_lat)],
                        },
                        "properties": {
                            "candidate_id": cand_id,
                            "rank": c_rank,
                            "distance_nm": c_dist,
                            "bearing_deg": c_bearing,
                            "water_depth_m": c_depth,
                            "sst_c": c_sst,
                            "chlorophyll_mg_m3": c_chlo,
                            "source_name": "INCOIS PFZ Advisory",
                            "label": f"PFZ Zone #{c_rank} ({cand_id})",
                        },
                    }
                )

            layers.append(
                MapLayer(
                    layer_id="layer_pfz_advisories",
                    name="Potential Fishing Zones (PFZ)",
                    layer_type="geojson",
                    visible=True,
                    style={
                        "color": "#10b981",
                        "opacity": 0.85,
                        "circle_radius": 8,
                        "layer_category": "navigation",
                    },
                    geojson={
                        "type": "FeatureCollection",
                        "features": features,
                    },
                )
            )

    # -------------------------------------------------------------------------
    # 3. Candidate & Recommended Routes Layer
    # -------------------------------------------------------------------------
    route_obs = observations.get("route_analysis")
    if route_obs:
        routes_list = getattr(route_obs, "routes", []) or route_obs.get("routes", [])
        rec_id = getattr(route_obs, "recommended_route_id", None) or route_obs.get("recommended_route_id")

        candidate_features = []
        recommended_feature = None

        for r in routes_list:
            r_id = getattr(r, "route_id", "") or r.get("route_id", "")
            r_name = getattr(r, "name", "") or r.get("name", r_id)
            r_dist = getattr(r, "distance_km", 0.0) or r.get("distance_km", 0.0)
            r_wave = getattr(r, "max_wave_height_m", 0.0) or r.get("max_wave_height_m", 0.0)
            r_exposure = getattr(r, "exposure_score", 0.0) or r.get("exposure_score", 0.0)
            r_risk = getattr(r, "risk_rating", "MODERATE") or r.get("risk_rating", "MODERATE")
            r_waypoints = getattr(r, "waypoints", []) or r.get("waypoints", [])

            if not r_waypoints:
                dest_coords = _get_harbor_lon_lat(state.get("destination") or "Porbandar")
                if r_id == "ROUTE-A-INSHORE":
                    mid_pt = [(lon + dest_coords[0]) / 2 + 0.05, (lat + dest_coords[1]) / 2]
                elif r_id == "ROUTE-B-DIRECT":
                    mid_pt = [(lon + dest_coords[0]) / 2 - 0.15, (lat + dest_coords[1]) / 2]
                elif r_id == "ROUTE-C-BALANCED":
                    mid_pt = [(lon + dest_coords[0]) / 2 - 0.05, (lat + dest_coords[1]) / 2]
                else:
                    mid_pt = [(lon + dest_coords[0]) / 2 - 0.05, (lat + dest_coords[1]) / 2]
                r_waypoints = [[lon, lat], mid_pt, dest_coords]

            feat = {
                "type": "Feature",
                "id": r_id,
                "geometry": {
                    "type": "LineString",
                    "coordinates": r_waypoints,
                },
                "properties": {
                    "route_id": r_id,
                    "name": r_name,
                    "distance_km": r_dist,
                    "max_wave_height_m": r_wave,
                    "exposure_score": r_exposure,
                    "risk_rating": r_risk,
                    "is_recommended": (r_id == rec_id),
                    "label": f"{r_name} ({r_risk} Risk)",
                },
            }

            if r_id == rec_id:
                recommended_feature = feat
            else:
                candidate_features.append(feat)

        if candidate_features:
            layers.append(
                MapLayer(
                    layer_id="layer_candidate_routes",
                    name="Candidate Passage Routes",
                    layer_type="geojson",
                    visible=True,
                    style={
                        "color": "#f59e0b",
                        "opacity": 0.75,
                        "line_width": 3,
                        "layer_category": "navigation",
                    },
                    geojson={
                        "type": "FeatureCollection",
                        "features": candidate_features,
                    },
                )
            )

        if recommended_feature:
            layers.append(
                MapLayer(
                    layer_id="layer_recommended_route",
                    name=f"Recommended Safe Route ({recommended_feature['properties']['name']})",
                    layer_type="geojson",
                    visible=True,
                    style={
                        "color": "#06b6d4",
                        "opacity": 0.95,
                        "line_width": 4,
                        "layer_category": "navigation",
                    },
                    geojson=recommended_feature,
                )
            )

    # -------------------------------------------------------------------------
    # 4. Destination / Waypoint Port Markers
    # -------------------------------------------------------------------------
    dest_name = state.get("destination") or (route_obs.get("destination") if isinstance(route_obs, dict) else getattr(route_obs, "destination", None))
    if dest_name and dest_name != harbor_name:
        dest_coords = _get_harbor_lon_lat(dest_name)
        layers.append(
            MapLayer(
                layer_id="layer_destination_port",
                name=f"Destination Port ({dest_name})",
                layer_type="geojson",
                visible=True,
                style={
                    "color": "#6366f1",
                    "opacity": 0.9,
                    "circle_radius": 7,
                    "layer_category": "navigation",
                },
                geojson={
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": dest_coords,
                    },
                    "properties": {
                        "harbor": dest_name,
                        "role": "destination",
                        "label": f"Destination: {dest_name}",
                    },
                },
            )
        )

    # -------------------------------------------------------------------------
    # 5. Marine Safety Risk Envelope Layer
    # -------------------------------------------------------------------------
    if intent in ("SAFETY", "GO_NO_GO_SAFETY", "ROUTE", "HAZARDS"):
        safety_color = "#10b981"  # GO
        if status_val == "NO_GO":
            safety_color = "#f43f5e"
        elif status_val == "CAUTION":
            safety_color = "#f59e0b"
        elif status_val == "UNKNOWN":
            safety_color = "#64748b"

        circle_ring = _create_circular_polygon(lon, lat, radius_nm=12.0)
        marine_obs = observations.get("marine_conditions") or {}
        weather_obs = observations.get("weather_conditions") or {}

        wave_h = getattr(marine_obs, "significant_wave_height_m", None) or (marine_obs.get("significant_wave_height_m") if isinstance(marine_obs, dict) else 1.2)
        wind_spd = getattr(weather_obs, "wind_speed_knots", None) or (weather_obs.get("wind_speed_knots") if isinstance(weather_obs, dict) else 12.0)

        layers.append(
            MapLayer(
                layer_id="layer_safety_envelope",
                name=f"Marine Safety Envelope ({status_val})",
                layer_type="geojson",
                visible=True,
                style={
                    "color": safety_color,
                    "opacity": 0.25,
                    "line_width": 2,
                    "layer_category": "safety_critical",
                },
                geojson={
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [circle_ring],
                    },
                    "properties": {
                        "status": status_val,
                        "harbor": harbor_name,
                        "wave_height_m": wave_h,
                        "wind_speed_knots": wind_spd,
                        "craft_profile": craft_profile,
                        "label": f"{harbor_name} Operational Safety Zone ({status_val})",
                    },
                },
            )
        )

    # -------------------------------------------------------------------------
    # 6. Cyclone / Severe Squall Alert Hazard Layer
    # -------------------------------------------------------------------------
    hazard_obs = observations.get("hazard_search")
    is_cyclone = False
    is_squall = False
    headline = ""
    bulletin_id = ""

    if hazard_obs:
        is_cyclone = bool(getattr(hazard_obs, "cyclone_warning_active", False) or (hazard_obs.get("cyclone_warning_active") if isinstance(hazard_obs, dict) else False))
        is_squall = bool(getattr(hazard_obs, "squall_alert", False) or (hazard_obs.get("squall_alert") if isinstance(hazard_obs, dict) else False))
        headline = getattr(hazard_obs, "headline", "") or (hazard_obs.get("headline", "") if isinstance(hazard_obs, dict) else "")
        bulletin_id = getattr(hazard_obs, "bulletin_id", "") or (hazard_obs.get("bulletin_id", "") if isinstance(hazard_obs, dict) else "")

    if is_cyclone or is_squall or (status_val == "NO_GO" and "cyclone" in headline.lower()):
        hazard_ring = _create_circular_polygon(lon, lat, radius_nm=24.0, points=32)
        layers.append(
            MapLayer(
                layer_id="layer_cyclone_hazard",
                name="Severe Cyclone / Squall Hazard Sector",
                layer_type="geojson",
                visible=True,
                style={
                    "color": "#ef4444",
                    "opacity": 0.40,
                    "line_width": 3,
                    "layer_category": "safety_critical",
                },
                geojson={
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [hazard_ring],
                    },
                    "properties": {
                        "severity": "WARNING" if is_cyclone else "ALERT",
                        "headline": headline or "Active Marine Severe Weather Warning",
                        "bulletin_id": bulletin_id or "IMD-CYCLONE-ALERT-01",
                        "is_hard_restriction": True,
                        "label": f"CRITICAL: {headline or 'Cyclone Advisory'}",
                    },
                },
            )
        )

    # -------------------------------------------------------------------------
    # 7. Maritime Geofence / Restricted Zone Layer
    # -------------------------------------------------------------------------
    geo_obs = observations.get("geospatial_hazard")
    if geo_obs or intent in ("HAZARDS", "GEOFENCE") or "range" in str(state.get("user_message", "")).lower():
        base_features = _load_base_geofence_features()
        if base_features:
            layers.append(
                MapLayer(
                    layer_id="layer_geofence_boundaries",
                    name="Maritime Geofences & Restricted Areas",
                    layer_type="geojson",
                    visible=True,
                    style={
                        "color": "#dc2626",
                        "opacity": 0.35,
                        "line_width": 2,
                        "layer_category": "safety_critical",
                    },
                    geojson={
                        "type": "FeatureCollection",
                        "features": base_features,
                    },
                )
            )

    return layers
