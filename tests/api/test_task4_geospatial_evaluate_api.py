"""API endpoint tests for /api/v1/geospatial/evaluate (Task 4)."""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_api_point_inside_naval_range(client: TestClient):
    response = client.post(
        "/api/v1/geospatial/evaluate",
        json={"longitude": 73.25, "latitude": 15.40},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["evaluation_state"] == "INSIDE"
    assert data["coordinates"] == [73.25, 15.40]
    assert data["approach_threshold_km"] == 10.0
    assert len(data["warnings"]) >= 1
    assert data["primary_warning"]["is_inside"] is True
    assert data["primary_warning"]["distance_km"] == 0.0
    assert "Naval Firing Range Foxtrot" in data["primary_warning"]["boundary_name"]


def test_api_point_approaching_boundary(client: TestClient):
    response = client.post(
        "/api/v1/geospatial/evaluate",
        json={"longitude": 73.25, "latitude": 15.58},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["evaluation_state"] == "APPROACHING"
    assert data["coordinates"] == [73.25, 15.58]
    assert data["primary_warning"]["is_inside"] is False
    assert 0.0 < data["primary_warning"]["distance_km"] <= 10.0


def test_api_point_clear_waters(client: TestClient):
    response = client.post(
        "/api/v1/geospatial/evaluate",
        json={"longitude": 73.28, "latitude": 16.99},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["evaluation_state"] == "CLEAR"
    assert data["warnings"] == []
    assert data["primary_warning"] is None


def test_api_inaccurate_gps_downgraded_to_unknown(client: TestClient):
    # Fix with accuracy = 250m (> 200m safety tolerance)
    response = client.post(
        "/api/v1/geospatial/evaluate",
        json={"longitude": 73.25, "latitude": 15.40, "accuracy": 250.0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["evaluation_state"] == "UNKNOWN"
    assert "INSUFFICIENT_ACCURACY" in (data["unknown_reason"] or "")


def test_api_missing_and_invalid_coordinates(client: TestClient):
    # Empty payload
    res1 = client.post("/api/v1/geospatial/evaluate", json={})
    assert res1.status_code == 200
    assert res1.json()["evaluation_state"] == "UNKNOWN"
    assert res1.json()["unknown_reason"] == "COORDINATES_MISSING"

    # Out of range latitude
    res2 = client.post("/api/v1/geospatial/evaluate", json={"longitude": 73.0, "latitude": 99.0})
    assert res2.status_code == 200
    assert res2.json()["evaluation_state"] == "UNKNOWN"
    assert "INVALID_COORDINATES" in res2.json()["unknown_reason"]


def test_api_trajectory_heading_and_speed_projected_crossing(client: TestClient):
    # Vessel heading due south (180 deg) at 12 knots toward Malvan MPA
    response = client.post(
        "/api/v1/geospatial/evaluate",
        json={
            "longitude": 73.47,
            "latitude": 16.15,
            "speed": 6.17, # ~12 knots in m/s
            "speed_unit": "m/s",
            "heading": 180.0,
            "lookahead_hours": 2.0,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["evaluation_state"] == "APPROACHING"
    crossing = next((w for w in data["warnings"] if w["projected_crossing"]), None)
    assert crossing is not None
    assert crossing["time_to_cross_hours"] is not None
    assert 0.0 < crossing["time_to_cross_hours"] <= 2.0


def test_api_alias_endpoint(client: TestClient):
    response = client.post(
        "/api/v1/geofence/evaluate",
        json={"longitude": 73.25, "latitude": 15.40},
    )
    assert response.status_code == 200
    assert response.json()["evaluation_state"] == "INSIDE"
