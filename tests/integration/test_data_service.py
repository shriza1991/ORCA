"""Integration tests for DataService DATA_MODE routing.

Tests:
1. SNAPSHOT mode always returns typed payloads without network calls.
2. PFZ repository stores and retrieves snapshots correctly.
3. DataService emits valid payloads for all three data types.
4. SnapshotConnector freshness — expired snapshots are not served.

All tests run fully offline (DATA_MODE=SNAPSHOT).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.connectors.snapshot import SnapshotConnector
from backend.app.repositories import PFZRepository
from backend.app.services.data_service import DataService
from backend.app.domain.synthetic.generator import REFERENCE_TIME


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def ctx() -> ToolInvocationContext:
    return ToolInvocationContext(
        origin_harbor="Ratnagiri",
        coordinates=[73.28, 16.99],
        craft_profile="motorized_boat",
    )


@pytest.fixture
def snapshot_data_service() -> DataService:
    """DataService pinned to SNAPSHOT mode — no external HTTP calls."""
    return DataService(data_mode="SNAPSHOT")


# ---------------------------------------------------------------------------
# 1. DataService SNAPSHOT mode — all three payloads
# ---------------------------------------------------------------------------

class TestDataServiceSnapshotMode:
    """DataService in SNAPSHOT mode must return valid payloads without network."""

    def test_get_marine_conditions_snapshot(self, snapshot_data_service, ctx):
        payload = snapshot_data_service.get_marine_conditions(ctx)
        assert payload.harbor == "Ratnagiri"
        assert payload.significant_wave_height_m >= 0.0
        assert payload.source_name  # non-empty string

    def test_get_weather_conditions_snapshot(self, snapshot_data_service, ctx):
        payload = snapshot_data_service.get_weather_conditions(ctx)
        assert payload.harbor == "Ratnagiri"
        assert payload.wind_speed_knots >= 0.0
        assert payload.source_name

    def test_get_hazard_bulletin_snapshot(self, snapshot_data_service, ctx):
        payload = snapshot_data_service.get_hazard_bulletin(ctx)
        assert payload.harbor == "Ratnagiri"
        assert isinstance(payload.cyclone_warning_active, bool)
        assert payload.severity in ("NORMAL", "WATCH", "ALERT", "WARNING", "SEVERE")
        assert payload.source_name

    def test_get_pfz_advisories_snapshot(self, snapshot_data_service, ctx):
        payload = snapshot_data_service.get_pfz_raw_advisories(ctx)
        assert isinstance(payload.features, list)
        assert payload.source_name

    def test_snapshot_bundle_and_hourly_forecast_share_demo_timeline(self):
        service = DataService(data_mode="SNAPSHOT")
        departure = REFERENCE_TIME + timedelta(hours=20)
        end = departure + timedelta(hours=24)
        context = ToolInvocationContext(
            origin_harbor="Ratnagiri",
            craft_profile="motorized_boat",
            departure_time=departure.isoformat(),
        )

        bundle = service.get_observation_bundle(context)
        forecast = service.get_hourly_marine_forecast(context, departure, end)

        assert "ORCA" in bundle.marine.source_name or "INCOIS" in bundle.marine.source_name
        assert bundle.weather.source_name.startswith("ORCA deterministic demo")
        assert bundle.hazard.source_name.startswith("ORCA deterministic demo")
        assert bundle.marine.observed_at == bundle.weather.observed_at
        assert bundle.marine.observed_at == bundle.hazard.valid_from
        assert len(forecast) == 25
        assert all(item.observed_at and item.significant_wave_height_m is not None for item in forecast)


# ---------------------------------------------------------------------------
# 2. PFZ Repository
# ---------------------------------------------------------------------------

class TestPFZRepository:
    """PFZ repository must store, retrieve, and respect freshness bounds."""

    def test_empty_repository_returns_none(self):
        repo = PFZRepository()
        assert repo.get_latest() is None

    def test_save_and_retrieve_fresh_snapshot(self, ctx):
        from backend.app.connectors.snapshot import SnapshotConnector
        repo = PFZRepository()
        connector = SnapshotConnector()
        payload = connector.get_pfz_raw_advisories(ctx)
        # Stamp with current time so it's fresh
        payload = payload.model_copy(
            update={"bulletin_date": datetime.now(timezone.utc).isoformat()}
        )
        repo.save(payload)
        retrieved = repo.get_latest(max_age_hours=24.0)
        assert retrieved is not None
        assert retrieved.features == payload.features

    def test_stale_snapshot_not_returned(self, ctx):
        from backend.app.connectors.snapshot import SnapshotConnector
        repo = PFZRepository()
        connector = SnapshotConnector()
        payload = connector.get_pfz_raw_advisories(ctx)
        # Stamp with 25 hours ago (beyond freshness window)
        stale_time = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
        payload = payload.model_copy(update={"bulletin_date": stale_time})
        repo.save(payload)
        retrieved = repo.get_latest(max_age_hours=24.0)
        assert retrieved is None

    def test_count_and_clear(self, ctx):
        from backend.app.connectors.snapshot import SnapshotConnector
        repo = PFZRepository()
        connector = SnapshotConnector()

        for i in range(3):
            payload = connector.get_pfz_raw_advisories(ctx)
            ts = (datetime.now(timezone.utc) - timedelta(hours=i)).isoformat()
            payload = payload.model_copy(update={"bulletin_date": ts})
            repo.save(payload)

        assert repo.count() == 3
        repo.clear()
        assert repo.count() == 0

    def test_get_all_features_returns_list(self, ctx):
        from backend.app.connectors.snapshot import SnapshotConnector
        repo = PFZRepository()
        connector = SnapshotConnector()
        payload = connector.get_pfz_raw_advisories(ctx)
        payload = payload.model_copy(
            update={"bulletin_date": datetime.now(timezone.utc).isoformat()}
        )
        repo.save(payload)
        features = repo.get_all_features()
        assert isinstance(features, list)


# ---------------------------------------------------------------------------
# 3. SnapshotConnector — multiple harbors
# ---------------------------------------------------------------------------

class TestSnapshotConnectorHarborResolution:
    """SnapshotConnector must correctly set harbor name in all payloads."""

    @pytest.mark.parametrize("harbor", ["Ratnagiri", "Mumbai", "Goa", "Kochi"])
    def test_harbor_propagated_to_marine_payload(self, harbor):
        connector = SnapshotConnector()
        ctx = ToolInvocationContext(origin_harbor=harbor, craft_profile="motorized_boat")
        payload = connector.get_marine_conditions(ctx)
        assert payload.harbor == harbor

    @pytest.mark.parametrize("harbor", ["Ratnagiri", "Mumbai"])
    def test_harbor_propagated_to_weather_payload(self, harbor):
        connector = SnapshotConnector()
        ctx = ToolInvocationContext(origin_harbor=harbor, craft_profile="motorized_boat")
        payload = connector.get_weather_conditions(ctx)
        assert payload.harbor == harbor

    @pytest.mark.parametrize("harbor", ["Ratnagiri", "Chennai"])
    def test_harbor_propagated_to_hazard_payload(self, harbor):
        connector = SnapshotConnector()
        ctx = ToolInvocationContext(origin_harbor=harbor, craft_profile="motorized_boat")
        payload = connector.get_hazard_bulletin(ctx)
        assert payload.harbor == harbor


# ---------------------------------------------------------------------------
# 4. SnapshotConnector — timestamp validity
# ---------------------------------------------------------------------------

class TestSnapshotConnectorTimestamps:
    """All timestamp fields must be valid ISO-8601 UTC strings."""

    def _is_utc(self, s: str) -> bool:
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt.tzinfo is not None
        except (ValueError, AttributeError):
            return False

    def test_marine_timestamps_are_utc(self):
        connector = SnapshotConnector()
        ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
        p = connector.get_marine_conditions(ctx)
        assert self._is_utc(p.observed_at), f"Not UTC: {p.observed_at}"
        assert self._is_utc(p.valid_to), f"Not UTC: {p.valid_to}"

    def test_weather_timestamps_are_utc(self):
        connector = SnapshotConnector()
        ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
        p = connector.get_weather_conditions(ctx)
        assert self._is_utc(p.observed_at)
        assert self._is_utc(p.valid_to)

    def test_hazard_timestamps_are_utc(self):
        connector = SnapshotConnector()
        ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
        p = connector.get_hazard_bulletin(ctx)
        assert self._is_utc(p.valid_from)
        assert self._is_utc(p.valid_to)
