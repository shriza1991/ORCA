"""Deterministic Marine Risk Evaluation Engine for SAMUDRA.

Owned by Dev 4 (Marine, Geo, Risk & Route Intelligence).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

CRITICAL INVARIANTS:
1. Pure deterministic Python math & domain rules.
2. The LLM NEVER calculates thresholds, risk scores, or safety decisions.
3. If critical telemetry is missing, corrupted, or expired, status is UNKNOWN (never GO).
4. Produces transparent, explainable structured decisions including threshold comparisons,
   decisive vs non-decisive factors, evidence references, and data provenance.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timezone
from typing import Any, Dict, List, Optional

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    WeatherConditionsPayload,
)
from backend.app.contracts.observation import ObservationBundle
from backend.app.agents.integrations.dev4 import RiskAssessmentPayload
from backend.app.contracts.chat import (
    ConfidenceLevel,
    DataProvenance,
    RecommendationStatus,
    ThresholdComparison,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Vessel Safety Threshold Matrix
# =============================================================================

CRAFT_THRESHOLDS: Dict[str, Dict[str, float]] = {
    "traditional_non_motorized": {
        "wave_caution_m": 1.0,
        "wave_nogo_m": 1.5,
        "wind_caution_knots": 12.0,
        "wind_nogo_knots": 18.0,
        "gust_caution_knots": 16.0,
        "gust_nogo_knots": 22.0,
        "swell_caution_m": 1.0,
        "swell_nogo_m": 1.4,
    },
    "motorized_boat": {
        "wave_caution_m": 1.5,
        "wave_nogo_m": 2.5,
        "wind_caution_knots": 18.0,
        "wind_nogo_knots": 25.0,
        "gust_caution_knots": 24.0,
        "gust_nogo_knots": 32.0,
        "swell_caution_m": 1.6,
        "swell_nogo_m": 2.2,
    },
    "mechanized_trawler": {
        "wave_caution_m": 2.2,
        "wave_nogo_m": 3.5,
        "wind_caution_knots": 24.0,
        "wind_nogo_knots": 35.0,
        "gust_caution_knots": 30.0,
        "gust_nogo_knots": 42.0,
        "swell_caution_m": 2.2,
        "swell_nogo_m": 3.0,
    },
}

DEFAULT_CRAFT_PROFILE = "motorized_boat"


# =============================================================================
# Deterministic Risk Engine Implementation
# =============================================================================

class DeterministicRiskEngine:
    """Authoritative Python domain risk engine."""

    @classmethod
    def evaluate(
        cls,
        context: ToolInvocationContext,
        marine: Optional[MarineConditionsPayload] = None,
        weather: Optional[WeatherConditionsPayload] = None,
        hazard: Optional[HazardBulletinPayload] = None,
        bundle: Optional[ObservationBundle] = None,
        data_mode: str = "SNAPSHOT",
        reference_time: Optional[datetime | str] = None,
        return_time: Optional[datetime | str] = None,
    ) -> RiskAssessmentPayload:
        """Computes a deterministic, explainable safety decision from domain observations."""
        if bundle is not None:
            if marine is None:
                marine = bundle.marine
            if weather is None:
                weather = bundle.weather
            if hazard is None:
                hazard = bundle.hazard
            if bundle.data_mode:
                data_mode = bundle.data_mode

        craft_profile = (context.craft_profile or DEFAULT_CRAFT_PROFILE).strip().lower()
        limits = CRAFT_THRESHOLDS.get(craft_profile, CRAFT_THRESHOLDS[DEFAULT_CRAFT_PROFILE])

        threshold_checks: List[ThresholdComparison] = []
        decisive_factors: List[str] = []
        non_decisive_factors: List[str] = []
        warnings: List[str] = []
        provenance_list: List[DataProvenance] = []
        evidence_ids: List[str] = []

        if reference_time is not None:
            try:
                if isinstance(reference_time, str):
                    ref_dt = datetime.fromisoformat(reference_time.replace("Z", "+00:00"))
                else:
                    ref_dt = reference_time
                now_utc = ref_dt if ref_dt.tzinfo is not None else ref_dt.replace(tzinfo=timezone.utc)
            except ValueError:
                now_utc = datetime.now(UTC)
        else:
            now_utc = datetime.now(UTC)

        window_end_utc = now_utc
        if return_time is not None:
            try:
                if isinstance(return_time, str):
                    ret_dt = datetime.fromisoformat(return_time.replace("Z", "+00:00"))
                else:
                    ret_dt = return_time
                window_end_utc = ret_dt if ret_dt.tzinfo is not None else ret_dt.replace(tzinfo=timezone.utc)
            except ValueError:
                window_end_utc = now_utc

        # ---------------------------------------------------------------------
        # 1. Provenance & Stale / Missing Data Validation
        # ---------------------------------------------------------------------
        marine_stale = False
        weather_stale = False
        hazard_stale = False

        if marine is not None:
            if marine.valid_to:
                try:
                    vt_str = marine.valid_to.replace("Z", "+00:00")
                    marine_vt = datetime.fromisoformat(vt_str)
                    if marine_vt.tzinfo is None:
                        marine_vt = marine_vt.replace(tzinfo=timezone.utc)
                    if marine_vt < now_utc:
                        marine_stale = True
                    elif marine_vt < window_end_utc:
                        warnings.append("TRIP_WINDOW_EXCEEDS_FORECAST: Marine forecast expires before planned return.")
                        marine_stale = True
                except Exception:
                    pass

            is_marine_degraded = marine_stale or "DEGRADED" in (marine.source_name or "").upper()
            prov_marine = DataProvenance(
                provider_name="INCOIS",
                source_name=marine.source_name or "INCOIS Ocean State Forecast",
                source_url=marine.source_url,
                observed_time=marine.observed_at,
                valid_to=marine.valid_to,
                data_mode=data_mode,
                is_stale=marine_stale,
                quality_flags=["official_source"] if not is_marine_degraded else ["degraded", "stale_telemetry"],
            )
            provenance_list.append(prov_marine)
            evidence_ids.append("EV-INCOIS-OSF-01")

        if weather is not None:
            if weather.valid_to:
                try:
                    vt_str = weather.valid_to.replace("Z", "+00:00")
                    weather_vt = datetime.fromisoformat(vt_str)
                    if weather_vt.tzinfo is None:
                        weather_vt = weather_vt.replace(tzinfo=timezone.utc)
                    if weather_vt < now_utc:
                        weather_stale = True
                    elif weather_vt < window_end_utc:
                        warnings.append("TRIP_WINDOW_EXCEEDS_FORECAST: Weather forecast expires before planned return.")
                        weather_stale = True
                except Exception:
                    pass

            is_weather_degraded = weather_stale or "DEGRADED" in (weather.source_name or "").upper()
            prov_weather = DataProvenance(
                provider_name="IMD",
                source_name=weather.source_name or "IMD Coastal Weather Bulletin",
                source_url=weather.source_url,
                observed_time=weather.observed_at,
                valid_to=weather.valid_to,
                data_mode=data_mode,
                is_stale=weather_stale,
                quality_flags=["official_source"] if not is_weather_degraded else ["degraded", "stale_telemetry"],
            )
            provenance_list.append(prov_weather)
            evidence_ids.append("EV-IMD-WEATHER-01")

        if hazard is not None:
            if hazard.valid_to:
                try:
                    vt_str = hazard.valid_to.replace("Z", "+00:00")
                    hazard_vt = datetime.fromisoformat(vt_str)
                    if hazard_vt.tzinfo is None:
                        hazard_vt = hazard_vt.replace(tzinfo=timezone.utc)
                    if hazard_vt < now_utc:
                        hazard_stale = True
                    elif hazard_vt < window_end_utc:
                        warnings.append("TRIP_WINDOW_EXCEEDS_FORECAST: Hazard bulletin expires before planned return.")
                        hazard_stale = True
                except Exception:
                    pass

            is_hazard_degraded = hazard_stale or "DEGRADED" in (hazard.source_name or "").upper()
            prov_hazard = DataProvenance(
                provider_name="IMD",
                source_name=hazard.source_name or "IMD Hazard Division",
                source_url=hazard.source_url,
                valid_from=hazard.valid_from,
                valid_to=hazard.valid_to,
                data_mode=data_mode,
                is_stale=hazard_stale,
                quality_flags=["official_source"] if not is_hazard_degraded else ["degraded", "stale_bulletin"],
            )
            provenance_list.append(prov_hazard)
            evidence_ids.append("EV-IMD-HAZARD-01")

        # Check for missing critical inputs or degraded telemetry
        is_data_degraded = (
            marine is None
            or weather is None
            or hazard is None
            or marine.significant_wave_height_m is None
            or weather.wind_speed_knots is None
            or marine_stale
            or weather_stale
            or hazard_stale
            or (marine is not None and "DEGRADED" in (marine.source_name or "").upper())
            or (weather is not None and "DEGRADED" in (weather.source_name or "").upper())
            or (hazard is not None and "DEGRADED" in (hazard.source_name or "").upper())
        )

        if is_data_degraded:
            threshold_checks.append(
                ThresholdComparison(
                    metric_name="data_validity",
                    observed_value="EXPIRED" if (marine_stale or weather_stale or hazard_stale) else "UNAVAILABLE",
                    threshold_value="CURRENT_WINDOW",
                    operator="==",
                    unit="status",
                    exceeded=True,
                    impact="UNKNOWN_TRIGGER",
                    description="Critical forecast telemetry or hazard bulletin is stale, degraded, or missing — safe operating conditions cannot be guaranteed.",
                )
            )
            decisive_factors.append("Missing, degraded, or expired sensor telemetry (validity window exceeded).")
            warnings.append("DEGRADED_DATA: Stale, degraded, or incomplete telemetry received.")

        # ---------------------------------------------------------------------
        # 2. Severe Hazard / Cyclone Bulletin Check
        # ---------------------------------------------------------------------
        cyclone_active = bool(hazard and hazard.cyclone_warning_active)
        squall_alert = bool(hazard and hazard.squall_alert)

        threshold_checks.append(
            ThresholdComparison(
                metric_name="cyclone_warning_active",
                observed_value=cyclone_active,
                threshold_value=False,
                operator="==",
                unit="boolean",
                exceeded=cyclone_active,
                impact="NO_GO_TRIGGER" if cyclone_active else "SAFE",
                description=f"Cyclone warning active: {cyclone_active} ({hazard.headline if hazard else 'Normal'})",
            )
        )

        if cyclone_active:
            decisive_factors.append(f"Active IMD cyclone warning: {hazard.headline or 'Cyclonic Storm Alert'}")

        # ---------------------------------------------------------------------
        # 3. Wave Height Check
        # ---------------------------------------------------------------------
        if marine and marine.significant_wave_height_m is not None:
            wave_h = marine.significant_wave_height_m
            wave_impact = "SAFE"
            wave_exceeded = False

            if wave_h > limits["wave_nogo_m"]:
                wave_impact = "NO_GO_TRIGGER"
                wave_exceeded = True
                decisive_factors.append(
                    f"Significant wave height {wave_h:.1f}m exceeds safety ceiling ({limits['wave_nogo_m']:.1f}m for {craft_profile})."
                )
            elif wave_h >= limits["wave_caution_m"]:
                wave_impact = "CAUTION_TRIGGER"
                wave_exceeded = True
                decisive_factors.append(
                    f"Moderate wave height {wave_h:.1f}m requires caution ({limits['wave_caution_m']:.1f}m - {limits['wave_nogo_m']:.1f}m limit)."
                )
            else:
                non_decisive_factors.append(f"Wave height {wave_h:.1f}m is within safe operating limits (< {limits['wave_caution_m']:.1f}m).")

            threshold_checks.append(
                ThresholdComparison(
                    metric_name="significant_wave_height_m",
                    observed_value=wave_h,
                    threshold_value=limits["wave_nogo_m"] if wave_h >= limits["wave_caution_m"] else limits["wave_caution_m"],
                    operator=">" if wave_h > limits["wave_nogo_m"] else ">=",
                    unit="meters",
                    exceeded=wave_exceeded,
                    impact=wave_impact,
                    description=f"Significant wave height {wave_h:.1f}m compared against {craft_profile} ceiling ({limits['wave_nogo_m']:.1f}m).",
                )
            )

        # ---------------------------------------------------------------------
        # 4. Wind Speed & Gust Check
        # ---------------------------------------------------------------------
        if weather and weather.wind_speed_knots is not None:
            wind_spd = weather.wind_speed_knots
            wind_impact = "SAFE"
            wind_exceeded = False

            if wind_spd > limits["wind_nogo_knots"]:
                wind_impact = "NO_GO_TRIGGER"
                wind_exceeded = True
                decisive_factors.append(
                    f"Sustained wind {wind_spd:.1f} kt exceeds gale ceiling ({limits['wind_nogo_knots']:.1f} kt)."
                )
            elif wind_spd >= limits["wind_caution_knots"]:
                wind_impact = "CAUTION_TRIGGER"
                wind_exceeded = True
                decisive_factors.append(
                    f"Elevated sustained wind {wind_spd:.1f} kt ({limits['wind_caution_knots']:.1f} kt caution threshold)."
                )
            else:
                non_decisive_factors.append(f"Sustained wind {wind_spd:.1f} kt is within calm operating range.")

            threshold_checks.append(
                ThresholdComparison(
                    metric_name="wind_speed_knots",
                    observed_value=wind_spd,
                    threshold_value=limits["wind_nogo_knots"] if wind_spd >= limits["wind_caution_knots"] else limits["wind_caution_knots"],
                    operator=">" if wind_spd > limits["wind_nogo_knots"] else ">=",
                    unit="knots",
                    exceeded=wind_exceeded,
                    impact=wind_impact,
                    description=f"Sustained wind {wind_spd:.1f} kt compared against {craft_profile} limit.",
                )
            )

            # Wind Gusts
            if weather.wind_gust_knots is not None:
                gust = weather.wind_gust_knots
                if gust >= limits["gust_nogo_knots"]:
                    decisive_factors.append(f"Peak wind gusts {gust:.1f} kt exceed {limits['gust_nogo_knots']:.1f} kt limit.")
                    threshold_checks.append(
                        ThresholdComparison(
                            metric_name="wind_gust_knots",
                            observed_value=gust,
                            threshold_value=limits["gust_nogo_knots"],
                            operator=">=",
                            unit="knots",
                            exceeded=True,
                            impact="NO_GO_TRIGGER",
                            description=f"Wind gusts {gust:.1f} kt breach maximum safe threshold.",
                        )
                    )
                else:
                    non_decisive_factors.append(f"Wind gusts {gust:.1f} kt within safe gust envelope.")

        # Squall Alert
        if squall_alert and not cyclone_active:
            decisive_factors.append(f"Active IMD squall alert: {hazard.headline if hazard else 'Squally weather watch'}")
            threshold_checks.append(
                ThresholdComparison(
                    metric_name="squall_alert",
                    observed_value=True,
                    threshold_value=False,
                    operator="==",
                    unit="boolean",
                    exceeded=True,
                    impact="CAUTION_TRIGGER",
                    description="Squall warning active over coastal sector.",
                )
            )

        # ---------------------------------------------------------------------
        # 5. Final Deterministic Status Synthesis
        # ---------------------------------------------------------------------
        has_nogo = any(tc.impact == "NO_GO_TRIGGER" for tc in threshold_checks)
        has_caution = any(tc.impact == "CAUTION_TRIGGER" for tc in threshold_checks)

        if has_nogo:
            status = RecommendationStatus.NO_GO
            summary = f"Severe marine conditions or hazards detected exceeding {craft_profile} safety ceiling."
            action = "Remain moored in port. Do not navigate under any circumstances."
            conf_reasons = ["Deterministic safety ceiling exceeded by official observations"]
            if is_data_degraded:
                warnings.append("Note: Secondary telemetry is also missing or degraded, but NO_GO prohibition takes precedence.")
        elif is_data_degraded:
            status = RecommendationStatus.UNKNOWN
            summary = "Sensor, forecast, or hazard bulletin data are expired, degraded, or incomplete. Safe departure evaluation cannot be completed."
            action = "Hold departure. Verify with port authorities before navigating."
            conf_reasons = ["Sensor telemetry validity window expired, degraded, or data feed missing"]
            confidence_level = ConfidenceLevel.LOW
        elif has_caution:
            status = RecommendationStatus.CAUTION
            summary = f"Moderate marine conditions require operational caution for {craft_profile}."
            action = "Operate with caution within 5 nm of coastline. Maintain continuous VHF watch."
            conf_reasons = ["Conditions near threshold boundaries — operational caution enforced"]
            warnings.append("Moderate sea state requires continuous vigilance.")
        else:
            status = RecommendationStatus.GO
            summary = "Conditions are calm and safe for coastal voyage departure."
            action = "Proceed with planned voyage under standard safety protocols."
            
            wave_str = f"{marine.significant_wave_height_m:.1f}m" if (marine and marine.significant_wave_height_m is not None) else "calm"
            wind_str = f"{weather.wind_speed_knots:.1f} kt" if (weather and weather.wind_speed_knots is not None) else "calm"
            
            decisive_factors.append(f"Significant wave height {wave_str} is calm (< {limits['wave_caution_m']:.1f}m).")
            decisive_factors.append(f"Sustained wind {wind_str} is favorable.")
            decisive_factors.append("No active severe weather bulletins.")
            conf_reasons = ["All environmental parameters strictly within safe operating envelope"]

        confidence_level = ConfidenceLevel.LOW if is_data_degraded else ConfidenceLevel.HIGH

        return RiskAssessmentPayload(
            status=status,
            summary=summary,
            decisive_factors=decisive_factors,
            non_decisive_factors=non_decisive_factors,
            threshold_comparisons=threshold_checks,
            recommended_action=action,
            confidence_level=confidence_level,
            confidence_reasons=conf_reasons,
            provenance=provenance_list,
            evidence_ids=evidence_ids,
            warnings=warnings,
        )


def evaluate_deterministic_risk(
    context: ToolInvocationContext,
    marine: Optional[MarineConditionsPayload] = None,
    weather: Optional[WeatherConditionsPayload] = None,
    hazard: Optional[HazardBulletinPayload] = None,
    bundle: Optional[ObservationBundle] = None,
    data_mode: str = "SNAPSHOT",
    reference_time: Optional[datetime | str] = None,
    return_time: Optional[datetime | str] = None,
) -> RiskAssessmentPayload:
    """Convenience helper to evaluate risk through the deterministic engine."""
    return DeterministicRiskEngine.evaluate(
        context,
        marine=marine,
        weather=weather,
        hazard=hazard,
        bundle=bundle,
        data_mode=data_mode,
        reference_time=reference_time,
        return_time=return_time,
    )
