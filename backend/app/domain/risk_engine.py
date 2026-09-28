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
from datetime import UTC, datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Union
from pathlib import Path
import json

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
from backend.app.contracts.assessment import (
    DecisionBoundaryItem,
    DecisionStabilityPayload,
    SafeMissionWindow,
    CounterfactualFlipExplanation,
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
        hourly_records: Optional[List[Dict[str, Any]]] = None,
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
            except (ValueError, TypeError):
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
            except (ValueError, TypeError):
                window_end_utc = now_utc

        # ---------------------------------------------------------------------
        # 1. Provenance & Stale / Missing Data Validation
        # ---------------------------------------------------------------------
        marine_stale = False
        weather_stale = False
        hazard_stale = False
        forecast_coverage_incomplete = False

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
            marine_source = marine.source_name or "INCOIS Ocean State Forecast"
            marine_provider = "Open-Meteo" if "open-meteo" in marine_source.lower() else "INCOIS"
            prov_marine = DataProvenance(
                provider_name=marine_provider,
                source_name=marine_source,
                source_url=marine.source_url,
                observed_time=marine.observed_at,
                valid_to=marine.valid_to,
                data_mode=data_mode,
                is_stale=marine_stale,
                quality_flags=["official_source"] if not is_marine_degraded and marine_provider == "INCOIS" else (["fallback_model"] if not is_marine_degraded else ["degraded", "stale_telemetry"]),
            )
            provenance_list.append(prov_marine)
            evidence_ids.append(f"EV-{marine_provider.upper()}-OSF-01")

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
            weather_source = weather.source_name or "IMD Coastal Weather Bulletin"
            weather_provider = "Open-Meteo" if "open-meteo" in weather_source.lower() else "IMD"
            prov_weather = DataProvenance(
                provider_name=weather_provider,
                source_name=weather_source,
                source_url=weather.source_url,
                observed_time=weather.observed_at,
                valid_to=weather.valid_to,
                data_mode=data_mode,
                is_stale=weather_stale,
                quality_flags=["official_source"] if not is_weather_degraded and weather_provider == "IMD" else (["fallback_model"] if not is_weather_degraded else ["degraded", "stale_telemetry"]),
            )
            provenance_list.append(prov_weather)
            evidence_ids.append(f"EV-{weather_provider.upper()}-WEATHER-01")

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
            hazard_source = hazard.source_name or "IMD Hazard Division"
            hazard_provider = "IMD"
            prov_hazard = DataProvenance(
                provider_name=hazard_provider,
                source_name=hazard_source,
                source_url=hazard.source_url,
                valid_from=hazard.valid_from,
                valid_to=hazard.valid_to,
                data_mode=data_mode,
                is_stale=hazard_stale,
                quality_flags=["official_source"] if not is_hazard_degraded else ["degraded", "stale_bulletin"],
            )
            provenance_list.append(prov_hazard)
            evidence_ids.append(f"EV-{hazard_provider.upper()}-HAZARD-01")

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
        hazard_is_above_normal = bool(hazard and str(hazard.severity).upper() != "NORMAL")
        cyclone_active = bool(hazard and hazard_is_above_normal and hazard.cyclone_warning_active)
        squall_alert = bool(hazard and hazard_is_above_normal and hazard.squall_alert)

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

        # Evaluate the complete mission window from the same hourly series used
        # by routes and What-If. A safe departure cannot remain GO when the
        # fishing or return leg crosses the configured wave limit.
        if hourly_records and return_time is not None:
            window_records = []
            record_times = []
            for record in hourly_records:
                timestamp = record.get("observation_time") or record.get("timestamp_utc") or record.get("observed_at")
                if not timestamp:
                    continue
                try:
                    record_time = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
                    if record_time.tzinfo is None:
                        record_time = record_time.replace(tzinfo=timezone.utc)
                except (TypeError, ValueError):
                    continue
                if now_utc <= record_time <= window_end_utc:
                    wave = record.get("wave_height_m", record.get("swh"))
                    if wave is not None:
                        window_records.append(float(wave))
                record_times.append(record_time)

            if record_times and max(record_times) + timedelta(hours=1) < window_end_utc:
                forecast_coverage_incomplete = True
                warnings.append("TRIP_WINDOW_EXCEEDS_FORECAST: Forecast coverage ends before planned return.")

            if window_records:
                max_window_wave = max(window_records)
                if max_window_wave > limits["wave_caution_m"]:
                    threshold_checks.append(
                        ThresholdComparison(
                            metric_name="mission_window_wave_height_m",
                            observed_value=max_window_wave,
                            threshold_value=limits["wave_caution_m"],
                            operator=">",
                            unit="meters",
                            exceeded=True,
                            impact="CAUTION_TRIGGER",
                            description="The planned fishing and return window exceeds the wave limit.",
                        )
                    )
                    decisive_factors.append(
                        f"Mission window reaches {max_window_wave:.1f}m waves, above the {limits['wave_caution_m']:.1f}m operating limit before return."
                    )

        # ---------------------------------------------------------------------
        # 5. Final Deterministic Status Synthesis & Hard Constraints Hierarchy
        #    Hierarchy: SAFETY (Cyclones/Squall) -> LEGAL (Geofence) -> VESSEL (Wave/Wind) -> DATA INTEGRITY -> OPPORTUNITY
        # ---------------------------------------------------------------------
        has_nogo = any(tc.impact == "NO_GO_TRIGGER" for tc in threshold_checks)
        has_caution = any(tc.impact == "CAUTION_TRIGGER" for tc in threshold_checks)

        # Check if fallback sources (e.g. Open-Meteo or snapshot) were used for complete valid data
        is_fallback_source = any("fallback" in prov.quality_flags for prov in provenance_list)

        if has_nogo:
            status = RecommendationStatus.NO_GO
            summary = f"Severe marine conditions or hazards detected exceeding {craft_profile} safety ceiling."
            action = "Remain moored in port. Do not navigate under any circumstances."
            conf_reasons = ["Deterministic safety ceiling exceeded by official observations"]
            if is_data_degraded:
                warnings.append("Note: Secondary telemetry is also missing or degraded, but NO_GO prohibition takes precedence.")
        elif is_data_degraded or forecast_coverage_incomplete:
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

        if is_data_degraded:
            confidence_level = ConfidenceLevel.LOW
        elif is_fallback_source:
            confidence_level = ConfidenceLevel.MEDIUM
            conf_reasons.append("Evaluated using verified fallback marine model observations")
        else:
            confidence_level = ConfidenceLevel.HIGH

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
    hourly_records: Optional[List[Dict[str, Any]]] = None,
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
        hourly_records=hourly_records,
    )


# =============================================================================
# M1.4 Deterministic Decision Delta & Counterfactual Intelligence
# =============================================================================

def compute_decision_boundaries(
    threshold_checks: List[ThresholdComparison],
    craft_profile: str = "motorized_boat",
) -> List[DecisionBoundaryItem]:
    """Pure deterministic helper to calculate boundary proximity and margins (M1.4)."""
    limits = CRAFT_THRESHOLDS.get(craft_profile, CRAFT_THRESHOLDS[DEFAULT_CRAFT_PROFILE])
    boundaries: List[DecisionBoundaryItem] = []

    for tc in threshold_checks:
        if isinstance(tc.observed_value, bool) or isinstance(tc.threshold_value, bool):
            continue
        try:
            obs = float(tc.observed_value)
            thresh = float(tc.threshold_value)
        except (ValueError, TypeError):
            continue

        # Upper bound constraint (marine ceilings: wave, wind, gust)
        # margin = threshold - observed
        # For lower bound constraints: margin = observed - threshold
        if tc.operator in ("<", "<="):
            margin = obs - thresh
        else:
            margin = thresh - obs

        margin = round(margin, 2)
        margin_percent = round((margin / thresh) * 100.0, 1) if thresh != 0 else 0.0

        if tc.exceeded:
            target_tier = "GO"
        elif thresh == limits.get("wave_nogo_m") or thresh == limits.get("wind_nogo_knots") or thresh == limits.get("gust_nogo_knots"):
            target_tier = "NO_GO"
        else:
            target_tier = "CAUTION"

        boundaries.append(
            DecisionBoundaryItem(
                metric_name=tc.metric_name,
                observed_value=obs,
                threshold_value=thresh,
                operator=tc.operator,
                unit=tc.unit,
                margin=margin,
                margin_percent=margin_percent,
                target_tier=target_tier,
                is_nearest_boundary=False,
            )
        )

    # Determine nearest_boundary as smallest positive safe margin
    positive_margins = [b for b in boundaries if b.margin > 0]
    if positive_margins:
        nearest = min(positive_margins, key=lambda b: b.margin)
        nearest.is_nearest_boundary = True

    # Return ordered boundary list: nearest first, then positive by margin ascending, then breached
    boundaries.sort(key=lambda b: (not b.is_nearest_boundary, b.margin <= 0, b.margin))
    return boundaries


def compute_minimal_safe_adjustment(
    threshold_checks: List[ThresholdComparison],
) -> Optional[str]:
    """Compute minimal adjustment required to revert to safe state (M1.4)."""
    breached: List[Dict[str, Any]] = []

    for tc in threshold_checks:
        if not tc.exceeded:
            continue
        if isinstance(tc.observed_value, bool) or isinstance(tc.threshold_value, bool):
            continue
        try:
            obs = float(tc.observed_value)
            thresh = float(tc.threshold_value)
        except (ValueError, TypeError):
            continue

        delta = round(abs(obs - thresh), 2)
        breached.append({
            "metric_name": tc.metric_name,
            "delta": delta,
            "unit": tc.unit,
            "obs": obs,
            "thresh": thresh,
        })

    if not breached:
        return None

    # Select smallest required adjustment
    smallest = min(breached, key=lambda b: b["delta"])
    metric = smallest["metric_name"]
    delta = smallest["delta"]

    if metric == "significant_wave_height_m":
        return f"Reduce wave height by {delta:.1f}m to reach GO threshold."
    elif metric == "wind_speed_knots":
        return f"Reduce wind speed by {delta:.1f} kt to reach GO threshold."
    elif metric == "wind_gust_knots":
        return f"Reduce wind gust by {delta:.1f} kt to reach GO threshold."
    else:
        metric_clean = metric.replace("_", " ")
        return f"Reduce {metric_clean} by {delta:.1f} {smallest['unit']} to reach GO threshold."


def compute_sensitivity_ranking(
    threshold_checks: List[ThresholdComparison],
) -> List[str]:
    """Deterministic 3-tier sensitivity ranking (M1.4)."""
    tier1: List[str] = []
    tier2: List[tuple[float, str]] = []
    tier3: List[tuple[float, str]] = []

    for tc in threshold_checks:
        # Tier 1 checks: Severe hazards always first
        if tc.metric_name == "cyclone_warning_active" and bool(tc.observed_value):
            tier1.append("Cyclone warnings (Active IMD cyclone bulletin)")
        elif tc.metric_name == "squall_alert" and bool(tc.observed_value):
            tier1.append("Squall alerts (Active IMD squall warning)")
        elif tc.metric_name in ("geofence_restriction", "geofence") and bool(tc.observed_value):
            tier1.append("Geofence hazards (Restricted maritime zone)")

        # Numerical checks
        if isinstance(tc.observed_value, bool) or isinstance(tc.threshold_value, bool):
            continue
        try:
            obs = float(tc.observed_value)
            thresh = float(tc.threshold_value)
        except (ValueError, TypeError):
            continue

        unit = "m" if "m" in tc.unit else ("kt" if "knot" in tc.unit else tc.unit)
        label = (
            "Wave Height" if "wave" in tc.metric_name else
            "Wind Speed" if "wind_speed" in tc.metric_name else
            "Wind Gust" if "gust" in tc.metric_name else
            tc.metric_name.replace("_", " ").title()
        )

        if tc.exceeded:
            # Tier 2: Breached metrics sorted by (observed - threshold) / threshold descending
            ratio = (obs - thresh) / thresh if thresh != 0 else 0.0
            line = f"{label} (+{ratio * 100:.1f}% breach: {obs:.1f}{unit} vs {thresh:.1f}{unit} limit)"
            tier2.append((ratio, line))
        else:
            # Tier 3: Safe metrics sorted by (threshold - observed) / threshold ascending
            ratio = (thresh - obs) / thresh if thresh != 0 else 0.0
            line = f"{label} ({ratio * 100:.1f}% safe margin: {obs:.1f}{unit} vs {thresh:.1f}{unit} limit)"
            tier3.append((ratio, line))

    tier2.sort(key=lambda x: x[0], reverse=True)
    tier3.sort(key=lambda x: x[0])

    return tier1 + [x[1] for x in tier2] + [x[1] for x in tier3]


def compute_decision_stability(
    boundaries: List[DecisionBoundaryItem],
    threshold_checks: List[ThresholdComparison],
    bulletins_active: bool = False,
) -> DecisionStabilityPayload:
    """Assess deterministic recommendation stability level (M1.4)."""
    nearest = next((b for b in boundaries if b.is_nearest_boundary), None)
    has_breach = any(
        tc.exceeded and tc.impact in ("NO_GO_TRIGGER", "CAUTION_TRIGGER", "UNKNOWN_TRIGGER")
        for tc in threshold_checks
    ) or any(b.margin < 0 for b in boundaries)

    # Stability Rules:
    # LOW: active breached metric OR nearest margin < 10%
    # MEDIUM: nearest margin between 10% and 25% (or hazard bulletin active)
    # HIGH: all margins > 25% AND no active hazard bulletins
    if has_breach or (nearest and nearest.margin_percent < 10.0):
        level = "LOW"
    elif nearest and 10.0 <= nearest.margin_percent <= 25.0:
        level = "MEDIUM"
    elif nearest and nearest.margin_percent > 25.0:
        level = "MEDIUM" if bulletins_active else "HIGH"
    else:
        level = "LOW" if not boundaries else "MEDIUM"

    unit_str = f" {nearest.unit}" if nearest and nearest.unit else ""
    metric_str = nearest.metric_name.replace("_", " ") if nearest else "safety"

    if level == "LOW":
        if has_breach:
            headline = "Low Decision Stability — Active Breaches"
            reason = "Operating outside safe envelope with one or more threshold breaches."
        elif nearest:
            headline = "Low Decision Stability — Narrow Safety Margins"
            reason = f"Nearest margin on {metric_str} is only {nearest.margin_percent:.1f}% ({nearest.margin:.2f}{unit_str}). Highly vulnerable to weather shifts."
        else:
            headline = "Low Decision Stability — Degraded Telemetry"
            reason = "Safety margins cannot be validated due to missing or degraded telemetry."
    elif level == "MEDIUM":
        if bulletins_active:
            headline = "Moderate Decision Stability — Active Bulletin"
            reason = "Active atmospheric advisory in effect despite acceptable environmental margins."
        elif nearest:
            headline = "Moderate Decision Stability — Operational Buffers"
            reason = f"Nearest margin on {metric_str} is {nearest.margin_percent:.1f}% ({nearest.margin:.2f}{unit_str}). Monitor for deterioration."
        else:
            headline = "Moderate Decision Stability"
            reason = "Conditions are acceptable but warrant continuous vigilance."
    else:  # HIGH
        headline = "High Decision Stability — Robust Margins"
        reason = f"All environmental margins exceed 25% safety buffer (nearest buffer {nearest.margin_percent:.1f}% on {metric_str}) with no active hazard bulletins." if nearest else "All parameters comfortably within safe limits with no active hazard bulletins."

    min_adj = compute_minimal_safe_adjustment(threshold_checks)
    sensitivity = compute_sensitivity_ranking(threshold_checks)

    return DecisionStabilityPayload(
        level=level,
        headline=headline,
        reason=reason,
        nearest_boundary=nearest,
        minimal_safe_adjustment=min_adj,
        sensitivity_ranking=sensitivity,
    )


def attribute_counterfactual_flip(
    baseline_decision: str,
    simulated_decision: str,
    baseline_evidence: List[Union[ThresholdComparison, Dict[str, Any]]],
    simulated_evidence: List[Union[ThresholdComparison, Dict[str, Any]]],
) -> CounterfactualFlipExplanation:
    """Explain causal driver when a simulated scenario flips the decision (M1.4)."""
    b_dec = (baseline_decision or "UNKNOWN").upper()
    s_dec = (simulated_decision or "UNKNOWN").upper()
    flipped = (b_dec != s_dec)

    if not flipped:
        return CounterfactualFlipExplanation(
            baseline_decision=b_dec,
            simulated_decision=s_dec,
            decision_flipped=False,
            primary_cause_metric="none",
            observed_before="—",
            observed_after="—",
            threshold_crossed="—",
            explanation_text=f"Decision remained {b_dec}. No safety threshold boundaries were crossed.",
            minimal_adjustment_to_revert=None,
        )

    # Normalize evidence dictionaries
    b_map: Dict[str, Dict[str, Any]] = {}
    for item in baseline_evidence:
        d = item if isinstance(item, dict) else item.model_dump()
        if "metric_name" in d:
            b_map[d["metric_name"]] = d

    s_map: Dict[str, Dict[str, Any]] = {}
    for item in simulated_evidence:
        d = item if isinstance(item, dict) else item.model_dump()
        if "metric_name" in d:
            s_map[d["metric_name"]] = d

    candidates = []
    for metric, s_item in s_map.items():
        b_item = b_map.get(metric)
        s_obs = s_item.get("observed_value")
        s_thresh = s_item.get("threshold_value")
        b_obs = b_item.get("observed_value") if b_item else None

        if isinstance(s_obs, (int, float)) and isinstance(s_thresh, (int, float)):
            obs_after = float(s_obs)
            thresh = float(s_thresh)
            obs_before = float(b_obs) if isinstance(b_obs, (int, float)) else obs_after
            unit = s_item.get("unit", "")
            unit_str = "m" if "meter" in unit else ("kt" if "knot" in unit else unit)

            # Check if this metric crossed threshold into breach
            if s_item.get("exceeded") and (not b_item or not b_item.get("exceeded") or obs_after > obs_before):
                rel_severity = (obs_after - thresh) / thresh if thresh != 0 else 0.0
                candidates.append({
                    "metric": metric,
                    "obs_before": obs_before,
                    "obs_after": obs_after,
                    "threshold": thresh,
                    "unit": unit_str,
                    "impact": s_item.get("impact", "CAUTION_TRIGGER"),
                    "severity": rel_severity,
                })

    if candidates:
        primary = max(candidates, key=lambda c: c["severity"])
        metric_name = primary["metric"]
        metric_display = (
            "Significant Wave Height" if "wave" in metric_name else
            "Wind Speed" if "wind_speed" in metric_name else
            "Wind Gust" if "gust" in metric_name else
            metric_name.replace("_", " ").title()
        )
        tier_label = "NO_GO" if "NO_GO" in primary["impact"] else "CAUTION"
        delta = round(abs(primary["obs_after"] - primary["threshold"]), 2)

        exp_text = (
            f"Decision flipped {b_dec} → {s_dec}.\n\n"
            f"Primary Cause:\n{metric_display}\n\n"
            f"{primary['obs_before']:.1f}{primary['unit']} → {primary['obs_after']:.1f}{primary['unit']}\n\n"
            f"Crossed:\n{primary['threshold']:.1f}{primary['unit']} {tier_label} threshold."
        )
        revert_msg = f"Reduce {metric_display.lower()} by {delta:.1f}{primary['unit']} to revert to {b_dec}."

        return CounterfactualFlipExplanation(
            baseline_decision=b_dec,
            simulated_decision=s_dec,
            decision_flipped=True,
            primary_cause_metric=metric_display,
            observed_before=primary["obs_before"],
            observed_after=primary["obs_after"],
            threshold_crossed=primary["threshold"],
            explanation_text=exp_text,
            minimal_adjustment_to_revert=revert_msg,
        )

    # Fallback if no numerical metric breached
    return CounterfactualFlipExplanation(
        baseline_decision=b_dec,
        simulated_decision=s_dec,
        decision_flipped=True,
        primary_cause_metric="Severe Weather Bulletin",
        observed_before="Normal",
        observed_after="Active Bulletin",
        threshold_crossed="Normal Status",
        explanation_text=f"Decision flipped {b_dec} → {s_dec} due to an active weather advisory or craft restriction.",
        minimal_adjustment_to_revert=f"Wait for weather advisory clearance to revert to {b_dec}.",
    )


def compute_safe_window(
    craft_profile: str = "motorized_boat",
    hourly_records: Optional[List[Dict[str, Any]]] = None,
    reference_time: Optional[Union[datetime, str]] = None,
    trip_duration_hours: int = 4,
    current_status: Optional[Union[RecommendationStatus, str]] = None,
) -> SafeMissionWindow:
    """Find contiguous safe mission windows from hourly forecast series (M1.4)."""
    limits = CRAFT_THRESHOLDS.get(craft_profile, CRAFT_THRESHOLDS[DEFAULT_CRAFT_PROFILE])

    if hourly_records is None:
        try:
            from backend.app.connectors.snapshot import SnapshotConnector
            hourly_records = SnapshotConnector()._load_osf_fixture()
        except Exception:
            hourly_records = []

    # Parse reference time
    ref_dt: datetime
    if reference_time:
        if isinstance(reference_time, str):
            try:
                ref_dt = datetime.fromisoformat(reference_time.replace("Z", "+00:00"))
            except Exception:
                ref_dt = datetime(2026, 9, 12, 6, 0, tzinfo=timezone.utc)
        else:
            ref_dt = reference_time
    else:
        ref_dt = datetime(2026, 9, 12, 6, 0, tzinfo=timezone.utc)

    if ref_dt.tzinfo is None:
        ref_dt = ref_dt.replace(tzinfo=timezone.utc)

    # Classify each future hour
    evaluated_hours: List[Dict[str, Any]] = []
    for r in hourly_records:
        t_str = r.get("observation_time") or r.get("timestamp_utc") or r.get("observed_at")
        if not t_str:
            continue
        try:
            t_dt = datetime.fromisoformat(str(t_str).replace("Z", "+00:00"))
            if t_dt.tzinfo is None:
                t_dt = t_dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue

        if t_dt < ref_dt:
            continue

        swh = float(r.get("swh") or r.get("wave_height_m") or r.get("significant_wave_height_m") or 0.0)
        wspd = float(r.get("wind_speed_knots") or 0.0)
        gust = float(r.get("wind_gust_knots") or 0.0)

        if swh > limits["wave_nogo_m"] or wspd > limits["wind_nogo_knots"] or gust >= limits["gust_nogo_knots"]:
            h_status = "NO_GO"
        elif swh > limits["wave_caution_m"] or wspd >= limits["wind_caution_knots"]:
            h_status = "CAUTION"
        else:
            h_status = "GO"

        evaluated_hours.append({
            "dt": t_dt,
            "status": h_status,
            "swh": swh,
            "wspd": wspd,
        })

    evaluated_hours.sort(key=lambda h: h["dt"])

    def to_ist(dt: datetime) -> str:
        ist_dt = dt + timedelta(hours=5, minutes=30)
        return ist_dt.strftime("%H:%M IST")

    def to_ist_day(dt: datetime) -> str:
        ist_dt = dt + timedelta(hours=5, minutes=30)
        now_ist = ref_dt + timedelta(hours=5, minutes=30)
        if ist_dt.date() > now_ist.date():
            return f"Tomorrow {ist_dt.strftime('%H:%M')}"
        return ist_dt.strftime("%H:%M")

    # If no future hours evaluated
    if not evaluated_hours:
        is_safe = (current_status in (RecommendationStatus.GO, "GO"))
        return SafeMissionWindow(
            is_current_safe=is_safe,
            window_summary="Current departure conditions evaluated; forecast horizon telemetry unavailable for future hours.",
        )

    # Check if current departure is safe
    first_hour = evaluated_hours[0]
    is_current_safe = (first_hour["status"] == "GO")
    if current_status is not None:
        c_status_str = current_status.value if isinstance(current_status, RecommendationStatus) else str(current_status)
        if c_status_str != "GO":
            is_current_safe = False

    if is_current_safe:
        safe_end = first_hour["dt"]
        for h in evaluated_hours:
            if h["status"] == "GO":
                safe_end = h["dt"]
            else:
                break

        start_iso = first_hour["dt"].isoformat()
        end_iso = safe_end.isoformat()
        summary = f"Current departure window is safe until {to_ist(safe_end)}."
        return SafeMissionWindow(
            is_current_safe=True,
            recommended_window_start=start_iso,
            recommended_window_end=end_iso,
            earliest_safer_departure=start_iso,
            window_summary=summary,
        )

    # Current departure is unsafe / caution: Find first contiguous GO block meeting duration
    contiguous_blocks: List[List[Dict[str, Any]]] = []
    current_block: List[Dict[str, Any]] = []

    for h in evaluated_hours:
        if h["status"] == "GO":
            current_block.append(h)
        else:
            if current_block:
                contiguous_blocks.append(current_block)
                current_block = []
    if current_block:
        contiguous_blocks.append(current_block)

    target_block = next((b for b in contiguous_blocks if len(b) >= trip_duration_hours), None)
    if not target_block and contiguous_blocks:
        target_block = max(contiguous_blocks, key=len)

    if target_block:
        b_start = target_block[0]["dt"]
        b_end = target_block[-1]["dt"] + timedelta(hours=1)
        start_label = to_ist_day(b_start)
        end_label = (b_end + timedelta(hours=5, minutes=30)).strftime("%H:%M IST")

        summary = f"Earliest safer departure window: {start_label}–{end_label}."
        return SafeMissionWindow(
            is_current_safe=False,
            recommended_window_start=b_start.isoformat(),
            recommended_window_end=b_end.isoformat(),
            earliest_safer_departure=b_start.isoformat(),
            window_summary=summary,
        )

    return SafeMissionWindow(
        is_current_safe=False,
        recommended_window_start=None,
        recommended_window_end=None,
        earliest_safer_departure=None,
        window_summary="No safe departure window detected within the 24-hour forecast horizon.",
    )
