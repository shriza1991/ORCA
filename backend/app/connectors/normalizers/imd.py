"""IMD Source Normalizers.

Normalizes source-native IMD Coastal Weather Bulletins (CWB) and
Cyclone Warning Division advisories into SAMUDRA internal contracts.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    WeatherConditionsPayload,
)


class ImdWeatherNormalizer:
    """Normalizes IMD Coastal Weather Bulletin source records into WeatherConditionsPayload."""

    @staticmethod
    def normalize(source_record: Dict[str, Any]) -> WeatherConditionsPayload:
        """Converts an IMD coastal weather record to WeatherConditionsPayload.

        Handles:
        - Source variable naming (wind_speed_knots, gust_speed, direction_deg, visibility_km)
        - Missing value preservation (explicit None, not coerced to 0.0)
        - Observation timestamps and valid windows
        """
        harbor = source_record.get("harbor") or source_record.get("station_name") or "Ratnagiri"

        def clean_val(v: Any) -> Optional[float]:
            if v is None:
                return None
            try:
                fv = float(v)
                if fv == -999.0 or fv < -900.0:
                    return None
                return fv
            except (ValueError, TypeError):
                return None

        wind_speed = clean_val(source_record.get("wind_speed_knots", source_record.get("wind_speed")))
        wind_gust = clean_val(source_record.get("gust_speed_knots", source_record.get("wind_gust_knots")))
        wind_dir = clean_val(source_record.get("wind_direction_deg", source_record.get("direction_deg")))
        visibility = clean_val(source_record.get("visibility_km"))

        obs_time = source_record.get("observed_at") or source_record.get("timestamp_utc")
        if not obs_time:
            obs_time = datetime.now(timezone.utc).isoformat()

        valid_to = source_record.get("valid_to") or source_record.get("valid_to_utc")
        if not valid_to:
            try:
                dt = datetime.fromisoformat(obs_time.replace("Z", "+00:00"))
                valid_to = (dt + timedelta(hours=12)).isoformat()
            except Exception:
                valid_to = "2030-01-01T00:00:00Z"

        # Distinguish file-import from synthetic
        _bulletin_id = source_record.get("bulletin_id")
        _access_method = source_record.get("_source_documentation", {}).get("access_method")
        if _bulletin_id or _access_method == "FILE_IMPORT":
            source_label = f"IMD Coastal Weather Bulletin (FILE_IMPORT — {_bulletin_id or 'dated bulletin'})"
        else:
            source_label = "IMD Coastal Weather Bulletin (SYNTHETIC)"

        return WeatherConditionsPayload(
            harbor=harbor,
            wind_speed_knots=wind_speed,
            wind_gust_knots=wind_gust,
            wind_direction_deg=wind_dir,
            visibility_km=visibility,
            observed_at=obs_time,
            valid_to=valid_to,
            source_name=source_label,
            source_url="https://mausam.imd.gov.in",
        )


class ImdHazardNormalizer:
    """Normalizes IMD Cyclone & Severe Weather Bulletins into HazardBulletinPayload."""

    @staticmethod
    def normalize(source_bulletin: Dict[str, Any]) -> HazardBulletinPayload:
        """Converts an IMD hazard advisory to HazardBulletinPayload.

        Maps:
        - Cyclone / squall indicators
        - Bulletin IDs and headlines
        - Severity classifications (NORMAL, WATCH, ALERT, WARNING)
        """
        harbor = source_bulletin.get("harbor") or source_bulletin.get("target_harbor") or "Ratnagiri"
        event_type = source_bulletin.get("event_type", source_bulletin.get("warning_type", "SQUALL_ALERT"))
        severity = source_bulletin.get("severity", "WARNING").upper()

        cyclone_active = (
            "CYCLONE" in event_type
            or source_bulletin.get("cyclone_warning_active", False)
            or source_bulletin.get("cyclone_alert", False)
        )
        squall_active = (
            "SQUALL" in event_type
            or source_bulletin.get("squall_alert", False)
            or severity in ("WARNING", "ALERT")
        )

        valid_from = source_bulletin.get("valid_from") or source_bulletin.get("start_time")
        if isinstance(valid_from, datetime):
            valid_from = valid_from.isoformat()
        elif not valid_from:
            valid_from = datetime.now(timezone.utc).isoformat()

        valid_to = source_bulletin.get("valid_to") or source_bulletin.get("end_time")
        if isinstance(valid_to, datetime):
            valid_to = valid_to.isoformat()
        elif not valid_to:
            valid_to = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()

        # Distinguish file-import from synthetic
        _bulletin_id = source_bulletin.get("bulletin_id") or source_bulletin.get("public_id")
        _access_method = source_bulletin.get("_source_documentation", {}).get("access_method")
        if _access_method == "FILE_IMPORT":
            source_label = f"IMD Cyclone Warning Division (FILE_IMPORT — {_bulletin_id or 'dated bulletin'})"
        else:
            source_label = "IMD Cyclone Warning Division (SYNTHETIC)"

        return HazardBulletinPayload(
            harbor=harbor,
            cyclone_warning_active=bool(cyclone_active),
            squall_alert=bool(squall_active),
            bulletin_id=_bulletin_id,
            severity=severity,
            headline=source_bulletin.get("headline", f"Marine Weather Advisory - {harbor}"),
            valid_from=str(valid_from),
            valid_to=str(valid_to),
            source_name=source_label,
            source_url="https://rsmcnewdelhi.imd.gov.in",
        )
