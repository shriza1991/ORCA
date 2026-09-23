"""Dataset Metadata Registry.

Owned by Dev 2 (Backend Platform).

A lightweight in-process registry for tracking ingested marine datasets.
Registered entries are searchable by variable, geographic coverage,
time coverage, resolution, access method, and availability status.

Each connector or importer registers an entry when it successfully
ingests data. The registry exposes only usable (non-failed) datasets
to downstream consumers via ``get_available_datasets()``.

Design principles:
- Thread-safe singleton registry via module-level lock.
- Pydantic-validated metadata — no raw dicts stored.
- Clear status taxonomy (SUCCESS / CACHED / UNAVAILABLE / FAILED)
  aligned with SourceHealthStatus in health.py.
- Geographic coverage is always recorded so regional queries are possible.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, UTC
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Availability status mirrors SourceHealthStatus for downstream consumers.
DatasetAvailability = Literal[
    "SUCCESS",       # Live fetch succeeded and data is usable
    "CACHED",        # Data loaded from a local file / snapshot; traceable to source
    "UNAVAILABLE",   # Access attempted but source not reachable; no data returned
    "FAILED",        # Import/parse failed; data is unusable
]


class GeographicCoverage(BaseModel):
    """Bounding box for the dataset's spatial extent."""
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float
    description: str = ""


class DatasetMetadata(BaseModel):
    """Searchable metadata record for an ingested marine dataset.

    Every connector or importer MUST register one of these after a
    successful or partially-successful ingest. Failed ingests are
    registered with availability=FAILED so downstream tools know
    the source was attempted but unusable.
    """
    dataset_id: str
    variable: str
    "Primary variable name (e.g. 'sst', 'pfz_zones', 'marine_hazard')."
    source_name: str
    "Human-readable source name (e.g. 'INCOIS PFZ', 'GHRSST MUR L4')."
    issuing_authority: str
    source_url: Optional[str] = None

    geographic_coverage: GeographicCoverage
    time_coverage_start: Optional[str] = None
    time_coverage_end: Optional[str] = None
    resolution_description: Optional[str] = None
    "E.g. '4 km', '0.01°', 'Point observation'."

    access_method: Literal["LIVE_API", "FILE_IMPORT", "SNAPSHOT", "OPENDAP", "UNKNOWN"]
    availability: DatasetAvailability
    availability_detail: Optional[str] = None
    "Human-readable explanation of availability status."

    registered_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    "UTC ISO-8601 timestamp when this entry was registered."

    original_file_path: Optional[str] = None
    "Absolute or repo-relative path to the original source file, if FILE_IMPORT."
    checksum: Optional[str] = None
    "SHA-256 checksum of the imported file, if FILE_IMPORT."
    product_id: Optional[str] = None
    "Issuing authority's product identifier."
    acquisition_time: Optional[str] = None
    "When the source data was acquired / issued."
    quality_flags: list[str] = Field(default_factory=list)

    extra: dict[str, Any] = Field(default_factory=dict)
    "Product-specific additional metadata."


class DatasetRegistry:
    """Thread-safe in-process registry of ingested dataset metadata.

    Usage::

        from backend.app.connectors.dataset_registry import dataset_registry
        dataset_registry.register(DatasetMetadata(...))
        available = dataset_registry.get_available_datasets()
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: dict[str, DatasetMetadata] = {}

    def register(self, metadata: DatasetMetadata) -> None:
        """Register or update a dataset metadata entry.

        If an entry with the same ``dataset_id`` already exists it is
        replaced (newer ingest wins).
        """
        with self._lock:
            self._entries[metadata.dataset_id] = metadata
        logger.info(
            "DatasetRegistry: registered %s (%s) — %s",
            metadata.dataset_id,
            metadata.variable,
            metadata.availability,
        )

    def get_all(self) -> list[DatasetMetadata]:
        """Return all registered entries (including failed)."""
        with self._lock:
            return list(self._entries.values())

    def get_available_datasets(self) -> list[DatasetMetadata]:
        """Return only datasets with availability SUCCESS or CACHED.

        Only usable data is exposed to downstream tools.
        """
        with self._lock:
            return [
                m for m in self._entries.values()
                if m.availability in ("SUCCESS", "CACHED")
            ]

    def get_by_variable(self, variable: str) -> list[DatasetMetadata]:
        """Return all entries whose variable matches (case-insensitive)."""
        variable_lower = variable.lower()
        with self._lock:
            return [
                m for m in self._entries.values()
                if m.variable.lower() == variable_lower
            ]

    def get_by_region(
        self,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float,
    ) -> list[DatasetMetadata]:
        """Return entries whose geographic coverage overlaps the given bounding box."""
        with self._lock:
            results = []
            for m in self._entries.values():
                cov = m.geographic_coverage
                # Overlapping bounding-box check
                if (cov.lat_min <= lat_max and cov.lat_max >= lat_min and
                        cov.lon_min <= lon_max and cov.lon_max >= lon_min):
                    results.append(m)
            return results

    def clear(self) -> None:
        """Clear all entries (for testing isolation)."""
        with self._lock:
            self._entries.clear()

    def source_health_summary(self) -> list[dict[str, Any]]:
        """Return a summary of all source health states for the /health endpoint.

        Returns explicit per-source status: configured, unavailable, failed,
        stale, cached, or successfully_retrieved.
        Static frontend profiles must NOT appear here.
        """
        with self._lock:
            summary = []
            for m in self._entries.values():
                summary.append({
                    "dataset_id": m.dataset_id,
                    "source_name": m.source_name,
                    "variable": m.variable,
                    "availability": m.availability,
                    "access_method": m.access_method,
                    "registered_at": m.registered_at,
                    "detail": m.availability_detail,
                })
            return summary


# Module-level singleton shared across the process
dataset_registry = DatasetRegistry()
