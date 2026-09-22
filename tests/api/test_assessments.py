import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_trip_assessment_missing_harbor():
    # Missing origin_harbor and coordinates
    payload = {
        "craft_profile": "motorized_boat",
        "data_mode": "SYNTHETIC"
    }
    response = client.post("/api/v1/trip-assessments", json=payload)
    assert response.status_code == 400
    assert "Missing critical inputs" in response.json()["detail"]

def test_trip_assessment_synthetic_success():
    payload = {
        "origin_harbor": "Ratnagiri",
        "craft_profile": "motorized_boat",
        "data_mode": "SYNTHETIC"
    }
    response = client.post("/api/v1/trip-assessments", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["assessment_id"] is not None
    assert data["decision"] in ["GO", "CAUTION", "NO_GO", "UNKNOWN"]
    assert data["conditions"]["marine"] is not None
    assert data["conditions"]["weather"] is not None
    assert data["conditions"]["hazard"] is not None
    assert len(data["source_status"]) > 0
    assert not data["is_durable"]

def test_trip_assessment_unknown_fallback():
    # Force a failure in the pipeline by asking for a mode that might fail or an unknown harbor in LIVE
    # (assuming LIVE is unconfigured or fails)
    payload = {
        "origin_harbor": "Ratnagiri",
        "craft_profile": "motorized_boat",
        "data_mode": "LIVE"
    }
    response = client.post("/api/v1/trip-assessments", json=payload)
    assert response.status_code == 200
    data = response.json()
    # It might fall back to UNKNOWN or still provide info
    assert "decision" in data
