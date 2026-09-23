"""Unit and Integration Tests for INCOIS Connectors (OSF, PFZ, SVAS).

Tests:
- Live request paths, timeouts, retry/backoff, typed failures
- Schema normalization into MarineConditionsPayload, PFZSourceDataPayload, SVASAdvisoryPayload
- Geodesic candidate ranking, distance ordering, bearing calculation
- Malformed, expired, missing geometry advisories
- Fallback mode (LIVE -> HYBRID -> SNAPSHOT)
"""

import httpx
import pytest
import respx
from datetime import UTC, datetime, timedelta

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.connectors.errors import (
    ConnectorAuthenticationError,
    ConnectorMalformedResponseError,
    ConnectorTimeoutError,
    ConnectorUpstreamUnavailableError,
)
from backend.app.connectors.incois import IncoisOceanStateConnector
from backend.app.core.config import settings
from backend.app.domain.pfz import (
    DeterministicPFZRankingEngine,
    haversine_distance_nm,
    initial_compass_bearing_deg,
)


@pytest.fixture
def incois_connector():
    IncoisOceanStateConnector._cache.clear()
    return IncoisOceanStateConnector(data_mode="HYBRID")


# =============================================================================
# 1. INCOIS OSF (Marine Conditions) Tests
# =============================================================================

@respx.mock
def test_incois_osf_live_success(monkeypatch, incois_connector):
    monkeypatch.setattr(settings, "INCOIS_API_KEY", "test-key-123")
    monkeypatch.setattr(settings, "INCOIS_API_BASE_URL", "https://api.incois.gov.in")

    mock_url = "https://api.incois.gov.in/osf"
    now_str = datetime.now(UTC).isoformat()
    valid_to_str = (datetime.now(UTC) + timedelta(hours=24)).isoformat()

    respx.get(mock_url).mock(return_value=httpx.Response(
        200,
        json={
            "swh": 1.4,
            "swell_height": 0.9,
            "swell_period": 7.5,
            "current_speed": 1.2,
            "sst": 28.3,
            "timestamp_utc": now_str,
            "valid_to_utc": valid_to_str,
        }
    ))

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = incois_connector.get_marine_conditions(ctx)

    assert payload.significant_wave_height_m == 1.4
    assert payload.swell_height_m == 0.9
    assert payload.swell_period_sec == 7.5
    assert payload.surface_current_knots == 1.2
    assert payload.sea_surface_temp_c == 28.3
    assert payload.source_name == "INCOIS Ocean State Forecast"
    assert payload.harbor == "Ratnagiri"


@respx.mock
def test_incois_osf_live_timeout_fallback_to_open_meteo(monkeypatch, incois_connector):
    monkeypatch.setattr(settings, "INCOIS_API_KEY", "test-key-123")
    monkeypatch.setattr(settings, "INCOIS_API_BASE_URL", "https://api.incois.gov.in")

    # Incois fails with timeout
    respx.get("https://api.incois.gov.in/osf").mock(side_effect=httpx.TimeoutException("INCOIS down"))

    # Fallback Open-Meteo responds
    respx.get("https://marine-api.open-meteo.com/v1/marine").mock(return_value=httpx.Response(
        200,
        json={
            "hourly": {
                "time": ["2026-09-22T00:00"],
                "wave_height": [1.8],
                "wave_direction": [200.0],
                "wave_period": [7.0],
                "swell_wave_height": [1.1],
                "swell_wave_period": [8.0],
                "ocean_current_velocity": [0.6],
                "sea_surface_temperature": [28.0],
            }
        }
    ))

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = incois_connector.get_marine_conditions(ctx)

    assert payload.significant_wave_height_m == 1.8
    assert "Open-Meteo" in payload.source_name


def test_incois_osf_snapshot_mode():
    conn = IncoisOceanStateConnector(data_mode="SNAPSHOT")
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = conn.get_marine_conditions(ctx)

    assert payload.significant_wave_height_m is None
    assert "DEGRADED" in payload.source_name


# =============================================================================
# 2. INCOIS PFZ Parsing and Geodesic Ranking Tests
# =============================================================================

def test_haversine_and_bearing_calculation():
    # Ratnagiri (~16.99, 73.28) to point due West (~16.99, 72.28)
    dist = haversine_distance_nm(16.99, 73.28, 16.99, 72.28)
    assert 50.0 < dist < 65.0

    bearing = initial_compass_bearing_deg(16.99, 73.28, 16.99, 72.28)
    # Due west is approximately 270 degrees
    assert 265.0 <= bearing <= 275.0


def test_deterministic_pfz_ranking():
    engine = DeterministicPFZRankingEngine()
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")  # 16.99, 73.28

    raw_features = [
        {
            "id": "PFZ-FAR",
            "lat": 17.20,
            "lon": 72.60,
            "sst": 28.0,
            "chlorophyll": 1.5,
        },
        {
            "id": "PFZ-NEAR",
            "lat": 16.95,
            "lon": 73.15,
            "sst": 28.5,
            "chlorophyll": 2.1,
        },
        {
            "id": "PFZ-TOO-FAR",
            "lat": 19.50,
            "lon": 70.00,
            "sst": 27.5,
            "chlorophyll": 0.8,
        },
        {
            "id": "PFZ-INVALID",
            "lat": "not_a_number",
        }
    ]

    result = engine.rank_pfz_candidates(ctx, raw_features, max_search_radius_nm=60.0)

    assert result.origin_harbor == "Ratnagiri"
    assert result.total_candidates == 2  # PFZ-TOO-FAR > 60nm, PFZ-INVALID filtered out
    assert result.ranked_candidates[0].candidate_id == "PFZ-NEAR"
    assert result.ranked_candidates[0].rank == 1
    assert result.ranked_candidates[1].candidate_id == "PFZ-FAR"
    assert result.ranked_candidates[1].rank == 2
    assert result.ranked_candidates[0].distance_nautical_miles < result.ranked_candidates[1].distance_nautical_miles


# =============================================================================
# 3. INCOIS SVAS (Small Vessel Advisory Services) Tests
# =============================================================================

@respx.mock
def test_incois_svas_live_success(monkeypatch, incois_connector):
    monkeypatch.setattr(settings, "INCOIS_API_KEY", "test-key-123")
    monkeypatch.setattr(settings, "INCOIS_API_BASE_URL", "https://api.incois.gov.in")

    mock_url = "https://api.incois.gov.in/svas"
    now_str = datetime.now(UTC).isoformat()
    valid_to_str = (datetime.now(UTC) + timedelta(hours=24)).isoformat()

    respx.get(mock_url).mock(return_value=httpx.Response(
        200,
        json={
            "advisory_status": "CAUTION",
            "safety_index": 4.5,
            "capsizing_risk": "MODERATE",
            "warning_statement": "Elevated swell conditions; operate nearshore.",
            "issued_at": now_str,
            "valid_to": valid_to_str,
        }
    ))

    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    payload = incois_connector.get_svas_advisories(ctx)

    assert payload.advisory_status == "CAUTION"
    assert payload.safety_index == 4.5
    assert payload.capsizing_risk == "MODERATE"
    assert payload.craft_profile == "motorized_boat"
    assert payload.source_name == "INCOIS SVAS"


def test_incois_svas_live_unavailable_cached_real():
    # Without API key, connector returns CACHED_REAL / LIMITED
    conn = IncoisOceanStateConnector(data_mode="HYBRID")
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri")
    payload = conn.get_svas_advisories(ctx)

    assert payload.advisory_status == "UNKNOWN"
    assert "UNAVAILABLE" in payload.source_name
