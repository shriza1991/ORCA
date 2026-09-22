import pytest
import json
from pathlib import Path
from datetime import datetime, UTC
from backend.app.importers.pfz_importer import PfzImporter
from backend.app.importers.hazard_importer import HazardImporter
from backend.app.importers.satellite_importer import SatelliteImporter
import xarray as xr
import numpy as np

@pytest.fixture
def pfz_file(tmp_path):
    data = {
        "bulletin_date": datetime.now(UTC).isoformat(),
        "features": [
            {"lat": 15.0, "lon": 73.0, "depth": 20},
            {"depth": 30} # Invalid, no coords
        ]
    }
    p = tmp_path / "pfz.json"
    p.write_text(json.dumps(data))
    return p

@pytest.fixture
def hazard_file(tmp_path):
    data = {
        "headline": "Squally weather",
        "event_type": "HIGH_WIND",
        "severity": "MODERATE"
    }
    p = tmp_path / "hazard.json"
    p.write_text(json.dumps(data))
    return p

@pytest.fixture
def netcdf_file(tmp_path):
    # Create a dummy netcdf file with xarray
    ds = xr.Dataset(
        {
            "sst": (("lat", "lon"), np.array([[28.5, np.nan], [29.0, 27.5]])),
        },
        coords={
            "lat": [15.0, 16.0],
            "lon": [73.0, 74.0],
            "time": [np.datetime64("2026-09-22T06:00")]
        },
        attrs={"description": "Test SST"}
    )
    p = tmp_path / "test.nc"
    ds.to_netcdf(p)
    return p

def test_pfz_importer_quarantines_invalid(pfz_file):
    importer = PfzImporter(pfz_file)
    res = importer.process()
    
    assert "metadata" in res
    assert res["metadata"]["quarantined_records"] == 1
    assert len(res["payload"].features) == 1
    assert res["payload"].features[0]["lat"] == 15.0

def test_hazard_importer(hazard_file):
    importer = HazardImporter(hazard_file)
    res = importer.process()
    
    assert "metadata" in res
    assert res["payload"].severity == "MODERATE"
    assert res["payload"].headline == "Squally weather"

def test_satellite_importer(netcdf_file):
    importer = SatelliteImporter(netcdf_file)
    res = importer.process()
    
    assert "metadata" in res
    assert res["metadata"]["variable"] == "sst"
    assert res["metadata"]["geographic_coverage"]["lat_min"] == 15.0
    assert np.isnan(res["dataset"]["sst"].values[0, 1]) # Verify NaN is preserved, not coerced to 0
