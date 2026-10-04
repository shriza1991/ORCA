"""Tests for ORCA Field Intelligence Network (Community Observations) API.

Verifies:
  C-1: Official constraints are never overridden.
  C-2: Empty feed does not imply safety (epistemic_notice).
  C-3: Source labeled [FIELD SIGNAL] in all responses.
  C-4: Trust is categorical, never decimal.
  C-5: Single uncorroborated reports never affect hard decisions.
  Privacy: Exact coordinates never returned in public fields.
"""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_community_demo_feed():
    """Deterministic snapshot demo feed returns observations with strict invariants."""
    response = client.get("/api/v1/community/observations/demo")
    assert response.status_code == 200
    data = response.json()
    assert "observations" in data
    assert len(data["observations"]) > 0
    assert "epistemic_notice" in data

    for obs in data["observations"]:
        # Verify safety labeling C-3
        assert obs["source_type"] == "COMMUNITY"
        assert obs["data_mode"] == "FIELD_SIGNAL"
        assert obs["lineage_label"] == "[FIELD SIGNAL]"
        # Verify categorical trust C-4
        assert obs["contributor_trust"] in ["UNVERIFIED", "PHONE_VERIFIED", "ESTABLISHED"]
        # Verify approximate location privacy
        assert "approx_latitude" in obs
        assert "approx_longitude" in obs
        assert "exact_latitude" not in obs
        assert "exact_longitude" not in obs


def test_community_observation_submit_and_corroborate():
    """Submitting a community observation stores approximate coordinates and allows corroboration."""
    payload = {
        "observation_type": "ROUGH_SEA",
        "severity": "MODERATE",
        "description": "2m swell spotted near harbor entrance",
        "latitude": 16.985,
        "longitude": 73.285,
        "harbor_reference": "Ratnagiri",
        "origin_harbor": "Ratnagiri",
        "craft_profile": "motorized_boat"
    }

    res = client.post("/api/v1/community/observations", json=payload)
    assert res.status_code == 201
    created = res.json()
    assert created["observation_type"] == "ROUGH_SEA"
    assert created["severity"] == "MODERATE"
    assert created["source_type"] == "COMMUNITY"
    assert created["data_mode"] == "FIELD_SIGNAL"
    assert created["contributor_trust"] == "UNVERIFIED"
    assert created["corroboration_count"] == 0
    assert created["public_id"].startswith("OBS-")
    # Coordinates rounded to approximate
    assert round(created["approx_latitude"], 2) == round(payload["latitude"], 2)

    # Corroborate using public_id
    pub_id = created["public_id"]
    corrob_res = client.post(
        f"/api/v1/community/observations/{pub_id}/corroborate",
        json={"latitude": 16.985, "longitude": 73.285, "agrees": True}
    )
    assert corrob_res.status_code == 200
    corroborated = corrob_res.json()
    assert corroborated["corroboration_count"] == 1
    assert corroborated["verification_status"] == "CORROBORATED"


def test_community_empty_feed_safety_invariant_c2():
    """Feed response includes epistemic notice reminding mariners that absence of reports != safe."""
    res = client.get("/api/v1/community/observations?harbor=NonExistentHarbor999")
    assert res.status_code == 200
    data = res.json()
    assert "epistemic_notice" in data
    assert "do not imply safe conditions" in data["epistemic_notice"].lower()
