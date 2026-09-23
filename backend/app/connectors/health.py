"""Health Checks for Connectors.

Owned by Dev 2 (Backend Platform).

Provides the SourceHealth model and helper utilities for explicit,
connector-driven health reporting.

SourceHealthStatus taxonomy (D011 Provider Status extension):
  - CONFIGURED   : Key present and endpoint non-placeholder; not yet fetched
  - UNAVAILABLE  : Attempted fetch but endpoint unreachable or returned 4xx/5xx
  - FAILED       : Import/parse raised an exception; data is unusable
  - STALE        : Cached data exists but older than 6 hours
  - CACHED       : Data loaded from a local file / dated snapshot; traceable
  - SUCCESS      : Live fetch succeeded and data is fresh

Static frontend profiles must NOT be classified under any of these statuses.
Only actually-executed connector fetches produce health results.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal, Optional

from pydantic import BaseModel

SourceHealthStatus = Literal[
    "CONFIGURED",
    "UNAVAILABLE",
    "FAILED",
    "STALE",
    "CACHED",
    "SUCCESS",
]

# Threshold beyond which a CACHED result is classified as STALE
_STALE_THRESHOLD_HOURS = 6


class SourceHealth(BaseModel):
    """Explicit health check result for a genuine data source.

    This must be produced by an actual connector execution — never from
    a static profile or hardcoded assumption.
    """
    source_name: str
    status: SourceHealthStatus
    details: Optional[str] = None
    last_retrieved: Optional[str] = None
    "ISO-8601 UTC timestamp of last successful retrieval."
    is_live: bool = False
    "True only when the most recent data came from a live API call."


def classify_connector_health(
    source_name: str,
    *,
    has_api_key: bool,
    is_placeholder_url: bool,
    fetch_succeeded: Optional[bool] = None,
    is_from_file: bool = False,
    file_acquisition_time_utc: Optional[str] = None,
    error_detail: Optional[str] = None,
) -> SourceHealth:
    """Derive a SourceHealth result from connector execution state.

    Parameters
    ----------
    source_name:
        Human-readable source name.
    has_api_key:
        Whether a non-empty API key is set in config.
    is_placeholder_url:
        Whether the API base URL contains the word 'placeholder'.
    fetch_succeeded:
        True = live fetch succeeded; False = live fetch failed; None = not attempted.
    is_from_file:
        Whether data was loaded from a local file import path.
    file_acquisition_time_utc:
        ISO-8601 UTC timestamp of the file's acquisition/issue time.
        Used to detect STALE state for file-imported data.
    error_detail:
        Error message if fetch failed or import raised an exception.
    """
    if fetch_succeeded is True:
        return SourceHealth(
            source_name=source_name,
            status="SUCCESS",
            details="Live data retrieved successfully.",
            last_retrieved=datetime.now(UTC).isoformat(),
            is_live=True,
        )

    if fetch_succeeded is False:
        return SourceHealth(
            source_name=source_name,
            status="UNAVAILABLE",
            details=error_detail or "Live fetch failed.",
            is_live=False,
        )

    if is_from_file:
        # Determine whether the file data is stale
        if file_acquisition_time_utc:
            try:
                acq_dt = datetime.fromisoformat(
                    file_acquisition_time_utc.replace("Z", "+00:00")
                )
                if acq_dt.tzinfo is None:
                    acq_dt = acq_dt.replace(tzinfo=UTC)
                age_hours = (datetime.now(UTC) - acq_dt).total_seconds() / 3600
                if age_hours > _STALE_THRESHOLD_HOURS:
                    return SourceHealth(
                        source_name=source_name,
                        status="STALE",
                        details=(
                            f"File-imported data is {age_hours:.1f} hours old "
                            f"(threshold: {_STALE_THRESHOLD_HOURS} h). "
                            "Downstream tools should treat this as degraded."
                        ),
                        last_retrieved=file_acquisition_time_utc,
                        is_live=False,
                    )
            except Exception:
                pass

        return SourceHealth(
            source_name=source_name,
            status="CACHED",
            details="Data loaded from local file import path. Traceable to original source.",
            last_retrieved=file_acquisition_time_utc,
            is_live=False,
        )

    if error_detail:
        return SourceHealth(
            source_name=source_name,
            status="FAILED",
            details=error_detail,
            is_live=False,
        )

    # Not yet attempted
    if has_api_key and not is_placeholder_url:
        return SourceHealth(
            source_name=source_name,
            status="CONFIGURED",
            details="API key present and endpoint non-placeholder. Not yet fetched this session.",
            is_live=False,
        )

    return SourceHealth(
        source_name=source_name,
        status="UNAVAILABLE",
        details="API key missing or endpoint is a placeholder URL. External blocker.",
        is_live=False,
    )


def get_connector_health(manager: Any) -> dict[str, Any]:
    """Returns the operational status of the ConnectorManager and its modes.

    This maintains the legacy schema for existing dashboard elements.
    For per-source granular health, use classify_connector_health() and
    DatasetRegistry.source_health_summary().
    """
    return {
        "mode": getattr(manager, "mode", getattr(manager, "data_mode", "UNKNOWN")),
        "snapshot_configured": getattr(manager, "snapshot", None) is not None,
        "marine_live_configured": getattr(
            manager, "marine_live", getattr(manager, "_incois", None)
        ) is not None,
        "weather_live_configured": getattr(
            manager, "weather_live", getattr(manager, "_imd_weather", None)
        ) is not None,
        "hazard_live_configured": getattr(
            manager, "hazard_live", getattr(manager, "_imd_hazard", None)
        ) is not None,
        "pfz_live_configured": getattr(
            manager, "pfz_live", getattr(manager, "_incois", None)
        ) is not None,
    }
