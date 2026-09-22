"""IMD Marine Hazard Bulletin File Importer.

Imports genuine marine hazard bulletins from a file when live access is unconfigured.

Supported formats:
1. IMD Marine Hazard Bulletin JSON (direct format with bulletin_id, issued_at, etc.)
2. SAMUDRA snapshot envelope (payload.harbor, payload.severity, etc.)

Preserves:
- Original source metadata (issuing_authority, bulletin_id, issued_at, valid_from, valid_to)
- File checksum for traceability
- Quarantined records with reasons

Invalid / quarantined rules:
- Bulletin dict missing both headline and severity: quarantined with MISSING_CRITICAL_FIELDS
"""
import json
from datetime import datetime, UTC, timedelta
from typing import Any, Dict

from backend.app.importers.base import BaseImporter
from backend.app.connectors.normalizers.imd import ImdHazardNormalizer


class HazardImporter(BaseImporter):
    """Importer for IMD Marine Hazard bulletin files."""

    def process(self) -> Dict[str, Any]:
        """Read and normalize a hazard bulletin file.

        Returns
        -------
        dict with:
          - ``payload``: HazardBulletinPayload (normalized for downstream tools)
          - ``metadata``: Provenance dict including checksum, issuing_authority,
                          bulletin_id, acquired_at, quarantined_details
        """
        with open(self.file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            raise ValueError(
                f"Invalid hazard bulletin format in {self.file_path}. Expected dict."
            )

        # Support both direct format and SAMUDRA snapshot envelope format
        if "payload" in data and "severity" in data.get("payload", {}):
            # SAMUDRA snapshot envelope: { metadata: {...}, payload: { severity, harbor, ... } }
            record = dict(data["payload"])
            issuing_authority = (
                data.get("metadata", {}).get("provider", "IMD")
                or "IMD"
            )
            bulletin_id = (
                record.get("bulletin_id")
                or data.get("metadata", {}).get("snapshot_id")
            )
            acquired_at = data.get("metadata", {}).get("captured_at")

        else:
            # Direct IMD bulletin format
            record = dict(data)
            issuing_authority = data.get("issuing_authority", "IMD Cyclone Warning Division")
            bulletin_id = data.get("bulletin_id")
            acquired_at = data.get("issued_at") or data.get("acquisition_time")

        # Quarantine check
        quarantined = []
        has_headline = "headline" in record or "body_text" in record
        has_severity = "severity" in record or "event_type" in record

        if not has_headline and not has_severity:
            quarantined.append({
                "record": record,
                "reason": "MISSING_CRITICAL_FIELDS: both headline and severity/event_type absent",
            })
            if not record.get("severity") and not record.get("event_type"):
                raise ValueError(
                    f"Hazard bulletin in {self.file_path} is completely unparseable "
                    f"(no headline, severity, or event_type)."
                )

        checksum = self._generate_checksum()

        # Normalize: pass full record to normalizer for field mapping
        normalized = ImdHazardNormalizer.normalize(record)

        return {
            "payload": normalized,
            "metadata": {
                "checksum": checksum,
                "issuing_authority": issuing_authority,
                "bulletin_id": bulletin_id,
                "acquired_at": acquired_at,
                "file_path": str(self.file_path),
                "quarantined_records": len(quarantined),
                "quarantined_details": quarantined,
            },
        }
