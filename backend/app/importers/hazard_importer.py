"""IMD Marine Hazard Bulletin File Importer.

Imports genuine marine hazard bulletins from a file when live access is unconfigured.
Preserves original source metadata and handles invalid records.
"""
import json
from datetime import datetime, UTC, timedelta
from typing import Any, Dict

from backend.app.importers.base import BaseImporter
from backend.app.connectors.normalizers.imd import ImdHazardNormalizer


class HazardImporter(BaseImporter):
    """Importer for IMD Marine Hazard bulletin files."""

    def process(self) -> Dict[str, Any]:
        """Reads and normalizes Hazard bulletins from file."""
        with open(self.file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # Verify candidate source documentation/formats
        if not isinstance(data, dict):
            raise ValueError(f"Invalid Hazard bulletin format in {self.file_path}. Expected dictionary.")

        # Quarantine check
        quarantined = []
        if "headline" not in data and "event_type" not in data:
            quarantined.append({"record": data, "reason": "Missing critical fields (headline/event_type)"})
            # Cannot normalize without minimal data
            if not data.get("severity"):
                 raise ValueError("Hazard bulletin is completely unparseable.")

        # Preserve metadata
        payload = dict(data)
        payload["source_metadata"] = {
            "checksum": self._generate_checksum(),
            "issuing_authority": data.get("issuing_authority", "IMD"),
            "file_path": str(self.file_path),
            "quarantined_records": len(quarantined),
            "quarantined_details": quarantined
        }
        
        normalized = ImdHazardNormalizer.normalize(payload)
        return {
            "payload": normalized,
            "metadata": payload["source_metadata"]
        }
