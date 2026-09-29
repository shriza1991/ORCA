"""Tests for Authority Fleet Surveillance vessel tracking geography and replay integrity.

Verifies:
1. Every intended vessel has canonical replay data.
2. Replay belongs strictly to the requested vessel.
3. Sector filtering returns only vessels belonging to the selected sector.
4. An unknown/no-match sector returns zero vessels without fallback vessel injection.
5. Replay points are strictly chronologically ordered.
6. Replay movement is smooth and does not contain unexpected geographic jumps.
7. Existing 14 vessel IDs remain unchanged and intact.
8. Replay coordinates remain within their intended operational surveillance sector.
9. No duplicate replay position public_ids or assignments occur.
"""

import json
from pathlib import Path
from fastapi.testclient import TestClient
from shapely.geometry import Polygon, Point

from backend.app.main import app

client = TestClient(app)

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "fixtures" / "synthetic" / "orca"


def test_1_all_fourteen_vessels_have_replay():
    """Verify all 14 canonical vessels exist and each has exactly 30 replay positions."""
    with open(FIXTURES_DIR / "vessels.json", "r", encoding="utf-8") as f:
        vessels = json.load(f)
    assert len(vessels) == 14

    with open(FIXTURES_DIR / "replay_positions.json", "r", encoding="utf-8") as f:
        replays = json.load(f)
    assert len(replays) == 420

    by_vessel = {}
    for r in replays:
        by_vessel.setdefault(r["vessel_id"], []).append(r)

    assert len(by_vessel) == 14
    for v in vessels:
        vid = v["public_id"]
        assert vid in by_vessel, f"Missing replay for vessel {vid}"
        assert len(by_vessel[vid]) == 30, f"Expected 30 points for {vid}, got {len(by_vessel[vid])}"


def test_2_replay_endpoint_returns_only_requested_vessel():
    """Verify GET /api/v1/demo/vessels/{vessel_id}/replay returns strictly the requested vessel's replay."""
    for i in range(1, 15):
        vid = f"vessel-{i:02d}"
        res = client.get(f"/api/v1/demo/vessels/{vid}/replay")
        assert res.status_code == 200
        pts = res.json()
        assert len(pts) == 30
        assert all(p["vessel_id"] == vid for p in pts), f"Found mismatched vessel_id in replay for {vid}"


def test_3_sector_filtering_returns_only_sector_vessels():
    """Verify /demo/vessels?sector=<sector> returns only vessels belonging to that sector."""
    sector_expected = {
        "Ratnagiri Sector (MH-03)": {"vessel-01", "vessel-02", "vessel-03", "vessel-04"},
        "Malvan Marine Zone (MH-04)": {"vessel-05", "vessel-06", "vessel-07", "vessel-08"},
        "Goa Naval Corridor (GA-01)": {"vessel-09", "vessel-10"},
        "Mumbai Offshore (MH-01)": {"vessel-11", "vessel-12"},
        "Veraval Coastal Zone (GJ-02)": {"vessel-13", "vessel-14"},
    }

    for sector_name, expected_ids in sector_expected.items():
        res = client.get(f"/api/v1/demo/vessels?sector={sector_name}")
        assert res.status_code == 200
        vessels = res.json()
        returned_ids = {v["public_id"] for v in vessels}
        assert returned_ids == expected_ids, f"Sector {sector_name} expected {expected_ids}, got {returned_ids}"


def test_4_unknown_or_no_match_sector_returns_zero_vessels():
    """Verify unknown or unmatched sector (e.g. 'Empty', 'UnknownSector') returns zero vessels.

    NOTE: 'Empty' is NOT a canonical sector; this tests that any unknown or unmatched
    sector query safely returns an empty list ([]) without injecting fallback vessels.
    """
    for query in ["Empty", "UnknownSector", "Unseeded Zone", "NonExistent (MH-99)"]:
        res = client.get(f"/api/v1/demo/vessels?sector={query}")
        assert res.status_code == 200
        assert res.json() == [], f"Expected empty vessel list for '{query}', got {res.json()}"


def test_5_replay_points_are_chronologically_ordered():
    """Verify replay points are strictly ordered in ascending timestamp order."""
    for i in range(1, 15):
        vid = f"vessel-{i:02d}"
        res = client.get(f"/api/v1/demo/vessels/{vid}/replay")
        assert res.status_code == 200
        pts = res.json()
        timestamps = [p["timestamp"] for p in pts]
        assert timestamps == sorted(timestamps), f"Timestamps out of order for {vid}"


def test_6_replay_movement_is_smooth_no_erratic_jumps():
    """Verify that successive points move smoothly without teleporting across the map (< 0.1 deg per step)."""
    for i in range(1, 15):
        vid = f"vessel-{i:02d}"
        res = client.get(f"/api/v1/demo/vessels/{vid}/replay")
        assert res.status_code == 200
        pts = res.json()
        for step in range(len(pts) - 1):
            d_lat = abs(pts[step + 1]["latitude"] - pts[step]["latitude"])
            d_lon = abs(pts[step + 1]["longitude"] - pts[step]["longitude"])
            assert d_lat < 0.05, f"{vid} lat jump at step {step}: {d_lat} deg"
            assert d_lon < 0.05, f"{vid} lon jump at step {step}: {d_lon} deg"


def test_7_existing_vessel_ids_intact():
    """Verify that canonical vessel public_ids vessel-01 through vessel-14 remain exactly intact."""
    with open(FIXTURES_DIR / "vessels.json", "r", encoding="utf-8") as f:
        vessels = json.load(f)
    ids = [v["public_id"] for v in vessels]
    expected_ids = [f"vessel-{i:02d}" for i in range(1, 15)]
    assert ids == expected_ids


def test_8_replay_coordinates_remain_inside_operational_sectors():
    """Verify using Shapely that all 30 points for all 14 vessels stay inside their sector polygons."""
    with open(FIXTURES_DIR / "sectors.json", "r", encoding="utf-8") as f:
        sectors = {s["public_id"]: Polygon(s["polygon"]) for s in json.load(f)}

    vessel_sector_map = {
        "vessel-01": "sector-ratnagiri",
        "vessel-02": "sector-ratnagiri",
        "vessel-03": "sector-ratnagiri",
        "vessel-04": "sector-ratnagiri",
        "vessel-05": "sector-malvan",
        "vessel-06": "sector-malvan",
        "vessel-07": "sector-malvan",
        "vessel-08": "sector-malvan",
        "vessel-09": "sector-goa",
        "vessel-10": "sector-goa",
        "vessel-11": "sector-mumbai",
        "vessel-12": "sector-mumbai",
        "vessel-13": "sector-veraval",
        "vessel-14": "sector-veraval",
    }

    for vid, sec_id in vessel_sector_map.items():
        poly = sectors[sec_id]
        res = client.get(f"/api/v1/demo/vessels/{vid}/replay")
        assert res.status_code == 200
        pts = res.json()
        for idx, p in enumerate(pts):
            pt = Point(p["longitude"], p["latitude"])
            assert poly.contains(pt), (
                f"Vessel {vid} point {idx} ({p['longitude']}, {p['latitude']}) "
                f"is outside {sec_id} polygon"
            )


def test_9_no_duplicate_replay_positions():
    """Verify every replay position has a unique public_id and no duplicate assignments occur."""
    with open(FIXTURES_DIR / "replay_positions.json", "r", encoding="utf-8") as f:
        replays = json.load(f)
    ids = [r["public_id"] for r in replays]
    assert len(ids) == len(set(ids)), "Found duplicate public_ids in replay_positions"
