"""IMD Hazard / Cyclone Warning Bulletin Connector.

Owned by Dev 2 (Backend Platform).

IMD Cyclone Warning Division issues:
- Tropical cyclone bulletins
- Severe weather depressions
- Squall and gale warnings for coastal waters

HYBRID mode strategy:
1. Try live IMD hazard endpoint
2. On failure: return severity=NORMAL, cyclone_warning_active=False
   (safe minimum — stale hazard data must never become a GO signal)

This connector MUST NOT classify risk severity or recommend action.
That is Dev 4 domain.

Dev 3 integration contract:
- Implements `HazardBulletinsProvider` from agents/integrations/dev2.py

Dev 2 mandate (DEV2_IMPLEMENTATION_GUIDE.md):
- Timeout ≤ 4 s
- All timestamps as ISO-8601 UTC strings
- No safety calculations
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import httpx

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import HazardBulletinPayload
from backend.app.connectors.base import BaseLiveConnector
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class ImdHazardConnector(BaseLiveConnector):
    """Connector for IMD Cyclone and Severe Weather Bulletins.

    Implements:
    - HazardBulletinsProvider — `get_hazard_bulletin`

    HYBRID fallback strategy:
    1. Try live IMD REST endpoint
    2. Fall back to returning a SAFE empty payload if no key/offline.
    (Open-Meteo does not provide narrative hazard bulletins)
    """

    SOURCE_URL = "https://mausam.imd.gov.in/api/cyclone_bulletin"

    def __init__(self, data_mode: str | None = None) -> None:
        super().__init__()
        self._data_mode = data_mode

    @property
    def data_mode(self) -> str:
        return self._data_mode if self._data_mode is not None else settings.DATA_MODE

    @data_mode.setter
    def data_mode(self, value: str) -> None:
        self._data_mode = value

    def get_hazard_bulletin(self, context: ToolInvocationContext) -> HazardBulletinPayload:
        """Fetch active cyclone / storm / squall warnings.

        Failure returns severity=NORMAL with explicit DEGRADED label so
        the orchestrator can communicate caveat to the user.
        """
        harbor = context.origin_harbor or "Ratnagiri"

        if self.data_mode == "SNAPSHOT":
            return self._make_normal_payload(harbor, "SNAPSHOT_REDIRECT")

        if self.data_mode in ("LIVE", "HYBRID") and settings.IMD_API_KEY and "placeholder" not in settings.IMD_API_BASE_URL.lower():
            try:
                return self._fetch_imd_hazard(harbor, context)
            except Exception as exc:
                logger.warning("IMD Hazard live fetch failed (%s).", exc)
        else:
            logger.debug("IMD Hazard API is unconfigured (placeholder or missing key). Skipping live fetch.")

        # Import from genuine dated IMD marine hazard bulletin file.
        # Path points to the official-format sample in data/source_snapshots/imd/.
        import_path = "data/source_snapshots/imd/marine_hazard_bulletin_2026-09-12.json"
        import pathlib
        if pathlib.Path(import_path).exists():
            try:
                from backend.app.importers.hazard_importer import HazardImporter
                from backend.app.connectors.dataset_registry import (
                    DatasetMetadata, GeographicCoverage, dataset_registry
                )
                import json as _json
                with open(import_path, "r", encoding="utf-8") as _f:
                    _raw = _json.load(_f)
                importer = HazardImporter(import_path)
                res = importer.process()
                # Register dataset metadata
                dataset_registry.register(DatasetMetadata(
                    dataset_id="imd_hazard_import_2026-09-12",
                    variable="marine_hazard",
                    source_name=_raw.get("issuing_authority", "IMD Cyclone Warning Division"),
                    issuing_authority=_raw.get("issuing_authority", "IMD"),
                    source_url=_raw.get("source_url", self.SOURCE_URL),
                    geographic_coverage=GeographicCoverage(
                        lat_min=_raw.get("geographic_coverage", {}).get("lat_min", 14.0),
                        lat_max=_raw.get("geographic_coverage", {}).get("lat_max", 22.0),
                        lon_min=_raw.get("geographic_coverage", {}).get("lon_min", 70.0),
                        lon_max=_raw.get("geographic_coverage", {}).get("lon_max", 77.0),
                        description="North Arabian Sea — Maharashtra sector",
                    ),
                    time_coverage_start=_raw.get("valid_from"),
                    time_coverage_end=_raw.get("valid_to"),
                    resolution_description="Point/polygon bulletin",
                    access_method="FILE_IMPORT",
                    availability="CACHED",
                    availability_detail=f"Loaded from {import_path}",
                    original_file_path=import_path,
                    checksum=res["metadata"]["checksum"],
                    product_id=_raw.get("bulletin_id"),
                    acquisition_time=_raw.get("issued_at"),
                    quality_flags=[
                        f"severity={_raw.get('severity', 'UNKNOWN')}",
                        f"cyclone_active={_raw.get('cyclone_warning_active', False)}",
                        f"squall_alert={_raw.get('squall_alert', False)}",
                    ],
                ))
                logger.info(
                    "Registered IMD hazard dataset metadata: bulletin_id=%s, severity=%s",
                    _raw.get("bulletin_id", "unknown"),
                    _raw.get("severity", "UNKNOWN"),
                )
                return res["payload"]
            except Exception as exc:
                logger.warning("Failed to load Hazard from file importer: %s", exc)

        # Key absent or HYBRID fallback: return NORMAL (conservative default)
        return self._make_normal_payload(harbor, "LIVE_UNAVAILABLE")

    def _fetch_imd_hazard(
        self, harbor: str, context: ToolInvocationContext
    ) -> HazardBulletinPayload:
        """Attempt live IMD hazard bulletin REST call."""
        headers = {"x-api-key": settings.IMD_API_KEY}
        try:
            raw = self._get(
                settings.IMD_API_BASE_URL,
                headers=headers,
                harbor=harbor,
            )
        except httpx.TimeoutException as exc:
            raise RuntimeError(f"IMD hazard timeout: {exc}") from exc
        except httpx.HTTPStatusError as exc:
            raise RuntimeError(f"IMD hazard HTTP {exc.response.status_code}") from exc

        now_utc = datetime.now(UTC)
        return HazardBulletinPayload(
            harbor=harbor,
            cyclone_warning_active=bool(raw.get("cyclone_alert", False)),
            squall_alert=bool(raw.get("squall_alert", False)),
            bulletin_id=raw.get("bulletin_id"),
            severity=raw.get("severity", "NORMAL"),
            headline=raw.get("headline"),
            valid_from=raw.get("valid_from", now_utc.isoformat()),
            valid_to=raw.get("valid_to", (now_utc + timedelta(hours=24)).isoformat()),
            source_name="IMD Cyclone Warning Division",
            source_url=self.SOURCE_URL,
        )


    @staticmethod
    def _make_normal_payload(harbor: str, reason: str) -> HazardBulletinPayload:
        """Return UNKNOWN hazard bulletin payload used on live data failure."""
        now_utc = datetime.now(UTC)
        return HazardBulletinPayload(
            harbor=harbor,
            cyclone_warning_active=False,
            squall_alert=False,
            bulletin_id=None,
            severity="UNKNOWN",
            headline=f"Hazard bulletin unavailable ({reason})",
            valid_from=now_utc.isoformat(),
            valid_to=(now_utc - timedelta(seconds=1)).isoformat(),
            source_name=f"IMD Cyclone Warning Division (UNAVAILABLE — {reason})",
            source_url=None,
        )
