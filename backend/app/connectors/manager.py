"""Connector Manager.

Owned by Dev 2 (Backend Platform).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from backend.app.agents.integrations.contracts import ToolInvocationContext
    from backend.app.agents.integrations.dev2 import (
        HazardBulletinPayload,
        MarineConditionsPayload,
        PFZSourceDataPayload,
        SVASAdvisoryPayload,
        WeatherConditionsPayload,
    )
from backend.app.connectors.errors import (
    ConnectorRateLimitError,
    ConnectorTimeoutError,
    ConnectorUpstreamUnavailableError,
)
from backend.app.connectors.modes import DataMode
from backend.app.connectors.snapshot import SnapshotConnector
from backend.app.core.config import settings

logger = logging.getLogger(__name__)


class ConnectorManager:
    """Manages connector routing based on DataMode.
    
    Implements:
    - MarineConditionsProvider
    - WeatherConditionsProvider
    - HazardBulletinsProvider
    - PFZSourceDataProvider
    - SVASAdvisoryProvider
    """

    def __init__(
        self,
        mode: DataMode | str | None,
        snapshot_connector: SnapshotConnector,
        marine_live: Any = None,
        weather_live: Any = None,
        hazard_live: Any = None,
        pfz_live: Any = None,
        svas_live: Any = None,
        sachet_live: Any = None,
    ) -> None:
        self._mode = mode
        self.snapshot = snapshot_connector
        self.marine_live = marine_live
        self.weather_live = weather_live
        self.hazard_live = hazard_live
        self.pfz_live = pfz_live
        self.svas_live = svas_live
        self.sachet_live = sachet_live

    @property
    def mode(self) -> DataMode:
        target = self._mode if self._mode is not None else settings.DATA_MODE
        if isinstance(target, DataMode):
            return target
        try:
            return DataMode(target) if target else DataMode.SNAPSHOT
        except ValueError:
            return DataMode.SNAPSHOT

    @mode.setter
    def mode(self, val: DataMode | str) -> None:
        self._mode = val

    @property
    def current_mode(self) -> DataMode:
        return self.mode

    def _track_health(self, source: str, is_online: bool, error: str = None) -> None:
        try:
            from backend.app.db.repositories import ConnectorStatusRepository
            from backend.app.db.session import SessionLocal
            with SessionLocal() as session:
                ConnectorStatusRepository(session).upsert_status(source, is_online, error)
        except Exception as exc:
            logger.debug(f"Failed to track health for {source}: {exc}")


    def _resolve_conflicts(self, payloads: list[Any]) -> Any:
        if not payloads:
            raise ValueError("No payloads to resolve")
        if len(payloads) == 1:
            return payloads[0]
            
        def get_authority_rank(p):
            src = (p.source_name or "").upper()
            if "INCOIS" in src or "IMD" in src:
                return 2
            elif "OPEN-METEO" in src or "OPENMETEO" in src:
                return 1
            return 0
            
        def get_freshness(p):
            from datetime import datetime, timezone
            try:
                obs = getattr(p, "observed_at", None) or getattr(p, "valid_from", None) or getattr(p, "valid_to", None)
                if not obs:
                    return datetime.min.replace(tzinfo=timezone.utc)
                return datetime.fromisoformat(obs.replace("Z", "+00:00")).astimezone(timezone.utc)
            except Exception:
                return datetime.min.replace(tzinfo=timezone.utc)
                
        sorted_payloads = sorted(payloads, key=lambda p: (get_authority_rank(p), get_freshness(p)), reverse=True)
        primary = sorted_payloads[0]
        
        conflicts = []
        for other in sorted_payloads[1:]:
            if hasattr(primary, "significant_wave_height_m") and hasattr(other, "significant_wave_height_m"):
                v1, v2 = primary.significant_wave_height_m, other.significant_wave_height_m
                if v1 is not None and v2 is not None and abs(v1 - v2) > 0.3:
                    conflicts.append({
                        "source": other.source_name,
                        "metric": "significant_wave_height_m",
                        "value": v2,
                        "primary_value": v1,
                        "reason": f"Preferred {primary.source_name} (Auth={get_authority_rank(primary)}) over {other.source_name} (Auth={get_authority_rank(other)})"
                    })
            if hasattr(primary, "wind_speed_knots") and hasattr(other, "wind_speed_knots"):
                v1, v2 = primary.wind_speed_knots, other.wind_speed_knots
                if v1 is not None and v2 is not None and abs(v1 - v2) > 2.0:
                    conflicts.append({
                        "source": other.source_name,
                        "metric": "wind_speed_knots",
                        "value": v2,
                        "primary_value": v1,
                        "reason": f"Preferred {primary.source_name} (Auth={get_authority_rank(primary)}) over {other.source_name} (Auth={get_authority_rank(other)})"
                    })
                    
        if hasattr(primary, "resolved_conflicts") and conflicts:
            primary.resolved_conflicts = conflicts
            
        return primary

    def _execute(
        self,
        live_provider: Any,
        snapshot_method: str,
        context: ToolInvocationContext,
    ) -> Any:
        import time
        start_time = time.perf_counter()
        mode = self.current_mode
        
        providers = live_provider if isinstance(live_provider, list) else ([live_provider] if live_provider else [])
        
        if mode == DataMode.SNAPSHOT:
            res = getattr(self.snapshot, snapshot_method)(context)
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            logger.info("Connector execution [%s] mode=SNAPSHOT duration_ms=%.2f status=SUCCESS", snapshot_method, elapsed_ms)
            return res

        if mode == DataMode.LIVE:
            if not providers:
                raise RuntimeError(f"Live provider not configured for {snapshot_method}")
            results = []
            for prov in providers:
                try:
                    res = getattr(prov, snapshot_method)(context)
                    self._track_health(snapshot_method, True)
                    results.append(res)
                except Exception as exc:
                    self._track_health(snapshot_method, False, str(exc))
                    logger.error("Connector execution [%s] mode=LIVE provider=%s error=%s", snapshot_method, prov.__class__.__name__, exc)
            if not results:
                raise RuntimeError(f"All live providers failed for {snapshot_method}")
            
            final_res = self._resolve_conflicts(results)
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            logger.info("Connector execution [%s] mode=LIVE duration_ms=%.2f status=SUCCESS", snapshot_method, elapsed_ms)
            return final_res

        if mode == DataMode.HYBRID:
            if not providers:
                logger.warning("No live provider for %s, falling back to snapshot.", snapshot_method)
                payload = getattr(self.snapshot, snapshot_method)(context)
                payload.source_name += " [HYBRID Fallback - Missing Provider]"
                elapsed_ms = (time.perf_counter() - start_time) * 1000
                logger.info("Connector execution [%s] mode=HYBRID_FALLBACK duration_ms=%.2f status=SUCCESS", snapshot_method, elapsed_ms)
                return payload

            results = []
            for prov in providers:
                try:
                    res = getattr(prov, snapshot_method)(context)
                    self._track_health(snapshot_method, True)
                    results.append(res)
                except (ConnectorTimeoutError, ConnectorUpstreamUnavailableError, ConnectorRateLimitError) as exc:
                    self._track_health(snapshot_method, False, str(exc))
                    logger.warning("Transient error %s on live provider %s for %s", exc, prov.__class__.__name__, snapshot_method)
                except Exception as exc:
                    self._track_health(snapshot_method, False, str(exc))
                    logger.error("Connector execution error on %s: %s", prov.__class__.__name__, exc)
            
            if results:
                final_res = self._resolve_conflicts(results)
                elapsed_ms = (time.perf_counter() - start_time) * 1000
                logger.info("Connector execution [%s] mode=HYBRID_LIVE duration_ms=%.2f status=SUCCESS", snapshot_method, elapsed_ms)
                return final_res
                
            # Fallback
            payload = getattr(self.snapshot, snapshot_method)(context)
            payload.source_name += " [HYBRID Fallback - Transient Error]"
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            logger.info("Connector execution [%s] mode=HYBRID_FALLBACK duration_ms=%.2f status=DEGRADED", snapshot_method, elapsed_ms)
            return payload

        raise ValueError(f"Unknown DataMode: {self.mode}")

    def get_marine_conditions(self, context: ToolInvocationContext) -> MarineConditionsPayload:
        return self._execute(self.marine_live, "get_marine_conditions", context)

    def get_weather_conditions(self, context: ToolInvocationContext) -> WeatherConditionsPayload:
        return self._execute(self.weather_live, "get_weather_conditions", context)

    def get_hazard_bulletin(self, context: ToolInvocationContext) -> HazardBulletinPayload:
        imd_payload = self._execute(self.hazard_live, "get_hazard_bulletin", context)
        
        # If SACHET connector is configured, query and harmonize alerts conservatively
        if self.sachet_live and hasattr(self.sachet_live, "get_hazard_bulletin"):
            try:
                sachet_payload = self.sachet_live.get_hazard_bulletin(context)
                # Respect epistemic authority & worst-case safety bounds:
                # If SACHET reports active cyclone or higher severity, elevate the bulletin
                severity_rank = {"WARNING": 4, "ALERT": 3, "WATCH": 2, "NORMAL": 1}
                imd_rank = severity_rank.get(imd_payload.severity.upper(), 1)
                sachet_rank = severity_rank.get(sachet_payload.severity.upper(), 1)

                if sachet_rank > imd_rank or (sachet_payload.cyclone_warning_active and not imd_payload.cyclone_warning_active):
                    # SACHET has more severe active warning
                    return HazardBulletinPayload(
                        harbor=imd_payload.harbor or sachet_payload.harbor,
                        cyclone_warning_active=imd_payload.cyclone_warning_active or sachet_payload.cyclone_warning_active,
                        squall_alert=imd_payload.squall_alert or sachet_payload.squall_alert,
                        bulletin_id=sachet_payload.bulletin_id or imd_payload.bulletin_id,
                        severity=sachet_payload.severity if sachet_rank >= imd_rank else imd_payload.severity,
                        headline=f"[SACHET/CAP] {sachet_payload.headline}" if sachet_payload.headline else imd_payload.headline,
                        valid_from=sachet_payload.valid_from or imd_payload.valid_from,
                        valid_to=sachet_payload.valid_to or imd_payload.valid_to,
                        source_name=f"{imd_payload.source_name} + {sachet_payload.source_name}",
                        source_url=sachet_payload.source_url or imd_payload.source_url,
                    )
            except Exception as exc:
                logger.warning("SACHET query during hazard bulletin harmonization failed: %s", exc)

        return imd_payload

    def get_pfz_raw_advisories(self, context: ToolInvocationContext) -> PFZSourceDataPayload:
        return self._execute(self.pfz_live, "get_pfz_raw_advisories", context)

    def get_svas_advisories(self, context: ToolInvocationContext) -> SVASAdvisoryPayload:
        return self._execute(self.svas_live, "get_svas_advisories", context)

