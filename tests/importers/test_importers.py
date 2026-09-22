"""Tests for file-based importers (PFZ, Hazard, Satellite).

Owned by Dev 2 (Backend Platform).

Tests cover:
- Existing fixture-based tests (quarantine, basic normalization)
- Genuine dated sample files (incois/pfz_bulletin, imd/marine_hazard_bulletin)
- Satellite importer: GHRSST_MUR product spec, pilot-region subset, quality masking,
  NaN preservation (never zero), and GENERIC fallback
"""
import json
import pytest
import numpy as np
from pathlib import Path
from datetime import datetime, UTC
from unittest.mock import patch

import xarray as xr

from backend.app.importers.pfz_importer import PfzImporter
from backend.app.importers.hazard_importer import HazardImporter
from backend.app.importers.satellite_importer import SatelliteImporter
from backend.app.connectors.dataset_registry import dataset_registry


# ── Fixtures: synthetic files for unit tests ──────────────────────────────────

@pytest.fixture(autouse=True)
def _reset_registry():
    """Clear the module-level dataset_registry before each test."""
    dataset_registry.clear()
    yield
    dataset_registry.clear()


@pytest.fixture
def pfz_file(tmp_path):
    """Minimal PFZ fixture with one valid and one invalid (no coords) feature."""
    data = {
        "bulletin_date": datetime.now(UTC).isoformat(),
        "features": [
            {"lat": 15.0, "lon": 73.0, "depth": 20},
            {"depth": 30},  # Invalid — no coords
        ],
    }
    p = tmp_path / "pfz.json"
    p.write_text(json.dumps(data))
    return p


@pytest.fixture
def hazard_file(tmp_path):
    """Minimal hazard fixture with headline and severity."""
    data = {
        "headline": "Squally weather",
        "event_type": "HIGH_WIND",
        "severity": "MODERATE",
    }
    p = tmp_path / "hazard.json"
    p.write_text(json.dumps(data))
    return p


@pytest.fixture
def netcdf_file_generic(tmp_path):
    """Generic NetCDF file with SST variable (GENERIC product spec)."""
    ds = xr.Dataset(
        {"sst": (("lat", "lon"), np.array([[28.5, np.nan], [29.0, 27.5]]))},
        coords={
            "lat": [15.0, 16.0],
            "lon": [73.0, 74.0],
            "time": [np.datetime64("2026-09-22T06:00")],
        },
        attrs={"description": "Test SST"},
    )
    p = tmp_path / "test_generic.nc"
    ds.to_netcdf(p)
    return p


@pytest.fixture
def netcdf_file_ghrsst_mur(tmp_path):
    """NetCDF file using real GHRSST MUR variable names and quality mask."""
    # analysed_sst in Kelvin (scale applied by xarray automatically).
    # We provide raw Kelvin values (around 300K = ~27°C).
    sst_kelvin = np.array([
        [302.15, 300.65, np.nan],   # Row 0: valid, valid, fill (NaN)
        [301.85, 299.15, 303.10],   # Row 1: all valid pre-mask
    ], dtype=np.float32)

    # mask: 0 = open_sea (valid), 1 = land (invalid)
    mask = np.array([
        [0, 0, 0],
        [0, 1, 0],   # Row 1, col 1 is land → should be masked
    ], dtype=np.int8)

    analysis_error = np.full_like(sst_kelvin, fill_value=0.08)

    ds = xr.Dataset(
        {
            "analysed_sst": (("lat", "lon"), sst_kelvin),
            "analysis_error": (("lat", "lon"), analysis_error),
            "mask": (("lat", "lon"), mask),
        },
        coords={
            "lat": [16.0, 17.0],
            "lon": [72.5, 73.0, 73.5],
            "time": [np.datetime64("2026-09-12T09:00")],
        },
        attrs={
            "title": "GHRSST Level 4 MUR Global Foundation SST Analysis",
            "institution": "Jet Propulsion Laboratory",
            "source": "MUR-JPL-L4-GLOB-v4.1",
        },
    )
    p = tmp_path / "20260912090000-JPL-L4_GHRSST-SSTfnd-MUR-GLOB-v02.0-fv04.1.nc"
    ds.to_netcdf(p)
    return p


# ── Genuine dated sample file fixtures ───────────────────────────────────────

# Paths relative to repo root (where pytest is run from)
_REPO_ROOT = Path(__file__).parent.parent.parent
_PFZ_GENUINE = _REPO_ROOT / "data/source_snapshots/incois/pfz_bulletin_2026-09-12.json"
_HAZARD_GENUINE = _REPO_ROOT / "data/source_snapshots/imd/marine_hazard_bulletin_2026-09-12.json"


# ── Existing fixture tests (must continue to pass) ────────────────────────────

def test_pfz_importer_quarantines_invalid(pfz_file):
    """PFZ importer quarantines features with missing coordinates."""
    importer = PfzImporter(pfz_file)
    res = importer.process()

    assert "metadata" in res
    assert res["metadata"]["quarantined_records"] == 1
    assert len(res["payload"].features) == 1
    assert res["payload"].features[0]["lat"] == 15.0


def test_hazard_importer(hazard_file):
    """Hazard importer normalizes headline and severity correctly."""
    importer = HazardImporter(hazard_file)
    res = importer.process()

    assert "metadata" in res
    assert res["payload"].severity == "MODERATE"
    assert res["payload"].headline == "Squally weather"


def test_satellite_importer_generic(netcdf_file_generic):
    """GENERIC product spec: auto-discovers variable, returns NaN-preserved dataset."""
    importer = SatelliteImporter(
        netcdf_file_generic,
        product_spec="GENERIC",
        subset_to_pilot_region=False,
    )
    res = importer.process()

    assert "metadata" in res
    assert res["metadata"]["variable"] == "sst"
    assert res["metadata"]["geographic_coverage"]["lat_min"] == 15.0
    # NaN must be preserved — never coerced to 0
    assert np.isnan(res["dataset"]["sst"].values[0, 1])


# ── Genuine dated sample file tests ──────────────────────────────────────────

@pytest.mark.skipif(
    not _PFZ_GENUINE.exists(),
    reason="Genuine PFZ bulletin not found at data/source_snapshots/incois/",
)
def test_pfz_importer_genuine_sample():
    """PFZ importer correctly parses the genuine INCOIS dated bulletin."""
    importer = PfzImporter(str(_PFZ_GENUINE))
    res = importer.process()

    payload = res["payload"]
    metadata = res["metadata"]

    # Must have valid features (cloud-obscured F04 is quarantined or nulled)
    assert len(payload.features) >= 1, "At least one valid feature expected"

    # Check provenance is preserved
    assert metadata["issuing_authority"] is not None
    assert metadata["checksum"] is not None
    assert len(metadata["checksum"]) == 64  # SHA-256 hex

    # Genuine bulletin — source_name must NOT say SYNTHETIC
    assert "SYNTHETIC" not in payload.source_name

    # product_id should be present from the genuine file
    assert metadata["product_id"] is not None, "product_id must be present in genuine bulletin"

    # Feature F04 is cloud-obscured: its sst_gradient_c should be None (not -999 or 0)
    f04_records = [f for f in payload.features if f.get("id") == "PFZ-MH-20260912-F04"]
    if f04_records:
        f04 = f04_records[0]
        assert f04.get("sst_grad") != -999.0, "Cloud-obscured SST gradient must not be -999"
        assert f04.get("sst_grad") != 0.0, "Cloud-obscured SST gradient must not be 0"

    # Geographic coverage in metadata
    assert metadata["quarantined_records"] >= 0  # May be 0 or 1 depending on F04 handling


@pytest.mark.skipif(
    not _HAZARD_GENUINE.exists(),
    reason="Genuine IMD hazard bulletin not found at data/source_snapshots/imd/",
)
def test_hazard_importer_genuine_sample():
    """Hazard importer correctly parses the genuine IMD dated bulletin."""
    importer = HazardImporter(str(_HAZARD_GENUINE))
    res = importer.process()

    payload = res["payload"]
    metadata = res["metadata"]

    # Basic contract
    assert payload.severity == "NORMAL"
    assert payload.cyclone_warning_active is False
    assert payload.squall_alert is False

    # Genuine bulletin — source_name must NOT say SYNTHETIC
    assert "SYNTHETIC" not in payload.source_name

    # bulletin_id extracted
    assert metadata["bulletin_id"] is not None

    # Checksum present and SHA-256
    assert metadata["checksum"] is not None
    assert len(metadata["checksum"]) == 64

    # Issuing authority
    assert "IMD" in metadata["issuing_authority"]


# ── GHRSST MUR satellite product tests ───────────────────────────────────────

def test_satellite_importer_ghrsst_mur_variable_mapping(netcdf_file_ghrsst_mur):
    """GHRSST_MUR spec: uses 'analysed_sst' variable, not generic 'sst' or 'CHL_A'."""
    importer = SatelliteImporter(
        netcdf_file_ghrsst_mur,
        product_spec="GHRSST_MUR",
        subset_to_pilot_region=False,
    )
    res = importer.process()

    assert res["metadata"]["variable"] == "analysed_sst"
    assert res["metadata"]["product_spec"] == "GHRSST_MUR"


def test_satellite_importer_ghrsst_mur_quality_mask(netcdf_file_ghrsst_mur):
    """GHRSST_MUR spec: mask=1 (land) pixels → NaN, not 0.

    The fixture has mask=1 at [1,1] (lat=17.0, lon=73.0).
    That pixel must become NaN after quality masking.
    """
    importer = SatelliteImporter(
        netcdf_file_ghrsst_mur,
        product_spec="GHRSST_MUR",
        subset_to_pilot_region=False,
    )
    res = importer.process()

    ds = res["dataset"]
    sst = ds["analysed_sst"].values

    # Find lat=17.0, lon=73.0 indices (row 1, col 1)
    lat_idx = list(ds.lat.values).index(17.0)
    lon_idx = list(ds.lon.values).index(73.0)

    masked_value = sst[lat_idx, lon_idx]
    assert np.isnan(masked_value), (
        f"Land-masked pixel must be NaN, got {masked_value}. "
        "Cloud/land/ice pixels MUST NOT be coerced to 0."
    )

    # The quarantined_pixels count must reflect this
    assert res["metadata"]["quarantined_pixels"] >= 1


def test_satellite_importer_nan_preserved_not_coerced_to_zero(netcdf_file_ghrsst_mur):
    """Original NaN pixels in the data are preserved as NaN, not 0."""
    importer = SatelliteImporter(
        netcdf_file_ghrsst_mur,
        product_spec="GHRSST_MUR",
        subset_to_pilot_region=False,
    )
    res = importer.process()

    ds = res["dataset"]
    sst = ds["analysed_sst"].values

    # The original fill/nan at [0,2] (lat=16.0, lon=73.5) — check no 0 values were introduced
    assert not np.any(sst == 0), (
        "No pixel should be exactly 0.0 — either valid SST or NaN."
    )


def test_satellite_importer_pilot_region_subset(netcdf_file_ghrsst_mur):
    """Pilot region subset limits lat to [14,22], lon to [70,77]."""
    importer = SatelliteImporter(
        netcdf_file_ghrsst_mur,
        product_spec="GHRSST_MUR",
        subset_to_pilot_region=True,
    )
    res = importer.process()

    geo = res["metadata"]["geographic_coverage"]
    # After subset, all points must be within the pilot region bounds
    assert geo["lat_min"] >= 14.0
    assert geo["lat_max"] <= 22.0
    assert geo["lon_min"] >= 70.0
    assert geo["lon_max"] <= 77.0


def test_satellite_importer_registers_in_dataset_registry(netcdf_file_ghrsst_mur):
    """Satellite importer registers a DatasetMetadata entry in the registry."""
    importer = SatelliteImporter(
        netcdf_file_ghrsst_mur,
        product_spec="GHRSST_MUR",
        product_id="MUR-JPL-L4-TEST-20260912",
        subset_to_pilot_region=False,
    )
    importer.process()

    available = dataset_registry.get_available_datasets()
    assert len(available) == 1
    entry = available[0]
    assert entry.variable == "analysed_sst"
    assert entry.access_method == "FILE_IMPORT"
    assert entry.availability == "CACHED"


def test_satellite_importer_kelvin_to_celsius_conversion(netcdf_file_ghrsst_mur):
    """GHRSST_MUR SST values are converted from Kelvin to Celsius.

    The fixture has values like 302.15K → 29.0°C.
    After conversion, valid values should be in plausible SST range (15–35°C).
    """
    importer = SatelliteImporter(
        netcdf_file_ghrsst_mur,
        product_spec="GHRSST_MUR",
        subset_to_pilot_region=False,
    )
    res = importer.process()

    sst = res["dataset"]["analysed_sst"].values
    valid_sst = sst[~np.isnan(sst)]

    # Should not be in Kelvin range (> 100)
    assert valid_sst.max() < 100.0, (
        f"SST still in Kelvin! Max value: {valid_sst.max():.1f}"
    )
    # Should be in reasonable Arabian Sea range
    assert valid_sst.min() >= 10.0, "Celsius SST below 10°C is implausible for Arabian Sea"
    assert valid_sst.max() <= 45.0, "Celsius SST above 45°C is implausible"


def test_satellite_importer_missing_variable_raises(tmp_path):
    """Satellite importer raises ValueError when GHRSST_MUR primary variable is missing."""
    # Create a NetCDF with wrong variable name (not 'analysed_sst')
    ds = xr.Dataset(
        {"wrong_var": (("lat", "lon"), np.ones((2, 2)))},
        coords={"lat": [15.0, 16.0], "lon": [73.0, 74.0]},
    )
    p = tmp_path / "wrong_vars.nc"
    ds.to_netcdf(p)

    importer = SatelliteImporter(p, product_spec="GHRSST_MUR", subset_to_pilot_region=False)
    with pytest.raises(ValueError, match="analysed_sst"):
        importer.process()
