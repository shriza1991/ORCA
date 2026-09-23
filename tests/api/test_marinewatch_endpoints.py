"""Comprehensive test suite for India MarineWatch Foundation API Contracts (§213, §214, §215).

Verifies:
1.  GET  /api/v1/forecast/point
2.  GET  /api/v1/forecast/route
3.  GET  /api/v1/hazards/active
4.  GET  /api/v1/fisheries/pfz
5.  GET  /api/v1/ports/nearby
6.  GET  /api/v1/aquaculture/sites/nearby
7.  GET  /api/v1/coast/profile
8.  GET  /api/v1/datasets & /api/v1/datasets/{id}
9.  GET  /api/v1/search
10. POST /api/v1/spatial/query
"""

from fastapi.testclient import TestClient
import pytest

from backend.app.main import create_app


@pytest.fixture(scope="module")
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


def test_forecast_point_contract(client: TestClient):
    """Test §214 single point marine intelligence endpoint."""
    resp = client.get("/api/v1/forecast/point?lat=16.99&lon=73.28")
    assert resp.status_code == 200
    data = resp.json()

    # Location
    assert "location" in data
    assert data["location"]["lat"] == 16.99
    assert data["location"]["lon"] == 73.28

    # Bathymetry Profile
    assert "profile" in data
    assert "bathymetry_depth_m" in data["profile"]
    assert "shelf_zone" in data["profile"]

    # Forecast
    assert "forecast" in data
    fc = data["forecast"]
    assert "wave_height_m" in fc
    assert "swell_period_s" in fc
    assert "wind_speed_kn" in fc
    assert "sst_c" in fc

    # Astronomical Tide
    assert "tide" in data
    tide = data["tide"]
    assert "current_height_m" in tide
    assert "phase" in tide
    assert "next_high" in tide
    assert "next_low" in tide
    assert len(tide["hourly_curve"]) > 0

    # Sources & Provenance
    assert "sources" in data
    assert len(data["sources"]) >= 3
    providers = [s["provider"] for s in data["sources"]]
    assert "INCOIS" in providers
    assert "GEBCO" in providers


def test_forecast_route_contract(client: TestClient):
    """Test passage forecast along waypoints."""
    # From Ratnagiri Harbour (16.99, 73.28) to Offshore PFZ (16.82, 72.95)
    resp = client.get(
        "/api/v1/forecast/route?waypoints=16.99,73.28;16.82,72.95&craft_profile=MOTORIZED_FIBERGLASS"
    )
    assert resp.status_code == 200
    data = resp.json()

    assert "total_distance_km" in data
    assert data["total_distance_km"] > 0
    assert "total_distance_nm" in data
    assert "max_wave_height_m" in data
    assert data["status"] in ("GO", "CAUTION", "NO_GO")
    assert "verdict" in data
    assert data["segments_count"] == 1


def test_hazards_active_contract(client: TestClient):
    """Test active IMD & INCOIS marine hazards."""
    resp = client.get("/api/v1/hazards/active")
    assert resp.status_code == 200
    data = resp.json()

    assert "hazards" in data
    assert data["count"] > 0
    assert "official_sources" in data
    for h in data["hazards"]:
        assert "hazard_id" in h
        assert "headline" in h
        assert "severity" in h
        assert "source" in h


def test_fisheries_pfz_contract(client: TestClient):
    """Test active INCOIS PFZ advisories."""
    resp = client.get("/api/v1/fisheries/pfz?sector=Maharashtra")
    assert resp.status_code == 200
    data = resp.json()

    assert data["sector"] == "Maharashtra"
    assert data["advisories_count"] > 0
    for adv in data["advisories"]:
        assert "advisory_id" in adv
        assert "latitude" in adv
        assert "longitude" in adv
        assert "sst_celsius" in adv
        assert "chlorophyll_mg_m3" in adv
        assert "target_species" in adv
        assert len(adv["target_species"]) > 0


def test_ports_nearby_contract(client: TestClient):
    """Test CMFRI landing centres proximity query."""
    # Near Ratnagiri
    resp = client.get("/api/v1/ports/nearby?lat=16.99&lon=73.28&radius_km=100")
    assert resp.status_code == 200
    data = resp.json()

    assert data["count"] > 0
    ports = data["ports"]
    assert any("Mirkarwada" in p["name"] or "Ratnagiri" in p["name"] for p in ports)
    for p in ports:
        assert "craft_count" in p
        assert "distance_km" in p
        assert p["distance_km"] <= 100.0


def test_aquaculture_sites_nearby_contract(client: TestClient):
    """Test CAA registered coastal aquaculture farms query."""
    # Near Ratnagiri coastal creeks
    resp = client.get("/api/v1/aquaculture/sites/nearby?lat=17.0&lon=73.25&radius_km=100")
    assert resp.status_code == 200
    data = resp.json()

    assert data["count"] > 0
    farms = data["aquaculture_sites"]
    for f in farms:
        assert "farm_name" in f
        assert "caa_registration_number" in f
        assert "water_source" in f
        assert "distance_km" in f
        assert f["distance_km"] <= 100.0


def test_coast_profile_contract(client: TestClient):
    """Test GEBCO bathymetric profile & shelf classification."""
    # Nearshore Ratnagiri
    resp = client.get("/api/v1/coast/profile?lat=16.99&lon=73.28")
    assert resp.status_code == 200
    data = resp.json()

    assert "bathymetry_depth_m" in data
    assert "shelf_zone" in data
    assert "distance_to_shore_km" in data
    assert data["dataset"].startswith("GEBCO")


def test_coast_profile_angria_bank_coral_atoll(client: TestClient):
    """Test Angria Bank submerged coral atoll unique bathymetric classification."""
    # Angria Bank coordinates: 16.5°N, 72.1°E (105 km offshore)
    resp = client.get("/api/v1/coast/profile?lat=16.50&lon=72.10")
    assert resp.status_code == 200
    data = resp.json()

    assert data["is_submerged_coral_bank"] is True
    assert "Angria Bank" in data["shelf_zone"]
    assert data["bathymetry_depth_m"] < 50.0  # Uniquely shallow coral plateau offshore


def test_datasets_catalogue_contract(client: TestClient):
    """Test First 30 datasets catalogue (§212)."""
    resp = client.get("/api/v1/datasets")
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_datasets"] == 30
    assert len(data["datasets"]) == 30

    # Specific dataset lookup
    resp_ds1 = client.get("/api/v1/datasets/DS-01")
    assert resp_ds1.status_code == 200
    ds1 = resp_ds1.json()
    assert ds1["id"] == "DS-01"
    assert "INCOIS" in ds1["provider"]
    assert "Ocean State Forecast" in ds1["title"]

    # Filter by category
    resp_ocean = client.get("/api/v1/datasets?category=Ocean")
    assert resp_ocean.status_code == 200
    assert resp_ocean.json()["total_datasets"] > 0


def test_search_marine_features_contract(client: TestClient):
    """Test unified spatial search."""
    resp = client.get("/api/v1/search?q=Ratnagiri")
    assert resp.status_code == 200
    data = resp.json()

    assert data["count"] > 0
    names = [r["name"] for r in data["results"]]
    assert any("Ratnagiri" in n or "Mirkarwada" in n for n in names)


def test_spatial_query_contract(client: TestClient):
    """Test §215 unified 'What is here?' composite spatial query."""
    payload = {
        "lat": 16.99,
        "lon": 73.28,
        "radius_km": 60.0,
    }
    resp = client.post("/api/v1/spatial/query", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert "query_point" in data
    assert "ocean_state" in data
    assert "bathymetry_and_shelf" in data
    assert "astronomical_tide" in data
    assert "active_hazards" in data
    assert "nearby_landing_centres" in data
    assert "sources" in data
