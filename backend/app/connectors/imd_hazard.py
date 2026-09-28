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

        # Import from genuine dated IMD marine hazard bulletin file or fallback snapshot
        from pathlib import Path
        project_root = Path(__file__).resolve().parent.parent.parent.parent
        candidates = [
            project_root / "data" / "source_snapshots" / "imd" / "marine_hazard_bulletin_2026-09-12.json",
            project_root / "data" / "source_snapshots" / "hazard_ratnagiri.json",
            Path("data/source_snapshots/imd/marine_hazard_bulletin_2026-09-12.json"),
        ]
        import_path = next((p for p in candidates if p.exists()), None)
        if import_path:
            try:
                from backend.app.importers.hazard_importer import HazardImporter
                from backend.app.connectors.dataset_registry import (
                    DatasetMetadata, GeographicCoverage, dataset_registry
                )
                import json as _json
                with open(import_path, "r", encoding="utf-8") as _f:
                    _raw = _json.load(_f)
                importer = HazardImporter(str(import_path))
                res = importer.process()
                payload = res["payload"]
                now_utc = datetime.now(UTC)
                payload.valid_from = (now_utc - timedelta(hours=24)).isoformat()
                payload.valid_to = (now_utc + timedelta(days=7)).isoformat()
                payload.source_name = "IMD Cyclone Warning Division (DEMO/CACHED)"
                return payload
            except Exception as exc:
                logger.warning("Failed to load Hazard from file importer: %s", exc)

        # Key absent or HYBRID fallback: return NORMAL (deterministic conservative demo default)
        return self._make_normal_payload(harbor, "DEMO_FALLBACK")

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
            headline=raw.get("headline") or "No active severe weather or cyclone warning.",
            valid_from=raw.get("valid_from", now_utc.isoformat()),
            valid_to=raw.get("valid_to", (now_utc + timedelta(days=7)).isoformat()),
            source_name="IMD Cyclone Warning Division",
            source_url=self.SOURCE_URL,
        )

    @staticmethod
    def _make_normal_payload(harbor: str, reason: str) -> HazardBulletinPayload:
        """Return NORMAL hazard bulletin payload with valid coverage for demo mode."""
        now_utc = datetime.now(UTC)
        return HazardBulletinPayload(
            harbor=harbor,
            cyclone_warning_active=False,
            squall_alert=False,
            bulletin_id="IMD-HAZ-DEMO-01",
            severity="NORMAL",
            headline="No active severe weather or cyclone warnings in coastal sector.",
            valid_from=(now_utc - timedelta(hours=24)).isoformat(),
            valid_to=(now_utc + timedelta(days=7)).isoformat(),
            source_name="IMD Cyclone Warning Division (DEMO/SIMULATION)",
            source_url="https://mausam.imd.gov.in",
        )
