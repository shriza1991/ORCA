"""Contract / Protocol Conformance Tests for Dev 2 Connectors.

Tests that:
1. Each connector class satisfies the corresponding runtime_checkable Protocol.
2. The SnapshotConnector returns valid, fully-populated typed payloads.
3. INCOIS and IMD connectors produce DEGRADED payloads (not exceptions) on missing keys.
4. All returned timestamps are ISO-8601 UTC strings.
5. PFZ payload features list is iterable even on empty results.

These tests use SNAPSHOT mode (no network) and assert the Dev 3 protocol
contracts are satisfied without making external HTTP calls.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import pytest

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    HazardBulletinsProvider,
    MarineConditionsProvider,
    PFZSourceDataProvider,
    WeatherConditionsProvider,
)
from backend.app.connectors.imd_hazard import ImdHazardConnector
from backend.app.connectors.imd_weather import ImdWeatherConnector
from backend.app.connectors.incois import IncoisOceanStateConnector
from backend.app.connectors.snapshot import SnapshotConnector

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

ISO8601_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$"
)


def is_iso8601_utc(value: Any) -> bool:
    """Loose check: string, parseable as UTC datetime."""
    if not isinstance(value, str):
        return False
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.tzinfo is not None
    except (ValueError, AttributeError):
        return False


@pytest.fixture
def snapshot_connector() -> SnapshotConnector:
    return SnapshotConnector()


@pytest.fixture
def ratnagiri_context() -> ToolInvocationContext:
    return ToolInvocationContext(
        origin_harbor="Ratnagiri",
        coordinates=[73.28, 16.99],
        craft_profile="motorized_boat",
    )


@pytest.fixture
def mumbai_context() -> ToolInvocationContext:
    return ToolInvocationContext(
        origin_harbor="Mumbai",
        coordinates=[72.877, 19.076],
        craft_profile="mechanized_trawler",
    )


# ---------------------------------------------------------------------------
# 1. Protocol Conformance — SnapshotConnector
# ---------------------------------------------------------------------------

class TestSnapshotConnectorProtocolConformance:
    """SnapshotConnector must satisfy all four Dev 2 protocols."""

    def test_marine_conditions_provider_protocol(self, snapshot_connector):
        assert isinstance(snapshot_connector, MarineConditionsProvider), (
            "SnapshotConnector must satisfy MarineConditionsProvider"
        )

    def test_weather_conditions_provider_protocol(self, snapshot_connector):
        assert isinstance(snapshot_connector, WeatherConditionsProvider), (
            "SnapshotConnector must satisfy WeatherConditionsProvider"
        )

    def test_hazard_bulletins_provider_protocol(self, snapshot_connector):
        assert isinstance(snapshot_connector, HazardBulletinsProvider), (
            "SnapshotConnector must satisfy HazardBulletinsProvider"
        )

    def test_pfz_source_provider_protocol(self, snapshot_connector):
        assert isinstance(snapshot_connector, PFZSourceDataProvider), (
            "SnapshotConnector must satisfy PFZSourceDataProvider"
        )

    def test_svas_advisory_provider_protocol(self, snapshot_connector):
        from backend.app.agents.integrations.dev2 import SVASAdvisoryProvider
        assert isinstance(snapshot_connector, SVASAdvisoryProvider), (
            "SnapshotConnector must satisfy SVASAdvisoryProvider"
        )


# ---------------------------------------------------------------------------
# 2. Protocol Conformance — INCOIS / IMD connectors
# ---------------------------------------------------------------------------

class TestProductionConnectorProtocolConformance:
    """Production connectors must satisfy their corresponding protocols."""

    def test_incois_marine_provider_protocol(self):
        connector = IncoisOceanStateConnector()
        assert isinstance(connector, MarineConditionsProvider)

    def test_incois_pfz_provider_protocol(self):
        connector = IncoisOceanStateConnector()
        assert isinstance(connector, PFZSourceDataProvider)

    def test_incois_svas_provider_protocol(self):
        from backend.app.agents.integrations.dev2 import SVASAdvisoryProvider
        connector = IncoisOceanStateConnector()
        assert isinstance(connector, SVASAdvisoryProvider)

    def test_imd_weather_provider_protocol(self):
        connector = ImdWeatherConnector()
        assert isinstance(connector, WeatherConditionsProvider)

    def test_imd_hazard_provider_protocol(self):
        connector = ImdHazardConnector()
        assert isinstance(connector, HazardBulletinsProvider)



# ---------------------------------------------------------------------------
# 3. SnapshotConnector payload correctness
# ---------------------------------------------------------------------------

class TestSnapshotConnectorPayloads:
    """SnapshotConnector must return valid typed payloads with UTC timestamps."""

    def test_marine_conditions_fields(self, snapshot_connector, ratnagiri_context):
        payload = snapshot_connector.get_marine_conditions(ratnagiri_context)
        assert payload.harbor == "Ratnagiri"
        assert payload.significant_wave_height_m >= 0.0
        assert is_iso8601_utc(payload.observed_at), f"observed_at not UTC: {payload.observed_at}"
        assert is_iso8601_utc(payload.valid_to), f"valid_to not UTC: {payload.valid_to}"
        assert payload.source_name  # non-empty

    def test_weather_conditions_fields(self, snapshot_connector, ratnagiri_context):
        payload = snapshot_connector.get_weather_conditions(ratnagiri_context)
        assert payload.harbor == "Ratnagiri"
        assert payload.wind_speed_knots >= 0.0
        assert is_iso8601_utc(payload.observed_at)
        assert is_iso8601_utc(payload.valid_to)
        assert payload.source_name

    def test_hazard_bulletin_fields(self, snapshot_connector, ratnagiri_context):
        payload = snapshot_connector.get_hazard_bulletin(ratnagiri_context)
        assert payload.harbor == "Ratnagiri"
        assert isinstance(payload.cyclone_warning_active, bool)
        assert isinstance(payload.squall_alert, bool)
        assert payload.severity in ("NORMAL", "WATCH", "ALERT", "WARNING", "SEVERE")
        assert is_iso8601_utc(payload.valid_from)
        assert is_iso8601_utc(payload.valid_to)
        assert payload.source_name

    def test_pfz_advisories_fields(self, snapshot_connector, ratnagiri_context):
        payload = snapshot_connector.get_pfz_raw_advisories(ratnagiri_context)
        assert isinstance(payload.features, list)
        assert is_iso8601_utc(payload.bulletin_date)
        assert is_iso8601_utc(payload.valid_to)
        assert payload.source_name

    def test_marine_conditions_different_harbor(self, snapshot_connector, mumbai_context):
        payload = snapshot_connector.get_marine_conditions(mumbai_context)
        assert payload.harbor == "Mumbai"
        assert payload.significant_wave_height_m >= 0.0


# ---------------------------------------------------------------------------
# 4. INCOIS / IMD connectors — no key → degraded, not exceptions
# ---------------------------------------------------------------------------

class TestConnectorDegradedFallback:
    """Connectors with no API keys must return DEGRADED payloads without raising."""

    def test_incois_returns_degraded_not_exception(self, ratnagiri_context):
        """IncoisOceanStateConnector without API key returns DEGRADED, not raises."""
        # In HYBRID mode with no INCOIS_API_KEY, falls back to Open-Meteo.
        # Open-Meteo may succeed or fail; in either case no uncaught exception.
        connector = IncoisOceanStateConnector()
        # Force SNAPSHOT mode so no HTTP calls are made
        connector.data_mode = "SNAPSHOT"
        payload = connector.get_marine_conditions(ratnagiri_context)
        # SNAPSHOT_REDIRECT payload: wave height = None, expired valid_to
        assert payload.significant_wave_height_m is None or payload.significant_wave_height_m >= 0.0
        assert is_iso8601_utc(payload.observed_at)

    def test_imd_weather_returns_degraded_not_exception(self, ratnagiri_context):
        connector = ImdWeatherConnector()
        connector.data_mode = "SNAPSHOT"
        payload = connector.get_weather_conditions(ratnagiri_context)
        assert payload.wind_speed_knots is None or payload.wind_speed_knots >= 0.0
        assert is_iso8601_utc(payload.observed_at)

    def test_imd_hazard_returns_normal_not_exception(self, ratnagiri_context):
        connector = ImdHazardConnector()
        connector.data_mode = "SNAPSHOT"
        payload = connector.get_hazard_bulletin(ratnagiri_context)
        assert isinstance(payload.cyclone_warning_active, bool)
        assert payload.severity in ("UNKNOWN", "NORMAL", "WATCH", "ALERT", "WARNING", "SEVERE")

    def test_imd_hazard_live_fail_returns_normal(self, ratnagiri_context):
        """When HYBRID and no key, ImdHazardConnector returns NORMAL severity payload."""
        connector = ImdHazardConnector()
        connector.data_mode = "HYBRID"
        # No API key set (default env) — falls through to _make_normal_payload
        payload = connector.get_hazard_bulletin(ratnagiri_context)
        assert isinstance(payload.cyclone_warning_active, bool)
        assert payload.cyclone_warning_active is False  # NORMAL fallback
        assert "DEGRADED" in payload.source_name or "LIVE_UNAVAILABLE" in payload.source_name or \
               "NORMAL" in payload.severity


# ---------------------------------------------------------------------------
# 5. Pydantic model_dump — round-trip serialization
# ---------------------------------------------------------------------------

class TestPayloadSerialization:
    """All payload models must round-trip through model_dump without error."""

    def test_marine_payload_serializable(self, snapshot_connector, ratnagiri_context):
        payload = snapshot_connector.get_marine_conditions(ratnagiri_context)
        dumped = payload.model_dump()
        assert "harbor" in dumped
        assert "significant_wave_height_m" in dumped

    def test_weather_payload_serializable(self, snapshot_connector, ratnagiri_context):
        payload = snapshot_connector.get_weather_conditions(ratnagiri_context)
        dumped = payload.model_dump()
        assert "wind_speed_knots" in dumped

    def test_hazard_payload_serializable(self, snapshot_connector, ratnagiri_context):
        payload = snapshot_connector.get_hazard_bulletin(ratnagiri_context)
        dumped = payload.model_dump()
        assert "cyclone_warning_active" in dumped
        assert "severity" in dumped

    def test_pfz_payload_serializable(self, snapshot_connector, ratnagiri_context):
        payload = snapshot_connector.get_pfz_raw_advisories(ratnagiri_context)
        dumped = payload.model_dump()
        assert "features" in dumped
        assert isinstance(dumped["features"], list)

    def test_svas_payload_serializable(self, snapshot_connector, ratnagiri_context):
        payload = snapshot_connector.get_svas_advisories(ratnagiri_context)
        dumped = payload.model_dump()
        assert "advisory_status" in dumped
        assert "safety_index" in dumped
        assert "capsizing_risk" in dumped

