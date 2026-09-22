"""Satellite Product Importer (SST/Chlorophyll).

Imports genuine satellite products (e.g. NetCDF) using xarray.
Handles parsing of product-specific variables, coordinate systems,
scale factors, missing-value conventions, and quality masks.
Never replaces cloud-masked or missing pixels with zero.
"""
import json
import logging
from typing import Any, Dict

import xarray as xr
from backend.app.importers.base import BaseImporter

logger = logging.getLogger(__name__)

class SatelliteImporter(BaseImporter):
    """Importer for generic Satellite NetCDF products."""

    def __init__(self, file_path: str, primary_variable: str = None):
        super().__init__(file_path)
        self.primary_variable = primary_variable

    def process(self) -> Dict[str, Any]:
        """Reads and normalizes satellite NetCDF products."""
        # Open dataset using xarray, which handles scale factors and fill values automatically
        ds = xr.open_dataset(self.file_path, engine="netcdf4")
        
        # Discover primary variable if not explicitly provided
        if not self.primary_variable:
            candidates = [v for v in ds.data_vars if len(ds[v].dims) >= 2]
            if not candidates:
                 raise ValueError("No valid 2D+ data variables found in satellite product.")
            self.primary_variable = candidates[0]
            
        if self.primary_variable not in ds.data_vars:
            raise ValueError(f"Variable {self.primary_variable} not found in {self.file_path}")

        var_data = ds[self.primary_variable]
        
        # Coordinate system discovery
        lat_col = next((c for c in ds.coords if c.lower() in ("lat", "latitude")), None)
        lon_col = next((c for c in ds.coords if c.lower() in ("lon", "longitude")), None)
        time_col = next((c for c in ds.coords if c.lower() in ("time", "t")), None)
        
        if not lat_col or not lon_col:
            raise ValueError("Could not determine spatial coordinates (lat/lon) in satellite product.")

        # Extract Dataset Metadata
        time_coverage = None
        if time_col and ds[time_col].size > 0:
            time_coverage = [str(ds[time_col].values[0]), str(ds[time_col].values[-1])]

        metadata = {
            "checksum": self._generate_checksum(),
            "variable": self.primary_variable,
            "variable_attrs": dict(var_data.attrs),
            "geographic_coverage": {
                "lat_min": float(ds[lat_col].min()),
                "lat_max": float(ds[lat_col].max()),
                "lon_min": float(ds[lon_col].min()),
                "lon_max": float(ds[lon_col].max())
            },
            "time_coverage": time_coverage,
            "resolution": {
                "lat_step": float(abs(ds[lat_col].diff(dim=lat_col).mean())),
                "lon_step": float(abs(ds[lon_col].diff(dim=lon_col).mean()))
            } if ds[lat_col].size > 1 else "point",
            "access_method": "FILE_IMPORT",
            "availability": "OFFLINE_CACHED",
            "file_path": str(self.file_path),
            "quarantined_records": 0, # In xarray, NaNs are preserved natively, representing masked data
            "quarantined_details": []
        }
        
        # Do NOT replace NaNs (missing/cloud masked) with 0.
        # Xarray preserves these as NaNs.
        
        # We can extract a summary payload or bounding boxes.
        # Real-world usage would stream/query the xarray dataset dynamically.
        # Here we return the loaded dataset reference and the metadata.
        return {
            "dataset": ds,
            "metadata": metadata
        }
