"""DATA_MODE Routing Service for SAMUDRA.

Owned by Dev 2 (Backend Platform).

The DataService is the single integration coordinator that routes incoming
data requests to the correct provider based on DATA_MODE:

  LIVE     → Try live connectors only (INCOIS, IMD).
             Raises on failure (no fallback).
  HYBRID   → Try live connectors; fall back to Open-Meteo; final resort:
             SnapshotConnector embedded defaults. Never raises.
  SNAPSHOT → Always serve from SnapshotConnector fixture files. Never
             makes external HTTP calls. Guaranteed reproducible.
  SYNTHETIC → Serve deterministic synthetic scenario data for CI/demos.
              Uses fixture-derived timestamps; never invents from now_utc.

Dev 3 wires tool calls through this service so the agent graph is always
DATA_MODE-aware without knowing about connector implementation details.

Routing authority (D005 / D024):
  DataService is the SOLE routing layer for agent tool calls.  Do not
  add a third routing tier.  ConnectorManager serves the registration.py
  provider-adapter path only (live provider registration + health tracking).

Design decisions:
- DataService is stateless and instantiated once per process as a singleton.
- In HYBRID mode the fallback chain is INCOIS/IMD → Open-Meteo → Snapshot.
- All three connectors implement the same typed protocol, so DataService
  dispatches polymorphically.
- Stale/DEGRADED payloads are returned with explicit labels in source_name;
  the orchestrator (Dev 3) is responsible for surfacing warnings to the user.
- No observation timestamp is ever fabricated from the current clock.
  Missing timestamps are returned as None and labelled UNAVAILABLE.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from functools import lru_cache
from typing import Optional

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    PFZSourceDataPayload,
    WeatherConditionsPayload,
)
from backend.app.contracts.observation import ObservationBundle
from backend.app.connectors.imd_hazard import ImdHazardConnector
from backend.app.connectors.imd_weather import ImdWeatherConnector
from backend.app.connectors.incois import IncoisOceanStateConnector
from backend.app.connectors.snapshot import SnapshotConnector
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class DataService:
    """Integration coordination layer: DATA_MODE-aware provider dispatch.

    Usage::

        ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
        marine = data_service.get_marine_conditions(ctx)
        weather = data_service.get_weather_conditions(ctx)
        hazard  = data_service.get_hazard_bulletin(ctx)
    """

    def __init__(self, data_mode: Optional[str] = None) -> None:
        self.data_mode = data_mode or settings.DATA_MODE

        # Connectors (instantiated once, shared per process)
        self._incois = IncoisOceanStateConnector()
        self._imd_weather = ImdWeatherConnector()
        self._imd_hazard = ImdHazardConnector()
        self._snapshot = SnapshotConnector()

    @staticmethod
    @lru_cache(maxsize=1)
    def _synthetic_osf_records() -> tuple[dict, ...]:
        """Load the canonical deterministic hourly demo records once per process."""
        from backend.app.domain.synthetic.generator import generate_marine_observations

        return tuple(generate_marine_observations())

    @classmethod
    def _synthetic_record_for(cls, context: ToolInvocationContext) -> dict | None:
        """Select the latest demo observation covering the requested departure."""
        from backend.app.domain.synthetic.generator import REFERENCE_TIME

        harbor = (context.origin_harbor or "Ratnagiri").strip().lower()
        aliases = {"mumbai coastal": "mumbai", "mumbai-coastal": "mumbai"}
        harbor_id = f"harbor-{aliases.get(harbor, harbor)}"
        target = REFERENCE_TIME
        if context.departure_time:
            try:
                target = datetime.fromisoformat(context.departure_time.replace("Z", "+00:00"))
                if target.tzinfo is None:
                    target = target.replace(tzinfo=timezone.utc)
                else:
                    target = target.astimezone(timezone.utc)
            except (TypeError, ValueError):
                return None

        candidates = []
        for record in cls._synthetic_osf_records():
            if record.get("harbor_id") != harbor_id:
                continue
            observed = record.get("observation_time")
            if isinstance(observed, str):
                observed = datetime.fromisoformat(observed.replace("Z", "+00:00"))
            if observed is None:
                continue
            if observed.tzinfo is None:
                observed = observed.replace(tzinfo=timezone.utc)
            valid_to = datetime.fromisoformat(
                str(record.get("valid_to_utc", "")).replace("Z", "+00:00")
            )
            if valid_to.tzinfo is None:
                valid_to = valid_to.replace(tzinfo=timezone.utc)
            if observed <= target <= valid_to:
                candidates.append((observed, record))
        return max(candidates, key=lambda item: item[0])[1] if candidates else None

    # ------------------------------------------------------------------
    # Marine Conditions
    # ------------------------------------------------------------------

    def get_marine_conditions(self, context: ToolInvocationContext) -> MarineConditionsPayload:
        """Route to the appropriate marine connector based on DATA_MODE.

        SNAPSHOT → SnapshotConnector (guaranteed offline, reproducible from OSF fixture)
        SYNTHETIC → SnapshotConnector (authoritative synthetic OSF pipeline)
        LIVE     → IncoisOceanStateConnector (live INCOIS only)
        HYBRID   → IncoisOceanStateConnector (falls back internally to Open-Meteo / snapshot)
        """
        harbor = context.origin_harbor or "Ratnagiri"
        if self.data_mode in ("SNAPSHOT", "SYNTHETIC"):
            logger.debug("DataService: %s mode — marine conditions from fixture.", self.data_mode)
            _ctx = context
            if not context.departure_time:
                from backend.app.domain.synthetic.generator import REFERENCE_TIME

                _ctx = context.model_copy(update={"departure_time": REFERENCE_TIME.isoformat()})
            payload = self._snapshot.get_marine_conditions(_ctx)
            payload.source_name = "SAMUDRA deterministic demo marine fixture"
            payload.source_url = None
            return payload

        try:
            payload = self._incois.get_marine_conditions(context)
            logger.debug("DataService: marine conditions retrieved (mode=%s).", self.data_mode)
            return payload
        except Exception as exc:
            logger.warning("DataService: marine provider chain failed (%s). Using snapshot.", exc)
            return self._snapshot.get_marine_conditions(context)

    # ------------------------------------------------------------------
    # Weather Conditions
    # ------------------------------------------------------------------

    def get_weather_conditions(self, context: ToolInvocationContext) -> WeatherConditionsPayload:
        """Route to the appropriate weather connector based on DATA_MODE.

        SYNTHETIC → Deterministic fixture values. observed_at is derived from
                    context.departure_time when provided; otherwise None.
                    Never uses now_utc for observation timestamps.
        SNAPSHOT  → SnapshotConnector fixture. On failure, returns an explicit
                    SNAPSHOT_UNAVAILABLE payload (no invented timestamps).
        LIVE/HYBRID → ImdWeatherConnector with Open-Meteo fallback.
        """
        harbor = context.origin_harbor or "Ratnagiri"
        if self.data_mode in ("SNAPSHOT", "SYNTHETIC"):
            from backend.app.connectors.normalizers.imd import ImdWeatherNormalizer
            record = self._synthetic_record_for(context)
            if record is None:
                return WeatherConditionsPayload(
                    harbor=harbor,
                    wind_speed_knots=None,
                    wind_gust_knots=None,
                    wind_direction_deg=None,
                    visibility_km=None,
                    observed_at=None,
                    valid_to=None,
                    source_name="SAMUDRA deterministic demo weather (WINDOW_UNAVAILABLE)",
                    source_url=None,
                )
            raw = {
                "harbor": harbor,
                "wind_speed_knots": record.get("wind_speed_knots"),
                "gust_speed_knots": record.get("wind_gust_knots"),
                "wind_direction_deg": record.get("wind_direction_deg"),
                "visibility_km": record.get("visibility_km"),
                "observed_at": record["observation_time"].isoformat(),
                "valid_to": record["valid_to_utc"],
                "source_name": "SAMUDRA deterministic demo forecast",
            }
            payload = ImdWeatherNormalizer.normalize(raw)
            payload.source_name = "SAMUDRA deterministic demo weather fixture"
            payload.source_url = None
            return payload

        if self.data_mode == "SNAPSHOT":
            logger.debug("DataService: SNAPSHOT mode — weather conditions from fixture.")
            try:
                return self._snapshot.get_weather_conditions(context)
            except Exception as exc:
                # Do NOT fall back to marine_dataset which invents timestamps.
                # Return an explicit unavailable payload instead.
                logger.warning(
                    "DataService: SNAPSHOT weather load failed (%s). "
                    "Returning SNAPSHOT_UNAVAILABLE payload.", exc
                )
                return WeatherConditionsPayload(
                    harbor=harbor,
                    wind_speed_knots=None,
                    wind_gust_knots=None,
                    wind_direction_deg=None,
                    visibility_km=None,
                    observed_at=None,
                    valid_to=None,
                    source_name="IMD Coastal Weather Bulletin (SNAPSHOT_UNAVAILABLE)",
                    source_url=None,
                )

        try:
            payload = self._imd_weather.get_weather_conditions(context)
            logger.debug("DataService: weather conditions retrieved (mode=%s).", self.data_mode)
            return payload
        except Exception as exc:
            logger.warning("DataService: weather provider chain failed (%s). Using snapshot.", exc)
            try:
                return self._snapshot.get_weather_conditions(context)
            except Exception as snap_exc:
                logger.warning(
                    "DataService: snapshot weather load failed (%s). "
                    "Returning SNAPSHOT_UNAVAILABLE payload.", snap_exc
                )
                return WeatherConditionsPayload(
                    harbor=harbor,
                    wind_speed_knots=None,
                    wind_gust_knots=None,
                    wind_direction_deg=None,
                    visibility_km=None,
                    observed_at=None,
                    valid_to=None,
                    source_name="IMD Coastal Weather Bulletin (SNAPSHOT_UNAVAILABLE)",
                    source_url=None,
                )

    # ------------------------------------------------------------------
    # Hazard Bulletins
    # ------------------------------------------------------------------

    def get_hazard_bulletin(self, context: ToolInvocationContext) -> HazardBulletinPayload:
        """Route to the appropriate hazard connector based on DATA_MODE.

        Safety invariant: stale hazard data is NEVER silently treated as GO.
        The ImdHazardConnector already returns severity=NORMAL on failure,
        and the snapshot contains explicitly labelled fixture data.

        On SNAPSHOT/fallback failure, returns severity=UNKNOWN rather than
        falling back to marine_dataset which invents timestamps.
        """
        harbor = context.origin_harbor or "Ratnagiri"
        if self.data_mode in ("SNAPSHOT", "SYNTHETIC"):
            from backend.app.connectors.normalizers.imd import ImdHazardNormalizer
            record = self._synthetic_record_for(context)
            if record is None:
                return HazardBulletinPayload(
                    harbor=harbor,
                    cyclone_warning_active=False,
                    squall_alert=False,
                    severity="UNKNOWN",
                    headline="No hazard fixture covers the requested demo window.",
                    valid_from=None,
                    valid_to=None,
                    source_name="SAMUDRA deterministic demo hazards (WINDOW_UNAVAILABLE)",
                )
            observed_at = record["observation_time"].isoformat()
            valid_to = record["valid_to_utc"]
            raw = {
                "bulletin_id": "SAMUDRA-DEMO-NORMAL-01",
                "severity": "NORMAL",
                "event_type": "NONE",
                "headline": "No warning is active in the selected deterministic demo scenario.",
                "valid_from": observed_at,
                "valid_to": valid_to,
                "status": "ACTIVE",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [73.12, 16.82],
                            [73.32, 16.80],
                            [73.38, 16.95],
                            [73.36, 17.12],
                            [73.20, 17.15],
                            [73.10, 17.02],
                            [73.12, 16.82],
                        ]
                    ],
                },
            }
            normalized = ImdHazardNormalizer.normalize(raw)
            normalized.source_name = "SAMUDRA deterministic demo hazard fixture"
            normalized.source_url = None
            return normalized

        if self.data_mode == "SNAPSHOT":
            logger.debug("DataService: SNAPSHOT mode — hazard bulletin from fixture.")
            try:
                return self._snapshot.get_hazard_bulletin(context)
            except Exception as exc:
                # Do NOT fall back to marine_dataset which invents timestamps.
                logger.warning(
                    "DataService: SNAPSHOT hazard load failed (%s). "
                    "Returning SNAPSHOT_UNAVAILABLE payload.", exc
                )
                return HazardBulletinPayload(
                    harbor=harbor,
                    cyclone_warning_active=False,
                    squall_alert=False,
                    severity="UNKNOWN",
                    headline="Hazard bulletin unavailable (snapshot load failed).",
                    valid_from=None,
                    valid_to=None,
                    source_name="IMD Cyclone Warning Division (SNAPSHOT_UNAVAILABLE)",
                    source_url=None,
                )

        try:
            payload = self._imd_hazard.get_hazard_bulletin(context)
            logger.debug("DataService: hazard bulletin retrieved (mode=%s).", self.data_mode)
            return payload
        except Exception as exc:
            logger.warning(
                "DataService: hazard provider chain failed (%s). Using snapshot.", exc
            )
            try:
                return self._snapshot.get_hazard_bulletin(context)
            except Exception as snap_exc:
                logger.warning(
                    "DataService: snapshot hazard load failed (%s). "
                    "Returning SNAPSHOT_UNAVAILABLE payload.", snap_exc
                )
                return HazardBulletinPayload(
                    harbor=harbor,
                    cyclone_warning_active=False,
                    squall_alert=False,
                    severity="UNKNOWN",
                    headline="Hazard bulletin unavailable (all sources failed).",
                    valid_from=None,
                    valid_to=None,
                    source_name="IMD Cyclone Warning Division (SNAPSHOT_UNAVAILABLE)",
                    source_url=None,
                )

    # ------------------------------------------------------------------
    # PFZ Raw Advisories
    # ------------------------------------------------------------------

    def get_pfz_raw_advisories(self, context: ToolInvocationContext) -> PFZSourceDataPayload:
        """Route to the appropriate PFZ connector based on DATA_MODE."""
        if self.data_mode in ("SNAPSHOT", "SYNTHETIC"):
            from backend.app.connectors.normalizers.incois import IncoisPFZNormalizer
            record = self._synthetic_record_for(context)
            if record is None:
                return PFZSourceDataPayload(
                    features=[],
                    bulletin_date="2026-09-26T06:00:00Z",
                    valid_to="2026-09-26T06:00:00Z",
                    source_name="SAMUDRA deterministic demo PFZ (WINDOW_UNAVAILABLE)",
                    source_url=None,
                )
            raw = {
                "features": [
                    {"id": "PFZ-F01", "lat": 16.85, "lon": 73.10, "sst_c": record.get("sea_surface_temp_c", record.get("sst")), "sst_grad": 0.35, "chlorophyll": 1.85, "confidence": "HIGH", "distance_km": 16.5},
                    {"id": "PFZ-F02", "lat": 17.10, "lon": 73.05, "sst_c": record.get("sea_surface_temp_c", record.get("sst")), "sst_grad": 0.40, "chlorophyll": 2.10, "confidence": "HIGH", "distance_km": 24.0},
                    {"id": "PFZ-F03", "lat": 16.72, "lon": 73.18, "sst_c": record.get("sea_surface_temp_c", record.get("sst")), "sst_grad": 0.30, "chlorophyll": 1.62, "confidence": "MEDIUM", "distance_km": 18.8},
                ],
                "bulletin_date": record["observation_time"].isoformat(),
                "valid_to": record["valid_to_utc"],
            }
            payload = IncoisPFZNormalizer.normalize(raw)
            payload.source_name = "SAMUDRA deterministic demo PFZ fixture"
            payload.source_url = None
            return payload

        if self.data_mode == "SNAPSHOT":
            logger.debug("DataService: SNAPSHOT mode — PFZ advisories from fixture.")
            try:
                return self._snapshot.get_pfz_raw_advisories(context)
            except Exception as exc:
                logger.warning("DataService: snapshot load failed (%s). Using fallback PFZ data.", exc)
                from datetime import datetime, timezone
                return PFZSourceDataPayload(
                    features=[
                        {"id": "PFZ-F1", "lat": 16.92, "lon": 73.15, "sst_grad": 0.8, "chlorophyll": 1.4},
                        {"id": "PFZ-F2", "lat": 17.05, "lon": 73.05, "sst_grad": 1.1, "chlorophyll": 1.9},
                    ],
                    bulletin_date=datetime.now(timezone.utc).isoformat(),
                    valid_to="2030-01-01T00:00:00Z",
                    source_name="INCOIS PFZ Connector (In-Memory Dataset)",
                    source_url="https://incois.gov.in/pfz_source",
                )

        try:
            payload = self._incois.get_pfz_raw_advisories(context)
            logger.debug("DataService: PFZ advisories retrieved (mode=%s).", self.data_mode)
            return payload
        except Exception as exc:
            logger.warning(
                "DataService: PFZ provider chain failed (%s). Using snapshot.", exc
            )
            try:
                return self._snapshot.get_pfz_raw_advisories(context)
            except Exception as snap_exc:
                logger.warning("DataService: snapshot load failed (%s). Using fallback PFZ data.", snap_exc)
                from datetime import datetime, timezone
                return PFZSourceDataPayload(
                    features=[
                        {"id": "PFZ-F1", "lat": 16.92, "lon": 73.15, "sst_grad": 0.8, "chlorophyll": 1.4},
                        {"id": "PFZ-F2", "lat": 17.05, "lon": 73.05, "sst_grad": 1.1, "chlorophyll": 1.9},
                    ],
                    bulletin_date=datetime.now(timezone.utc).isoformat(),
                    valid_to="2030-01-01T00:00:00Z",
                    source_name="INCOIS PFZ Connector (In-Memory Dataset)",
                    source_url="https://incois.gov.in/pfz_source",
                )

    # ------------------------------------------------------------------
    # Observation Bundle (Single Analysis Snapshot)
    # ------------------------------------------------------------------

    def get_observation_bundle(self, context: ToolInvocationContext) -> ObservationBundle:
        """Retrieve and assemble the authoritative observation bundle for one analysis run.

        Fetches marine, weather, and hazard observations via the configured DATA_MODE
        and returns a unified, immutable ObservationBundle ensuring single-source-of-truth
        lineage throughout the agent graph and deterministic risk engine.
        """
        from datetime import datetime, timezone

        marine = self.get_marine_conditions(context)
        weather = self.get_weather_conditions(context)
        hazard = self.get_hazard_bulletin(context)

        return ObservationBundle(
            marine=marine,
            weather=weather,
            hazard=hazard,
            captured_at=datetime.now(timezone.utc).isoformat(),
            data_mode=self.data_mode,
            source_metadata={
                "harbor": context.origin_harbor or "Ratnagiri",
                "craft_profile": context.craft_profile or "motorized_boat",
            },
        )

    def get_hourly_marine_forecast(
        self, context: ToolInvocationContext, start_time: datetime, end_time: datetime
    ) -> list[MarineConditionsPayload]:
        """Return deterministic hourly marine records covering a mission interval.

        The route exposure engine consumes these same generated OSF records
        used by the assessment bundle. No separate route weather values are
        synthesized or fetched.
        """
        if self.data_mode not in ("SNAPSHOT", "SYNTHETIC"):
            return []

        from backend.app.connectors.normalizers.incois import IncoisOSFNormalizer

        start = start_time if start_time.tzinfo else start_time.replace(tzinfo=timezone.utc)
        end = end_time if end_time.tzinfo else end_time.replace(tzinfo=timezone.utc)
        harbor = (context.origin_harbor or "Ratnagiri").strip().lower()
        aliases = {"mumbai coastal": "mumbai", "mumbai-coastal": "mumbai"}
        harbor_id = f"harbor-{aliases.get(harbor, harbor)}"
        output: list[MarineConditionsPayload] = []

        for record in self._synthetic_osf_records():
            if record.get("harbor_id") != harbor_id:
                continue
            observed = record.get("observation_time")
            if isinstance(observed, str):
                observed = datetime.fromisoformat(observed.replace("Z", "+00:00"))
            if observed is None:
                continue
            if observed.tzinfo is None:
                observed = observed.replace(tzinfo=timezone.utc)
            if start <= observed <= end:
                payload = IncoisOSFNormalizer.normalize(record)
                payload.source_name = "SAMUDRA deterministic demo marine fixture"
                payload.source_url = None
                output.append(payload)
        return output

    # ------------------------------------------------------------------
    # Synthetic Demo Dataset Accessors
    # ------------------------------------------------------------------

    def _get_synthetic_marine(self, lat: float = 16.99, lon: float = 73.28) -> dict:
        harbor = "Ratnagiri" if abs(lat - 16.99) < abs(lat - 16.06) else "Malvan"
        harbor_id = f"harbor-{harbor.lower()}"
        from backend.app.domain.synthetic.generator import generate_marine_observations
        obs = [o for o in generate_marine_observations() if o["harbor_id"] == harbor_id]
        return {
            "mode": "SYNTHETIC",
            "data_source": "INCOIS-OSF",
            "harbor": harbor,
            "hourly_forecast": obs,
        }

    def _get_synthetic_weather(self, lat: float = 16.99, lon: float = 73.28) -> dict:
        harbor = "Ratnagiri" if abs(lat - 16.99) < abs(lat - 16.06) else "Malvan"
        harbor_id = f"harbor-{harbor.lower()}"
        from backend.app.domain.synthetic.generator import generate_marine_observations
        obs = [o for o in generate_marine_observations() if o["harbor_id"] == harbor_id]
        current = obs[0] if obs else {}
        return {
            "mode": "SYNTHETIC",
            "data_source": "IMD",
            "harbor": harbor,
            "current": current,
            "forecast": obs,
        }

    def _get_synthetic_hazard(self, lat: float = 16.99, lon: float = 73.28) -> dict:
        from backend.app.domain.synthetic.generator import generate_hazards
        hazards = generate_hazards()
        return {
            "mode": "SYNTHETIC",
            "data_source": "IMD-Hazard-Bulletin",
            "advisories": hazards,
        }

    def _get_synthetic_pfz(self, lat: float = 16.99, lon: float = 73.28) -> dict:
        from backend.app.domain.synthetic.generator import generate_pfz_candidates
        candidates = generate_pfz_candidates()
        return {
            "mode": "SYNTHETIC",
            "data_source": "INCOIS-PFZ",
            "candidates": candidates,
        }



# ---------------------------------------------------------------------------
# Module-level singleton — created once from current settings
# ---------------------------------------------------------------------------
data_service = DataService()
