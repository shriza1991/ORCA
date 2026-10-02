"""Deterministic Marine Risk Evaluation Engine for ORCA.

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
# Vessel Capability Profiles & Safety Threshold Matrix
# =============================================================================

VESSEL_CAPABILITIES: Dict[tuple[str, str], Dict[str, Any]] = {
    # Traditional Craft (<6m, 6–9m, 9–12m)
    ("traditional_craft", "small"): {
        "type_label": "Traditional Craft",
        "size_label": "Small",
        "display_name": "Small Traditional Craft (< 6m)",
        "label": "Small Traditional Craft",
        "length_desc": "< 6m",
        "wave_caution_m": 0.8,
        "wave_nogo_m": 1.2,
        "wind_caution_knots": 10.0,
        "wind_nogo_knots": 15.0,
        "gust_caution_knots": 14.0,
        "gust_nogo_knots": 18.0,
        "swell_caution_m": 0.8,
        "swell_nogo_m": 1.1,
        "speed_knots": 2.5,
        "hazard_sensitivity": "high",
        "description": "Small dugout, kattumaram or canoe (<6m) with minimal freeboard and stability in open water.",
    },
    ("traditional_craft", "medium"): {
        "type_label": "Traditional Craft",
        "size_label": "Medium",
        "display_name": "Medium Traditional Craft (6–9m)",
        "label": "Medium Traditional Craft",
        "length_desc": "6–9m",
        "wave_caution_m": 1.0,
        "wave_nogo_m": 1.5,
        "wind_caution_knots": 12.0,
        "wind_nogo_knots": 18.0,
        "gust_caution_knots": 16.0,
        "gust_nogo_knots": 22.0,
        "swell_caution_m": 1.0,
        "swell_nogo_m": 1.4,
        "speed_knots": 3.0,
        "hazard_sensitivity": "moderate_high",
        "description": "Plank-built boat or medium craft (6-9m) suitable for nearshore coastal fishing.",
    },
    ("traditional_craft", "large"): {
        "type_label": "Traditional Craft",
        "size_label": "Large",
        "display_name": "Large Traditional Craft (9–12m)",
        "label": "Large Traditional Craft",
        "length_desc": "9–12m",
        "wave_caution_m": 1.2,
        "wave_nogo_m": 1.8,
        "wind_caution_knots": 14.0,
        "wind_nogo_knots": 20.0,
        "gust_caution_knots": 18.0,
        "gust_nogo_knots": 24.0,
        "swell_caution_m": 1.2,
        "swell_nogo_m": 1.6,
        "speed_knots": 4.5,
        "hazard_sensitivity": "moderate",
        "description": "Large traditional wooden craft (9-12m) with enhanced freeboard and displacement hull.",
    },

    # Motorized Boat (<8m, 8–12m, >12m)
    ("motorized_boat", "small"): {
        "type_label": "Motorized Boat",
        "size_label": "Small",
        "display_name": "Small Motorized Boat (< 8m)",
        "label": "Small Motorized Boat",
        "length_desc": "< 8m",
        "wave_caution_m": 1.2,
        "wave_nogo_m": 2.0,
        "wind_caution_knots": 15.0,
        "wind_nogo_knots": 22.0,
        "gust_caution_knots": 20.0,
        "gust_nogo_knots": 28.0,
        "swell_caution_m": 1.3,
        "swell_nogo_m": 1.8,
        "speed_knots": 6.5,
        "hazard_sensitivity": "moderate",
        "description": "Small FRP boat or skiff with outboard motor (<8m) for inshore day-trips.",
    },
    ("motorized_boat", "medium"): {
        "type_label": "Motorized Boat",
        "size_label": "Medium",
        "display_name": "Medium Motorized Boat (8–12m)",
        "label": "Medium Motorized Boat",
        "length_desc": "8–12m",
        "wave_caution_m": 1.5,
        "wave_nogo_m": 2.5,
        "wind_caution_knots": 18.0,
        "wind_nogo_knots": 25.0,
        "gust_caution_knots": 24.0,
        "gust_nogo_knots": 32.0,
        "swell_caution_m": 1.6,
        "swell_nogo_m": 2.2,
        "speed_knots": 8.0,
        "hazard_sensitivity": "normal",
        "description": "Standard FRP motorized boat (8-12m) with inboard/outboard engine and VHF/GPS.",
    },
    ("motorized_boat", "large"): {
        "type_label": "Motorized Boat",
        "size_label": "Large",
        "display_name": "Large Motorized Boat (> 12m)",
        "label": "Large Motorized Boat",
        "length_desc": "> 12m",
        "wave_caution_m": 1.8,
        "wave_nogo_m": 2.8,
        "wind_caution_knots": 20.0,
        "wind_nogo_knots": 28.0,
        "gust_caution_knots": 26.0,
        "gust_nogo_knots": 35.0,
        "swell_caution_m": 1.8,
        "swell_nogo_m": 2.5,
        "speed_knots": 11.0,
        "hazard_sensitivity": "normal",
        "description": "High-capacity motorized craft (>12m) with enclosed wheelhouse and extended range.",
    },

    # Mechanized Trawler (<15m, 15–20m, >20m)
    ("mechanized_trawler", "small"): {
        "type_label": "Mechanized Trawler",
        "size_label": "Small",
        "display_name": "Small Trawler (< 15m)",
        "label": "Small Trawler",
        "length_desc": "< 15m",
        "wave_caution_m": 1.8,
        "wave_nogo_m": 2.8,
        "wind_caution_knots": 20.0,
        "wind_nogo_knots": 28.0,
        "gust_caution_knots": 26.0,
        "gust_nogo_knots": 36.0,
        "swell_caution_m": 1.8,
        "swell_nogo_m": 2.6,
        "speed_knots": 8.0,
        "hazard_sensitivity": "normal",
        "description": "Coastal mechanized trawler (<15m) operating within territorial waters.",
    },
    ("mechanized_trawler", "medium"): {
        "type_label": "Mechanized Trawler",
        "size_label": "Medium",
        "display_name": "Medium Trawler (15–20m)",
        "label": "Medium Trawler",
        "length_desc": "15–20m",
        "wave_caution_m": 2.2,
        "wave_nogo_m": 3.5,
        "wind_caution_knots": 24.0,
        "wind_nogo_knots": 35.0,
        "gust_caution_knots": 30.0,
        "gust_nogo_knots": 42.0,
        "swell_caution_m": 2.2,
        "swell_nogo_m": 3.0,
        "speed_knots": 10.0,
        "hazard_sensitivity": "resilient",
        "description": "Standard offshore commercial trawler (15-20m) equipped for multi-day voyages.",
    },
    ("mechanized_trawler", "large"): {
        "type_label": "Mechanized Trawler",
        "size_label": "Large",
        "display_name": "Large Trawler (> 20m)",
        "label": "Large Trawler",
        "length_desc": "> 20m",
        "wave_caution_m": 2.5,
        "wave_nogo_m": 4.0,
        "wind_caution_knots": 28.0,
        "wind_nogo_knots": 40.0,
        "gust_caution_knots": 35.0,
        "gust_nogo_knots": 48.0,
        "swell_caution_m": 2.5,
        "swell_nogo_m": 3.4,
        "speed_knots": 12.0,
        "hazard_sensitivity": "resilient",
        "description": "Deep-sea industrial trawler (>20m) with heavy displacement and all-weather navigation aids.",
    },
}

DEFAULT_CRAFT_PROFILE = "motorized_boat"
DEFAULT_VESSEL_SIZE = "medium"


def normalize_craft_profile(profile: Optional[str]) -> str:
    p = (profile or DEFAULT_CRAFT_PROFILE).strip().lower()
    if p in ("traditional_craft", "traditional_non_motorized", "traditional"):
        return "traditional_craft"
    if p in ("mechanized_trawler", "trawler"):
        return "mechanized_trawler"
    return "motorized_boat"


def normalize_vessel_size(size: Optional[str]) -> str:
    s = (size or DEFAULT_VESSEL_SIZE).strip().lower()
    if s in ("small", "medium", "large"):
        return s
    return "medium"


def get_vessel_capability(craft_profile: Optional[str], vessel_size: Optional[str] = "medium") -> Dict[str, Any]:
    norm_craft = normalize_craft_profile(craft_profile)
    norm_size = normalize_vessel_size(vessel_size)
    cap = VESSEL_CAPABILITIES.get((norm_craft, norm_size))
    if cap is None:
        cap = VESSEL_CAPABILITIES.get((norm_craft, "medium"))
    if cap is None:
        cap = VESSEL_CAPABILITIES.get(("motorized_boat", "medium"))
    return cap


# Backward-compatible dictionary referencing the canonical medium profile
CRAFT_THRESHOLDS: Dict[str, Dict[str, float]] = {
    "traditional_non_motorized": {
        k: float(v) for k, v in VESSEL_CAPABILITIES[("traditional_craft", "medium")].items() if isinstance(v, (int, float))
    },
    "traditional_craft": {
        k: float(v) for k, v in VESSEL_CAPABILITIES[("traditional_craft", "medium")].items() if isinstance(v, (int, float))
    },
    "motorized_boat": {
        k: float(v) for k, v in VESSEL_CAPABILITIES[("motorized_boat", "medium")].items() if isinstance(v, (int, float))
    },
    "mechanized_trawler": {
        k: float(v) for k, v in VESSEL_CAPABILITIES[("mechanized_trawler", "medium")].items() if isinstance(v, (int, float))
    },
}


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
        vessel_size = getattr(context, "vessel_size", None) or DEFAULT_VESSEL_SIZE
        capability = get_vessel_capability(craft_profile, vessel_size)
        limits = capability
        vessel_label = capability.get("label") or craft_profile

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
                now_utc = datetime.now(timezone.utc)
        else:
            now_utc = datetime.now(timezone.utc)

        def parse_to_utc(dt_val: Any) -> Optional[datetime]:
            if not dt_val:
                return None
            try:
                if isinstance(dt_val, datetime):
                    return dt_val.astimezone(timezone.utc) if dt_val.tzinfo else dt_val.replace(tzinfo=timezone.utc)
                if isinstance(dt_val, str):
                    s = dt_val.strip()
                    if s.endswith("Z"):
                        s = s[:-1] + "+00:00"
                    dt = datetime.fromisoformat(s)
                    return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            except Exception:
                return None
            return None

        # Assessment / departure target time for validity checks
        eval_time_utc = parse_to_utc(context.departure_time) if hasattr(context, "departure_time") else None
        if eval_time_utc is None:
            eval_time_utc = now_utc

        window_end_utc = eval_time_utc
        if return_time is not None:
            ret_parsed = parse_to_utc(return_time)
            if ret_parsed is not None:
                window_end_utc = ret_parsed

        # ---------------------------------------------------------------------
        # 1. Provenance & Stale / Missing Data Validation
        # ---------------------------------------------------------------------
        marine_stale = False
        weather_stale = False
        hazard_stale = False
        forecast_coverage_incomplete = False

        def provenance_quality(source_name: str, degraded: bool, official: bool) -> list[str]:
            normalized_source = (source_name or "").upper()
            if any(marker in normalized_source for marker in ("ORCA", "DEMO", "SYNTHETIC", "MOCK", "FIXTURE", "SIMULATION")):
                return ["deterministic_demo"] if not degraded else ["degraded", "stale_demo_data"]
            if degraded:
                return ["degraded", "stale_telemetry"]
            return ["official_source"] if official else ["fallback_model"]

        is_operational = data_mode.upper() in ("LIVE", "HYBRID")

        prov_marine: Optional[DataProvenance] = None
        prov_weather: Optional[DataProvenance] = None
        prov_hazard: Optional[DataProvenance] = None

        if marine is not None:
            marine_vt = parse_to_utc(marine.valid_to)
            marine_vf = parse_to_utc(getattr(marine, "valid_from", None)) or parse_to_utc(marine.observed_at)
            if marine_vt is None:
                if is_operational:
                    marine_stale = True
            elif marine_vt < eval_time_utc:
                marine_stale = True
            elif is_operational and marine_vf and marine_vf > eval_time_utc:
                marine_stale = True
            elif marine_vt < window_end_utc:
                warnings.append("TRIP_WINDOW_EXCEEDS_FORECAST: Marine forecast expires before planned return.")
                marine_stale = True

            is_marine_degraded = marine_stale or "DEGRADED" in (marine.source_name or "").upper()
            marine_source = marine.source_name or "INCOIS Ocean State Forecast"
            marine_provider = "Open-Meteo" if "open-meteo" in marine_source.lower() else "INCOIS"
            from backend.app.agents.integrations.adapters import ProviderToolAdapter
            marine_mode, marine_flags = ProviderToolAdapter._resolve_provenance(
                marine, is_mock=(data_mode == "MOCK"), eval_time_iso=eval_time_utc.isoformat() if eval_time_utc else None
            )
            prov_marine = DataProvenance(
                provider_name=marine_provider,
                source_name=marine_source,
                source_url=marine.source_url,
                observed_time=marine.observed_at,
                valid_from=getattr(marine, "valid_from", None),
                valid_to=marine.valid_to,
                data_mode=marine_mode,
                lineage_id=ProviderToolAdapter._resolve_lineage(marine, marine_mode, is_mock=(data_mode == "MOCK")),
                retrieved_at=now_utc.isoformat(),
                is_stale=marine_stale or ("stale" in marine_flags or "EXPIRED" in marine_flags),
                quality_flags=marine_flags,
            )
            provenance_list.append(prov_marine)
            evidence_ids.append(f"EV-{marine_provider.upper()}-OSF-01")

        if weather is not None:
            weather_vt = parse_to_utc(weather.valid_to)
            weather_vf = parse_to_utc(getattr(weather, "valid_from", None)) or parse_to_utc(weather.observed_at)
            if weather_vt is None:
                if is_operational:
                    weather_stale = True
            elif weather_vt < eval_time_utc:
                weather_stale = True
            elif is_operational and weather_vf and weather_vf > eval_time_utc:
                weather_stale = True
            elif weather_vt < window_end_utc:
                warnings.append("TRIP_WINDOW_EXCEEDS_FORECAST: Weather forecast expires before planned return.")
                weather_stale = True

            is_weather_degraded = weather_stale or "DEGRADED" in (weather.source_name or "").upper()
            weather_source = weather.source_name or "IMD Coastal Weather Bulletin"
            weather_provider = "Open-Meteo" if "open-meteo" in weather_source.lower() else "IMD"
            from backend.app.agents.integrations.adapters import ProviderToolAdapter
            weather_mode, weather_flags = ProviderToolAdapter._resolve_provenance(
                weather, is_mock=(data_mode == "MOCK"), eval_time_iso=eval_time_utc.isoformat() if eval_time_utc else None
            )
            prov_weather = DataProvenance(
                provider_name=weather_provider,
                source_name=weather_source,
                source_url=weather.source_url,
                observed_time=weather.observed_at,
                valid_from=getattr(weather, "valid_from", None),
                valid_to=weather.valid_to,
                data_mode=weather_mode,
                lineage_id=ProviderToolAdapter._resolve_lineage(weather, weather_mode, is_mock=(data_mode == "MOCK")),
                retrieved_at=now_utc.isoformat(),
                is_stale=weather_stale or ("stale" in weather_flags or "EXPIRED" in weather_flags),
                quality_flags=weather_flags,
            )
            provenance_list.append(prov_weather)
            evidence_ids.append(f"EV-{weather_provider.upper()}-WEATHER-01")

        if hazard is not None:
            hazard_vt = parse_to_utc(hazard.valid_to)
            hazard_vf = parse_to_utc(hazard.valid_from)
            if hazard_vt is None:
                if is_operational or (hazard.severity in (None, "UNKNOWN")) or ("UNAVAILABLE" in (hazard.source_name or "").upper()):
                    hazard_stale = True
            elif hazard_vt < eval_time_utc:
                hazard_stale = True
            elif is_operational and hazard_vf and hazard_vf > window_end_utc:
                hazard_stale = True
            elif hazard_vt < window_end_utc:
                # The controlled scenario retains the complete applicable bulletin
                # corpus. A warning ending mid-trip does not expire that corpus.
                flags = hazard.freshness_flags or {}
                scenario_end = parse_to_utc(flags.get("coverage_end")) if data_mode.upper() == "DEMO" and "hazard_records" in flags else None
                if scenario_end is None or scenario_end < window_end_utc:
                    warnings.append("TRIP_WINDOW_EXCEEDS_FORECAST: Hazard bulletin expires before planned return.")
                    hazard_stale = True

            if is_operational and hazard.severity in (None, "UNKNOWN"):
                hazard_stale = True

            is_hazard_degraded = hazard_stale or "DEGRADED" in (hazard.source_name or "").upper() or "UNAVAILABLE" in (hazard.source_name or "").upper()
            hazard_source = hazard.source_name or "IMD Hazard Division"
            hazard_provider = "IMD"
            from backend.app.agents.integrations.adapters import ProviderToolAdapter
            hazard_mode, hazard_flags = ProviderToolAdapter._resolve_provenance(
                hazard, is_mock=(data_mode == "MOCK"), eval_time_iso=eval_time_utc.isoformat() if eval_time_utc else None
            )
            prov_hazard = DataProvenance(
                provider_name=hazard_provider,
                source_name=hazard_source,
                source_url=hazard.source_url,
                observed_time=getattr(hazard, "observed_at", None) or getattr(hazard, "issued_at", None),
                valid_from=hazard.valid_from,
                valid_to=hazard.valid_to,
                data_mode=hazard_mode,
                lineage_id=ProviderToolAdapter._resolve_lineage(hazard, hazard_mode, is_mock=(data_mode == "MOCK")),
                retrieved_at=now_utc.isoformat(),
                is_stale=hazard_stale or ("stale" in hazard_flags or "EXPIRED" in hazard_flags),
                quality_flags=hazard_flags,
            )
            provenance_list.append(prov_hazard)
            evidence_ids.append(f"EV-{hazard_provider.upper()}-HAZARD-01")

        def _is_prov_simulated(prov: Optional[DataProvenance]) -> bool:
            if not prov:
                return False
            mode = str(getattr(prov, "data_mode", "") or "").upper()
            if mode in ("MOCK", "SIMULATED", "SNAPSHOT", "SYNTHETIC", "DEMO"):
                return True
            s_name = str(getattr(prov, "source_name", "") or "").lower()
            if any(marker in s_name for marker in ("demo", "synthetic", "mock", "fixture", "simulation", "snapshot")):
                return True
            for flag in getattr(prov, "quality_flags", []) or []:
                f_lower = str(flag).lower()
                if any(marker in f_lower for marker in ("demo", "synthetic", "mock", "simulated", "fixture", "snapshot_source", "m1_demo_data", "m2_contract_mock")):
                    return True
            return False

        def _is_prov_verified_official(prov: Optional[DataProvenance], payload: Any = None) -> bool:
            """Determine if a telemetry or hazard source is an authentically verified official observation.

            Being non-simulated, fresh, or geographically applicable does NOT establish verification.
            Verification must be established through structured provider/verification metadata.
            Must NOT infer verification merely from application mode or provider-like source names.
            Fallback models and unverified feeds never acquire official verification.
            """
            if not prov:
                return False
            if _is_prov_simulated(prov):
                return False

            prov_mode = str(getattr(prov, "data_mode", "") or "").upper()
            if prov_mode in ("MOCK", "SIMULATED", "SNAPSHOT", "SYNTHETIC", "DEMO", "HYBRID", "UNVERIFIED", "UNAVAILABLE", "FALLBACK", "PHYSICAL_FALLBACK_MODEL"):
                return False

            flags = [str(f).lower() for f in (getattr(prov, "quality_flags", []) or [])]
            if any(marker in flags for marker in ("fallback", "fallback_model", "geographic_fallback", "unverified", "degraded", "unavailable", "simulated", "deterministic_demo", "m2_contract_mock")):
                return False

            s_name = str(getattr(prov, "source_name", "") or "").lower()
            p_name = str(getattr(prov, "provider_name", "") or "").lower()
            if any(marker in s_name for marker in ("fallback", "unverified", "degraded", "unavailable", "open-meteo", "synthetic")):
                return False
            if any(marker in p_name for marker in ("fallback", "unverified", "degraded", "unavailable", "open-meteo", "synthetic")):
                return False

            freshness = getattr(payload, "freshness_flags", {}) if payload else {}
            if not isinstance(freshness, dict):
                freshness = {}
            if freshness.get("fallback_model") or freshness.get("is_fallback") or freshness.get("fallback"):
                return False
            cov_status = str(freshness.get("coverage_status", "")).upper()
            if cov_status in ("FALLBACK", "FALLBACK_MODEL", "GEOGRAPHIC_FALLBACK", "UNAVAILABLE", "UNVERIFIED", "SYNTHETIC_DATA"):
                return False

            is_official_authority = any(auth in p_name.upper() or auth in s_name.upper() for auth in ("IMD", "INCOIS", "INHO", "DG_SHIPPING", "GOVERNMENT"))
            has_official = (
                "official_source" in flags
                or bool(freshness.get("is_official"))
                or cov_status in ("OFFICIAL_STATION", "OFFICIAL_BULLETIN")
            ) and is_official_authority

            has_verified_live = (
                "verified_live" in flags
                or bool(freshness.get("verified_live"))
            )
            return bool(has_verified_live and has_official)

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
            or (hazard is not None and ("DEGRADED" in (hazard.source_name or "").upper() or "UNAVAILABLE" in (hazard.source_name or "").upper()))
        )

        is_geo_fallback = False
        for p in (marine, weather, hazard):
            if p is not None:
                ff = getattr(p, "freshness_flags", None)
                if isinstance(ff, dict) and ff.get("coverage_status") == "GEOGRAPHIC_FALLBACK":
                    is_geo_fallback = True
                    break
                if "GEOGRAPHIC_FALLBACK" in (getattr(p, "source_name", "") or ""):
                    is_geo_fallback = True
                    break

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

        if is_geo_fallback:
            threshold_checks.append(
                ThresholdComparison(
                    metric_name="geographic_coverage",
                    observed_value="GEOGRAPHIC_FALLBACK",
                    threshold_value="LOCAL_HARBOR_COVERAGE",
                    operator="==",
                    unit="status",
                    exceeded=True,
                    impact="UNKNOWN_TRIGGER",
                    description=(
                        f"Authoritative marine/weather coverage is unavailable for '{context.origin_harbor or 'the requested harbor'}'. "
                        f"Reference data from Ratnagiri cannot certify voyage safety."
                    ),
                )
            )
            decisive_factors.append(
                f"No authoritative local observations for {context.origin_harbor or 'harbor'} (Ratnagiri fallback)."
            )
            warnings.append(
                f"GEOGRAPHIC_FALLBACK: Local station observations unavailable for '{context.origin_harbor or 'harbor'}'. "
                f"Ratnagiri baseline data cannot certify departure safety."
            )

        # ---------------------------------------------------------------------
        # 2. Severe Hazard / Cyclone Bulletin Check (Deterministic Verification)
        # ---------------------------------------------------------------------
        hazard_is_above_normal = bool(hazard and str(hazard.severity).upper() not in ("NORMAL", "UNKNOWN"))

        # Geographic applicability check
        is_geo_applicable = True
        if hazard and hazard.harbor and hasattr(context, "origin_harbor") and context.origin_harbor:
            h_harbor = hazard.harbor.strip().lower()
            c_harbor = context.origin_harbor.strip().lower()
            if h_harbor and c_harbor and h_harbor != c_harbor:
                if h_harbor not in ("all", "coastal", "regional", "west_coast", "maharashtra", "india", "arabian_sea"):
                    is_geo_applicable = False
                    warnings.append(
                        f"HAZARD_GEO_MISMATCH: Hazard bulletin issued for '{hazard.harbor}' does not apply to voyage harbor '{context.origin_harbor}'."
                    )

        # Validity window check
        hazard_vf_dt = parse_to_utc(hazard.valid_from) if hazard else None
        hazard_vt_dt = parse_to_utc(hazard.valid_to) if hazard else None
        has_valid_window = bool(hazard and hazard_vf_dt is not None and hazard_vt_dt is not None)
        is_within_window = bool(has_valid_window and hazard_vf_dt <= window_end_utc and hazard_vt_dt >= eval_time_utc)
        is_future_bulletin = bool(has_valid_window and hazard_vf_dt > eval_time_utc)
        is_expired_bulletin = bool(has_valid_window and hazard_vt_dt < eval_time_utc)

        # Verified active hazard requires:
        # - Geographic applicability
        # - Well-formed validity window (both valid_from and valid_to parseable)
        # - Valid warning interval overlaps the requested mission
        # - A short horizon does not erase a known restriction
        # - Malformed windows and unavailable/degraded sources cannot establish it
        # Official/live verification is checked separately below.
        is_active_hazard = bool(
            hazard
            and is_geo_applicable
            and is_within_window
            and hazard_vf_dt <= hazard_vt_dt
            and not any(x in (hazard.source_name or "").upper() for x in ("DEGRADED", "UNAVAILABLE"))
            and hazard_is_above_normal
        )
        is_verified_live_hazard = bool(
            is_active_hazard
            and _is_prov_verified_official(prov_hazard, hazard)
        )
        is_active_verified_hazard = is_verified_live_hazard

        cyclone_active = bool(is_active_hazard and hazard.cyclone_warning_active)
        squall_alert = bool(is_active_hazard and hazard.squall_alert)
        severe_hazard_active = bool(is_active_hazard and str(hazard.severity).upper() in ("WARNING", "DANGER"))

        # Informative transparency for non-active hazard bulletins:
        if hazard and hazard_is_above_normal:
            if not is_geo_applicable:
                non_decisive_factors.append(
                    f"Geographically inapplicable hazard bulletin noted ({hazard.headline or 'Advisory'}; "
                    f"issued for '{hazard.harbor}', voyage is from '{context.origin_harbor}'); not active for this mission sector."
                )
            elif is_expired_bulletin or hazard_stale:
                non_decisive_factors.append(
                    f"Historical hazard bulletin noted ({hazard.headline or 'Past Cyclone/Severe Weather Alert'}; "
                    f"valid {hazard.valid_from} to {hazard.valid_to}); not an active warning for planned departure."
                )
                warnings.append(
                    f"HISTORICAL_HAZARD_CONTEXT: Past advisory from expired bulletin {hazard.bulletin_id or ''} "
                    f"({hazard.valid_from} to {hazard.valid_to}) was severe but has expired."
                )
            elif is_future_bulletin:
                non_decisive_factors.append(
                    f"Future hazard bulletin noted ({hazard.headline or 'Scheduled Advisory'}; "
                    f"valid from {hazard.valid_from} to {hazard.valid_to}); not an active warning for departure at {eval_time_utc.isoformat()}."
                )
                warnings.append(
                    f"FUTURE_HAZARD_CONTEXT: Advisory from bulletin {hazard.bulletin_id or ''} "
                    f"commences in the future ({hazard.valid_from}) and is not yet in effect."
                )
            elif not has_valid_window:
                non_decisive_factors.append(
                    f"Hazard bulletin noted ({hazard.headline or 'Advisory'}) with missing or unverified validity window; "
                    "cannot be treated as an active verified hazard."
                )
                warnings.append(
                    f"HAZARD_VALIDITY_UNKNOWN: Bulletin {hazard.bulletin_id or ''} lacks verified validity window."
                )

        threshold_checks.append(
            ThresholdComparison(
                metric_name="cyclone_warning_active",
                observed_value=cyclone_active,
                threshold_value=False,
                operator="==",
                unit="boolean",
                exceeded=cyclone_active,
                impact="NO_GO_TRIGGER" if cyclone_active else "SAFE",
                description=f"Cyclone warning active: {cyclone_active} ({hazard.headline if is_active_hazard else ('Historical/Expired/Inactive' if hazard and hazard_is_above_normal else 'Normal')})",
            )
        )

        if cyclone_active:
            if is_active_verified_hazard:
                decisive_factors.append(f"Active IMD cyclone warning: {hazard.headline or 'Cyclonic Storm Alert'}")
            else:
                decisive_factors.append(f"Active cyclone warning ({hazard.source_name or 'hazard advisory'}): {hazard.headline or 'Cyclonic Storm Alert'}")

        if severe_hazard_active and not cyclone_active:
            if is_active_verified_hazard:
                decisive_factors.append(f"Active IMD severe hazard warning: {hazard.headline or 'Severe Weather Warning'}")
            else:
                decisive_factors.append(f"Active severe hazard warning ({hazard.source_name or 'hazard advisory'}): {hazard.headline or 'Severe Weather Warning'}")
            threshold_checks.append(
                ThresholdComparison(
                    metric_name="severe_hazard_warning",
                    observed_value=True,
                    threshold_value=False,
                    operator="==",
                    unit="boolean",
                    exceeded=True,
                    impact="NO_GO_TRIGGER",
                    description=f"Severe weather warning active: {hazard.headline or 'Warning issued by IMD'}",
                )
            )

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
                    f"Significant wave height {wave_h:.1f}m exceeds safety ceiling ({limits['wave_nogo_m']:.1f}m for {vessel_label})."
                )
            elif wave_h >= limits["wave_caution_m"]:
                wave_impact = "CAUTION_TRIGGER"
                wave_exceeded = True
                decisive_factors.append(
                    f"Moderate wave height {wave_h:.1f}m requires caution for {vessel_label} ({limits['wave_caution_m']:.1f}m - {limits['wave_nogo_m']:.1f}m limit)."
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
                    description=f"Significant wave height {wave_h:.1f}m compared against {vessel_label} ceiling ({limits['wave_nogo_m']:.1f}m).",
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
                    description=f"Sustained wind {wind_spd:.1f} kt compared against {vessel_label} limit.",
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
        is_fallback_source = any(
            any("fallback" in flag.lower() for flag in prov.quality_flags)
            or "fallback" in (prov.source_name or "").lower()
            for prov in provenance_list
        )

        is_simulated_source = any(_is_prov_simulated(p) for p in provenance_list)

        hazard_is_simulated = bool(prov_hazard and _is_prov_simulated(prov_hazard))
        marine_is_simulated = bool(prov_marine and _is_prov_simulated(prov_marine))
        weather_is_simulated = bool(prov_weather and _is_prov_simulated(prov_weather))

        is_verified_severe_hazard = bool(
            is_active_verified_hazard
            and (cyclone_active or severe_hazard_active)
        )
        is_verified_severe_marine = bool(
            marine
            and _is_prov_verified_official(prov_marine, marine)
            and not marine_stale
            and marine.significant_wave_height_m is not None
            and marine.significant_wave_height_m > limits["wave_nogo_m"]
        )
        is_verified_severe_wind = bool(
            weather
            and _is_prov_verified_official(prov_weather, weather)
            and not weather_stale
            and weather.wind_speed_knots is not None
            and weather.wind_speed_knots > limits["wind_nogo_knots"]
        )
        has_verified_severe_nogo = bool(
            is_verified_severe_hazard or is_verified_severe_marine or is_verified_severe_wind
        )

        if has_nogo:
            status = RecommendationStatus.NO_GO
            summary = f"Severe marine conditions or hazards detected exceeding {vessel_label} safety ceiling."
            action = "Remain moored in port. Do not navigate under any circumstances."
            if has_verified_severe_nogo:
                conf_reasons = ["Deterministic safety ceiling exceeded by verified official observations"]
            elif is_fallback_source or any("fallback" in flag.lower() for prov in (prov_marine, prov_weather, prov_hazard) if prov for flag in prov.quality_flags):
                conf_reasons = ["Deterministic safety ceiling exceeded by fallback model forecast observations"]
            elif (cyclone_active or severe_hazard_active) and not is_active_verified_hazard:
                conf_reasons = ["Deterministic safety ceiling exceeded by unverified hazard advisory"]
            else:
                conf_reasons = ["Deterministic safety ceiling exceeded by reported conditions"]
            if is_data_degraded or is_geo_fallback:
                warnings.append("Note: Secondary telemetry is missing, degraded, or from geographic fallback, but NO_GO prohibition takes precedence.")
        elif is_data_degraded or forecast_coverage_incomplete:
            status = RecommendationStatus.UNKNOWN
            summary = "Sensor, forecast, or hazard bulletin data are expired, degraded, or incomplete. Safe departure evaluation cannot be completed."
            action = "Hold departure. Verify with port authorities before navigating."
            conf_reasons = ["Sensor telemetry validity window expired, degraded, or data feed missing"]
            confidence_level = ConfidenceLevel.LOW
        elif is_geo_fallback:
            status = RecommendationStatus.UNKNOWN
            summary = (
                f"No authoritative marine or weather observations are available for "
                f"{context.origin_harbor or 'the requested harbor'}. Fallback data from Ratnagiri cannot certify departure safety."
            )
            action = f"Hold departure. Obtain verified local port authority clearance for {context.origin_harbor or 'the harbor'}."
            conf_reasons = [f"Geographic fallback in use — no verified station data for {context.origin_harbor or 'requested harbor'}"]
            confidence_level = ConfidenceLevel.LOW
        elif has_caution:
            status = RecommendationStatus.CAUTION
            summary = f"Moderate marine conditions require operational caution for {vessel_label}."
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

        # Mixed-source and simulation handling:
        # In LIVE or HYBRID mode, simulated inputs cannot clear real-world departure
        if is_operational and is_simulated_source:
            if has_verified_severe_nogo:
                # Valid verified severe hazard/conditions independently justify NO_GO
                status = RecommendationStatus.NO_GO
                summary = f"Severe marine conditions or hazards detected exceeding {vessel_label} safety ceiling."
                action = "Remain moored in port. Do not navigate under any circumstances."
                confidence_level = ConfidenceLevel.HIGH
                conf_reasons = ["Deterministic safety ceiling exceeded by verified official observations"]
                warnings.append("Note: Auxiliary telemetry relies on simulated or fallback data, but verified severe hazard independently requires NO_GO.")
                if is_verified_severe_hazard:
                    decisive_factors.insert(0, f"Verified severe hazard warning ({hazard.headline or 'IMD Alert'}) active over sector.")
            else:
                # Fail closed: In LIVE or HYBRID mode, simulated inputs cannot clear real-world departure.
                # Conversely, a simulated or expired severe hazard must not independently justify an operational NO_GO/HIGH.
                status = RecommendationStatus.UNKNOWN
                summary = "Essential safety evidence relies on simulated or demonstration data. Real-world departure cannot be certified."
                action = "Hold departure. Obtain verified official live marine and hazard forecasts."
                confidence_level = ConfidenceLevel.LOW
                conf_reasons = ["Simulated data cannot support real-world departure clearance"]
                decisive_factors.insert(0, "Essential safety evidence relies on simulated or demonstration data; operational clearance denied.")

        # If demonstration scenario in SNAPSHOT/DEMO/MOCK mode, label summary and action accordingly
        elif status == RecommendationStatus.GO and (data_mode.upper() in ("SNAPSHOT", "DEMO", "MOCK") or getattr(context, "is_demo", False)):
            summary = "Conditions in this demonstration scenario are within modeled safe limits (Scenario Evaluation — Not Clearance for Current Voyage)."
            action = "Demonstration scenario evaluation only. Does not grant operational clearance for current vessel departure. Always obtain verified live official bulletins before sailing."

        if has_verified_severe_nogo:
            confidence_level = ConfidenceLevel.HIGH
        elif is_data_degraded or is_geo_fallback or status == RecommendationStatus.UNKNOWN:
            confidence_level = ConfidenceLevel.LOW
        elif is_simulated_source:
            confidence_level = ConfidenceLevel.MEDIUM
            conf_reasons = ["Evaluated using demonstration scenario reference data"]
        elif is_fallback_source or any("fallback" in flag.lower() for prov in (prov_marine, prov_weather, prov_hazard) if prov for flag in prov.quality_flags):
            confidence_level = ConfidenceLevel.MEDIUM
            if not has_nogo:
                conf_reasons.append("Evaluated using verified fallback marine model observations")
        elif (cyclone_active or severe_hazard_active) and not is_active_verified_hazard:
            confidence_level = ConfidenceLevel.MEDIUM
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
    vessel_size: Optional[str] = "medium",
) -> List[DecisionBoundaryItem]:
    """Pure deterministic helper to calculate boundary proximity and margins (M1.4)."""
    limits = get_vessel_capability(craft_profile, vessel_size)
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
    vessel_size: Optional[str] = "medium",
) -> SafeMissionWindow:
    """Find contiguous safe mission windows from hourly forecast series (M1.4)."""
    limits = get_vessel_capability(craft_profile, vessel_size)

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
