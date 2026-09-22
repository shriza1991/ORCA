"""Forecast alignment tests — Prompt 0 acceptance criteria.

Tests:
AC-1  A query for a later hour returns that hour's values.
AC-2  Nulls in one variable do not cause cross-hour mixing.
AC-3  A 3.6 km/h current converts to approximately 1.94384 knots.
AC-4  Out-of-horizon requests are COVERAGE_UNAVAILABLE rather than silently
      using another hour.
AC-5  Unsupported harbour coverage is explicit (GEOGRAPHIC_FALLBACK flag).
AC-6  Reading cached (snapshot) data does not refresh its acquisition or
      valid time.
AC-7  Existing deterministic scenarios remain reproducible (SnapshotConnector
      returns WINDOW_UNAVAILABLE when no record matches, not a wrong record).

Also covers unit helpers: _select_hour_index, _safe_float, _parse_departure_utc,
_select_record.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest
import respx

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.connectors.open_meteo import (
    OpenMeteoConnector,
    _KMH_TO_KNOTS,
    _parse_departure_utc,
    _safe_float,
    _select_hour_index,
)
from backend.app.connectors.snapshot import SnapshotConnector, _parse_utc, _select_record


# =============================================================================
# Unit tests: helpers
# =============================================================================

class TestSelectHourIndex:
    """_select_hour_index must pick the slot that covers the departure time."""

    TIMES = [
        "2026-09-22T00:00",
        "2026-09-22T01:00",
        "2026-09-22T06:00",
        "2026-09-22T12:00",
        "2026-09-22T18:00",
        "2026-09-23T00:00",
    ]

    def test_returns_zero_when_no_departure(self):
        assert _select_hour_index(self.TIMES, None) == 0

    def test_selects_exact_slot(self):
        target = datetime(2026, 9, 22, 6, 0, 0, tzinfo=UTC)
        idx = _select_hour_index(self.TIMES, target)
        assert idx == 2  # "2026-09-22T06:00"

    def test_selects_floor_slot_when_between_hours(self):
        # 06:30 → should floor to slot at 06:00 (index 2)
        target = datetime(2026, 9, 22, 6, 30, 0, tzinfo=UTC)
        idx = _select_hour_index(self.TIMES, target)
        assert idx == 2

    def test_later_hour_returns_later_slot(self):
        target_06 = datetime(2026, 9, 22, 6, 0, 0, tzinfo=UTC)
        target_18 = datetime(2026, 9, 22, 18, 0, 0, tzinfo=UTC)
        idx_06 = _select_hour_index(self.TIMES, target_06)
        idx_18 = _select_hour_index(self.TIMES, target_18)
        assert idx_18 > idx_06, "Later departure must yield a later index"

    def test_returns_zero_for_empty_times(self):
        assert _select_hour_index([], datetime(2026, 9, 22, 8, tzinfo=UTC)) == 0

    def test_returns_zero_when_all_times_are_after_target(self):
        # All slots are after the target: best is index 0 (default)
        target = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)
        idx = _select_hour_index(self.TIMES, target)
        assert idx == 0


class TestSafeFloat:
    """_safe_float must return the value at the given index or None."""

    def test_returns_value_at_index(self):
        assert _safe_float([1.0, 2.0, 3.0], 1) == 2.0

    def test_returns_none_for_null_value(self):
        assert _safe_float([1.0, None, 3.0], 1) is None

    def test_returns_none_for_out_of_bounds_index(self):
        assert _safe_float([1.0, 2.0], 5) is None

    def test_returns_none_for_empty_list(self):
        assert _safe_float([], 0) is None

    def test_no_cross_index_contamination(self):
        """AC-2: nulls in one position must not cause another index to be used."""
        values = [None, 2.5, None]
        assert _safe_float(values, 0) is None
        assert _safe_float(values, 1) == 2.5
        assert _safe_float(values, 2) is None


class TestParseDepartureUtc:
    def test_parses_utc_zulu(self):
        dt = _parse_departure_utc("2026-09-22T06:00:00Z")
        assert dt is not None
        assert dt.tzinfo is not None
        assert dt.hour == 6

    def test_parses_offset(self):
        dt = _parse_departure_utc("2026-09-22T11:30:00+05:30")
        assert dt is not None
        assert dt.tzinfo == UTC or dt.utcoffset().total_seconds() == 0

    def test_returns_none_for_none(self):
        assert _parse_departure_utc(None) is None

    def test_returns_none_for_garbage(self):
        assert _parse_departure_utc("not-a-date") is None


# =============================================================================
# AC-3: Unit conversion — 3.6 km/h → knots
# =============================================================================

class TestKnotConversion:
    """AC-3: 3.6 km/h must convert to approximately 1.94384 knots."""

    def test_kmh_to_knots_factor(self):
        kmh = 3.6
        expected_knots = 3.6 / 1.852
        result = kmh * _KMH_TO_KNOTS
        assert abs(result - expected_knots) < 1e-6, (
            f"3.6 km/h should be ~{expected_knots:.5f} kn, got {result:.5f}"
        )

    def test_approximate_matches_1_94384(self):
        kmh = 3.6
        result = kmh * _KMH_TO_KNOTS
        # 1.94384 is the commonly cited approximate value
        assert abs(result - 1.94384) < 0.0001

    def test_zero_current(self):
        assert 0.0 * _KMH_TO_KNOTS == 0.0

    def test_not_using_ms_factor(self):
        """The m/s→knot factor is 1.94384 for 1 m/s = 1.94384 kn.
        For 1 km/h = 0.539957 kn — the two factors are different.
        This test guards against regression to the wrong factor."""
        ms_factor = 1.94384
        kmh_factor = _KMH_TO_KNOTS
        assert abs(ms_factor - kmh_factor) > 0.5, (
            "km/h conversion factor must not equal the m/s factor"
        )


# =============================================================================
# AC-1 & AC-2: Open-Meteo trip-window alignment
# =============================================================================

class TestOpenMeteoTripWindowAlignment:
    """AC-1: query for a later hour returns that hour's values.
    AC-2: nulls in one variable do not cause cross-hour mixing."""

    def _make_hourly_response(self) -> dict:
        """Build a realistic Open-Meteo-style hourly response spanning 6 hours."""
        times = [
            "2026-09-22T00:00",
            "2026-09-22T01:00",
            "2026-09-22T06:00",
            "2026-09-22T12:00",
            "2026-09-22T18:00",
            "2026-09-23T00:00",
        ]
        return {
            "latitude": 16.99,
            "longitude": 73.28,
            "hourly_units": {
                "time": "iso8601",
                "wave_height": "m",
                "ocean_current_velocity": "km/h",
            },
            "hourly": {
                "time": times,
                # Each slot has a distinct, easily testable value
                "wave_height":            [1.0, 1.1, 1.6, 2.0, 2.4, 2.8],
                "wave_direction":         [180, 185, 200, 210, 220, 230],
                "wave_period":            [6.0, 6.1, 6.5, 7.0, 7.5, 8.0],
                "swell_wave_height":      [0.5, 0.6, 0.9, 1.2, 1.5, 1.8],
                "swell_wave_period":      [8.0, 8.1, 8.5, 9.0, 9.5, 10.0],
                # Slot 2 (06:00) has a null current — tests AC-2
                "ocean_current_velocity": [0.5, 0.6, None, 1.2, 1.5, 1.8],
                "sea_surface_temperature":[28.0, 28.1, 28.6, 29.0, 29.5, 30.0],
            },
        }

    @respx.mock
    def test_ac1_later_hour_returns_later_values(self):
        """AC-1: departing at 12:00 should give wave_height=2.0, not 1.0 (00:00)."""
        OpenMeteoConnector._cache.clear()
        respx.get("https://marine-api.open-meteo.com/v1/marine").mock(
            return_value=httpx.Response(200, json=self._make_hourly_response())
        )

        ctx = ToolInvocationContext(
            origin_harbor="Ratnagiri",
            departure_time="2026-09-22T12:00:00Z",
        )
        connector = OpenMeteoConnector()
        payload = connector.get_marine_conditions(ctx)

        # Slot index 3 = 12:00 → wave_height=2.0
        assert payload.significant_wave_height_m == 2.0, (
            f"Expected 2.0 (12:00 slot) but got {payload.significant_wave_height_m}"
        )
        assert payload.wave_direction_deg == 210
        assert payload.swell_height_m == 1.2
        assert payload.observed_at is not None and "12:00" in payload.observed_at

    @respx.mock
    def test_ac1_default_slot_is_zero_when_no_departure(self):
        """Without departure_time, index 0 (00:00) is selected."""
        OpenMeteoConnector._cache.clear()
        respx.get("https://marine-api.open-meteo.com/v1/marine").mock(
            return_value=httpx.Response(200, json=self._make_hourly_response())
        )

        ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
        connector = OpenMeteoConnector()
        payload = connector.get_marine_conditions(ctx)

        assert payload.significant_wave_height_m == 1.0

    @respx.mock
    def test_ac2_null_current_at_06_does_not_bleed_to_wave_height(self):
        """AC-2: slot 06:00 has None current — other variables at 06:00 must be correct,
        and the null must not cause any cross-index fetch for other variables."""
        OpenMeteoConnector._cache.clear()
        respx.get("https://marine-api.open-meteo.com/v1/marine").mock(
            return_value=httpx.Response(200, json=self._make_hourly_response())
        )

        ctx = ToolInvocationContext(
            origin_harbor="Ratnagiri",
            departure_time="2026-09-22T06:00:00Z",
        )
        connector = OpenMeteoConnector()
        payload = connector.get_marine_conditions(ctx)

        # current is null at index 2 (06:00)
        assert payload.surface_current_knots is None

        # All other variables must be from index 2 (06:00), not another index
        assert payload.significant_wave_height_m == 1.6,  \
            f"wave_height should be 1.6 (slot 06:00), got {payload.significant_wave_height_m}"
        assert payload.swell_height_m == 0.9
        assert payload.swell_period_sec == 8.5
        assert payload.wave_direction_deg == 200
        assert payload.sea_surface_temp_c == pytest.approx(28.6)

    @respx.mock
    def test_ac3_current_unit_conversion_in_full_flow(self):
        """AC-3: 3.6 km/h current in API response must convert to ~1.944 knots."""
        OpenMeteoConnector._cache.clear()
        hourly = {
            "time": ["2026-09-22T06:00"],
            "wave_height": [1.5],
            "wave_direction": [200.0],
            "wave_period": [6.0],
            "swell_wave_height": [0.8],
            "swell_wave_period": [8.0],
            "ocean_current_velocity": [3.6],   # km/h — must not be treated as m/s
            "sea_surface_temperature": [28.5],
        }
        respx.get("https://marine-api.open-meteo.com/v1/marine").mock(
            return_value=httpx.Response(200, json={"hourly": hourly})
        )

        ctx = ToolInvocationContext(
            origin_harbor="Ratnagiri",
            departure_time="2026-09-22T06:00:00Z",
        )
        connector = OpenMeteoConnector()
        payload = connector.get_marine_conditions(ctx)

        expected_knots = 3.6 / 1.852
        assert payload.surface_current_knots == pytest.approx(expected_knots, abs=1e-4), (
            f"3.6 km/h should convert to ~{expected_knots:.5f} kn; "
            f"got {payload.surface_current_knots}"
        )


# =============================================================================
# AC-4: Out-of-horizon requests
# =============================================================================

class TestOutOfHorizonRejection:
    """AC-4: out-of-horizon requests are WINDOW_UNAVAILABLE, not silently wrong."""

    def test_beyond_forecast_horizon_returns_unavailable_marine(self):
        """Departure > 16 days ahead must return WINDOW_UNAVAILABLE payload."""
        far_future = (datetime.now(UTC) + timedelta(days=20)).isoformat()
        ctx = ToolInvocationContext(
            origin_harbor="Ratnagiri",
            departure_time=far_future,
        )
        connector = OpenMeteoConnector()
        payload = connector.get_marine_conditions(ctx)

        assert payload.significant_wave_height_m is None
        assert payload.freshness_flags is not None
        assert payload.freshness_flags["coverage_status"] == "WINDOW_UNAVAILABLE", (
            f"Expected WINDOW_UNAVAILABLE, got {payload.freshness_flags}"
        )
        assert "WINDOW_UNAVAILABLE" in payload.source_name

    def test_beyond_forecast_horizon_returns_unavailable_weather(self):
        far_future = (datetime.now(UTC) + timedelta(days=20)).isoformat()
        ctx = ToolInvocationContext(
            origin_harbor="Ratnagiri",
            departure_time=far_future,
        )
        connector = OpenMeteoConnector()
        payload = connector.get_weather_conditions(ctx)

        assert payload.wind_speed_knots is None
        assert "WINDOW_UNAVAILABLE" in payload.source_name

    @respx.mock
    def test_within_horizon_does_not_trigger_unavailable(self):
        """7-day departure is within the supported horizon — must fetch normally."""
        OpenMeteoConnector._cache.clear()
        next_week = (datetime.now(UTC) + timedelta(days=5)).replace(
            hour=6, minute=0, second=0, microsecond=0
        )
        # Build a minimal valid hourly response
        hourly = {
            "time": [next_week.strftime("%Y-%m-%dT%H:%M")],
            "wave_height": [1.2],
            "wave_direction": [200.0],
            "wave_period": [7.0],
            "swell_wave_height": [0.7],
            "swell_wave_period": [9.0],
            "ocean_current_velocity": [1.0],
            "sea_surface_temperature": [28.0],
        }
        respx.get("https://marine-api.open-meteo.com/v1/marine").mock(
            return_value=httpx.Response(200, json={"hourly": hourly})
        )
        ctx = ToolInvocationContext(
            origin_harbor="Ratnagiri",
            departure_time=next_week.isoformat(),
        )
        connector = OpenMeteoConnector()
        payload = connector.get_marine_conditions(ctx)

        assert payload.significant_wave_height_m == 1.2
        assert payload.freshness_flags["coverage_status"] == "OK"


# =============================================================================
# AC-5: Unsupported harbour → explicit GEOGRAPHIC_FALLBACK
# =============================================================================

class TestGeographicFallback:
    """AC-5: unsupported harbour resolves to fallback coords and is labelled."""

    @respx.mock
    def test_unknown_harbor_labels_geographic_fallback(self):
        """An unknown harbor that resolves to Ratnagiri default must be flagged."""
        OpenMeteoConnector._cache.clear()
        hourly = {
            "time": ["2026-09-22T06:00"],
            "wave_height": [1.5],
            "wave_direction": [200.0],
            "wave_period": [6.0],
            "swell_wave_height": [0.8],
            "swell_wave_period": [8.0],
            "ocean_current_velocity": [1.2],
            "sea_surface_temperature": [28.5],
        }
        respx.get("https://marine-api.open-meteo.com/v1/marine").mock(
            return_value=httpx.Response(200, json={"hourly": hourly})
        )

        # "XYZ Port" is not in the catalog → will resolve to Ratnagiri default
        ctx = ToolInvocationContext(origin_harbor="XYZ Port")
        connector = OpenMeteoConnector()
        payload = connector.get_marine_conditions(ctx)

        assert payload.freshness_flags is not None
        assert payload.freshness_flags["coverage_status"] == "GEOGRAPHIC_FALLBACK", (
            f"Expected GEOGRAPHIC_FALLBACK, got {payload.freshness_flags}"
        )

    @respx.mock
    def test_known_harbor_ratnagiri_is_not_flagged(self):
        """Ratnagiri itself must have coverage_status=OK, not GEOGRAPHIC_FALLBACK."""
        OpenMeteoConnector._cache.clear()
        hourly = {
            "time": ["2026-09-22T06:00"],
            "wave_height": [1.5],
            "wave_direction": [200.0],
            "wave_period": [6.0],
            "swell_wave_height": [0.8],
            "swell_wave_period": [8.0],
            "ocean_current_velocity": [1.2],
            "sea_surface_temperature": [28.5],
        }
        respx.get("https://marine-api.open-meteo.com/v1/marine").mock(
            return_value=httpx.Response(200, json={"hourly": hourly})
        )

        ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
        connector = OpenMeteoConnector()
        payload = connector.get_marine_conditions(ctx)

        assert payload.freshness_flags["coverage_status"] == "OK"


# =============================================================================
# AC-6: Snapshot cached data preserves original timestamps
# =============================================================================

class TestSnapshotTimestampPreservation:
    """AC-6: reading cached snapshot data must not refresh observed_at or valid_to."""

    def _make_fixture_records(self, obs_time: str) -> list[dict]:
        """Build a minimal fixture record list."""
        return [
            {
                "harbor_id": "harbor-ratnagiri",
                "observation_time": obs_time,
                "swh": 1.4,
                "swell_height": 0.9,
                "swell_period": 7.5,
                "current_speed": 1.2,
                "sst": 28.3,
                "valid_to": "2026-09-12T12:00:00+00:00",
                "qc_flag": 0,
                "provenance_json": {"harbor": "ratnagiri"},
            }
        ]

    def test_observed_at_is_from_fixture_not_clock(self):
        """AC-6: observed_at must equal the fixture record's observation_time."""
        fixture_obs_time = "2026-09-12T06:00:00+00:00"
        records = self._make_fixture_records(fixture_obs_time)

        connector = SnapshotConnector()
        connector._osf_cache = records  # inject fixture directly

        ctx = ToolInvocationContext(
            origin_harbor="Ratnagiri",
            departure_time="2026-09-12T06:00:00Z",
        )
        payload = connector.get_marine_conditions(ctx)

        assert payload.observed_at is not None
        # The observed_at must come from the fixture record, not from now_utc
        assert "2026-09-12T06:00:00" in payload.observed_at, (
            f"observed_at should preserve fixture time '2026-09-12T06:00:00', "
            f"got {payload.observed_at!r}"
        )

    def test_second_read_returns_same_timestamps(self):
        """Reading the same cached record twice must not change timestamps."""
        fixture_obs_time = "2026-09-12T06:00:00+00:00"
        records = self._make_fixture_records(fixture_obs_time)

        connector = SnapshotConnector()
        connector._osf_cache = records

        ctx = ToolInvocationContext(
            origin_harbor="Ratnagiri",
            departure_time="2026-09-12T06:00:00Z",
        )
        payload1 = connector.get_marine_conditions(ctx)
        payload2 = connector.get_marine_conditions(ctx)

        assert payload1.observed_at == payload2.observed_at, (
            "Second read must not produce a different timestamp"
        )


# =============================================================================
# AC-7: Snapshot WINDOW_UNAVAILABLE on unmatched departure time
# =============================================================================

class TestSnapshotWindowUnavailable:
    """AC-7: When no fixture record covers the requested departure time,
    the connector must return a labeled WINDOW_UNAVAILABLE payload."""

    def test_future_departure_with_past_fixtures_returns_unavailable(self):
        """Fixture records in the past; departure time is far in the future."""
        records = [
            {
                "harbor_id": "harbor-ratnagiri",
                "observation_time": "2026-09-12T06:00:00+00:00",
                "swh": 1.4,
                "swell_height": 0.9,
                "swell_period": 7.5,
                "current_speed": 1.2,
                "sst": 28.3,
                "qc_flag": 0,
                "provenance_json": {"harbor": "ratnagiri"},
            }
        ]

        connector = SnapshotConnector()
        connector._osf_cache = records

        # Departure is in 2027 — no fixture record can cover it
        ctx = ToolInvocationContext(
            origin_harbor="Ratnagiri",
            departure_time="2027-06-01T06:00:00Z",
        )
        payload = connector.get_marine_conditions(ctx)

        assert payload.significant_wave_height_m is None
        assert payload.freshness_flags is not None
        assert payload.freshness_flags["coverage_status"] == "WINDOW_UNAVAILABLE", (
            f"Expected WINDOW_UNAVAILABLE, got: {payload.freshness_flags}"
        )
        assert "WINDOW_UNAVAILABLE" in payload.source_name


# =============================================================================
# Snapshot select_record helper unit tests
# =============================================================================

class TestSelectRecord:
    """Tests for the _select_record helper used by SnapshotConnector."""

    def _record(self, obs_time: str) -> dict:
        return {"observation_time": obs_time, "swh": 1.0}

    def test_returns_none_on_empty(self):
        assert _select_record([], datetime(2026, 9, 22, 6, tzinfo=UTC)) is None

    def test_returns_first_when_departure_none(self):
        records = [self._record("2026-09-12T06:00:00+00:00"), self._record("2026-09-12T07:00:00+00:00")]
        chosen = _select_record(records, None)
        assert chosen is records[0]

    def test_selects_latest_record_at_or_before_target(self):
        records = [
            self._record("2026-09-22T04:00:00+00:00"),
            self._record("2026-09-22T06:00:00+00:00"),
            self._record("2026-09-22T08:00:00+00:00"),
        ]
        target = datetime(2026, 9, 22, 7, 0, 0, tzinfo=UTC)
        chosen = _select_record(records, target)
        # 06:00 is the latest slot ≤ 07:00
        assert chosen["observation_time"] == "2026-09-22T06:00:00+00:00"

    def test_returns_none_when_all_records_are_after_target(self):
        records = [
            self._record("2026-09-22T10:00:00+00:00"),
            self._record("2026-09-22T12:00:00+00:00"),
        ]
        target = datetime(2026, 9, 22, 8, 0, 0, tzinfo=UTC)
        chosen = _select_record(records, target)
        assert chosen is None
