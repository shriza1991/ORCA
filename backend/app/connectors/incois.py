"""INCOIS Ocean State Forecast (OSF) Connector.

Owned by Dev 2 (Backend Platform).

INCOIS (Indian National Centre for Ocean Information Services) publishes:
- Ocean State Forecasts (wave height, currents, SST)
- Potential Fishing Zone (PFZ) advisories with satellite-derived data

Current INCOIS REST endpoints are behind a government portal that requires
an approved API key. In HYBRID mode, this connector:
1. Attempts the live INCOIS endpoint (with 4 s timeout)
2. On failure, falls back to Open-Meteo Marine API
3. Tags quality_flags accordingly

In SNAPSHOT mode, data is served from pre-seeded fixtures (handled by
SnapshotConnector via DataService).

Dev 3 integration contract:
- Implements `MarineConditionsProvider` from agents/integrations/dev2.py
- Implements `PFZSourceDataProvider` from agents/integrations/dev2.py

Dev 2 mandate (DEV2_IMPLEMENTATION_GUIDE.md):
- Timeout ≤ 4 s
- All timestamps as ISO-8601 UTC strings
- No safety calculations
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    MarineConditionsPayload,
    PFZSourceDataPayload,
    SVASAdvisoryPayload,
)
from backend.app.connectors.base import BaseLiveConnector
from backend.app.connectors.open_meteo import OpenMeteoConnector
from backend.app.connectors.health import SourceHealth, SourceHealthStatus
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class IncoisOceanStateConnector(BaseLiveConnector):
    """Connector for INCOIS Ocean State Forecast, PFZ advisories, and SVAS.

    Implements:
    - MarineConditionsProvider — `get_marine_conditions`
    - PFZSourceDataProvider — `get_pfz_raw_advisories`
    - SVASAdvisoryProvider — `get_svas_advisories`

    HYBRID mode strategy:
    1. Try INCOIS live API (returns 4xx / 5xx or times out)
    2. Fall back to Open-Meteo Marine (free, no key)
    3. Final resort: return a labelled DEGRADED payload
    """

    PFZ_SOURCE_URL = "https://incois.gov.in/portal/pfz"
    OSF_SOURCE_URL = "https://incois.gov.in/portal/osf"
    SVAS_SOURCE_URL = "https://incois.gov.in/portal/svas"

    def __init__(self, data_mode: str | None = None) -> None:
        super().__init__()
        self._data_mode = data_mode
        self._fallback = OpenMeteoConnector()

    @property
    def data_mode(self) -> str:
        return self._data_mode if self._data_mode is not None else settings.DATA_MODE

    @data_mode.setter
    def data_mode(self, value: str) -> None:
        self._data_mode = value

    # ------------------------------------------------------------------
    # MarineConditionsProvider
    # ------------------------------------------------------------------

    def get_marine_conditions(self, context: ToolInvocationContext) -> MarineConditionsPayload:
        """Fetch ocean state: significant wave height, swell, currents, SST.

        In LIVE/HYBRID mode: try INCOIS, fall back to Open-Meteo.
        In SNAPSHOT mode: caller must redirect to SnapshotConnector via DataService.
        """
        harbor = context.origin_harbor or "Ratnagiri"

        if self.data_mode == "SNAPSHOT":
            return self._make_degraded_marine_payload(harbor, "SNAPSHOT_REDIRECT")

        if self.data_mode in ("LIVE", "HYBRID"):
            # Attempt live INCOIS endpoint if configured properly
            is_placeholder = "placeholder" in self.OSF_SOURCE_URL.lower() or "placeholder" in settings.INCOIS_API_BASE_URL.lower()
            if settings.INCOIS_API_KEY and not is_placeholder:
                try:
                    return self._fetch_incois_marine(harbor, context)
                except Exception as exc:
                    logger.warning(
                        "INCOIS OSF live fetch failed (%s), falling back to Open-Meteo.", exc
                    )
            else:
                 logger.debug("INCOIS API is unconfigured (placeholder or missing key). Skipping live fetch.")

            # Fall back to Open-Meteo
            return self._fallback.get_marine_conditions(context)

        return self._make_degraded_marine_payload(harbor, "ALL_SOURCES_FAILED")

    def _fetch_incois_marine(
        self, harbor: str, context: ToolInvocationContext
    ) -> MarineConditionsPayload:
        """Attempt live INCOIS OSF REST call."""
        url = f"{settings.INCOIS_API_BASE_URL}/osf"
        headers = {"Authorization": f"Bearer {settings.INCOIS_API_KEY}"}
        raw = self._get(url, headers=headers, harbor=harbor)

        now_utc = datetime.now(UTC)
        return MarineConditionsPayload(
            harbor=harbor,
            significant_wave_height_m=float(raw.get("swh", 1.0)),
            swell_height_m=float(raw["swell_height"]) if raw.get("swell_height") else None,
            swell_period_sec=float(raw["swell_period"]) if raw.get("swell_period") else None,
            surface_current_knots=float(raw["current_speed"]) if raw.get("current_speed") else None,
            sea_surface_temp_c=float(raw["sst"]) if raw.get("sst") else None,
            observed_at=raw.get("timestamp_utc", now_utc.isoformat()),
            valid_to=raw.get("valid_to_utc", (now_utc + timedelta(hours=24)).isoformat()),
            source_name="INCOIS Ocean State Forecast",
            source_url=self.OSF_SOURCE_URL,
        )

    @staticmethod
    def _make_degraded_marine_payload(harbor: str, reason: str) -> MarineConditionsPayload:
        """Produce a clearly-labelled UNKNOWN/DEGRADED payload for total failure."""
        now_utc = datetime.now(UTC)
        return MarineConditionsPayload(
            harbor=harbor,
            significant_wave_height_m=None,
            swell_height_m=None,
            swell_period_sec=None,
            surface_current_knots=None,
            sea_surface_temp_c=None,
            observed_at=now_utc.isoformat(),
            valid_to=(now_utc - timedelta(seconds=1)).isoformat(),  # Immediately expired → stale
            source_name=f"INCOIS OSF (DEGRADED — {reason})",
            source_url=None,
        )

    # ------------------------------------------------------------------
    # PFZSourceDataProvider
    # ------------------------------------------------------------------

    def get_pfz_raw_advisories(self, context: ToolInvocationContext) -> PFZSourceDataPayload:
        """Fetch raw INCOIS PFZ zone advisories.

        Returns GeoJSON-style feature records. In HYBRID mode without a
        valid API key, returns an empty feature set with appropriate labels
        so downstream PFZ ranking (Dev 4) can handle gracefully.
        """
        now_utc = datetime.now(UTC)
        valid_to = (now_utc + timedelta(hours=24)).isoformat()

        if self.data_mode == "SNAPSHOT":
            return PFZSourceDataPayload(
                features=[],
                bulletin_date=now_utc.isoformat(),
                valid_to=valid_to,
                source_name="INCOIS PFZ (SNAPSHOT_REDIRECT)",
                source_url=self.PFZ_SOURCE_URL,
            )

        if settings.INCOIS_API_KEY and "placeholder" not in settings.INCOIS_API_BASE_URL.lower():
            try:
                return self._fetch_incois_pfz(context)
            except Exception as exc:
                logger.warning("INCOIS PFZ live fetch failed (%s).", exc)
        else:
             logger.debug("INCOIS API is unconfigured (placeholder or missing key). Skipping live fetch for PFZ.")

        # Check if an imported file exists in references for PFZ
        import_path = "data/reference/pfz_advisories.json"
        import pathlib
        if pathlib.Path(import_path).exists():
             try:
                 from backend.app.importers.pfz_importer import PfzImporter
                 importer = PfzImporter(import_path)
                 res = importer.process()
                 # Log dataset metadata registration
                 logger.info(f"Registered PFZ Dataset Metadata: {res['metadata']}")
                 return res["payload"]
             except Exception as exc:
                 logger.warning("Failed to load PFZ from file importer: %s", exc)

        # Return empty advisory set; Dev 4 will handle absence gracefully
        return PFZSourceDataPayload(
            features=[],
            bulletin_date=now_utc.isoformat(),
            valid_to=valid_to,
            source_name="INCOIS PFZ Mission (HYBRID — live unavailable)",
            source_url=self.PFZ_SOURCE_URL,
        )

    def _fetch_incois_pfz(self, context: ToolInvocationContext) -> PFZSourceDataPayload:
        """Attempt live INCOIS PFZ REST call."""
        url = f"{settings.INCOIS_API_BASE_URL}/pfz"
        headers = {"Authorization": f"Bearer {settings.INCOIS_API_KEY}"}
        raw = self._get(url, headers=headers)
        now_utc = datetime.now(UTC)
        features: list[dict[str, Any]] = raw.get("features", [])
        return PFZSourceDataPayload(
            features=features,
            bulletin_date=raw.get("bulletin_date", now_utc.isoformat()),
            valid_to=raw.get("valid_to", (now_utc + timedelta(hours=24)).isoformat()),
            source_name="INCOIS PFZ Mission",
            source_url=self.PFZ_SOURCE_URL,
        )

    # ------------------------------------------------------------------
    # SVASAdvisoryProvider
    # ------------------------------------------------------------------

    def get_svas_advisories(self, context: ToolInvocationContext) -> SVASAdvisoryPayload:
        """Fetch INCOIS Small Vessel Advisory Services (SVAS) bulletin.

        Normalizes safety index, capsizing risk, and warning statements.
        If live access is not available: marks as LIMITED or CACHED_REAL.
        """
        harbor = context.origin_harbor or "Ratnagiri"
        craft_profile = context.craft_profile or "motorized_boat"
        now_utc = datetime.now(UTC)
        valid_to = (now_utc + timedelta(hours=24)).isoformat()

        if self.data_mode == "SNAPSHOT":
            return SVASAdvisoryPayload(
                harbor=harbor,
                craft_profile=craft_profile,
                advisory_status="UNKNOWN",
                safety_index=None,
                capsizing_risk="UNKNOWN",
                warning_statement="Live SVAS advisory unavailable in snapshot.",
                issued_at=now_utc.isoformat(),
                valid_to=(now_utc - timedelta(seconds=1)).isoformat(),
                source_name="INCOIS SVAS (UNAVAILABLE — SNAPSHOT_REDIRECT)",
                source_url=self.SVAS_SOURCE_URL,
            )

        if settings.INCOIS_API_KEY and "placeholder" not in settings.INCOIS_API_BASE_URL.lower():
            try:
                return self._fetch_incois_svas(harbor, craft_profile, context)
            except Exception as exc:
                logger.warning("INCOIS SVAS live fetch failed (%s). Returning CACHED_REAL fallback.", exc)
        else:
            logger.debug("INCOIS API is unconfigured (placeholder or missing key). Skipping live fetch for SVAS.")

        # In HYBRID / LIVE without active SVAS key: return UNAVAILABLE
        return SVASAdvisoryPayload(
            harbor=harbor,
            craft_profile=craft_profile,
            advisory_status="UNKNOWN",
            safety_index=None,
            capsizing_risk="UNKNOWN",
            warning_statement="Live SVAS advisory unavailable.",
            issued_at=now_utc.isoformat(),
            valid_to=(now_utc - timedelta(seconds=1)).isoformat(),
            source_name="INCOIS SVAS (UNAVAILABLE — live unavailable)",
            source_url=self.SVAS_SOURCE_URL,
        )

    def _fetch_incois_svas(
        self, harbor: str, craft_profile: str, context: ToolInvocationContext
    ) -> SVASAdvisoryPayload:
        """Attempt live INCOIS SVAS REST call."""
        url = f"{settings.INCOIS_API_BASE_URL}/svas"
        headers = {"Authorization": f"Bearer {settings.INCOIS_API_KEY}"}
        raw = self._get(url, headers=headers, harbor=harbor, craft_profile=craft_profile)
        now_utc = datetime.now(UTC)
        return SVASAdvisoryPayload(
            harbor=harbor,
            craft_profile=craft_profile,
            advisory_status=raw.get("advisory_status", "SAFE"),
            safety_index=float(raw["safety_index"]) if raw.get("safety_index") is not None else None,
            capsizing_risk=raw.get("capsizing_risk", "LOW"),
            warning_statement=raw.get("warning_statement", "No severe maritime alerts active."),
            issued_at=raw.get("issued_at", now_utc.isoformat()),
            valid_to=raw.get("valid_to", (now_utc + timedelta(hours=24)).isoformat()),
            source_name="INCOIS SVAS",
            source_url=self.SVAS_SOURCE_URL,
        )

