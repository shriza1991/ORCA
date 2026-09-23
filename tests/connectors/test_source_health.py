"""Tests for source connectors: source-health reporting and dataset registry.

Owned by Dev 2 (Backend Platform).

These tests verify:
1. classify_connector_health() produces correct SourceHealthStatus for all states
2. DatasetRegistry.register() / get_available_datasets() / get_by_variable() / get_by_region()
3. DatasetRegistry.source_health_summary() produces expected shape
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from backend.app.connectors.health import (
    SourceHealth,
    classify_connector_health,
)
from backend.app.connectors.dataset_registry import (
    DatasetMetadata,
    DatasetRegistry,
    GeographicCoverage,
    dataset_registry,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reset_dataset_registry():
    """Clear the module-level registry before and after each test."""
    dataset_registry.clear()
    yield
    dataset_registry.clear()


def _make_pilot_region_coverage() -> GeographicCoverage:
    return GeographicCoverage(
        lat_min=14.0,
        lat_max=22.0,
        lon_min=70.0,
        lon_max=77.0,
        description="Konkan coast pilot region",
    )


def _make_dataset_metadata(
    dataset_id: str = "test-ds-001",
    variable: str = "sst",
    availability: str = "CACHED",
    access_method: str = "FILE_IMPORT",
) -> DatasetMetadata:
    return DatasetMetadata(
        dataset_id=dataset_id,
        variable=variable,
        source_name="Test Source",
        issuing_authority="Test Authority",
        geographic_coverage=_make_pilot_region_coverage(),
        access_method=access_method,
        availability=availability,
    )


# ── Source health tests ───────────────────────────────────────────────────────

class TestClassifyConnectorHealth:
    """Tests for classify_connector_health()."""

    def test_configured_status_when_key_and_non_placeholder_url(self):
        """CONFIGURED: API key present, non-placeholder URL, not yet fetched."""
        result = classify_connector_health(
            "INCOIS PFZ",
            has_api_key=True,
            is_placeholder_url=False,
            fetch_succeeded=None,
        )
        assert result.status == "CONFIGURED"
        assert result.is_live is False

    def test_unavailable_when_key_missing(self):
        """UNAVAILABLE: no API key and no file import."""
        result = classify_connector_health(
            "INCOIS PFZ",
            has_api_key=False,
            is_placeholder_url=True,
        )
        assert result.status == "UNAVAILABLE"
        assert result.is_live is False

    def test_success_when_live_fetch_succeeded(self):
        """SUCCESS: live fetch succeeded."""
        result = classify_connector_health(
            "Open-Meteo",
            has_api_key=False,
            is_placeholder_url=False,
            fetch_succeeded=True,
        )
        assert result.status == "SUCCESS"
        assert result.is_live is True
        assert result.last_retrieved is not None

    def test_unavailable_when_live_fetch_failed(self):
        """UNAVAILABLE: live fetch attempted but failed."""
        result = classify_connector_health(
            "INCOIS OSF",
            has_api_key=True,
            is_placeholder_url=False,
            fetch_succeeded=False,
            error_detail="Connection timeout",
        )
        assert result.status == "UNAVAILABLE"
        assert result.is_live is False
        assert "timeout" in (result.details or "").lower()

    def test_cached_when_file_import_recent(self):
        """CACHED: data loaded from file import, file is recent (< 6 hours)."""
        recent_time = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
        result = classify_connector_health(
            "IMD Hazard",
            has_api_key=False,
            is_placeholder_url=True,
            is_from_file=True,
            file_acquisition_time_utc=recent_time,
        )
        assert result.status == "CACHED"
        assert result.is_live is False

    def test_stale_when_file_import_old(self):
        """STALE: file-imported data older than 6 hours."""
        old_time = (datetime.now(UTC) - timedelta(hours=8)).isoformat()
        result = classify_connector_health(
            "INCOIS PFZ",
            has_api_key=False,
            is_placeholder_url=True,
            is_from_file=True,
            file_acquisition_time_utc=old_time,
        )
        assert result.status == "STALE"
        assert result.is_live is False

    def test_failed_when_error_detail_provided(self):
        """FAILED: exception raised during import."""
        result = classify_connector_health(
            "MOSDAC SST",
            has_api_key=False,
            is_placeholder_url=True,
            error_detail="NetCDF file corrupted",
        )
        assert result.status == "FAILED"

    def test_source_health_is_pydantic_model(self):
        """SourceHealth is a valid Pydantic model."""
        result = classify_connector_health(
            "Test",
            has_api_key=True,
            is_placeholder_url=False,
        )
        assert isinstance(result, SourceHealth)
        assert result.source_name == "Test"


# ── Dataset registry tests ────────────────────────────────────────────────────

class TestDatasetRegistry:
    """Tests for DatasetRegistry CRUD and query operations."""

    def test_register_and_get_all(self):
        """Registered entries appear in get_all()."""
        registry = DatasetRegistry()
        entry = _make_dataset_metadata()
        registry.register(entry)
        assert len(registry.get_all()) == 1
        assert registry.get_all()[0].dataset_id == "test-ds-001"

    def test_get_available_datasets_filters_failed(self):
        """get_available_datasets() excludes FAILED and UNAVAILABLE entries."""
        registry = DatasetRegistry()
        registry.register(_make_dataset_metadata("ds-cached", availability="CACHED"))
        registry.register(_make_dataset_metadata("ds-success", availability="SUCCESS"))
        registry.register(_make_dataset_metadata("ds-failed", availability="FAILED"))
        registry.register(_make_dataset_metadata("ds-unavail", availability="UNAVAILABLE"))

        available = registry.get_available_datasets()
        ids = {m.dataset_id for m in available}
        assert "ds-cached" in ids
        assert "ds-success" in ids
        assert "ds-failed" not in ids
        assert "ds-unavail" not in ids

    def test_get_by_variable_case_insensitive(self):
        """get_by_variable() is case-insensitive."""
        registry = DatasetRegistry()
        registry.register(_make_dataset_metadata("ds-sst", variable="SST"))
        registry.register(_make_dataset_metadata("ds-pfz", variable="pfz_zones"))

        sst_results = registry.get_by_variable("sst")
        assert len(sst_results) == 1
        assert sst_results[0].dataset_id == "ds-sst"

    def test_get_by_region_overlap(self):
        """get_by_region() returns entries whose coverage overlaps query bbox."""
        registry = DatasetRegistry()
        # Pilot region coverage
        registry.register(_make_dataset_metadata("ds-pilot", variable="sst"))
        # Non-overlapping region (Bay of Bengal)
        registry.register(DatasetMetadata(
            dataset_id="ds-bof-bengal",
            variable="sst",
            source_name="Bay of Bengal SST",
            issuing_authority="Test",
            geographic_coverage=GeographicCoverage(
                lat_min=10.0, lat_max=22.0,
                lon_min=80.0, lon_max=92.0,
            ),
            access_method="FILE_IMPORT",
            availability="CACHED",
        ))

        # Query for Ratnagiri area (inside pilot region)
        results = registry.get_by_region(lat_min=16.0, lat_max=17.5, lon_min=72.5, lon_max=73.5)
        result_ids = {m.dataset_id for m in results}
        assert "ds-pilot" in result_ids
        # Bay of Bengal should NOT overlap with 72.5–73.5°E
        assert "ds-bof-bengal" not in result_ids

    def test_register_replaces_existing_same_id(self):
        """Re-registering with same dataset_id replaces the entry."""
        registry = DatasetRegistry()
        registry.register(_make_dataset_metadata("ds-001", variable="sst"))
        registry.register(_make_dataset_metadata("ds-001", variable="pfz_zones"))

        all_entries = registry.get_all()
        assert len(all_entries) == 1
        assert all_entries[0].variable == "pfz_zones"

    def test_source_health_summary_shape(self):
        """source_health_summary() returns expected fields for each entry."""
        registry = DatasetRegistry()
        registry.register(_make_dataset_metadata("ds-001"))

        summary = registry.source_health_summary()
        assert len(summary) == 1
        entry = summary[0]
        assert "dataset_id" in entry
        assert "source_name" in entry
        assert "availability" in entry
        assert "access_method" in entry

    def test_clear_removes_all(self):
        """clear() removes all entries."""
        registry = DatasetRegistry()
        registry.register(_make_dataset_metadata("ds-001"))
        registry.register(_make_dataset_metadata("ds-002", variable="pfz_zones"))
        registry.clear()
        assert registry.get_all() == []

    def test_module_level_registry_is_singleton(self):
        """The module-level dataset_registry singleton can be used directly."""
        entry = _make_dataset_metadata("singleton-test")
        dataset_registry.register(entry)
        available = dataset_registry.get_available_datasets()
        assert any(m.dataset_id == "singleton-test" for m in available)


# ── Pilot region coverage validation ─────────────────────────────────────────

class TestPilotRegionCoverage:
    """Verify pilot region bounding box values are correct."""

    def test_pilot_region_bbox_values(self):
        """Pilot region covers Maharashtra/Konkan coast correctly."""
        cov = _make_pilot_region_coverage()
        assert cov.lat_min == 14.0
        assert cov.lat_max == 22.0
        assert cov.lon_min == 70.0
        assert cov.lon_max == 77.0

    def test_ratnagiri_is_inside_pilot_region(self):
        """Ratnagiri (16.99°N, 73.31°E) is within the pilot region."""
        ratnagiri_lat = 16.99
        ratnagiri_lon = 73.31
        cov = _make_pilot_region_coverage()
        assert cov.lat_min <= ratnagiri_lat <= cov.lat_max
        assert cov.lon_min <= ratnagiri_lon <= cov.lon_max

    def test_bay_of_bengal_is_outside_pilot_region(self):
        """Visakhapatnam (17.7°N, 83.3°E) is outside pilot region (Bay of Bengal)."""
        vskp_lat = 17.7
        vskp_lon = 83.3
        cov = _make_pilot_region_coverage()
        # Longitude 83.3 > 77.0 — not in pilot region
        assert not (cov.lon_min <= vskp_lon <= cov.lon_max)
