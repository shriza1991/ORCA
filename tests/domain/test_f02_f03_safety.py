"""End-to-End Safety Data Verification Test Suite (F02 + F03).

Verifies that:
F02 — Missing / Stale / Invalid Data:
1. Complete fresh observations → normal deterministic risk evaluation.
2. Missing marine observations (None, missing SWH, -999.0 sentinel) → UNKNOWN.
3. Missing weather observations (None, missing wind, -999.0 sentinel) → UNKNOWN.
4. Missing hazard observations (None) → UNKNOWN.
5. Degraded / QC-invalid observations → UNKNOWN / degraded status.
6. Expired / stale observations (valid_to < now) → UNKNOWN.
7. Missing values are NEVER converted into zero, safe defaults, or fabricated GO observations.
8. Craft thresholds (CRAFT_THRESHOLDS) and risk formulas are strictly preserved.

F03 — Upstream Failure Handling:
1. Upstream connector failure / exception → explicitly identifiable as DEGRADED / UNAVAILABLE / UNKNOWN.
2. DataService / adapter / ObservationBundle failure propagation guarantees UNKNOWN (never fabricated GO).
3. Active cyclone warning → strict NO_GO override.
4. Active squall / high-wave hazard → CAUTION / NO_GO override.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
import pytest

from backend.app.agents.integrations.contracts import ToolInvocationContext, ToolErrorCode
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    WeatherConditionsPayload,
)
from backend.app.contracts.observation import ObservationBundle
from backend.app.contracts.chat import (
    ConfidenceLevel,
    RecommendationStatus,
)
from backend.app.contracts.tools import ToolStatus
from backend.app.connectors.normalizers.incois import IncoisOSFNormalizer
from backend.app.connectors.normalizers.imd import ImdWeatherNormalizer, ImdHazardNormalizer
from backend.app.connectors.incois import IncoisOceanStateConnector
from backend.app.connectors.imd_weather import ImdWeatherConnector
from backend.app.domain.risk_engine import (
    CRAFT_THRESHOLDS,
    DeterministicRiskEngine,
    evaluate_deterministic_risk,
)
from backend.app.agents.integrations.adapters import ProviderToolAdapter
from backend.app.services.data_service import DataService


@pytest.fixture
def context() -> ToolInvocationContext:
    return ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
    )


@pytest.fixture
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture
def future_iso() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()


@pytest.fixture
def expired_iso() -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()


# =============================================================================
# SCENARIO A: Fresh Complete Observations
# =============================================================================

def test_scenario_a_fresh_complete_data(context, now_iso, future_iso):
    """Scenario A: Fresh complete observations produce normal deterministic evaluation."""
    # 1. Calm conditions -> GO
    bundle_calm = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=1.2,
            swell_height_m=0.8,
            swell_period_sec=8.0,
            surface_current_knots=1.0,
            sea_surface_temp_c=28.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="INCOIS Ocean State Forecast",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=12.0,
            wind_gust_knots=16.0,
            wind_direction_deg=240.0,
            visibility_km=10.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            bulletin_id="IMD-NORMAL-01",
            severity="NORMAL",
            headline="Calm coastal conditions",
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Hazard Division",
        ),
        data_mode="SYNTHETIC",
    )
    result_calm = evaluate_deterministic_risk(context, bundle=bundle_calm)
    assert result_calm.status == RecommendationStatus.GO
    assert result_calm.confidence_level == ConfidenceLevel.HIGH
    assert "Proceed" in result_calm.recommended_action

    # 2. Cautionary wave conditions (1.8m > 1.5m caution limit for motorized boat) -> CAUTION
    bundle_caution = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=1.8,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="INCOIS Ocean State Forecast",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=14.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Hazard Division",
        ),
    )
    result_caution = evaluate_deterministic_risk(context, bundle=bundle_caution)
    assert result_caution.status == RecommendationStatus.CAUTION
    assert any("Moderate wave height 1.8m requires caution" in f for f in result_caution.decisive_factors)


# =============================================================================
# SCENARIO B: Missing Marine Observations
# =============================================================================

def test_scenario_b_missing_marine(context, now_iso, future_iso):
    """Scenario B: Missing marine observations (None, missing SWH, -999.0) produce UNKNOWN."""
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=10.0,
        observed_at=now_iso,
        valid_to=future_iso,
    )
    hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        squall_alert=False,
        valid_from=now_iso,
        valid_to=future_iso,
    )

    # 1. Entire marine payload is None
    bundle_no_marine = ObservationBundle(marine=None, weather=weather, hazard=hazard)
    res_no_marine = evaluate_deterministic_risk(context, bundle=bundle_no_marine)
    assert res_no_marine.status == RecommendationStatus.UNKNOWN
    assert res_no_marine.confidence_level == ConfidenceLevel.LOW

    # 2. Marine payload present but significant_wave_height_m is None
    bundle_no_swh = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=None,
            observed_at=now_iso,
            valid_to=future_iso,
        ),
        weather=weather,
        hazard=hazard,
    )
    res_no_swh = evaluate_deterministic_risk(context, bundle=bundle_no_swh)
    assert res_no_swh.status == RecommendationStatus.UNKNOWN
    assert res_no_swh.confidence_level == ConfidenceLevel.LOW

    # 3. Raw source has sentinel -999.0 -> normalizer preserves None -> bundle -> UNKNOWN
    raw_osf_missing = {
        "harbor": "Ratnagiri",
        "swh": -999.0,  # Sentinel missing
        "observed_at": now_iso,
        "valid_to": future_iso,
    }
    normalized_marine = IncoisOSFNormalizer.normalize(raw_osf_missing)
    assert normalized_marine.significant_wave_height_m is None  # NOT coerced to 0.0 or 1.2

    bundle_sentinel = ObservationBundle(marine=normalized_marine, weather=weather, hazard=hazard)
    res_sentinel = evaluate_deterministic_risk(context, bundle=bundle_sentinel)
    assert res_sentinel.status == RecommendationStatus.UNKNOWN


# =============================================================================
# SCENARIO C: Missing Weather Observations
# =============================================================================

def test_scenario_c_missing_weather(context, now_iso, future_iso):
    """Scenario C: Missing weather observations produce UNKNOWN."""
    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.0,
        observed_at=now_iso,
        valid_to=future_iso,
    )
    hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        squall_alert=False,
        valid_from=now_iso,
        valid_to=future_iso,
    )

    # 1. Entire weather payload is None
    bundle_no_weather = ObservationBundle(marine=marine, weather=None, hazard=hazard)
    res_no_weather = evaluate_deterministic_risk(context, bundle=bundle_no_weather)
    assert res_no_weather.status == RecommendationStatus.UNKNOWN

    # 2. Weather payload present but wind_speed_knots is None
    bundle_no_wind = ObservationBundle(
        marine=marine,
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=None,
            observed_at=now_iso,
            valid_to=future_iso,
        ),
        hazard=hazard,
    )
    res_no_wind = evaluate_deterministic_risk(context, bundle=bundle_no_wind)
    assert res_no_wind.status == RecommendationStatus.UNKNOWN

    # 3. Raw IMD record with sentinel -999.0
    raw_weather_missing = {
        "harbor": "Ratnagiri",
        "wind_speed_knots": -999.0,
        "observed_at": now_iso,
        "valid_to": future_iso,
    }
    normalized_weather = ImdWeatherNormalizer.normalize(raw_weather_missing)
    assert normalized_weather.wind_speed_knots is None

    bundle_sentinel = ObservationBundle(marine=marine, weather=normalized_weather, hazard=hazard)
    res_sentinel = evaluate_deterministic_risk(context, bundle=bundle_sentinel)
    assert res_sentinel.status == RecommendationStatus.UNKNOWN


# =============================================================================
# SCENARIO D: Missing Hazard Observations
# =============================================================================

def test_scenario_d_missing_hazard(context, now_iso, future_iso):
    """Scenario D: Missing hazard observations produce UNKNOWN."""
    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.0,
        observed_at=now_iso,
        valid_to=future_iso,
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=10.0,
        observed_at=now_iso,
        valid_to=future_iso,
    )

    bundle_no_hazard = ObservationBundle(marine=marine, weather=weather, hazard=None)
    res = evaluate_deterministic_risk(context, bundle=bundle_no_hazard)
    assert res.status == RecommendationStatus.UNKNOWN
    assert res.confidence_level == ConfidenceLevel.LOW


# =============================================================================
# SCENARIOS E & F: Stale Marine / Weather Observations
# =============================================================================

def test_scenario_e_stale_marine(context, now_iso, future_iso, expired_iso):
    """Scenario E: Expired/stale marine observations produce UNKNOWN."""
    bundle_stale_marine = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=1.0,
            observed_at=(datetime.now(timezone.utc) - timedelta(hours=12)).isoformat(),
            valid_to=expired_iso,  # Stale
            source_name="INCOIS Ocean State Forecast",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=10.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            valid_from=now_iso,
            valid_to=future_iso,
        ),
    )
    res = evaluate_deterministic_risk(context, bundle=bundle_stale_marine)
    assert res.status == RecommendationStatus.UNKNOWN
    assert res.confidence_level == ConfidenceLevel.LOW
    assert any("expired" in factor.lower() or "stale" in factor.lower() for factor in res.decisive_factors)


def test_scenario_f_stale_weather(context, now_iso, future_iso, expired_iso):
    """Scenario F: Expired/stale weather observations produce UNKNOWN."""
    bundle_stale_weather = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=1.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="INCOIS Ocean State Forecast",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=10.0,
            observed_at=(datetime.now(timezone.utc) - timedelta(hours=12)).isoformat(),
            valid_to=expired_iso,  # Stale
            source_name="IMD Coastal Weather Bulletin",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            valid_from=now_iso,
            valid_to=future_iso,
        ),
    )
    res = evaluate_deterministic_risk(context, bundle=bundle_stale_weather)
    assert res.status == RecommendationStatus.UNKNOWN
    assert res.confidence_level == ConfidenceLevel.LOW


# =============================================================================
# SCENARIO G: Degraded Payload
# =============================================================================

def test_scenario_g_degraded_payload(context, now_iso, future_iso):
    """Scenario G: Degraded payloads (tagged with DEGRADED) produce UNKNOWN."""
    bundle_degraded = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=1.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="INCOIS OSF (DEGRADED — SENSOR_ERROR)",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=10.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            valid_from=now_iso,
            valid_to=future_iso,
        ),
    )
    res = evaluate_deterministic_risk(context, bundle=bundle_degraded)
    assert res.status == RecommendationStatus.UNKNOWN
    assert res.confidence_level == ConfidenceLevel.LOW
    assert any("degraded" in w.lower() for w in res.warnings)


# =============================================================================
# SCENARIO H: Upstream Connector / Provider Failure Handling
# =============================================================================

def test_scenario_h_upstream_failure_propagation(context):
    """Scenario H: Upstream provider failure guarantees UNKNOWN, never fabricated GO."""
    # 1. IncoisOceanStateConnector degraded payload produces UNKNOWN
    incois_conn = IncoisOceanStateConnector()
    incois_conn.data_mode = "SNAPSHOT"
    degraded_marine = incois_conn.get_marine_conditions(context)
    assert degraded_marine.significant_wave_height_m is None
    assert "DEGRADED" in degraded_marine.source_name

    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=10.0,
        observed_at=datetime.now(timezone.utc).isoformat(),
        valid_to=(datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(),
    )
    hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        squall_alert=False,
        valid_from=datetime.now(timezone.utc).isoformat(),
        valid_to=(datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(),
    )

    bundle_from_failed_incois = ObservationBundle(
        marine=degraded_marine,
        weather=weather,
        hazard=hazard,
    )
    res_incois_fail = evaluate_deterministic_risk(context, bundle=bundle_from_failed_incois)
    assert res_incois_fail.status == RecommendationStatus.UNKNOWN

    # 2. ImdWeatherConnector degraded payload produces UNKNOWN
    imd_conn = ImdWeatherConnector()
    imd_conn.data_mode = "SNAPSHOT"
    degraded_weather = imd_conn.get_weather_conditions(context)
    assert degraded_weather.wind_speed_knots is None
    assert "DEGRADED" in degraded_weather.source_name

    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.0,
        observed_at=datetime.now(timezone.utc).isoformat(),
        valid_to=(datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(),
    )
    bundle_from_failed_imd = ObservationBundle(
        marine=marine,
        weather=degraded_weather,
        hazard=hazard,
    )
    res_imd_fail = evaluate_deterministic_risk(context, bundle=bundle_from_failed_imd)
    assert res_imd_fail.status == RecommendationStatus.UNKNOWN

    # 3. ProviderToolAdapter handling provider exception -> ToolStatus.FAILED with ToolErrorCode
    def failing_provider(ctx):
        raise ConnectionResetError("Remote telemetry server disconnected")

    adapter_result = ProviderToolAdapter.adapt_marine_conditions(failing_provider, context)
    assert adapter_result.status == ToolStatus.FAILED
    assert adapter_result.error_code == ToolErrorCode.UPSTREAM_FAILURE.value


# =============================================================================
# SCENARIO I: Active Cyclone Hazard Override
# =============================================================================

def test_scenario_i_active_cyclone(context, now_iso, future_iso):
    """Scenario I: Active cyclone warning strictly triggers NO_GO override."""
    # Even if wave and wind are calm, active cyclone forces NO_GO
    bundle_cyclone = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=1.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="INCOIS Ocean State Forecast",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=10.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=True,
            squall_alert=True,
            bulletin_id="IMD-CYCLONE-ALERT-01",
            severity="WARNING",
            headline="Severe Cyclonic Storm Alert over Arabian Sea Coast",
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Cyclone Warning Division",
            freshness_flags={"is_official": True, "verified_live": True},
        ),
    )
    res = evaluate_deterministic_risk(context, bundle=bundle_cyclone, data_mode="LIVE")
    assert res.status == RecommendationStatus.NO_GO
    assert res.confidence_level == ConfidenceLevel.HIGH
    assert any("cyclone" in factor.lower() for factor in res.decisive_factors)
    assert "moored" in res.recommended_action.lower() or "not navigate" in res.recommended_action.lower()


# =============================================================================
# SCENARIO J: Active Squall / High-Wave Hazard
# =============================================================================

def test_scenario_j_active_squall_and_high_wave(context, now_iso, future_iso):
    """Scenario J: Squall alert and high wave hazard triggers CAUTION / NO_GO."""
    # 1. Squall alert with moderate wave -> CAUTION
    bundle_squall = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=1.2,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="INCOIS Ocean State Forecast",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=14.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=True,
            bulletin_id="IMD-SQUALL-01",
            severity="ALERT",
            headline="Squally weather warning with wind gusts up to 25 kt",
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Hazard Division",
        ),
    )
    res_squall = evaluate_deterministic_risk(context, bundle=bundle_squall)
    assert res_squall.status == RecommendationStatus.CAUTION
    assert any("squall" in factor.lower() for factor in res_squall.decisive_factors)

    # 2. Extreme wave height (3.2m > 2.5m NO_GO ceiling for motorized boat) -> NO_GO
    bundle_high_wave = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=3.2,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="INCOIS Ocean State Forecast",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=20.0,
            observed_at=now_iso,
            valid_to=future_iso,
            source_name="IMD Coastal Weather Bulletin",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            valid_from=now_iso,
            valid_to=future_iso,
            source_name="IMD Hazard Division",
        ),
    )
    res_high_wave = evaluate_deterministic_risk(context, bundle=bundle_high_wave)
    assert res_high_wave.status == RecommendationStatus.NO_GO
    assert any("wave height 3.2m exceeds safety ceiling" in factor.lower() for factor in res_high_wave.decisive_factors)


# =============================================================================
# SCENARIO K: Preserving Craft Thresholds
# =============================================================================

def test_scenario_k_craft_thresholds_intact():
    """Verify CRAFT_THRESHOLDS table is strictly intact and uncorrupted."""
    assert "traditional_non_motorized" in CRAFT_THRESHOLDS
    assert "motorized_boat" in CRAFT_THRESHOLDS
    assert "mechanized_trawler" in CRAFT_THRESHOLDS

    # Non-motorized limits
    assert CRAFT_THRESHOLDS["traditional_non_motorized"]["wave_caution_m"] == 1.0
    assert CRAFT_THRESHOLDS["traditional_non_motorized"]["wave_nogo_m"] == 1.5

    # Motorized boat limits
    assert CRAFT_THRESHOLDS["motorized_boat"]["wave_caution_m"] == 1.5
    assert CRAFT_THRESHOLDS["motorized_boat"]["wave_nogo_m"] == 2.5
    assert CRAFT_THRESHOLDS["motorized_boat"]["wind_caution_knots"] == 18.0
    assert CRAFT_THRESHOLDS["motorized_boat"]["wind_nogo_knots"] == 25.0

    # Mechanized trawler limits
    assert CRAFT_THRESHOLDS["mechanized_trawler"]["wave_caution_m"] == 2.2
    assert CRAFT_THRESHOLDS["mechanized_trawler"]["wave_nogo_m"] == 3.5
    assert CRAFT_THRESHOLDS["mechanized_trawler"]["wind_caution_knots"] == 24.0
    assert CRAFT_THRESHOLDS["mechanized_trawler"]["wind_nogo_knots"] == 35.0
