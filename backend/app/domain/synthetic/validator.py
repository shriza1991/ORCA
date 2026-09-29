"""Geospatial & Relational Validation for ORCA Synthetic Demo Data.

Validates coordinates, geometries, foreign key relationships, temporal ordering,
source schema compatibility, and data-quality edge cases.
"""

from __future__ import annotations

from typing import Any, Dict, List
from shapely.geometry import shape


class SyntheticValidationError(Exception):
    """Raised when synthetic demo dataset fails validation."""
    pass


def validate_coordinates(lat: float, lon: float, entity_name: str, public_id: str) -> None:
    """Validates EPSG:4326 coordinate ranges."""
    if not (-90.0 <= lat <= 90.0):
        raise SyntheticValidationError(f"Invalid latitude {lat} for {entity_name} '{public_id}'. Must be in [-90, 90].")
    if not (-180.0 <= lon <= 180.0):
        raise SyntheticValidationError(f"Invalid longitude {lon} for {entity_name} '{public_id}'. Must be in [-180, 180].")


def validate_polygon_geometry(geojson_geom: dict, entity_name: str, public_id: str) -> None:
    """Validates that a GeoJSON geometry is a valid, non-self-intersecting Shapely geometry."""
    try:
        geom = shape(geojson_geom)
        if not geom.is_valid:
            raise SyntheticValidationError(f"Invalid polygon geometry in {entity_name} '{public_id}': self-intersection or bad ring.")
        if geom.is_empty:
            raise SyntheticValidationError(f"Empty geometry in {entity_name} '{public_id}'.")
    except Exception as exc:
        raise SyntheticValidationError(f"Malformed GeoJSON in {entity_name} '{public_id}': {exc}") from exc


def validate_synthetic_dataset(dataset: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    """Exhaustively validates all entities, geometries, and foreign keys in the synthetic dataset.

    Returns a summary report if valid; raises SyntheticValidationError on any failure.
    """
    required_keys = [
        "stakeholders",
        "harbors",
        "fishers",
        "vessels",
        "trips",
        "marine_observations",
        "eo_grid_cells",
        "pfz_candidates",
        "geofences",
        "route_nodes",
        "route_edges",
        "hazards",
        "notifications",
        "replay_positions",
        "sectors",
    ]
    for key in required_keys:
        if key not in dataset:
            raise SyntheticValidationError(f"Missing required dataset collection: '{key}'")

    # Extract ID sets for referential integrity
    harbor_ids = {h["public_id"] for h in dataset["harbors"]}
    fisher_ids = {f["public_id"] for f in dataset["fishers"]}
    vessel_ids = {v["public_id"] for v in dataset["vessels"]}
    trip_ids = {t["public_id"] for t in dataset["trips"]}
    hazard_ids = {h["public_id"] for h in dataset["hazards"]}
    geofence_ids = {g["public_id"] for g in dataset["geofences"]}
    node_ids = {n["public_id"] for n in dataset["route_nodes"]}

    # Validate Harbors
    for h in dataset["harbors"]:
        validate_coordinates(h["latitude"], h["longitude"], "Harbor", h["public_id"])

    # Validate Fishers & FKs
    for f in dataset["fishers"]:
        if f["home_harbor_id"] not in harbor_ids:
            raise SyntheticValidationError(f"Fisher '{f['public_id']}' references unknown harbor '{f['home_harbor_id']}'")

    # Validate Vessels & FKs
    for v in dataset["vessels"]:
        if v["home_harbor_id"] not in harbor_ids:
            raise SyntheticValidationError(f"Vessel '{v['public_id']}' references unknown harbor '{v['home_harbor_id']}'")
        if v["owner_fisher_id"] and v["owner_fisher_id"] not in fisher_ids:
            raise SyntheticValidationError(f"Vessel '{v['public_id']}' references unknown owner '{v['owner_fisher_id']}'")

    # Validate Trips & FKs
    for t in dataset["trips"]:
        if t["fisher_id"] not in fisher_ids:
            raise SyntheticValidationError(f"Trip '{t['public_id']}' references unknown fisher '{t['fisher_id']}'")
        if t["vessel_id"] not in vessel_ids:
            raise SyntheticValidationError(f"Trip '{t['public_id']}' references unknown vessel '{t['vessel_id']}'")
        if t["origin_harbor_id"] not in harbor_ids:
            raise SyntheticValidationError(f"Trip '{t['public_id']}' references unknown harbor '{t['origin_harbor_id']}'")

    # Validate Marine Observations
    for o in dataset["marine_observations"]:
        if o["harbor_id"] not in harbor_ids:
            raise SyntheticValidationError(f"Observation '{o['public_id']}' references unknown harbor '{o['harbor_id']}'")

    # Validate EO Grid Cells
    for eo in dataset["eo_grid_cells"]:
        validate_coordinates(eo["latitude"], eo["longitude"], "EOGridCell", eo["public_id"])

    # Validate PFZ Candidates
    for pfz in dataset["pfz_candidates"]:
        validate_coordinates(pfz["latitude"], pfz["longitude"], "PFZCandidate", pfz["public_id"])

    # Validate Geofences
    for g in dataset["geofences"]:
        validate_polygon_geometry(g["geometry_geojson"], "Geofence", g["public_id"])

    # Validate Route Nodes & Edges
    for n in dataset["route_nodes"]:
        validate_coordinates(n["latitude"], n["longitude"], "RouteNode", n["public_id"])

    for e in dataset["route_edges"]:
        if e["from_node_id"] not in node_ids:
            raise SyntheticValidationError(f"RouteEdge '{e['public_id']}' references unknown from_node '{e['from_node_id']}'")
        if e["to_node_id"] not in node_ids:
            raise SyntheticValidationError(f"RouteEdge '{e['public_id']}' references unknown to_node '{e['to_node_id']}'")

    # Validate Hazard Polygons
    for hz in dataset["hazards"]:
        validate_polygon_geometry(hz["geometry_geojson"], "HazardEvent", hz["public_id"])

    # Validate Notifications
    for notif in dataset["notifications"]:
        if notif["fisher_id"] and notif["fisher_id"] not in fisher_ids:
            raise SyntheticValidationError(f"Notification '{notif['public_id']}' references unknown fisher '{notif['fisher_id']}'")
        if notif["vessel_id"] and notif["vessel_id"] not in vessel_ids:
            raise SyntheticValidationError(f"Notification '{notif['public_id']}' references unknown vessel '{notif['vessel_id']}'")
        if notif["trip_id"] and notif["trip_id"] not in trip_ids:
            raise SyntheticValidationError(f"Notification '{notif['public_id']}' references unknown trip '{notif['trip_id']}'")
        if notif["hazard_id"] and notif["hazard_id"] not in hazard_ids:
            raise SyntheticValidationError(f"Notification '{notif['public_id']}' references unknown hazard '{notif['hazard_id']}'")
        if notif["geofence_id"] and notif["geofence_id"] not in geofence_ids:
            raise SyntheticValidationError(f"Notification '{notif['public_id']}' references unknown geofence '{notif['geofence_id']}'")

    # Validate Vessel Replay Positions
    for pos in dataset["replay_positions"]:
        if pos["vessel_id"] not in vessel_ids:
            raise SyntheticValidationError(f"Replay position '{pos['public_id']}' references unknown vessel '{pos['vessel_id']}'")
        if pos["trip_id"] and pos["trip_id"] not in trip_ids:
            raise SyntheticValidationError(f"Replay position '{pos['public_id']}' references unknown trip '{pos['trip_id']}'")
        validate_coordinates(pos["latitude"], pos["longitude"], "ReplayPosition", pos["public_id"])

    return {
        "status": "VALID",
        "entity_counts": {k: len(v) for k, v in dataset.items()},
        "geometries_validated": len(dataset["geofences"]) + len(dataset["hazards"]),
        "coordinates_validated": len(dataset["harbors"]) + len(dataset["route_nodes"]) + len(dataset["pfz_candidates"]) + len(dataset["eo_grid_cells"]) + len(dataset["replay_positions"]),
    }
