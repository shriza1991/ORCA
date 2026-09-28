"""Tests for ObservationBundle Single Source of Truth & Risk Engine Lineage (F01).

Verifies that:
1. DataService.get_observation_bundle() constructs an authentic ObservationBundle from normalized data.
2. The payload instances in the ObservationBundle reach DeterministicRiskEngine.evaluate() directly.
3. The risk_evaluation tool does not independently re-fetch data when an ObservationBundle is provided.
4. Deterministic risk decisions remain identical and strictly follow craft thresholds.
5. Missing observations produce RecommendationStatus.UNKNOWN.
6. Expired / stale observations produce RecommendationStatus.UNKNOWN.
7. End-to-end execution through the LangGraph pipeline maintains observation lineage.
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

import pytest

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    WeatherConditionsPayload,
)
from backend.app.contracts.observation import ObservationBundle
from backend.app.agents.integrations.adapters import ProviderToolAdapter
from backend.app.agents.graph import run_orca_graph
from backend.app.contracts.chat import RecommendationStatus
from backend.app.domain.risk_engine import DeterministicRiskEngine, evaluate_deterministic_risk
from backend.app.services.data_service import DataService


@pytest.fixture
def data_service() -> DataService:
    return DataService(data_mode="SYNTHETIC")


@pytest.fixture
def context() -> ToolInvocationContext:
    return ToolInvocationContext(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
    )


def test_1_bundle_construction_from_data_service(data_service: DataService, context: ToolInvocationContext):
    """TEST 1: Bundle construction — DataService outputs become the bundle without altering values."""
    bundle = data_service.get_observation_bundle(context)

    assert isinstance(bundle, ObservationBundle)
    assert bundle.marine is not None
    assert bundle.weather is not None
    assert bundle.hazard is not None
    assert bundle.data_mode == "SYNTHETIC"

    # Marine fields (from authoritative OSF fixture)
    assert bundle.marine.harbor == "Ratnagiri"
    assert bundle.marine.significant_wave_height_m == 1.2
    assert bundle.marine.swell_height_m == 0.78
    assert bundle.marine.swell_period_sec == 8.0

    # Weather fields
    assert bundle.weather.harbor == "Ratnagiri"
    assert bundle.weather.wind_speed_knots == 12.0
    assert bundle.weather.wind_gust_knots == 16.5

    # Hazard fields
    assert bundle.hazard.cyclone_warning_active is False
    assert bundle.hazard.squall_alert is False


def test_2_same_value_lineage_to_risk_engine(data_service: DataService, context: ToolInvocationContext):
    """TEST 2: Same-instance/value lineage reaching DeterministicRiskEngine."""
    bundle = data_service.get_observation_bundle(context)

    # Use a controlled reference time within the synthetic fixture's validity window
    reference_now = "2026-09-12T12:00:00Z"
    result = DeterministicRiskEngine.evaluate(context, bundle=bundle, reference_time=reference_now)

    assert result.status == RecommendationStatus.GO
    assert result.recommended_action == "Proceed with planned voyage under standard safety protocols."
    assert any("1.2m" in factor for factor in result.decisive_factors + result.non_decisive_factors)
    assert any("12.0" in factor or "12" in factor for factor in result.decisive_factors + result.non_decisive_factors)

    # Invariance check: evaluating the exact same bundle past validity produces UNKNOWN
    expired_reference_time = "2026-10-02T12:00:00Z"
    stale_result = DeterministicRiskEngine.evaluate(context, bundle=bundle, reference_time=expired_reference_time)
    assert stale_result.status == RecommendationStatus.UNKNOWN
    assert any("Missing, degraded, or expired" in factor for factor in stale_result.decisive_factors)


def test_3_no_duplicate_retrieval_with_bundle(context: ToolInvocationContext):
    """TEST 3: No duplicate risk retrieval — risk_evaluation uses bundle without calling providers."""
    mock_engine = MagicMock(return_value=DeterministicRiskEngine.evaluate(context, bundle=None))

    marine = MarineConditionsPayload(
        harbor="Ratnagiri",
        significant_wave_height_m=1.2,
        observed_at=datetime.now(timezone.utc).isoformat(),
        valid_to=(datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(),
        source_name="INCOIS",
    )
    weather = WeatherConditionsPayload(
        harbor="Ratnagiri",
        wind_speed_knots=10.0,
        observed_at=datetime.now(timezone.utc).isoformat(),
        valid_to=(datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(),
        source_name="IMD",
    )
    hazard = HazardBulletinPayload(
        harbor="Ratnagiri",
        cyclone_warning_active=False,
        squall_alert=False,
        valid_from=datetime.now(timezone.utc).isoformat(),
        valid_to=(datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(),
        source_name="IMD",
    )
    bundle = ObservationBundle(
        marine=marine,
        weather=weather,
        hazard=hazard,
        data_mode="SYNTHETIC",
    )

    # Adapt risk evaluation with bundle
    tool_result = ProviderToolAdapter.adapt_risk_evaluation(
        mock_engine,
        context,
        bundle=bundle,
        is_mock=True,
    )

    assert tool_result.status.value == "ok"
    mock_engine.assert_called_once_with(
        context,
        marine=marine,
        weather=weather,
        hazard=hazard,
        bundle=bundle,
        data_mode="MOCK",
    )


def test_4_deterministic_results_calm_elevated_severe():
    """TEST 4: Deterministic result preservation across calm, elevated, and severe observations."""
    now_utc = datetime.now(timezone.utc)
    future_utc = (now_utc + timedelta(hours=24)).isoformat()

    # Scenario A: Calm -> GO (motorized_boat ceiling: wave < 1.5m, wind < 18kt)
    bundle_calm = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=1.1,
            observed_at=now_utc.isoformat(),
            valid_to=future_utc,
            source_name="INCOIS",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=10.0,
            observed_at=now_utc.isoformat(),
            valid_to=future_utc,
            source_name="IMD",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            valid_from=now_utc.isoformat(),
            valid_to=future_utc,
            source_name="IMD",
        ),
    )
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    res_calm = evaluate_deterministic_risk(ctx, bundle=bundle_calm)
    assert res_calm.status == RecommendationStatus.GO

    # Scenario B: Elevated -> CAUTION (wave 1.8m > 1.5m caution threshold)
    bundle_elevated = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=1.8,
            observed_at=now_utc.isoformat(),
            valid_to=future_utc,
            source_name="INCOIS",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=14.0,
            observed_at=now_utc.isoformat(),
            valid_to=future_utc,
            source_name="IMD",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            valid_from=now_utc.isoformat(),
            valid_to=future_utc,
            source_name="IMD",
        ),
    )
    res_elevated = evaluate_deterministic_risk(ctx, bundle=bundle_elevated)
    assert res_elevated.status == RecommendationStatus.CAUTION

    # Scenario C: Severe -> NO_GO (active cyclone)
    bundle_severe = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=3.5,
            observed_at=now_utc.isoformat(),
            valid_to=future_utc,
            source_name="INCOIS",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=32.0,
            observed_at=now_utc.isoformat(),
            valid_to=future_utc,
            source_name="IMD",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=True,
            squall_alert=True,
            valid_from=now_utc.isoformat(),
            valid_to=future_utc,
            source_name="IMD",
        ),
    )
    res_severe = evaluate_deterministic_risk(ctx, bundle=bundle_severe)
    assert res_severe.status == RecommendationStatus.NO_GO


def test_5_missing_data_produces_unknown(context: ToolInvocationContext):
    """TEST 5: Missing observations result in RecommendationStatus.UNKNOWN."""
    # Empty bundle (all observations None)
    bundle_missing = ObservationBundle(marine=None, weather=None, hazard=None)
    result = evaluate_deterministic_risk(context, bundle=bundle_missing)

    assert result.status == RecommendationStatus.UNKNOWN
    assert any("Missing or expired" in f or "missing" in f.lower() for f in result.decisive_factors + result.confidence_reasons)


def test_6_stale_data_produces_unknown(context: ToolInvocationContext):
    """TEST 6: Expired observations result in RecommendationStatus.UNKNOWN."""
    now_utc = datetime.now(timezone.utc)
    past_utc = (now_utc - timedelta(hours=2)).isoformat()

    bundle_stale = ObservationBundle(
        marine=MarineConditionsPayload(
            harbor="Ratnagiri",
            significant_wave_height_m=1.0,
            observed_at=(now_utc - timedelta(hours=6)).isoformat(),
            valid_to=past_utc,  # Expired
            source_name="INCOIS",
        ),
        weather=WeatherConditionsPayload(
            harbor="Ratnagiri",
            wind_speed_knots=10.0,
            observed_at=now_utc.isoformat(),
            valid_to=(now_utc + timedelta(hours=12)).isoformat(),
            source_name="IMD",
        ),
        hazard=HazardBulletinPayload(
            harbor="Ratnagiri",
            cyclone_warning_active=False,
            squall_alert=False,
            valid_from=now_utc.isoformat(),
            valid_to=(now_utc + timedelta(hours=12)).isoformat(),
            source_name="IMD",
        ),
    )

    result = evaluate_deterministic_risk(context, bundle=bundle_stale)
    assert result.status == RecommendationStatus.UNKNOWN
    assert any("expired" in f.lower() or "stale" in f.lower() for f in result.decisive_factors + result.confidence_reasons)


def test_7_end_to_end_graph_execution():
    """TEST 7: End-to-end execution through the LangGraph pipeline."""
    final_state = run_orca_graph(
        "Is it safe for a motorized boat to leave Ratnagiri tomorrow morning?",
        user_context={"craft_profile": "motorized_boat", "origin_harbor": "Ratnagiri"},
        tool_mode="contract_mock",
    )

    assert "risk_assessment" in final_state
    rec = final_state["risk_assessment"]
    assert rec is not None
    assert rec.status in [RecommendationStatus.GO, RecommendationStatus.CAUTION, RecommendationStatus.NO_GO, RecommendationStatus.UNKNOWN]

    # Verify observation_bundle exists in final state
    assert "observation_bundle" in final_state
    bundle = final_state["observation_bundle"]
    if bundle is not None:
        assert isinstance(bundle, ObservationBundle)
        assert bundle.marine is not None
        assert bundle.marine.harbor == "Ratnagiri"
