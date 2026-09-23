"""Satellite Product Importer — Product-Spec Aware.

Imports genuine satellite SST / Chlorophyll-a products (NetCDF) using xarray.

Supported product specs and their canonical variable mappings:

GHRSST_MUR (NASA JPL MUR L4, v4.1)
  - Primary variable : analysed_sst  (Kelvin, scale_factor=0.001, add_offset=298.15)
  - Uncertainty      : analysis_error
  - Quality mask     : mask (0=open_sea, non-zero=non-ocean → treat as missing)
  - Coordinates      : lat, lon, time

GHRSST_AVHRR (NOAA AVHRR Pathfinder or similar GHRSST L3/L4)
  - Primary variable : sea_surface_temperature  (Kelvin)
  - Quality mask     : quality_level (>= 4 = high quality; < 4 = suspect/cloud)
  - Coordinates      : lat, lon, time

OCEANSAT3_SST (ISRO Oceansat-3 OCM SST product)
  - Primary variable : sst
  - Quality flag     : QA_FLAGS (0=Clear, 1=Cloud, 2=No Data)
  - Missing sentinel : -999.0
  - Coordinates      : LATITUDE, LONGITUDE, TIME

OCEANSAT3_CHL (ISRO Oceansat-3 Ocean Colour Monitor Chl-a)
  - Primary variable : chlorophyll_a
  - Quality flag     : QA_FLAGS
  - Missing sentinel : -999.0
  - Coordinates      : LATITUDE, LONGITUDE, TIME

GENERIC
  - Auto-discovers the first 2D+ variable and lat/lon coordinates.
  - Does NOT apply product-specific quality masks.
  - Use only for exploratory import.

Key behaviours
--------------
1. Quality-masked or fill-value pixels are preserved as NaN — NEVER replaced with 0.
2. Results are subsetted to the pilot-region bounding box (lat 14–22°N, lon 70–77°E)
   unless ``subset_to_pilot_region=False`` is passed.
3. Successfully imported metadata is registered in the module-level DatasetRegistry.
4. SST in Kelvin is converted to Celsius for downstream contracts.
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Any, Literal, Optional

import numpy as np
import xarray as xr

from backend.app.importers.base import BaseImporter
from backend.app.connectors.dataset_registry import (
    DatasetMetadata,
    GeographicCoverage,
    dataset_registry,
)

logger = logging.getLogger(__name__)

ProductSpec = Literal[
    "GHRSST_MUR",
    "GHRSST_AVHRR",
    "OCEANSAT3_SST",
    "OCEANSAT3_CHL",
    "GENERIC",
]

# ── Product-to-variable-name mappings ────────────────────────────────────────
# Sourced from official product user guides, NOT invented.
#
# GHRSST MUR v4.1:
#   https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1
#   CDL: https://opendap.earthdata.nasa.gov/providers/POCLOUD/collections/MUR-JPL-L4-GLOB-v4.1
#
# GHRSST AVHRR Pathfinder:
#   https://www.ncei.noaa.gov/products/avhrr-pathfinder-sst
#
# Oceansat-3 OCM:
#   https://www.sac.gov.in/Vacancy/SAC/data_products/oceansat3/ocm/
_PRODUCT_SPECS: dict[str, dict[str, Any]] = {
    "GHRSST_MUR": {
        "primary_var": "analysed_sst",
        "uncertainty_var": "analysis_error",
        "quality_mask_var": "mask",
        # mask == 0 means open-sea (valid ocean); non-zero = land/ice/other
        "valid_mask_value": 0,
        "lat_coord": "lat",
        "lon_coord": "lon",
        "time_coord": "time",
        "sst_units": "kelvin",
        "convert_kelvin_to_celsius": True,
        "missing_sentinel": -32768,
        "issuing_authority": "NASA JPL PO.DAAC",
        "source_url": "https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1",
    },
    "GHRSST_AVHRR": {
        "primary_var": "sea_surface_temperature",
        "uncertainty_var": None,
        "quality_mask_var": "quality_level",
        # quality_level >= 4 is usable; < 4 is suspect or cloud-affected
        "min_quality_level": 4,
        "lat_coord": "lat",
        "lon_coord": "lon",
        "time_coord": "time",
        "sst_units": "kelvin",
        "convert_kelvin_to_celsius": True,
        "missing_sentinel": -999,
        "issuing_authority": "NOAA NCEI",
        "source_url": "https://www.ncei.noaa.gov/products/avhrr-pathfinder-sst",
    },
    "OCEANSAT3_SST": {
        "primary_var": "sst",
        "uncertainty_var": None,
        "quality_mask_var": "QA_FLAGS",
        # QA_FLAGS == 0 is clear/valid; 1=Cloud, 2=No Data
        "valid_qa_value": 0,
        "lat_coord": "LATITUDE",
        "lon_coord": "LONGITUDE",
        "time_coord": "TIME",
        "sst_units": "celsius",
        "convert_kelvin_to_celsius": False,
        "missing_sentinel": -999.0,
        "issuing_authority": "ISRO SAC / INCOIS",
        "source_url": "https://mosdac.gov.in",
    },
    "OCEANSAT3_CHL": {
        "primary_var": "chlorophyll_a",
        "uncertainty_var": None,
        "quality_mask_var": "QA_FLAGS",
        "valid_qa_value": 0,
        "lat_coord": "LATITUDE",
        "lon_coord": "LONGITUDE",
        "time_coord": "TIME",
        "sst_units": "mg/m3",
        "convert_kelvin_to_celsius": False,
        "missing_sentinel": -999.0,
        "issuing_authority": "ISRO SAC / INCOIS",
        "source_url": "https://mosdac.gov.in",
    },
    "GENERIC": {
        # Populated dynamically during import
        "primary_var": None,
        "quality_mask_var": None,
        "lat_coord": None,
        "lon_coord": None,
        "time_coord": None,
        "sst_units": "unknown",
        "convert_kelvin_to_celsius": False,
        "missing_sentinel": None,
        "issuing_authority": "Unknown",
        "source_url": None,
    },
}

# Pilot region bounding box (D013 — Ratnagiri/Konkan corridor)
PILOT_REGION = {
    "lat_min": 14.0,
    "lat_max": 22.0,
    "lon_min": 70.0,
    "lon_max": 77.0,
}


def _clean_val(v: Any, sentinel: Optional[float] = None) -> Optional[float]:
    """Return None for NaN, sentinel values, or non-numeric inputs."""
    if v is None:
        return None
    try:
        fv = float(v)
        if np.isnan(fv):
            return None
        if sentinel is not None and abs(fv - sentinel) < 1e-3:
            return None
        return fv
    except (ValueError, TypeError):
        return None


class SatelliteImporter(BaseImporter):
    """Product-spec-aware satellite product importer.

    Parameters
    ----------
    file_path:
        Path to the NetCDF file.
    product_spec:
        One of GHRSST_MUR, GHRSST_AVHRR, OCEANSAT3_SST, OCEANSAT3_CHL, GENERIC.
        Controls variable name lookup, quality mask interpretation, and unit
        conversion. GENERIC is auto-discovery and skips quality masking.
    subset_to_pilot_region:
        When True (default), spatial subset to lat 14–22°N, lon 70–77°E.
        Pass False for global or full-file imports.
    product_id:
        Optional product identifier from the issuing authority.
    acquisition_time:
        Optional ISO-8601 UTC acquisition time string.
    """

    def __init__(
        self,
        file_path: str,
        product_spec: ProductSpec = "GENERIC",
        subset_to_pilot_region: bool = True,
        product_id: Optional[str] = None,
        acquisition_time: Optional[str] = None,
    ) -> None:
        super().__init__(file_path)
        self.product_spec = product_spec
        self.subset_to_pilot_region = subset_to_pilot_region
        self.product_id = product_id
        self.acquisition_time = acquisition_time

    def process(self) -> dict[str, Any]:
        """Read, quality-mask, and subset the satellite product.

        Returns
        -------
        dict with keys:
          - ``dataset``: The xarray.Dataset (pilot-region subset, quality-masked)
          - ``metadata``: DatasetMetadata-compatible dict with full provenance

        Raises
        ------
        ValueError
            If the expected primary variable or coordinates are not found.
        """
        spec = dict(_PRODUCT_SPECS[self.product_spec])

        # Open dataset; xarray auto-applies scale_factor / add_offset / _FillValue
        ds = xr.open_dataset(str(self.file_path), engine="netcdf4", mask_and_scale=True)

        # ── Variable discovery ────────────────────────────────────────────────
        primary_var = spec.get("primary_var")
        if not primary_var or self.product_spec == "GENERIC":
            candidates = [v for v in ds.data_vars if ds[v].ndim >= 2]
            if not candidates:
                raise ValueError(
                    f"No 2D+ data variables found in {self.file_path}"
                )
            primary_var = candidates[0]
            spec["primary_var"] = primary_var
            logger.info("GENERIC product spec: discovered primary variable %r", primary_var)

        if primary_var not in ds.data_vars:
            raise ValueError(
                f"Variable {primary_var!r} not found in {self.file_path}. "
                f"Available: {list(ds.data_vars)}"
            )

        # ── Coordinate discovery ──────────────────────────────────────────────
        lat_coord = spec.get("lat_coord")
        lon_coord = spec.get("lon_coord")
        time_coord = spec.get("time_coord")

        # Fall back to auto-discovery if spec coords not found
        if not lat_coord or lat_coord not in ds.coords:
            lat_coord = next(
                (c for c in ds.coords if c.lower() in ("lat", "latitude")), None
            )
        if not lon_coord or lon_coord not in ds.coords:
            lon_coord = next(
                (c for c in ds.coords if c.lower() in ("lon", "longitude")), None
            )
        if not time_coord or time_coord not in ds.coords:
            time_coord = next(
                (c for c in ds.coords if c.lower() in ("time", "t")), None
            )

        if not lat_coord or not lon_coord:
            raise ValueError(
                f"Could not find lat/lon coordinates in {self.file_path}. "
                f"Available coords: {list(ds.coords)}"
            )

        # ── Pilot region subset ───────────────────────────────────────────────
        if self.subset_to_pilot_region:
            try:
                ds = ds.sel(
                    {lat_coord: slice(PILOT_REGION["lat_min"], PILOT_REGION["lat_max"])},
                )
                ds = ds.sel(
                    {lon_coord: slice(PILOT_REGION["lon_min"], PILOT_REGION["lon_max"])},
                )
                logger.debug(
                    "Subsetted to pilot region: lat [%s–%s], lon [%s–%s]",
                    PILOT_REGION["lat_min"], PILOT_REGION["lat_max"],
                    PILOT_REGION["lon_min"], PILOT_REGION["lon_max"],
                )
            except Exception as exc:
                logger.warning(
                    "Could not subset to pilot region (%s). Using full dataset.", exc
                )

        # ── Quality masking ───────────────────────────────────────────────────
        quality_mask_var = spec.get("quality_mask_var")
        quarantined_count = 0

        if quality_mask_var and quality_mask_var in ds.data_vars:
            mask = ds[quality_mask_var]
            valid_mask_value = spec.get("valid_mask_value")
            min_quality_level = spec.get("min_quality_level")
            valid_qa_value = spec.get("valid_qa_value")

            if valid_mask_value is not None:
                # Binary mask: 0=valid ocean, non-zero=invalid
                invalid = mask != valid_mask_value
            elif min_quality_level is not None:
                # Quality level: >= threshold is valid
                invalid = mask < min_quality_level
            elif valid_qa_value is not None:
                # QA flags: 0=clear/valid
                invalid = mask != valid_qa_value
            else:
                invalid = None

            if invalid is not None:
                # Count masked pixels (cloud, land, ice, etc.)
                quarantined_count = int(invalid.sum())
                # Apply mask: set invalid pixels to NaN — NEVER to 0
                ds[primary_var] = ds[primary_var].where(~invalid)
                logger.info(
                    "Quality mask applied: %d invalid pixels → NaN (not 0)",
                    quarantined_count,
                )
        elif quality_mask_var:
            logger.warning(
                "Quality mask variable %r specified but not found in dataset. "
                "No masking applied.",
                quality_mask_var,
            )

        # ── Unit conversion: Kelvin → Celsius ────────────────────────────────
        if spec.get("convert_kelvin_to_celsius", False):
            kelvin_min = float(ds[primary_var].min())
            if kelvin_min > 100:  # Sanity check: Kelvin values >> 100
                ds[primary_var] = ds[primary_var] - 273.15
                logger.debug(
                    "Converted %s from Kelvin to Celsius (subtract 273.15)", primary_var
                )

        # ── Time coverage ─────────────────────────────────────────────────────
        time_coverage = None
        if time_coord and time_coord in ds.coords and ds[time_coord].size > 0:
            try:
                t_vals = ds[time_coord].values
                time_coverage = [str(t_vals.min()), str(t_vals.max())]
            except Exception:
                pass

        # ── Geographic coverage after subset ─────────────────────────────────
        lat_vals = ds[lat_coord].values
        lon_vals = ds[lon_coord].values
        geo_coverage = GeographicCoverage(
            lat_min=float(lat_vals.min()),
            lat_max=float(lat_vals.max()),
            lon_min=float(lon_vals.min()),
            lon_max=float(lon_vals.max()),
            description=(
                "Konkan coast pilot region subset" if self.subset_to_pilot_region
                else "Full product extent"
            ),
        )

        # ── Resolution ───────────────────────────────────────────────────────
        resolution_desc = "unknown"
        try:
            if lat_vals.size > 1:
                lat_step = abs(float(np.diff(lat_vals).mean()))
                lon_step = abs(float(np.diff(lon_vals).mean()))
                resolution_desc = f"{lat_step:.4f}° × {lon_step:.4f}°"
        except Exception:
            pass

        # ── Checksum ──────────────────────────────────────────────────────────
        checksum = self._generate_checksum()

        # ── Build metadata dict ───────────────────────────────────────────────
        metadata = {
            "checksum": checksum,
            "product_spec": self.product_spec,
            "variable": primary_var,
            "variable_attrs": dict(ds[primary_var].attrs),
            "geographic_coverage": geo_coverage.model_dump(),
            "time_coverage": time_coverage,
            "resolution": resolution_desc,
            "access_method": "FILE_IMPORT",
            "availability": "CACHED",
            "file_path": str(self.file_path),
            "quarantined_pixels": quarantined_count,
            "quarantine_reason": (
                f"Quality mask {quality_mask_var!r} applied"
                if quality_mask_var and quarantined_count > 0 else None
            ),
            "issuing_authority": spec.get("issuing_authority", "Unknown"),
            "source_url": spec.get("source_url"),
            "product_id": self.product_id,
            "acquisition_time": self.acquisition_time,
            "units_after_processing": (
                "celsius" if spec.get("convert_kelvin_to_celsius") else spec.get("sst_units", "unknown")
            ),
        }

        # ── Register in dataset registry ──────────────────────────────────────
        dataset_id = f"satellite_{self.product_spec}_{Path(self.file_path).stem}"
        registry_entry = DatasetMetadata(
            dataset_id=dataset_id,
            variable=primary_var,
            source_name=f"{spec.get('issuing_authority', 'Unknown')} — {self.product_spec}",
            issuing_authority=spec.get("issuing_authority", "Unknown"),
            source_url=spec.get("source_url"),
            geographic_coverage=geo_coverage,
            time_coverage_start=time_coverage[0] if time_coverage else None,
            time_coverage_end=time_coverage[-1] if time_coverage else None,
            resolution_description=resolution_desc,
            access_method="FILE_IMPORT",
            availability="CACHED",
            availability_detail=f"Loaded from {Path(self.file_path).name}",
            original_file_path=str(self.file_path),
            checksum=checksum,
            product_id=self.product_id,
            acquisition_time=self.acquisition_time,
            quality_flags=[
                f"quality_mask={quality_mask_var}" if quality_mask_var else "no_mask",
                f"quarantined_pixels={quarantined_count}",
            ],
        )
        dataset_registry.register(registry_entry)

        return {
            "dataset": ds,
            "metadata": metadata,
        }
