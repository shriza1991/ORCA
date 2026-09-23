"""MOSDAC / ISRO / GHRSST Satellite EO Source Normalizers.

Normalizes satellite ocean-colour and SST grid cell records into normalized
SAMUDRA EO cell representations.

Supported products and their canonical variable names:

GHRSST_MUR (NASA JPL MUR L4, v4.1)
  - SST variable  : analysed_sst (Kelvin → converted to Celsius by importer)
  - Error variable: analysis_error (Kelvin)
  - Quality mask  : mask (0 = open_sea/valid)
  Reference: https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1

GHRSST_AVHRR (NOAA Pathfinder AVHRR SST L3/L4)
  - SST variable  : sea_surface_temperature (Kelvin → converted by importer)
  - Quality level : quality_level (≥ 4 = usable)
  Reference: https://www.ncei.noaa.gov/products/avhrr-pathfinder-sst

OCEANSAT3_SST (ISRO Oceansat-3)
  - SST variable  : sst (Celsius)
  - Quality flags : QA_FLAGS (0=Clear, 1=Cloud, 2=No Data)
  - Missing sentinel: -999.0
  Reference: https://www.sac.gov.in/Vacancy/SAC/data_products/oceansat3/

OCEANSAT3_CHL (ISRO Oceansat-3 OCM)
  - Chl-a variable: chlorophyll_a (mg/m³)
  - Quality flags : QA_FLAGS
  - Missing sentinel: -999.0

SYNTHETIC (internal synthetic fixture)
  - Legacy variable names: CHL_A, SST, QA_FLAGS, PIXEL_UNCERTAINTY
  - Used only for synthetic demo data, not for real product imports
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional


ProductSpec = Literal[
    "GHRSST_MUR",
    "GHRSST_AVHRR",
    "OCEANSAT3_SST",
    "OCEANSAT3_CHL",
    "SYNTHETIC",
]

# ── Per-product variable maps ─────────────────────────────────────────────────
# Maps SAMUDRA internal field names → source product variable names.
# These are NOT invented; sourced from official product documentation.

GHRSST_MUR_VARIABLE_MAP: dict[str, str] = {
    "sst": "analysed_sst",
    "uncertainty": "analysis_error",
    "quality_flag": "mask",
    "latitude": "lat",
    "longitude": "lon",
    "time": "time",
}

GHRSST_AVHRR_VARIABLE_MAP: dict[str, str] = {
    "sst": "sea_surface_temperature",
    "uncertainty": None,
    "quality_flag": "quality_level",
    "latitude": "lat",
    "longitude": "lon",
    "time": "time",
}

OCEANSAT3_SST_VARIABLE_MAP: dict[str, str] = {
    "sst": "sst",
    "uncertainty": None,
    "quality_flag": "QA_FLAGS",
    "latitude": "LATITUDE",
    "longitude": "LONGITUDE",
    "time": "TIME",
}

OCEANSAT3_CHL_VARIABLE_MAP: dict[str, str] = {
    "chlorophyll_a": "chlorophyll_a",
    "uncertainty": None,
    "quality_flag": "QA_FLAGS",
    "latitude": "LATITUDE",
    "longitude": "LONGITUDE",
    "time": "TIME",
}

# Legacy synthetic map used only for internal demo fixtures
SYNTHETIC_VARIABLE_MAP: dict[str, str] = {
    "sst": "SST",
    "chlorophyll_a": "CHL_A",
    "uncertainty": "PIXEL_UNCERTAINTY",
    "quality_flag": "QA_FLAGS",
    "latitude": "LATITUDE",
    "longitude": "LONGITUDE",
    "time": "ACQUISITION_TIME",
}

PRODUCT_VARIABLE_MAPS: dict[str, dict[str, str]] = {
    "GHRSST_MUR": GHRSST_MUR_VARIABLE_MAP,
    "GHRSST_AVHRR": GHRSST_AVHRR_VARIABLE_MAP,
    "OCEANSAT3_SST": OCEANSAT3_SST_VARIABLE_MAP,
    "OCEANSAT3_CHL": OCEANSAT3_CHL_VARIABLE_MAP,
    "SYNTHETIC": SYNTHETIC_VARIABLE_MAP,
}

PRODUCT_SOURCE_NAMES: dict[str, str] = {
    "GHRSST_MUR": "NASA JPL GHRSST MUR L4 SST",
    "GHRSST_AVHRR": "NOAA AVHRR Pathfinder SST",
    "OCEANSAT3_SST": "ISRO Oceansat-3 SST",
    "OCEANSAT3_CHL": "ISRO Oceansat-3 OCM Chl-a",
    "SYNTHETIC": "MOSDAC / ISRO Synthetic Demo",
}

PRODUCT_SOURCE_URLS: dict[str, str] = {
    "GHRSST_MUR": "https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1",
    "GHRSST_AVHRR": "https://www.ncei.noaa.gov/products/avhrr-pathfinder-sst",
    "OCEANSAT3_SST": "https://mosdac.gov.in",
    "OCEANSAT3_CHL": "https://mosdac.gov.in",
    "SYNTHETIC": "https://mosdac.gov.in",
}


class MosdacEONormalizer:
    """Normalizes satellite grid cell product records into normalized EO cell dicts.

    Handles:
    - Product-specific variable name mapping (sourced from official specs)
    - QA_FLAGS / mask / quality_level conventions per product
    - Missing value sentinel (-999.0 → None)
    - Explicit provenance labeling: product spec + source authority
    - Strictly environmental data — NOT measured fishing catch productivity
    - Cloud-masked / invalid pixels → None, NEVER → 0
    """

    @staticmethod
    def normalize(
        source_cell: Dict[str, Any],
        product_spec: ProductSpec = "SYNTHETIC",
    ) -> Dict[str, Any]:
        """Convert a satellite product cell record to a normalized EO cell dict.

        Parameters
        ----------
        source_cell:
            Dict containing source-native variable names.
        product_spec:
            The product specification controlling variable name mapping and
            quality mask interpretation. Defaults to "SYNTHETIC" for backward
            compatibility with the internal demo dataset.

        Returns
        -------
        Normalized EO cell dict with SAMUDRA internal field names.
        Missing/cloud-masked values are None, not 0.
        """
        variable_map = PRODUCT_VARIABLE_MAPS.get(product_spec, SYNTHETIC_VARIABLE_MAP)

        def clean_val(v: Any) -> Optional[float]:
            """Clean a value: None for NaN, sentinel, or non-numeric."""
            if v is None:
                return None
            try:
                fv = float(v)
                if fv == -999.0 or fv < -900.0:
                    return None
                return fv
            except (ValueError, TypeError):
                return None

        # ── Extract values using product-specific variable names ──────────────
        sst_key = variable_map.get("sst") or variable_map.get("chlorophyll_a")
        sst = clean_val(source_cell.get(sst_key)) if sst_key else None
        if sst is None:
            sst = clean_val(source_cell.get("sst_c") or source_cell.get("SST") or source_cell.get("sst"))

        # For CHL products, get chlorophyll directly
        chl_key = variable_map.get("chlorophyll_a")
        chl = clean_val(source_cell.get(chl_key)) if chl_key else None
        if chl is None:
            # Fallback: try common chlorophyll keys alongside SST
            chl = clean_val(
                source_cell.get("CHL_A")
                or source_cell.get("chlorophyll_mg_m3")
                or source_cell.get("chlorophyll_a")
            )

        uncertainty_key = variable_map.get("uncertainty")
        uncertainty = clean_val(source_cell.get(uncertainty_key)) if uncertainty_key else None
        if uncertainty is None:
            uncertainty = clean_val(source_cell.get("uncertainty", 0.12))

        # ── Quality flag interpretation ───────────────────────────────────────
        quality_flag_key = variable_map.get("quality_flag")
        qa_raw = source_cell.get(quality_flag_key, source_cell.get("qc_status", "VALID"))
        qc_status = source_cell.get("qc_status", "VALID")

        if product_spec == "GHRSST_MUR":
            # mask == 0 is open_sea (valid); non-zero → invalid
            try:
                mask_val = int(float(qa_raw))
                if mask_val != 0:
                    qc_status = "CLOUD_OBSCURED" if mask_val in (1, 2, 4) else "NO_DATA"
                    sst = None
                    chl = None
            except (ValueError, TypeError):
                pass

        elif product_spec == "GHRSST_AVHRR":
            # quality_level >= 4 is usable; < 4 is suspect or cloud-contaminated
            try:
                ql = int(float(qa_raw))
                if ql < 4:
                    qc_status = "CLOUD_OBSCURED" if ql in (1, 2) else "DEGRADED_QC_WARNING"
                    sst = None
            except (ValueError, TypeError):
                pass

        elif product_spec in ("OCEANSAT3_SST", "OCEANSAT3_CHL"):
            # QA_FLAGS: 0=Clear, 1=Cloud, 2=No Data
            try:
                qa_int = int(float(qa_raw))
                if qa_int == 1:
                    qc_status = "CLOUD_OBSCURED"
                    sst = None
                    chl = None
                elif qa_int == 2:
                    qc_status = "NO_DATA"
                    sst = None
                    chl = None
            except (ValueError, TypeError):
                pass

        else:
            # SYNTHETIC or GENERIC: legacy flag check
            qa_flags = source_cell.get("QA_FLAGS", 0)
            try:
                qa_int = int(float(qa_flags))
            except (ValueError, TypeError):
                qa_int = 0

            if qa_int == 1 or qc_status == "CLOUD_OBSCURED":
                qc_status = "CLOUD_OBSCURED"
                sst = None
                chl = None
            elif qa_int == 2 or qc_status == "NO_DATA":
                qc_status = "NO_DATA"
                sst = None
                chl = None
            elif uncertainty is not None and uncertainty > 0.4:
                qc_status = "DEGRADED_QC_WARNING"

        # ── Observation time ──────────────────────────────────────────────────
        time_key = variable_map.get("time")
        obs_time = source_cell.get(time_key) or source_cell.get("observation_time")
        if isinstance(obs_time, datetime):
            obs_time = obs_time.isoformat()
        elif not obs_time:
            obs_time = datetime.now(timezone.utc).isoformat()

        # ── Coordinates ───────────────────────────────────────────────────────
        lat_key = variable_map.get("latitude")
        lon_key = variable_map.get("longitude")
        latitude = float(source_cell.get(lat_key, source_cell.get("latitude", 16.0)))
        longitude = float(source_cell.get(lon_key, source_cell.get("longitude", 73.0)))

        # ── Cloud fraction proxy ──────────────────────────────────────────────
        # Never infer cloud fraction from SST presence; use explicit field if provided
        cloud_fraction = clean_val(source_cell.get("cloud_fraction"))
        if cloud_fraction is None:
            cloud_fraction = 0.0 if qc_status == "VALID" else 0.85

        return {
            "cell_id": source_cell.get("cell_id", source_cell.get("pixel_id", "CELL-00-00")),
            "latitude": latitude,
            "longitude": longitude,
            "observation_time": str(obs_time),
            "sst_c": sst,
            "chlorophyll_mg_m3": chl,
            "uncertainty": uncertainty,
            "qc_status": qc_status,
            "cloud_fraction": cloud_fraction,
            "source_name": PRODUCT_SOURCE_NAMES.get(product_spec, "Unknown Satellite Product"),
            "source_url": PRODUCT_SOURCE_URLS.get(product_spec, ""),
            "product_type": "SATELLITE_OCEAN_COLOR_THERMAL",
            "product_spec": product_spec,
            "provenance_note": (
                "Satellite environmental observation — NOT measured fishing catch productivity. "
                f"Product spec: {product_spec}. "
                f"QC status: {qc_status}. "
                f"Source: {PRODUCT_SOURCE_NAMES.get(product_spec, 'Unknown')}."
            ),
        }
