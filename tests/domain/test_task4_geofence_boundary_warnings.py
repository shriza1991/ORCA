"""Task 4 Comprehensive Regression & Unit Test Suite for Boundary Warnings & Geofencing.

Covers:
1. Point inside a relevant polygon (INSIDE, distance 0.0).
2. Point outside but within approach threshold (APPROACHING, 0 < dist <= 10 km).
3. Point outside and beyond approach threshold (CLEAR, dist > 10 km).
4. Point exactly on boundary (INSIDE, distance 0.0).
5. Just inside/outside threshold using unrounded precision.
6. MultiPolygon handling.
7. Polygon hole handling (interior rings).
8. Multiple restrictions with deterministic ordering.
9. Missing/invalid/out-of-range coordinates (fail-closed to UNKNOWN).
10. Missing or failed restriction dataset (UNKNOWN, not CLEAR).
11. Successfully loaded data with no applicable active restriction (CLEAR).
12. Future and expired restrictions.
13. Malformed validity.
14. Truthful demo/source metadata & coverage limitations.
15. Existing legacy check_geofence_hazards & trajectory compatibility.
"""

import json
import math
from datetime import UTC, datetime, timedelta
from pathlib import Path
import pytest
from shapely.geometry import Polygon, MultiPolygon

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.domain.geo_restrictions import (
    DeterministicGeospatialEngine,
    LocationEvaluationResult,
    compute_metric_distance_km,
    validate_coordinates,
)


@pytest.fixture
def standard_geo_engine() -> DeterministicGeospatialEngine:
    return DeterministicGeospatialEngine()


def test_case_1_point_inside_relevant_polygon(standard_geo_engine: DeterministicGeospatialEngine):
    # Naval Firing Range Foxtrot bounds: lon [73.15, 73.35], lat [15.30, 15.55]
    inside_coords = [73.25, 15.40]
    result = standard_geo_engine.evaluate_location(coordinates=inside_coords)

    assert result.evaluation_state == "INSIDE"
    assert result.coordinates == [73.25, 15.40]
    assert len(result.warnings) >= 1
    primary = result.primary_warning
    assert primary is not None
    assert primary.is_inside is True
    assert primary.distance_km == 0.0
    assert "Naval Firing Range Foxtrot" in primary.boundary_name
    assert primary.restriction_level == "NO_GO"
    assert primary.is_hard_restriction is True


def test_case_2_point_outside_within_approach_threshold(standard_geo_engine: DeterministicGeospatialEngine):
    # Point ~3.3 km north of Naval range boundary (lat 15.58, lon 73.25)
    near_coords = [73.25, 15.58]
    result = standard_geo_engine.evaluate_location(coordinates=near_coords)

    assert result.evaluation_state == "APPROACHING"
    assert result.coordinates == [73.25, 15.58]
    assert len(result.warnings) >= 1
    primary = result.primary_warning
    assert primary is not None
    assert primary.is_inside is False
    assert 0.0 < primary.distance_km <= 10.0
    assert "Naval Firing Range Foxtrot" in primary.boundary_name
    # Proximity warning alone without heading does NOT claim projected crossing
    assert primary.projected_crossing is False
    assert primary.time_to_cross_hours is None


def test_case_3_point_outside_beyond_approach_threshold(standard_geo_engine: DeterministicGeospatialEngine):
    # Ratnagiri harbor waters: [73.28, 16.99] (>100 km from any active restriction)
    ratnagiri_coords = [73.28, 16.99]
    result = standard_geo_engine.evaluate_location(coordinates=ratnagiri_coords)

    assert result.evaluation_state == "CLEAR"
    assert result.coordinates == [73.28, 16.99]
    assert result.warnings == []
    assert result.primary_warning is None
    assert "CLEAR indicates no applicable restrictions within evaluated coverage" in result.coverage_scope


def test_case_4_point_exactly_on_boundary(standard_geo_engine: DeterministicGeospatialEngine):
    # North boundary vertex/segment of Foxtrot is around lat 15.55, lon 73.25
    boundary_coords = [73.25, 15.55]
    result = standard_geo_engine.evaluate_location(coordinates=boundary_coords)

    assert result.evaluation_state == "INSIDE"
    primary = result.primary_warning
    assert primary is not None
    assert primary.is_inside is True
    assert primary.distance_km == 0.0


def test_case_5_unrounded_distance_threshold_precision(tmp_path: Path):
    # Construct a reference polygon with boundary at exactly lat 16.0, lon [73.0, 74.0]
    # At 1 degree of latitude, 1 degree ~ 111.195 km.
    # 10.0 km north is latitude 16.0 + 10.0 / 111.195 = 16.0899321
    ref_file = tmp_path / "precision_test.geojson"
    data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "POLY-PRECISION-01",
                "properties": {
                    "restriction_id": "POLY-PRECISION-01",
                    "name": "Precision Test Sector",
                    "type": "RESTRICTED_ZONE",
                    "restriction_level": "NO_GO",
                    "is_hard_restriction": True,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [73.0, 15.0],
                            [74.0, 15.0],
                            [74.0, 16.0],
                            [73.0, 16.0],
                            [73.0, 15.0],
                        ]
                    ],
                },
            }
        ],
    }
    ref_file.write_text(json.dumps(data), encoding="utf-8")
    engine = DeterministicGeospatialEngine(restrictions_path=ref_file, geofences_path=tmp_path / "empty.geojson")

    # Point at ~9.95 km north (strictly inside threshold)
    lat_inside_thresh = 16.0 + (9.95 / 111.195)
    res_in = engine.evaluate_location(coordinates=[73.5, lat_inside_thresh])
    assert res_in.evaluation_state == "APPROACHING"
    assert res_in.primary_warning is not None
    assert res_in.primary_warning.distance_km < 10.0

    # Point at ~10.05 km north (strictly outside threshold)
    lat_outside_thresh = 16.0 + (10.05 / 111.195)
    res_out = engine.evaluate_location(coordinates=[73.5, lat_outside_thresh])
    assert res_out.evaluation_state == "CLEAR"
    assert res_out.warnings == []


def test_case_6_multipolygon_handling(tmp_path: Path):
    multi_file = tmp_path / "multipolygon_test.geojson"
    data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "POLY-MULTI-01",
                "properties": {
                    "name": "Archipelago Multi-Sector",
                    "type": "MPA_SANCTUARY_CORE",
                    "restriction_level": "NO_GO",
                    "is_hard_restriction": True,
                },
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": [
                        # Island A: [72.0, 18.0] to [72.1, 18.1]
                        [[[72.0, 18.0], [72.1, 18.0], [72.1, 18.1], [72.0, 18.1], [72.0, 18.0]]],
                        # Island B: [72.5, 18.5] to [72.6, 18.6]
                        [[[72.5, 18.5], [72.6, 18.5], [72.6, 18.6], [72.5, 18.6], [72.5, 18.5]]],
                    ],
                },
            }
        ],
    }
    multi_file.write_text(json.dumps(data), encoding="utf-8")
    engine = DeterministicGeospatialEngine(restrictions_path=multi_file, geofences_path=tmp_path / "empty.geojson")

    # Inside Island B
    res_in_b = engine.evaluate_location(coordinates=[72.55, 18.55])
    assert res_in_b.evaluation_state == "INSIDE"
    assert res_in_b.primary_warning.distance_km == 0.0

    # Outside, near Island A (~4 km)
    res_near_a = engine.evaluate_location(coordinates=[72.05, 18.14])
    assert res_near_a.evaluation_state == "APPROACHING"
    assert 0.0 < res_near_a.primary_warning.distance_km <= 10.0


def test_case_7_polygon_hole_handling(tmp_path: Path):
    hole_file = tmp_path / "hole_test.geojson"
    # Outer square: [73.0, 15.0] to [74.0, 16.0]
    # Hole (civilian channel): [73.3, 15.3] to [73.7, 15.7]
    data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "POLY-HOLE-01",
                "properties": {
                    "name": "Naval Range with Free Channel Hole",
                    "type": "NAVAL_FIRING_RANGE",
                    "restriction_level": "NO_GO",
                    "is_hard_restriction": True,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        # Exterior
                        [[73.0, 15.0], [74.0, 15.0], [74.0, 16.0], [73.0, 16.0], [73.0, 15.0]],
                        # Interior hole
                        [[73.3, 15.3], [73.7, 15.3], [73.7, 15.7], [73.3, 15.7], [73.3, 15.3]],
                    ],
                },
            }
        ],
    }
    hole_file.write_text(json.dumps(data), encoding="utf-8")
    engine = DeterministicGeospatialEngine(restrictions_path=hole_file, geofences_path=tmp_path / "empty.geojson")

    # Inside the exclusion zone (between outer and inner hole)
    res_solid = engine.evaluate_location(coordinates=[73.1, 15.1])
    assert res_solid.evaluation_state == "INSIDE"
    assert res_solid.primary_warning.distance_km == 0.0

    # Inside the hole near boundary (0.04 deg = ~4.3 km from hole boundary at 73.3)
    res_near_hole = engine.evaluate_location(coordinates=[73.34, 15.5])
    assert res_near_hole.evaluation_state == "APPROACHING"
    assert res_near_hole.primary_warning.is_inside is False
    assert 0.0 < res_near_hole.primary_warning.distance_km <= 10.0

    # Inside the center of the hole (~22 km from hole boundary, outside 10 km threshold)
    res_hole_center = engine.evaluate_location(coordinates=[73.5, 15.5])
    assert res_hole_center.evaluation_state == "CLEAR"
    assert res_hole_center.warnings == []


def test_case_8_multiple_restrictions_deterministic_ordering(tmp_path: Path):
    multi_poly_file = tmp_path / "ordering_test.geojson"
    data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "ZONE-C-FAR",
                "properties": {
                    "name": "Far Restricted Zone",
                    "type": "NAVAL_FIRING_RANGE",
                    "restriction_level": "NO_GO",
                    "is_hard_restriction": True,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[75.0, 15.0], [75.1, 15.0], [75.1, 15.1], [75.0, 15.1], [75.0, 15.0]]],
                },
            },
            {
                "type": "Feature",
                "id": "ZONE-B-NEAR",
                "properties": {
                    "name": "Approaching Advisory Buffer",
                    "type": "IMBL_ADVISORY_BORDER",
                    "restriction_level": "CAUTION",
                    "is_hard_restriction": False,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[73.30, 15.0], [73.40, 15.0], [73.40, 15.1], [73.30, 15.1], [73.30, 15.0]]],
                },
            },
            {
                "type": "Feature",
                "id": "ZONE-A-INSIDE",
                "properties": {
                    "name": "Inside Hard Exclusion Zone",
                    "type": "NAVAL_FIRING_RANGE",
                    "restriction_level": "NO_GO",
                    "is_hard_restriction": True,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[73.0, 15.0], [73.2, 15.0], [73.2, 15.2], [73.0, 15.2], [73.0, 15.0]]],
                },
            },
        ],
    }
    multi_poly_file.write_text(json.dumps(data), encoding="utf-8")
    engine = DeterministicGeospatialEngine(restrictions_path=multi_poly_file, geofences_path=tmp_path / "empty.geojson")

    # Point at [73.1, 15.1] is inside ZONE-A-INSIDE, and ~18 km from ZONE-B-NEAR
    res = engine.evaluate_location(coordinates=[73.1, 15.1])
    assert res.evaluation_state == "INSIDE"
    assert res.primary_warning.boundary_id == "ZONE-A-INSIDE"
    assert res.primary_warning.is_inside is True


def test_case_9_missing_invalid_out_of_range_coordinates(standard_geo_engine: DeterministicGeospatialEngine):
    # None coordinates
    res1 = standard_geo_engine.evaluate_location(coordinates=None)
    assert res1.evaluation_state == "UNKNOWN"
    assert res1.unknown_reason == "COORDINATES_MISSING"

    # Out of range longitude
    res2 = standard_geo_engine.evaluate_location(coordinates=[200.0, 15.0])
    assert res2.evaluation_state == "UNKNOWN"
    assert "INVALID_COORDINATES" in (res2.unknown_reason or "")

    # Out of range latitude
    res3 = standard_geo_engine.evaluate_location(coordinates=[73.0, 95.0])
    assert res3.evaluation_state == "UNKNOWN"
    assert "INVALID_COORDINATES" in (res3.unknown_reason or "")

    # Non-finite coordinates (NaN)
    res4 = standard_geo_engine.evaluate_location(coordinates=[float("nan"), 15.0])
    assert res4.evaluation_state == "UNKNOWN"
    assert "INVALID_COORDINATES" in (res4.unknown_reason or "")

    # Truncated tuple [lon]
    res5 = standard_geo_engine.evaluate_location(coordinates=[73.0])
    assert res5.evaluation_state == "UNKNOWN"
    assert "INVALID_COORDINATES" in (res5.unknown_reason or "")


def test_case_10_missing_or_failed_restriction_dataset(tmp_path: Path):
    non_existent_1 = tmp_path / "does_not_exist_1.geojson"
    non_existent_2 = tmp_path / "does_not_exist_2.geojson"

    engine = DeterministicGeospatialEngine(restrictions_path=non_existent_1, geofences_path=non_existent_2)
    res = engine.evaluate_location(coordinates=[73.28, 16.99])

    # Must fail-closed to UNKNOWN, NEVER fabricated CLEAR
    assert res.evaluation_state == "UNKNOWN"
    assert res.unknown_reason == "RESTRICTION_DATASET_UNAVAILABLE"


def test_case_11_successfully_loaded_data_with_no_applicable_restriction(tmp_path: Path):
    empty_valid_file = tmp_path / "empty_valid.geojson"
    empty_valid_file.write_text(json.dumps({"type": "FeatureCollection", "features": []}), encoding="utf-8")

    engine = DeterministicGeospatialEngine(restrictions_path=empty_valid_file, geofences_path=tmp_path / "empty2.geojson")
    res = engine.evaluate_location(coordinates=[73.28, 16.99])

    # Distinct from data unavailable: successfully evaluated against empty coverage
    assert res.evaluation_state == "CLEAR"
    assert res.warnings == []
    assert res.unknown_reason is None


def test_case_12_future_and_expired_restrictions(tmp_path: Path):
    temp_file = tmp_path / "validity_test.geojson"
    now_utc = datetime.now(UTC)
    future_from = (now_utc + timedelta(days=2)).isoformat()
    future_to = (now_utc + timedelta(days=5)).isoformat()
    expired_from = (now_utc - timedelta(days=10)).isoformat()
    expired_to = (now_utc - timedelta(days=2)).isoformat()

    data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "ZONE-FUTURE",
                "properties": {
                    "name": "Future Naval Firing",
                    "type": "NAVAL_FIRING_RANGE",
                    "valid_from": future_from,
                    "valid_to": future_to,
                    "is_hard_restriction": True,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[73.0, 15.0], [73.2, 15.0], [73.2, 15.2], [73.0, 15.2], [73.0, 15.0]]],
                },
            },
            {
                "type": "Feature",
                "id": "ZONE-EXPIRED",
                "properties": {
                    "name": "Expired Temporary Range",
                    "type": "NAVAL_FIRING_RANGE",
                    "valid_from": expired_from,
                    "valid_to": expired_to,
                    "is_hard_restriction": True,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[73.0, 15.0], [73.2, 15.0], [73.2, 15.2], [73.0, 15.2], [73.0, 15.0]]],
                },
            },
        ],
    }
    temp_file.write_text(json.dumps(data), encoding="utf-8")
    engine = DeterministicGeospatialEngine(restrictions_path=temp_file, geofences_path=tmp_path / "empty.geojson")

    # Point [73.1, 15.1] is inside both geometries, but both are inactive (one future, one expired)
    res = engine.evaluate_location(coordinates=[73.1, 15.1], evaluation_time=now_utc)
    assert res.evaluation_state == "CLEAR"
    assert res.warnings == []


def test_case_13_malformed_validity(tmp_path: Path):
    malformed_file = tmp_path / "malformed_validity.geojson"
    data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "ZONE-MALFORMED",
                "properties": {
                    "name": "Corrupt Validity Sector",
                    "type": "NAVAL_FIRING_RANGE",
                    "valid_from": "2026-INVALID-DATE",
                    "valid_to": "NEVER",
                    "is_hard_restriction": True,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[73.0, 15.0], [73.2, 15.0], [73.2, 15.2], [73.0, 15.2], [73.0, 15.0]]],
                },
            }
        ],
    }
    malformed_file.write_text(json.dumps(data), encoding="utf-8")
    engine = DeterministicGeospatialEngine(restrictions_path=malformed_file, geofences_path=tmp_path / "empty.geojson")

    res = engine.evaluate_location(coordinates=[73.1, 15.1])
    # Invalid relevant validity cannot establish CLEAR.
    assert res.evaluation_state == "UNKNOWN"
    assert res.unknown_reason == "MALFORMED_RESTRICTION_VALIDITY"
    assert res.warnings == []


def test_case_14_truthful_source_and_coverage_metadata(standard_geo_engine: DeterministicGeospatialEngine):
    near_coords = [73.25, 15.58]
    res = standard_geo_engine.evaluate_location(coordinates=near_coords)

    assert res.data_mode == "DEMO"
    assert res.approach_threshold_km == 10.0
    assert "CLEAR indicates no applicable restrictions within evaluated coverage" in res.coverage_scope
    primary = res.primary_warning
    assert primary is not None
    assert primary.source_mode == "OFFLINE_FIXTURE"
    assert "Maharashtra / Goa / Gujarat" in (primary.coverage_limitation or "")


def test_case_15_existing_route_exposure_and_legacy_check(standard_geo_engine: DeterministicGeospatialEngine):
    # Verify legacy check_geofence_hazards preserves contract and behavior
    ctx = ToolInvocationContext(origin_harbor="Goa")
    inside_payload = standard_geo_engine.check_geofence_hazards(ctx, [73.25, 15.40])
    assert inside_payload.intersected is True
    assert inside_payload.hard_stop is True
    assert inside_payload.distance_to_boundary_km == 0.0

    # Route crossing
    passage_line = [[73.25, 15.20], [73.25, 15.65]]
    cross_payload = standard_geo_engine.check_geofence_hazards(ctx, passage_line)
    assert cross_payload.intersected is True
    assert cross_payload.hard_stop is True
    assert cross_payload.distance_to_boundary_km == 0.0

    # Projected crossing trajectory
    ctx_malvan = ToolInvocationContext(origin_harbor="Malvan", coordinates=[73.47, 16.15])
    traj_payload = standard_geo_engine.check_projected_trajectory_hazards(
        context=ctx_malvan,
        current_coordinates=[73.47, 16.15],
        speed_knots=12.0,
        heading_degrees=180.0,
        lookahead_hours=2.0,
    )
    assert traj_payload.projected_intersection is True
    assert traj_payload.time_to_cross_hours is not None
    assert 0.0 < traj_payload.time_to_cross_hours <= 2.0
