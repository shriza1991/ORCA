"""INCOIS PFZ File Importer.

Imports genuine PFZ advisories from a file when the live API is unconfigured.
Preserves original source metadata and handles invalid records.
"""
import json
from datetime import datetime, UTC, timedelta
from typing import Any, Dict, List

from backend.app.importers.base import BaseImporter
from backend.app.connectors.normalizers.incois import IncoisPFZNormalizer


class PfzImporter(BaseImporter):
    """Importer for PFZ advisory files."""

    def process(self) -> Dict[str, Any]:
        """Reads and normalizes PFZ advisories from file."""
        with open(self.file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # Verify candidate source documentation/formats
        if "features" not in data and "data" not in data:
            raise ValueError(f"Invalid PFZ advisory format in {self.file_path}")

        raw_features = data.get("features", data.get("data", []))
        quarantined = []
        valid_features = []
        
        for feat in raw_features:
            # Quarantine invalid records (missing coordinates/lat/lon)
            coords = feat.get("coordinates", feat.get("geometry", {}).get("coordinates", []))
            lat = feat.get("lat") or feat.get("latitude")
            lon = feat.get("lon") or feat.get("longitude")
            
            if not lat and (not coords or len(coords) < 2):
                quarantined.append({"record": feat, "reason": "Missing coordinates"})
                continue
                
            valid_features.append(feat)

        # Preserve metadata
        payload = {
            "features": valid_features,
            "bulletin_date": data.get("bulletin_date") or data.get("valid_from") or datetime.now(UTC).isoformat(),
            "valid_to": data.get("valid_to") or (datetime.now(UTC) + timedelta(hours=24)).isoformat(),
            "source_metadata": {
                "checksum": self._generate_checksum(),
                "issuing_authority": data.get("issuing_authority", "INCOIS"),
                "file_path": str(self.file_path),
                "quarantined_records": len(quarantined),
                "quarantined_details": quarantined
            }
        }
        
        # Use existing normalizer
        normalized = IncoisPFZNormalizer.normalize(payload)
        return {
            "payload": normalized,
            "metadata": payload["source_metadata"]
        }
