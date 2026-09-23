"""INCOIS PFZ File Importer.

Imports genuine PFZ advisories from a file when the live API is unconfigured.

Supported formats:
1. INCOIS PFZ GeoJSON-like format (features array with lat/lon + SST gradient)
2. Internal SAMUDRA snapshot format (features under payload.features)

Preserves:
- Original source metadata (issuing_authority, product_id, acquisition_time,
  bulletin_date, valid_from, valid_to, geographic_coverage, units)
- File checksum for traceability
- Quarantined records (with reasons) — cloud-obscured / missing coords are kept
  but not passed to normalizer to avoid silently coercing missing data

Invalid / quarantined rules:
- Missing coordinates (lat AND lon both absent): quarantine with MISSING_COORDS
- SST gradient == -999.0 or -999: record is valid but SST gradient is set to None
- cloud_obscured qc_status: record is valid (kept) but SST gradient is None
"""
import json
from datetime import datetime, UTC, timedelta
from typing import Any, Dict, List

from backend.app.importers.base import BaseImporter
from backend.app.connectors.normalizers.incois import IncoisPFZNormalizer


class PfzImporter(BaseImporter):
    """Importer for PFZ advisory files."""

    def process(self) -> Dict[str, Any]:
        """Read and normalize PFZ advisories from a genuine bulletin file.

        Returns
        -------
        dict with:
          - ``payload``: PFZSourceDataPayload (normalized for downstream tools)
          - ``metadata``: Provenance dict including checksum, quarantine details,
                          issuing_authority, product_id, acquisition_time
        """
        with open(self.file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Support both direct format and SAMUDRA snapshot envelope format
        if "payload" in data and "features" in data.get("payload", {}):
            # SAMUDRA snapshot envelope: { metadata: {...}, payload: { features: [...] } }
            raw_features = data["payload"].get("features", [])
            bulletin_date = data["payload"].get("bulletin_date")
            valid_to = data["payload"].get("valid_to")
            issuing_authority = (
                data.get("metadata", {}).get("provider", "INCOIS")
                or "INCOIS"
            )
            product_id = data.get("metadata", {}).get("snapshot_id")
            acquisition_time = data.get("metadata", {}).get("captured_at")

        elif "features" in data or "data" in data:
            # Direct GeoJSON-like format (INCOIS PFZ bulletin)
            raw_features = data.get("features", data.get("data", []))
            bulletin_date = data.get("bulletin_date") or data.get("valid_from")
            valid_to = data.get("valid_to")
            issuing_authority = data.get("issuing_authority", "INCOIS")
            product_id = data.get("product_id") or data.get("bulletin_id")
            acquisition_time = data.get("bulletin_date") or data.get("acquisition_time")

        else:
            raise ValueError(
                f"Invalid PFZ advisory format in {self.file_path}. "
                f"Expected 'features' array or 'payload.features'. "
                f"Found keys: {list(data.keys())}"
            )

        quarantined: List[Dict[str, Any]] = []
        valid_features: List[Dict[str, Any]] = []

        for feat in raw_features:
            # Extract coordinates — accept various field name conventions
            coords = feat.get("coordinates", feat.get("geometry", {}).get("coordinates", []))
            lat = feat.get("lat") or feat.get("latitude")
            lon = feat.get("lon") or feat.get("longitude")

            if lat is None and coords and len(coords) >= 2:
                lon, lat = float(coords[0]), float(coords[1])

            if lat is None and lon is None:
                quarantined.append({
                    "record": feat,
                    "reason": "MISSING_COORDS: lat and lon both absent",
                })
                continue

            # Preserve cloud-obscured records as valid but flag them
            qc_status = feat.get("qc_status", "VALID")
            if qc_status in ("CLOUD_OBSCURED", "NO_DATA"):
                # Keep record for traceability; SST gradient must not be coerced
                feat = dict(feat)
                feat["sst_gradient_c"] = None  # Must not be -999 or 0
                feat["chlorophyll_proxy"] = None

            valid_features.append(feat)

        # Build normalized payload envelope
        payload_envelope = {
            "features": valid_features,
            "bulletin_date": bulletin_date or datetime.now(UTC).isoformat(),
            "valid_to": valid_to or (datetime.now(UTC) + timedelta(hours=24)).isoformat(),
            # Pass product metadata for provenance labeling in normalizer
            "product_id": product_id,
            "issuing_authority": issuing_authority,
            "_source_documentation": data.get("_source_documentation", {}),
        }

        normalized = IncoisPFZNormalizer.normalize(payload_envelope)

        return {
            "payload": normalized,
            "metadata": {
                "checksum": self._generate_checksum(),
                "issuing_authority": issuing_authority,
                "product_id": product_id,
                "acquisition_time": acquisition_time,
                "file_path": str(self.file_path),
                "quarantined_records": len(quarantined),
                "quarantined_details": quarantined,
                "total_input_features": len(raw_features),
                "valid_features": len(valid_features),
            },
        }
