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
            from backend.app.connectors.snapshot import SnapshotConnector
            return SnapshotConnector().get_hazard_bulletin(context)

        if self.data_mode in ("LIVE", "HYBRID") and settings.IMD_API_KEY and "placeholder" not in settings.IMD_API_BASE_URL.lower():
            try:
                return self._fetch_imd_hazard(harbor, context)
            except Exception as exc:
                logger.warning("IMD Hazard live fetch failed (%s).", exc)
                if self.data_mode == "LIVE":
                    raise
        else:
            logger.debug("IMD Hazard API is unconfigured (placeholder or missing key).")
            if self.data_mode == "LIVE":
                from backend.app.connectors.errors import ConnectorAuthenticationError
                raise ConnectorAuthenticationError("IMD_API_KEY is not configured for LIVE mode.")

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
                importer = HazardImporter(str(import_path))
                res = importer.process()
                payload = res["payload"]
                meta = res.get("metadata", {})
                # PRESERVE ORIGINAL VALIDITY: Do NOT rewrite historical valid_from/valid_to to now_utc
                bid = payload.bulletin_id or meta.get("bulletin_id")
                payload.source_name = f"IMD Cyclone Warning Division (CACHED_REAL — {bid or 'dated bulletin'})"
                payload.freshness_flags = {
                    "coverage_status": "CACHED",
                    "retrieved_at": datetime.now(UTC).isoformat(),
                    "source_issue_time": meta.get("acquired_at"),
                    "valid_from": payload.valid_from,
                    "valid_to": payload.valid_to,
                    "warnings": [
                        "Live IMD Hazard API unconfigured or offline; loaded cached bulletin.",
                    ],
                }
                return payload
            except Exception as exc:
                logger.warning("Failed to load Hazard from file importer: %s", exc)

        # When credentials or bulletins are unavailable, FAIL CLOSED with UNKNOWN
        return self._make_unavailable_payload(
            harbor,
            reason="MISSING_CREDENTIALS" if not settings.IMD_API_KEY else "UPSTREAM_UNAVAILABLE",
        )

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

        return HazardBulletinPayload(
            harbor=harbor,
            cyclone_warning_active=bool(raw.get("cyclone_alert", False)),
            squall_alert=bool(raw.get("squall_alert", False)),
            bulletin_id=raw.get("bulletin_id"),
            severity=raw.get("severity", "NORMAL"),
            headline=raw.get("headline") or "No active severe weather or cyclone warning.",
            valid_from=raw.get("valid_from"),
            valid_to=raw.get("valid_to"),
            source_name="IMD Cyclone Warning Division",
            source_url=self.SOURCE_URL,
            freshness_flags={
                "coverage_status": "LIVE",
                "retrieved_at": datetime.now(UTC).isoformat(),
            },
        )

    @staticmethod
    def _make_unavailable_payload(harbor: str, reason: str) -> HazardBulletinPayload:
        """Return UNKNOWN hazard bulletin payload when data is missing or unconfigured.

        Never manufactures NORMAL conditions or safe clearances without data.
        """
        now_utc = datetime.now(UTC)
        return HazardBulletinPayload(
            harbor=harbor,
            cyclone_warning_active=False,
            squall_alert=False,
            bulletin_id=None,
            severity="UNKNOWN",
            headline="Hazard bulletin unavailable (IMD service unconfigured or offline).",
            valid_from=None,
            valid_to=None,
            source_name="IMD Cyclone Warning Division (UNAVAILABLE)",
            source_url="https://mausam.imd.gov.in",
            freshness_flags={
                "coverage_status": "UNAVAILABLE",
                "retrieved_at": now_utc.isoformat(),
                "warnings": [
                    f"[HAZARD-UNAVAILABLE] Official IMD hazard advisory feed is unavailable ({reason}). "
                    "Departure safety cannot be certified without active hazard bulletins."
                ],
            },
        )
