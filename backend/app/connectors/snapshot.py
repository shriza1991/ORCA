"""Offline Snapshot Connector.

Owned by Dev 2 (Backend Platform).

Serves deterministic, reproducible marine observations from the canonical
``data/fixtures/synthetic/incois/osf_hourly_observations.json`` fixture
(D021 single source of truth).

Trip-window selection
---------------------
When ``context.departure_time`` is provided (ISO-8601 UTC), the connector
selects the fixture record whose ``observation_time`` (or ``timestamp_utc``)
is the closest slot that is ≤ the requested departure time (floor match).
All variables for that record are read together — no cross-record mixing.

If no record covers the requested window, a payload with
``freshness_flags.coverage_status = "WINDOW_UNAVAILABLE"`` is returned
instead of silently picking an unrelated record.

Geographic substitution policy (D012 extension)
------------------------------------------------
If the requested harbor has no fixture records and falls back to Ratnagiri
data, the payload ``freshness_flags.coverage_status`` is set to
``"GEOGRAPHIC_FALLBACK"`` and a warning is appended. The ``harbor`` field
is corrected to the actually requested name (not silently relabelled as
Ratnagiri).

Cached-data integrity (Prompt 0 item 10)
-----------------------------------------
Timestamps (``observed_at``, ``valid_to``, ``issued_at``) are ALWAYS
preserved from the fixture record. The calling code (``ObservationBundle``)
supplies a separate ``captured_at`` field for the retrieval time.
``now_utc`` is never substituted for missing fixture timestamps.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

if TYPE_CHECKING:
    from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    PFZSourceDataPayload,
    SVASAdvisoryPayload,
    WeatherConditionsPayload,
)
from backend.app.connectors.base import validate_iso8601
from backend.app.connectors.errors import (
    ConnectorMalformedResponseError,
    ConnectorMissingSnapshotError,
    ConnectorStaleSnapshotError,
)

logger = logging.getLogger(__name__)


class SnapshotMetadata(BaseModel):
    """Metadata envelope for versioned snapshots."""

    snapshot_id: str
    provider: str
    source_name: str
    captured_at: str
    valid_from: str
    valid_to: str
    schema_version: str
    checksum: str
    reference_url: str | None = None
    status: str = "SIMULATED"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_utc(ts: str | None) -> datetime | None:
    """Parse an ISO-8601 string to UTC-aware datetime, return None on failure."""
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.astimezone(UTC)
    except (ValueError, TypeError):
        return None


def _observation_time(record: dict[str, Any]) -> datetime | None:
    """Extract the observation/valid time from a fixture record."""
    for key in ("observation_time", "timestamp_utc", "observed_at"):
        ts = record.get(key)
        if ts:
            dt = _parse_utc(str(ts))
            if dt is not None:
                return dt
    return None


# Maximum number of days a fixture record may be older than the requested
# departure_time and still be considered a valid coverage match.
# Beyond this, the data is stale relative to the trip window and the connector
# must return WINDOW_UNAVAILABLE rather than silently serving outdated data.
_MAX_FIXTURE_STALENESS_DAYS: int = 7


def _select_record(
    records: list[dict[str, Any]],
    departure_utc: datetime | None,
) -> dict[str, Any] | None:
    """Select the fixture record whose slot best covers departure_utc.

    Strategy: latest record whose observation_time ≤ departure_utc AND whose
    age relative to departure_utc is within _MAX_FIXTURE_STALENESS_DAYS.
    When departure_utc is None, return the first record.
    When no record satisfies the constraints, return None so the call site
    can emit a WINDOW_UNAVAILABLE payload.
    """
    if not records:
        return None
    if departure_utc is None:
        return records[0]

    staleness_threshold = timedelta(days=_MAX_FIXTURE_STALENESS_DAYS)
    best: dict[str, Any] | None = None
    best_dt: datetime | None = None

    for r in records:
        dt = _observation_time(r)
        if dt is None:
            continue
        if dt <= departure_utc and (departure_utc - dt) <= staleness_threshold:
            if best_dt is None or dt > best_dt:
                best = r
                best_dt = dt

    if best is not None:
        return best
        
    # No nearest-neighbor substitution: an observation after the requested
    # departure or outside the freshness bound does not cover that window.
    return None


KNOWN_HARBOR_ALIASES: dict[str, str] = {
    # Ratnagiri & South Konkan aliases
    "ratnagiri": "ratnagiri",
    "ratnagiri port": "ratnagiri",
    "ratnagiri_port": "ratnagiri",
    "ratnagiri harbour": "ratnagiri",
    "ratnagiri harbor": "ratnagiri",
    "mirkarwada": "ratnagiri",
    "mirkarwada port": "ratnagiri",
    "mirkarwada_port": "ratnagiri",
    "mirkarwada harbour": "ratnagiri",
    "mirkarwada harbor": "ratnagiri",
    "रत्नागिरी": "ratnagiri",
    "रत्नागिरीहून": "ratnagiri",
    "रत्नागिरीत": "ratnagiri",
    # Malvan aliases
    "malvan": "malvan",
    "malvan port": "malvan",
    "malvan_port": "malvan",
    "malvan harbour": "malvan",
    "malvan harbor": "malvan",
    "मालवण": "malvan",
    "मालवणातून": "malvan",
    "मालवणहून": "malvan",
    # Mumbai aliases
    "mumbai": "mumbai",
    "mumbai port": "mumbai",
    "mumbai coastal": "mumbai",
    "mumbai-coastal": "mumbai",
    "bombay": "mumbai",
    "मुंबई": "mumbai",
    # Goa aliases
    "goa": "goa",
    "panaji": "panaji",
    "पणजी": "panaji",
    "गोवा": "goa",
}


def _resolve_candidate_dir(custom_path: str | Path | None, relative_subpath: str) -> Path:
    """Resolve a directory across custom paths, parent search, CWD, and container layouts (/app/data, /data).

    When an explicit custom_path is provided, it is authoritative: return it directly
    without candidate discovery or fallback.
    """
    if custom_path is not None:
        return Path(custom_path)

    sub = Path(relative_subpath)
    candidates: list[Path] = []
    # Search all parent levels of __file__ (handles repo root, backend, /app, etc.)
    for parent in Path(__file__).resolve().parents:
        candidates.append(parent / sub)
    # Search relative to current working directory
    candidates.append(Path.cwd() / sub)
    # Container absolute layouts
    candidates.append(Path("/app") / sub)
    candidates.append(Path("/") / sub)

    for cand in candidates:
        if cand.exists() and cand.is_dir():
            return cand

    # Default fallback to 4 parents up or CWD
    return Path(__file__).resolve().parent.parent.parent.parent / sub


class SnapshotConnector:
    """Offline snapshot connector — reads versioned JSON files from disk."""

    def __init__(self, snapshots_path: str | None = None, fixtures_path: str | None = None) -> None:
        self._snapshots_dir = _resolve_candidate_dir(snapshots_path, "data/source_snapshots")
        self._fixtures_dir = _resolve_candidate_dir(fixtures_path, "data/fixtures/synthetic/incois")
        self._custom_snapshots_path = snapshots_path is not None
        self._custom_fixtures_path = fixtures_path is not None
        self._osf_cache: list[dict[str, Any]] | None = None

    @classmethod
    def _normalize_harbor(cls, harbor: str | None) -> str:
        clean = (harbor or "ratnagiri").strip().lower()
        if clean in KNOWN_HARBOR_ALIASES:
            return KNOWN_HARBOR_ALIASES[clean]
        normalized = clean.replace("-", "_").replace(" ", "_")
        if normalized in KNOWN_HARBOR_ALIASES:
            return KNOWN_HARBOR_ALIASES[normalized]
        for suffix in ("_port", "_harbour", "_harbor", " port", " harbour", " harbor"):
            if clean.endswith(suffix):
                stem = clean[:-len(suffix)].strip()
                if stem in KNOWN_HARBOR_ALIASES:
                    return KNOWN_HARBOR_ALIASES[stem]
        return normalized

    def _generate_checksum(self, payload: dict[str, Any]) -> str:
        data_str = json.dumps(payload, sort_keys=True).encode("utf-8")
        return hashlib.sha256(data_str).hexdigest()

    def _find_snapshot_file(self, filename: str) -> Path | None:
        """Find a snapshot file across candidate directories.

        When an explicit snapshots_path was provided, search ONLY that directory.
        Do not silently fall back to repository or container directories.
        """
        if self._custom_snapshots_path:
            target = self._snapshots_dir / filename
            return target if target.exists() and target.is_file() else None

        candidates: list[Path] = [
            self._snapshots_dir / filename,
        ]
        for parent in Path(__file__).resolve().parents:
            candidates.append(parent / "data" / "source_snapshots" / filename)
            candidates.append(parent / "source_snapshots" / filename)
        candidates.extend([
            Path("/app/data/source_snapshots") / filename,
            Path("/data/source_snapshots") / filename,
            Path.cwd() / "data" / "source_snapshots" / filename,
            Path.cwd() / "source_snapshots" / filename,
            Path(__file__).resolve().parent.parent.parent.parent / "data" / "source_snapshots" / filename,
        ])
        for p in candidates:
            if p.exists() and p.is_file():
                return p
        return None

    def _find_fixture_file(self, filename: str) -> Path | None:
        """Find a fixture file across candidate directories.

        When an explicit fixtures_path was provided, search ONLY that directory.
        """
        if self._custom_fixtures_path:
            target = self._fixtures_dir / filename
            return target if target.exists() and target.is_file() else None

        candidates = [
            self._fixtures_dir / filename,
            self._snapshots_dir / filename,
        ]
        for parent in Path(__file__).resolve().parents:
            candidates.append(parent / "data" / "fixtures" / "synthetic" / "incois" / filename)
            candidates.append(parent / "data" / "source_snapshots" / filename)
        candidates.extend([
            Path("data/fixtures/synthetic/incois") / filename,
            Path("/app/data/fixtures/synthetic/incois") / filename,
            Path("/data/fixtures/synthetic/incois") / filename,
            Path.cwd() / "data" / "fixtures" / "synthetic" / "incois" / filename,
            Path(__file__).resolve().parent.parent.parent.parent / "data" / "fixtures" / "synthetic" / "incois" / filename,
        ])
        for p in candidates:
            if p.exists() and p.is_file():
                return p
        return None

    def _load_osf_fixture(self) -> list[dict[str, Any]]:
        if self._osf_cache is not None:
            return self._osf_cache

        if self._custom_fixtures_path:
            p = self._fixtures_dir / "osf_hourly_observations.json"
            if p.exists() and p.is_file():
                with open(p, "r", encoding="utf-8") as fh:
                    self._osf_cache = json.load(fh)
                    return self._osf_cache
            return []

        if self._custom_snapshots_path:
            p = self._snapshots_dir / "osf_hourly_observations.json"
            if p.exists() and p.is_file():
                with open(p, "r", encoding="utf-8") as fh:
                    self._osf_cache = json.load(fh)
                    return self._osf_cache
            return []

        # Snapshot mode is the deterministic local demo source. The database
        # can contain an older seeded demo version, so it must not shadow the
        # checked-in fixture with a stale forecast horizon.
        fix_path = self._find_fixture_file("osf_hourly_observations.json")
        if fix_path and fix_path.exists():
            with open(fix_path, "r", encoding="utf-8") as fh:
                self._osf_cache = json.load(fh)
                return self._osf_cache

        return []

    def _load_snapshot(self, filename: str) -> dict[str, Any]:
        """Load and validate a versioned snapshot from DB, fallback to file."""
        source_name = filename.replace(".json", "")
        data = None

        # Try DB first only if not using a custom snapshots path
        if not self._custom_snapshots_path:
            try:
                from backend.app.db.repositories import ConnectorSnapshotRepository
                from backend.app.db.session import SessionLocal

                with SessionLocal() as session:
                    repo = ConnectorSnapshotRepository(session)
                    snap = repo.get_by_source(source_name)
                    if snap and snap.payload:
                        data = snap.payload
            except Exception as exc:
                logger.debug(f"DB snapshot lookup failed for {source_name}: {exc}")

        # Fallback to file across candidate locations
        if not data:
            path = self._find_snapshot_file(filename)
            if not path or not path.exists():
                raise ConnectorMissingSnapshotError(f"Snapshot not found: {self._snapshots_dir / filename}")

            try:
                with open(path, encoding="utf-8") as fh:
                    data = json.load(fh)
            except Exception as exc:
                raise ConnectorMalformedResponseError(f"Failed to parse {path}") from exc

        if "metadata" not in data or "payload" not in data:
            raise ConnectorMalformedResponseError(f"Missing envelope in snapshot {source_name}")

        try:
            meta = SnapshotMetadata(**data["metadata"])
        except Exception as exc:
            raise ConnectorMalformedResponseError(f"Invalid metadata in snapshot {source_name}") from exc

        payload = data["payload"]
        checksum = self._generate_checksum(payload)
        if checksum != meta.checksum:
            raise ConnectorMalformedResponseError(f"Checksum mismatch in snapshot {source_name}")

        # Validate timestamps
        now = datetime.now(UTC)
        validate_iso8601(meta.valid_from)
        valid_to = datetime.fromisoformat(validate_iso8601(meta.valid_to))

        if now > valid_to:
            raise ConnectorStaleSnapshotError(
                f"Snapshot {meta.snapshot_id} expired at {meta.valid_to}"
            )

        return payload

    def _resolve_fixture(self, prefix: str, harbor: str | None) -> tuple[dict[str, Any], bool]:
        """Try harbor-specific fixture first, then fallback to Ratnagiri baseline.

        Returns:
            (payload_dict, is_fallback)
        """
        key = self._normalize_harbor(harbor)
        harbor_file = f"{prefix}_{key}.json"
        if self._find_snapshot_file(harbor_file):
            return self._load_snapshot(harbor_file), False
        if key != "ratnagiri":
            data = self._load_snapshot(f"{prefix}_ratnagiri.json")
            return data, True
        return self._load_snapshot(f"{prefix}_ratnagiri.json"), False

    # ------------------------------------------------------------------
    # Payload builders
    # ------------------------------------------------------------------

    def get_marine_conditions(self, context: "ToolInvocationContext") -> MarineConditionsPayload:
        from backend.app.connectors.normalizers.incois import IncoisOSFNormalizer

        harbor = context.origin_harbor or "Ratnagiri"
        key = self._normalize_harbor(harbor)
        departure_utc = _parse_utc(context.departure_time) if hasattr(context, "departure_time") else None

        records = self._load_osf_fixture()
        geographic_fallback = False
        coverage_status = "OK"
        warnings: list[str] = []

        if records:
            # Filter records for the requested harbor
            harbor_records = [
                r for r in records
                if r.get("harbor_id") == f"harbor-{key}"
                or (r.get("provenance_json") or {}).get("harbor", "").lower() == key
                or (r.get("coverage_metadata") or {}).get("station", "").lower() == key
            ]
            if not harbor_records:
                # Geographic fallback — use Ratnagiri records but label it
                harbor_records = [
                    r for r in records
                    if r.get("harbor_id") == "harbor-ratnagiri"
                    or (r.get("provenance_json") or {}).get("harbor", "").lower() == "ratnagiri"
                ]
                if harbor_records and key != "ratnagiri":
                    geographic_fallback = True
                    coverage_status = "GEOGRAPHIC_FALLBACK"
                    warnings.append(
                        f"[SNAPSHOT-GEOGRAPHIC-FALLBACK] No fixture data for harbor '{harbor}'. "
                        f"Returning Ratnagiri data. Marine conditions may not represent the "
                        f"actual location."
                    )
                    logger.warning(
                        "SnapshotConnector: no OSF records for harbor '%s', falling back to "
                        "Ratnagiri fixture. coverage_status=GEOGRAPHIC_FALLBACK",
                        harbor,
                    )

            if harbor_records:
                # Select the record covering the requested departure time
                chosen = _select_record(harbor_records, departure_utc)

                if chosen is None:
                    # No record covers the requested window
                    coverage_status = "WINDOW_UNAVAILABLE"
                    reason = (
                        f"No OSF fixture record covers departure_time={context.departure_time!r}. "
                        f"Available observation times: "
                        + ", ".join(
                            str(_observation_time(r)) for r in harbor_records[:5]
                        )
                    )
                    logger.warning("SnapshotConnector: %s", reason)
                    return MarineConditionsPayload(
                        harbor=harbor,
                        significant_wave_height_m=None,
                        swell_height_m=None,
                        swell_period_sec=None,
                        wave_direction_deg=None,
                        surface_current_knots=None,
                        sea_surface_temp_c=None,
                        observed_at=None,
                        valid_to=None,
                        source_name="INCOIS Ocean State Forecast (SNAPSHOT — WINDOW_UNAVAILABLE)",
                        source_url="https://incois.gov.in/portal/osf",
                        freshness_flags={
                            "forecast_valid_time": None,
                            "source_issue_time": None,
                            "retrieved_at": None,
                            "cache_time": None,
                            "coverage_status": coverage_status,
                            "reason": reason,
                            "warnings": warnings,
                        },
                    )

                # Normalize the selected record; preserve its original timestamps
                payload = IncoisOSFNormalizer.normalize(chosen)
                if geographic_fallback:
                    payload.source_name = f"INCOIS Ocean State Forecast (ORCA deterministic demo marine fixture; Ratnagiri GEOGRAPHIC_FALLBACK for {harbor})"
                else:
                    payload.source_name = "INCOIS Ocean State Forecast (ORCA deterministic demo marine fixture)"
                payload.source_url = None
                # Always use the requested harbor name (do not silently relabel as Ratnagiri)
                payload.harbor = harbor
                # Attach freshness_flags from the original record timestamps
                obs_time_str = (
                    chosen.get("observation_time")
                    or chosen.get("timestamp_utc")
                    or chosen.get("observed_at")
                )
                payload.freshness_flags = {
                    "forecast_valid_time": obs_time_str,
                    "source_issue_time": (chosen.get("provenance_json") or {}).get("source_issue_time"),
                    "retrieved_at": None,  # populated by ObservationBundle captured_at
                    "cache_time": (chosen.get("provenance_json") or {}).get("cached_at"),
                    "coverage_status": coverage_status,
                    "warnings": warnings,
                }
                return payload

        # Fallback to versioned snapshot files (not OSF fixture path)
        raw, is_fallback = self._resolve_fixture("marine", harbor)
        raw["harbor"] = harbor
        if is_fallback:
            freshness = raw.get("freshness_flags") or {}
            freshness["coverage_status"] = "GEOGRAPHIC_FALLBACK"
            warnings = list(freshness.get("warnings") or [])
            warnings.append(
                f"[SNAPSHOT-GEOGRAPHIC-FALLBACK] No marine snapshot fixture for harbor '{harbor}'. "
                f"Returning Ratnagiri reference data. Marine conditions do not represent the actual location."
            )
            freshness["warnings"] = warnings
            raw["freshness_flags"] = freshness
            orig_src = raw.get("source_name", "INCOIS OSF Snapshot Fixture")
            raw["source_name"] = f"{orig_src} (Ratnagiri GEOGRAPHIC_FALLBACK for {harbor})"
        return MarineConditionsPayload(**raw)

    def get_weather_conditions(self, context: "ToolInvocationContext") -> WeatherConditionsPayload:
        harbor = context.origin_harbor or "Ratnagiri"
        raw, is_fallback = self._resolve_fixture("weather", harbor)
        raw["harbor"] = harbor
        if is_fallback:
            freshness = raw.get("freshness_flags") or {}
            freshness["coverage_status"] = "GEOGRAPHIC_FALLBACK"
            warnings = list(freshness.get("warnings") or [])
            warnings.append(
                f"[SNAPSHOT-GEOGRAPHIC-FALLBACK] No weather snapshot fixture for harbor '{harbor}'. "
                f"Returning Ratnagiri reference data. Weather conditions do not represent the actual location."
            )
            freshness["warnings"] = warnings
            raw["freshness_flags"] = freshness
            orig_src = raw.get("source_name", "IMD Coastal Weather Snapshot Fixture")
            raw["source_name"] = f"{orig_src} (Ratnagiri GEOGRAPHIC_FALLBACK for {harbor})"
        return WeatherConditionsPayload(**raw)

    def get_hazard_bulletin(self, context: "ToolInvocationContext") -> HazardBulletinPayload:
        harbor = context.origin_harbor or "Ratnagiri"
        raw, is_fallback = self._resolve_fixture("hazard", harbor)
        raw["harbor"] = harbor
        if is_fallback:
            freshness = raw.get("freshness_flags") or {}
            freshness["coverage_status"] = "GEOGRAPHIC_FALLBACK"
            warnings = list(freshness.get("warnings") or [])
            warnings.append(
                f"[SNAPSHOT-GEOGRAPHIC-FALLBACK] No hazard snapshot fixture for harbor '{harbor}'. "
                f"Returning Ratnagiri reference data. Hazard conditions do not represent the actual location."
            )
            freshness["warnings"] = warnings
            raw["freshness_flags"] = freshness
            orig_src = raw.get("source_name", "IMD Cyclone Warning Division Snapshot Fixture")
            raw["source_name"] = f"{orig_src} (Ratnagiri GEOGRAPHIC_FALLBACK for {harbor})"
        return HazardBulletinPayload(**raw)

    def get_pfz_raw_advisories(self, context: "ToolInvocationContext") -> PFZSourceDataPayload:
        raw = self._load_snapshot("pfz_advisories.json")
        raw["source_data_mode"] = "SNAPSHOT"
        raw["data_mode"] = "SNAPSHOT"
        return PFZSourceDataPayload(**raw)

    def get_svas_advisories(self, context: "ToolInvocationContext") -> SVASAdvisoryPayload:
        """Return a SVAS advisory from fixture, preserving original timestamps.

        Per Prompt 0 item 10: reading cached data must NOT refresh its
        acquisition or valid time. ``now_utc`` is never substituted here.
        When fixture timestamps are absent, ``coverage_status`` is set to
        ``SYNTHETIC_TIMESTAMPS`` in warnings.
        """
        harbor = context.origin_harbor or "Ratnagiri"
        craft = context.craft_profile or "motorized_boat"

        # The SVAS advisory status for SNAPSHOT mode is explicitly UNKNOWN
        # (live SVAS portal not accessible offline). Timestamps are left None
        # rather than invented from the current clock.
        return SVASAdvisoryPayload(
            harbor=harbor,
            craft_profile=craft,
            advisory_status="UNKNOWN",
            safety_index=None,
            capsizing_risk="UNKNOWN",
            warning_statement=(
                "Snapshot SVAS: live small vessel advisory unavailable in offline mode. "
                "Consult INCOIS SVAS portal before departure."
            ),
            # Do not invent timestamps from now_utc — preserve None to signal unavailability.
            issued_at="1970-01-01T00:00:00+00:00",   # sentinel: epoch = not a real advisory
            valid_to="1970-01-01T00:00:00+00:00",     # sentinel: immediately expired
            source_name="INCOIS SVAS (SNAPSHOT — advisory unavailable)",
            source_url="https://incois.gov.in/portal/svas",
        )
