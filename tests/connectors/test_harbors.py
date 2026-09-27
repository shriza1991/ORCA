"""Tests for harbors.py Reference Loaders and Coordinate Resolver.

Tests valid load, missing file, malformed record, unknown harbor,
unknown vessel profile, invalid coordinates, and invalid safety thresholds.
"""

import json
import pytest
from pathlib import Path
from pydantic import ValidationError

from backend.app.connectors.harbors import (
    LandingCentreRecord,
    VesselLimits,
    VesselProfileRecord,
    get_landing_centre,
    get_vessel_profile,
    init_reference_catalogs,
    load_landing_centres,
    load_vessel_profiles,
    resolve_coordinates,
)


class DummyContext:
    def __init__(self, origin_harbor=None, coordinates=None):
        self.origin_harbor = origin_harbor
        self.coordinates = coordinates


def test_valid_load_landing_centres():
    records = load_landing_centres()
    assert len(records) >= 9
    names = [r.name for r in records]
    assert "Ratnagiri" in names
    assert "Veraval" in names
    assert "Mumbai" in names

    rat = get_landing_centre("Ratnagiri")
    assert rat is not None
    assert rat.latitude == 16.9942
    assert rat.longitude == 73.2847
    assert rat.state == "Maharashtra"


def test_valid_load_vessel_profiles():
    records = load_vessel_profiles()
    assert len(records) >= 3
    ids = [r.profile_id for r in records]
    assert "traditional_non_motorized" in ids
    assert "motorized_boat" in ids
    assert "mechanized_trawler" in ids

    boat = get_vessel_profile("motorized_boat")
    assert boat is not None
    assert boat.safety_limits.wave_nogo_m == 2.5
    assert boat.safety_limits.wind_nogo_knots == 25.0


def test_missing_file(tmp_path):
    missing_path = tmp_path / "non_existent.json"
    with pytest.raises(FileNotFoundError):
        load_landing_centres(missing_path)

    with pytest.raises(FileNotFoundError):
        load_vessel_profiles(missing_path)


def test_malformed_json(tmp_path):
    malformed_file = tmp_path / "bad.json"
    malformed_file.write_text("{ this is not json }", encoding="utf-8")

    with pytest.raises(ValueError, match="Malformed JSON"):
        load_landing_centres(malformed_file)

    with pytest.raises(ValueError, match="Malformed JSON"):
        load_vessel_profiles(malformed_file)


def test_malformed_record_type(tmp_path):
    bad_type_file = tmp_path / "bad_type.json"
    bad_type_file.write_text('{"id": "HARB-01"}', encoding="utf-8")

    with pytest.raises(ValueError, match="Expected list"):
        load_landing_centres(bad_type_file)


def test_unknown_harbor_and_vessel():
    init_reference_catalogs(force_reload=True)
    assert get_landing_centre("NonExistentHarbor999") is None
    assert get_vessel_profile("spaceship_v1") is None


def test_invalid_coordinates():
    with pytest.raises(ValidationError):
        LandingCentreRecord(
            id="HARB-TEST",
            name="Test",
            state="Test",
            latitude=95.0,  # Invalid > 90
            longitude=73.0,
            source="Test",
            updated_at="2026-09-01T00:00:00Z",
        )

    with pytest.raises(ValidationError):
        LandingCentreRecord(
            id="HARB-TEST",
            name="Test",
            state="Test",
            latitude=16.0,
            longitude=200.0,  # Invalid > 180
            source="Test",
            updated_at="2026-09-01T00:00:00Z",
        )


def test_invalid_safety_thresholds():
    # wave_nogo_m < wave_caution_m must fail
    with pytest.raises(ValidationError, match="wave_nogo_m .* cannot be less than wave_caution_m"):
        VesselLimits(
            wave_caution_m=2.0,
            wave_nogo_m=1.0,  # Invalid
            wind_caution_knots=15.0,
            wind_nogo_knots=25.0,
            gust_caution_knots=20.0,
            gust_nogo_knots=30.0,
            swell_caution_m=1.0,
            swell_nogo_m=1.5,
        )


def test_resolve_coordinates():
    # 1. From coordinates list
    ctx1 = DummyContext(coordinates=[72.87, 18.92])
    lat, lon = resolve_coordinates(ctx1)
    assert lat == 18.92
    assert lon == 72.87

    # 2. From landing centre catalog lookup
    ctx2 = DummyContext(origin_harbor="Porbandar")
    lat, lon = resolve_coordinates(ctx2)
    assert lat == 21.64
    assert lon == 69.60

    # 3. Missing both
    ctx3 = DummyContext(origin_harbor=None, coordinates=None)
    with pytest.raises(ValueError, match="missing"):
        resolve_coordinates(ctx3)


def test_mumbai_resolves_to_fishing_harbour_not_city_area():
    ctx = DummyContext(origin_harbor="Mumbai")

    lat, lon = resolve_coordinates(ctx)

    assert (lat, lon) == (18.9158, 72.8258)
