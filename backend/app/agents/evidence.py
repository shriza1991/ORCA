"""Evidence Provenance, Citations & Claim Validation for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

CORE ARCHITECTURAL RULE:
===============================================================================
EVERY NUMERICAL OR IMPORTANT FACTUAL CLAIM IN THE FINAL RESPONSE
MUST BE TRACEABLE TO EVIDENCE.

If evidence is missing or insufficient, the response composer must not invent
the missing fact. Unverified claims must be replaced with an explicit acknowledgment
of missing data or operational caution.
===============================================================================
"""

from datetime import datetime, timezone
import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from pydantic import BaseModel, Field

from backend.app.contracts.chat import EvidenceItem

# Devanagari numerals translation table
DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def _normalize_digits(text: str) -> str:
    """Converts Devanagari numerals (०-९) to ASCII digits (0-9)."""
    return text.translate(DEVANAGARI_DIGITS)


class EvidenceRecord(BaseModel):
    """Normalized evidence record linking observations to authoritative sources."""

    evidence_id: str = Field(..., description="Unique deterministic identifier (e.g. 'EV-INCOIS-WAVE-001')")
    source_name: str = Field(..., description="Authoritative issuer (e.g. 'INCOIS OSF', 'IMD Bulletin')")
    source_url: Optional[str] = Field(None, description="Direct URL or catalog link to official bulletin")
    observed_at: Optional[str] = Field(None, description="Sensor/satellite measurement ISO-8601 UTC timestamp")
    valid_from: Optional[str] = Field(None, description="Advisory start window (ISO-8601 UTC)")
    valid_to: Optional[str] = Field(None, description="Advisory expiration window (ISO-8601 UTC)")
    retrieved_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="System retrieval ISO-8601 UTC timestamp",
    )
    geometry: Optional[Dict[str, Any]] = Field(None, description="GeoJSON Point/Polygon of observation")
    metric_name: Optional[str] = Field(None, description="Variable (e.g., 'significant_wave_height')")
    metric_value: Optional[Any] = Field(None, description="Numerical value or status flag")
    metric_unit: Optional[str] = Field(None, description="Unit (e.g., 'meters', 'knots', 'km/h')")
    quality_flags: List[str] = Field(
        default_factory=list,
        description="Quality badges: 'official_source', 'fresh', 'snapshot_fallback', 'stale'",
    )

    def to_chat_evidence_item(self) -> EvidenceItem:
        """Converts to the shared frontend ChatResponse EvidenceItem model."""
        return EvidenceItem(
            evidence_id=self.evidence_id,
            source_name=self.source_name,
            source_url=self.source_url,
            observed_time=self.observed_at,
            valid_from=self.valid_from,
            valid_to=self.valid_to,
            retrieved_at=self.retrieved_at,
            geometry=self.geometry,
            metric_name=self.metric_name,
            metric_value=self.metric_value,
            metric_unit=self.metric_unit,
            quality_flags=self.quality_flags,
        )


class NumericalClaim(BaseModel):
    """A numerical assertion extracted from response text."""

    metric_name: str = Field(..., description="Canonical metric category (e.g. 'significant_wave_height', 'wind_speed')")
    claimed_value: float = Field(..., description="Extracted numerical figure")
    unit: Optional[str] = Field(None, description="Extracted physical unit")
    raw_text: str = Field(..., description="Original sentence or clause containing the claim")
    cited_evidence_id: Optional[str] = Field(None, description="Explicit citation tag if present in text (e.g. 'EV123')")


class ClaimValidationResult(BaseModel):
    """Verification outcome for an individual numerical assertion."""

    claim: NumericalClaim = Field(..., description="Underlying numerical claim")
    is_valid: bool = Field(..., description="True if supported by valid, fresh, unconflicted evidence")
    supporting_evidence_id: Optional[str] = Field(None, description="Matched EvidenceItem ID")
    supporting_evidence_item: Optional[EvidenceItem] = Field(None, description="Matched EvidenceItem")
    rejection_reason: Optional[str] = Field(
        None,
        description="Reason if invalid: 'no_evidence_available' | 'invalid_evidence_id' | 'unrelated_evidence_citation' | 'stale_evidence' | 'conflicting_evidence' | 'value_mismatch'",
    )


class ResponseClaimValidationReport(BaseModel):
    """Aggregated validation report for all numerical assertions in a response."""

    is_valid: bool = Field(..., description="True if all extracted numerical claims are valid")
    claims: List[ClaimValidationResult] = Field(default_factory=list, description="All evaluated claims")
    valid_claims: List[ClaimValidationResult] = Field(default_factory=list, description="Substantiated claims")
    invalid_claims: List[ClaimValidationResult] = Field(default_factory=list, description="Unsubstantiated or invalid claims")
    rejection_reasons: List[str] = Field(default_factory=list, description="List of descriptive rejection rationales")


class EvidenceValidationReport(BaseModel):
    """Outcome report generated by the Evidence Validator node."""

    is_valid: bool = Field(
        ..., description="True if all critical claims are backed by unexpired evidence"
    )
    total_claims_checked: int = Field(0, description="Number of factual/numerical assertions evaluated")
    verified_evidence_count: int = Field(0, description="Count of valid supporting evidence items")
    unverified_claims: List[str] = Field(
        default_factory=list, description="Claims made that lack supporting evidence"
    )
    stale_evidence_warnings: List[str] = Field(
        default_factory=list, description="Warnings for evidence whose validity window has lapsed"
    )
    conflicting_metrics: List[str] = Field(
        default_factory=list, description="Metrics with unresolved contradictory evidence"
    )
    quality_summary: str = Field(
        ..., description="Summary of evidence strength: 'robust' | 'partial' | 'compromised'"
    )


# Metric category compatibility mappings
METRIC_ALIASES: Dict[str, Set[str]] = {
    "significant_wave_height": {
        "significant_wave_height", "wave_height_m", "significant_wave_height_m", "max_wave_height_m",
        "swell_height_m", "wave_height",
    },
    "wind_speed": {
        "wind_speed", "wind_speed_knots", "wind_speed_kmh", "wind_speed_kts", "wind_gust_knots",
        "wind_gusts_knots",
    },
    "distance": {
        "distance", "distance_km", "distance_nautical_miles", "pfz_distance_nm",
        "distance_to_boundary_km",
    },
    "water_depth": {
        "water_depth", "water_depth_m", "depth",
    },
    "sea_surface_temp": {
        "sea_surface_temp", "sea_surface_temp_c", "temperature", "sst",
    },
    "swell_period": {
        "swell_period", "swell_period_sec", "period",
    },
    "chlorophyll": {
        "chlorophyll", "chlorophyll_mg_m3",
    },
    "bearing": {
        "bearing", "bearing_degrees",
    },
    "exposure_score": {
        "exposure_score", "route_exposure_score",
    },
    "visibility": {
        "visibility", "visibility_km",
    },
    "rainfall": {
        "rainfall", "rainfall_mm", "precipitation",
    },
}


def _find_cited_id(sent: str, match_span: Tuple[int, int]) -> Optional[str]:
    """Finds the nearest citation tag [EV...] attached to a specific match span."""
    # Look immediately after match (up to 40 characters)
    after_text = sent[match_span[1]:match_span[1] + 40]
    cit_after = re.search(r"^\s*\[(EV[A-Za-z0-9_\-]+)\]", after_text)
    if cit_after:
        return cit_after.group(1)
    # Also search within after_text if not separated by another metric
    cit_after_relaxed = re.search(r"\[(EV[A-Za-z0-9_\-]+)\]", after_text)
    if cit_after_relaxed and not re.search(r"[0-9]", after_text[:cit_after_relaxed.start()]):
        return cit_after_relaxed.group(1)

    # Look anywhere in the sentence if there is only 1 citation tag in total
    all_cits = re.findall(r"\[(EV[A-Za-z0-9_\-]+)\]", sent)
    if len(all_cits) == 1:
        return all_cits[0]

    return None


class EvidenceValidator:
    """Validates factual grounding between domain observations and synthesized statements."""

    @staticmethod
    def ensure_evidence_ids(evidence_items: List[EvidenceItem]) -> List[EvidenceItem]:
        """Ensures that every EvidenceItem has a non-empty, deterministic evidence_id.

        If an item lacks an evidence_id, a clean deterministic ID is generated based on
        its metric name / source and sequential index.
        """
        updated: List[EvidenceItem] = []
        for idx, ev in enumerate(evidence_items, start=1):
            if not ev.evidence_id:
                clean_metric = (ev.metric_name or ev.source_name or "ITEM").upper()
                clean_metric = re.sub(r"[^A-Z0-9]+", "-", clean_metric).strip("-")
                ev_id = f"EV-{clean_metric}-{idx:03d}"
                # Create a copy with assigned evidence_id
                item_dict = ev.model_dump()
                item_dict["evidence_id"] = ev_id
                updated.append(EvidenceItem(**item_dict))
            else:
                updated.append(ev)
        return updated

    @staticmethod
    def is_evidence_stale(item: EvidenceItem, now_iso: Optional[str] = None) -> bool:
        """Determines if an EvidenceItem is expired or stale.

        Checks:
        1. 'stale' quality flag
        2. valid_to timestamp against current time
        """
        if "stale" in item.quality_flags:
            return True

        if item.valid_to:
            current_time = now_iso or datetime.now(timezone.utc).isoformat()
            # Normalize ISO strings for lexicographical/timestamp comparison
            try:
                valid_to_dt = datetime.fromisoformat(item.valid_to.replace("Z", "+00:00"))
                curr_dt = datetime.fromisoformat(current_time.replace("Z", "+00:00"))
                if valid_to_dt < curr_dt:
                    return True
            except Exception:
                if item.valid_to < current_time:
                    return True

        return False

    @staticmethod
    def detect_conflicts(
        evidence_items: List[EvidenceItem],
        now_iso: Optional[str] = None,
    ) -> Dict[str, List[EvidenceItem]]:
        """Detects unresolvable conflicting evidence for the same metric.

        Returns a dictionary mapping metric_name to the list of conflicting items.
        """
        by_metric: Dict[str, List[EvidenceItem]] = {}
        for ev in evidence_items:
            is_stale = "stale" in ev.quality_flags or (now_iso is not None and EvidenceValidator.is_evidence_stale(ev, now_iso=now_iso))
            if ev.metric_name and ev.metric_value is not None and not is_stale:
                # Map to canonical metric group
                canonical_group = ev.metric_name
                for group, aliases in METRIC_ALIASES.items():
                    if ev.metric_name in aliases:
                        canonical_group = group
                        break
                by_metric.setdefault(canonical_group, []).append(ev)

        conflicts: Dict[str, List[EvidenceItem]] = {}
        for metric, items in by_metric.items():
            if len(items) > 1:
                # Check numerical disparity
                values: List[float] = []
                for it in items:
                    try:
                        values.append(float(it.metric_value))
                    except (ValueError, TypeError):
                        pass

                if values and (max(values) - min(values) > 0.1):
                    # Check if one is strictly higher authority (e.g. OFFICIAL vs SNAPSHOT)
                    has_official = any("OFFICIAL" in it.quality_flags or "REAL_SOURCE" in it.quality_flags for it in items)
                    all_equal_tier = all(
                        ("OFFICIAL" in it.quality_flags or "REAL_SOURCE" in it.quality_flags) == has_official
                        for it in items
                    )
                    if all_equal_tier:
                        conflicts[metric] = items

        return conflicts

    @staticmethod
    def extract_numerical_claims(text: str) -> List[NumericalClaim]:
        """Extracts numerical assertions and associated citation tags from text.

        Supports English, Hindi, and Marathi terminology and Devanagari numerals.
        """
        claims: List[NumericalClaim] = []
        # Normalize devanagari numerals for parsing
        normalized_text = _normalize_digits(text)

        # Split into sentences / lines, avoiding split between period and citation tag e.g. '2.1 m. [EV123]'
        sentence_split_pattern = r"(?<=[!?।\n])\s+|(?<=\.)\s+(?!\[EV)"
        raw_sentences = [s.strip() for s in re.split(sentence_split_pattern, text) if s.strip()]
        norm_sentences = [s.strip() for s in re.split(sentence_split_pattern, normalized_text) if s.strip()]

        for raw_sent, norm_sent in zip(raw_sentences, norm_sentences):
            # Pattern 1: Wave height (meters / m / मीटर / मी)
            wave_match = re.search(
                r"(?:wave(?:\s*height)?|swell(?:\s*height)?|लाट(?:ांची)?\s*उंची|लाट|तरंग(?:\s*ऊंचाई)?|लहरों\s*की\s*ऊंचाई)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:m|meters|meter|मीटर|मी)?\b",
                norm_sent,
                re.IGNORECASE,
            )
            if not wave_match:
                wave_match = re.search(
                    r"([0-9]+(?:\.[0-9]+)?)\s*(?:m|meters|meter|मीटर|मी)\s*(?:wave|waves|swell|लाट|लाटा|तरंग)",
                    norm_sent,
                    re.IGNORECASE,
                )
            if wave_match:
                val = float(wave_match.group(1))
                cited_id = _find_cited_id(raw_sent, wave_match.span())
                claims.append(
                    NumericalClaim(
                        metric_name="significant_wave_height",
                        claimed_value=val,
                        unit="meters",
                        raw_text=raw_sent,
                        cited_evidence_id=cited_id,
                    )
                )

            # Pattern 2: Wind speed / gusts (knots / kts / km/h / किमी/तास / किमी/घंटा / नॉट्स)
            wind_match = re.search(
                r"(?:wind(?:\s*speed)?|gusts?(?:\s*to)?|वाऱ्याचा\s*वेग|हवा\s*की\s*गति|पवन\s*गति)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:knots|kts|knot|km/h|kmh|किमी/तास|किमी/घंटा|नॉट्स)?\b",
                norm_sent,
                re.IGNORECASE,
            )
            if not wind_match:
                wind_match = re.search(
                    r"([0-9]+(?:\.[0-9]+)?)\s*(?:knots|kts|knot|km/h|kmh|किमी/तास|किमी/घंटा|नॉट्स)\s*(?:wind|winds|gusts|वारे|हवा|पवन)",
                    norm_sent,
                    re.IGNORECASE,
                )
            if not wind_match:
                # Standalone wind unit e.g. "wind speed is 31 km/h" or "31 km/h"
                wind_match = re.search(
                    r"(?:wind|वारा|हवा|पवन).*?([0-9]+(?:\.[0-9]+)?)\s*(?:knots|kts|km/h|kmh|किमी/तास|किमी/घंटा|नॉट्स)",
                    norm_sent,
                    re.IGNORECASE,
                )
            if wind_match:
                val = float(wind_match.group(1))
                unit = "km/h" if ("km/h" in norm_sent.lower() or "किमी/तास" in norm_sent or "किमी/घंटा" in norm_sent) else "knots"
                cited_id = _find_cited_id(raw_sent, wind_match.span())
                claims.append(
                    NumericalClaim(
                        metric_name="wind_speed",
                        claimed_value=val,
                        unit=unit,
                        raw_text=raw_sent,
                        cited_evidence_id=cited_id,
                    )
                )

            # Pattern 3: Distance (nm / nautical miles / km / सागरी मैल / समुद्री मील / किमी)
            is_visibility = bool(re.search(r"(?:visibility|दृश्यमानता|दृश्यता)", norm_sent, re.IGNORECASE))
            vis_val = None
            if is_visibility:
                v_match = re.search(r"(?:visibility|दृश्यमानता|दृश्यता)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)", norm_sent, re.IGNORECASE)
                if v_match:
                    vis_val = float(v_match.group(1))

            dist_match = re.search(
                r"([0-9]+(?:\.[0-9]+)?)\s*(?:nautical miles|nautical mile|nm|km|kilometers|सागरी मैल|समुद्री मील|किमी|किलोमीटर)",
                norm_sent,
                re.IGNORECASE,
            )
            if not dist_match:
                dist_match = re.search(
                    r"(?:distance|अंतर|दूरी)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:nm|km|सागरी मैल|समुद्री मील|किमी)?\b",
                    norm_sent,
                    re.IGNORECASE,
                )
            if dist_match:
                val = float(dist_match.group(1))
                unit = "km" if ("km" in norm_sent.lower() or "किमी" in norm_sent or "किलोमीटर" in norm_sent) else "nautical_miles"
                # Exclude if it was already matched as wind speed km/h or visibility km
                is_wind = bool(wind_match and abs(val - float(wind_match.group(1))) < 0.01)
                is_vis = bool(vis_val is not None and abs(val - vis_val) < 0.01)
                if not (is_wind or is_vis):
                    cited_id = _find_cited_id(raw_sent, dist_match.span())
                    claims.append(
                        NumericalClaim(
                            metric_name="distance",
                            claimed_value=val,
                            unit=unit,
                            raw_text=raw_sent,
                            cited_evidence_id=cited_id,
                        )
                    )

            # Pattern 4: Water depth (m / meters / पाणी खोली / गहराई)
            depth_match = re.search(
                r"(?:water\s*depth|depth|पाण्याची\s*खोली|खोली|पानी\s*की\s*गहराई|गहराई)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:m|meters|मीटर|मी)?\b",
                norm_sent,
                re.IGNORECASE,
            )
            if depth_match:
                val = float(depth_match.group(1))
                cited_id = _find_cited_id(raw_sent, depth_match.span())
                claims.append(
                    NumericalClaim(
                        metric_name="water_depth",
                        claimed_value=val,
                        unit="meters",
                        raw_text=raw_sent,
                        cited_evidence_id=cited_id,
                    )
                )

            # Pattern 5: Sea surface temperature (°C / C / celsius / सेल्सिअस)
            temp_match = re.search(
                r"(?:sea\s*surface\s*temp(?:erature)?|sst|temperature|तापमान)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:°C|°c|C|celsius|सेल्सिअस|सेल्सियस)?\b",
                norm_sent,
                re.IGNORECASE,
            )
            if not temp_match:
                temp_match = re.search(
                    r"([0-9]+(?:\.[0-9]+)?)\s*(?:°C|°c|celsius|सेल्सिअस|सेल्सियस)",
                    norm_sent,
                    re.IGNORECASE,
                )
            if temp_match:
                val = float(temp_match.group(1))
                cited_id = _find_cited_id(raw_sent, temp_match.span())
                claims.append(
                    NumericalClaim(
                        metric_name="sea_surface_temp",
                        claimed_value=val,
                        unit="celsius",
                        raw_text=raw_sent,
                        cited_evidence_id=cited_id,
                    )
                )

            # Pattern 6: Swell period (seconds / s / सेकंद)
            swell_match = re.search(
                r"(?:swell\s*period|उसळीचा\s*कालावधी|स्वेल\s*अवधि)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:s|seconds|sec|सेकंद|सेकंड)?\b",
                norm_sent,
                re.IGNORECASE,
            )
            if swell_match:
                val = float(swell_match.group(1))
                cited_id = _find_cited_id(raw_sent, swell_match.span())
                claims.append(
                    NumericalClaim(
                        metric_name="swell_period",
                        claimed_value=val,
                        unit="seconds",
                        raw_text=raw_sent,
                        cited_evidence_id=cited_id,
                    )
                )

            # Pattern 7: Exposure score
            score_match = re.search(
                r"(?:exposure\s*score|एक्सपोजर\s*स्कोर|स्कोर)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\b",
                norm_sent,
                re.IGNORECASE,
            )
            if score_match:
                val = float(score_match.group(1))
                cited_id = _find_cited_id(raw_sent, score_match.span())
                claims.append(
                    NumericalClaim(
                        metric_name="exposure_score",
                        claimed_value=val,
                        unit="score",
                        raw_text=raw_sent,
                        cited_evidence_id=cited_id,
                    )
                )

            # Pattern 8: Chlorophyll (mg/m³)
            chlor_match = re.search(
                r"(?:chlorophyll|क्लोरोफिल)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:mg/m³|mg/m3)?\b",
                norm_sent,
                re.IGNORECASE,
            )
            if chlor_match:
                val = float(chlor_match.group(1))
                cited_id = _find_cited_id(raw_sent, chlor_match.span())
                claims.append(
                    NumericalClaim(
                        metric_name="chlorophyll",
                        claimed_value=val,
                        unit="mg/m3",
                        raw_text=raw_sent,
                        cited_evidence_id=cited_id,
                    )
                )

            # Pattern 9: Bearing (degrees / ° / दिशा / अंश)
            bearing_match = re.search(
                r"(?:bearing|direction|दिशा)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:°|degrees|deg|अंश|डिग्री)?\b",
                norm_sent,
                re.IGNORECASE,
            )
            if not bearing_match:
                bearing_match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*°", norm_sent)
            if bearing_match and not temp_match:
                val = float(bearing_match.group(1))
                cited_id = _find_cited_id(raw_sent, bearing_match.span())
                claims.append(
                    NumericalClaim(
                        metric_name="bearing",
                        claimed_value=val,
                        unit="degrees",
                        raw_text=raw_sent,
                        cited_evidence_id=cited_id,
                    )
                )

            # Pattern 10: Visibility / Rainfall
            vis_match = re.search(
                r"(?:visibility|दृश्यमानता|दृश्यता)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:km|m|किमी|मी)?\b",
                norm_sent,
                re.IGNORECASE,
            )
            if vis_match:
                val = float(vis_match.group(1))
                cited_id = _find_cited_id(raw_sent, vis_match.span())
                claims.append(
                    NumericalClaim(
                        metric_name="visibility",
                        claimed_value=val,
                        unit="km",
                        raw_text=raw_sent,
                        cited_evidence_id=cited_id,
                    )
                )

            rain_match = re.search(
                r"(?:rainfall|rain|precipitation|पाऊस|बारिश)\s*(?:is|of|:|=)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:mm|मिमी)?\b",
                norm_sent,
                re.IGNORECASE,
            )
            if rain_match:
                val = float(rain_match.group(1))
                cited_id = _find_cited_id(raw_sent, rain_match.span())
                claims.append(
                    NumericalClaim(
                        metric_name="rainfall",
                        claimed_value=val,
                        unit="mm",
                        raw_text=raw_sent,
                        cited_evidence_id=cited_id,
                    )
                )

        return claims

    @staticmethod
    def _is_metric_compatible(claim_metric: str, evidence_metric: Optional[str]) -> bool:
        """Checks if a claim metric category matches an EvidenceItem metric_name."""
        if not evidence_metric:
            return False
        if claim_metric == evidence_metric:
            return True
        aliases = METRIC_ALIASES.get(claim_metric, {claim_metric})
        return evidence_metric in aliases

    @staticmethod
    def _values_match(claim_val: float, ev_val: Any, tolerance: float = 0.05) -> bool:
        """Checks if a claimed numerical value matches evidence value within tolerance."""
        try:
            val = float(ev_val)
            return math.isclose(claim_val, val, abs_tol=tolerance)
        except (ValueError, TypeError):
            return False

    @staticmethod
    def validate_claim(
        claim: NumericalClaim,
        evidence_items: List[EvidenceItem],
        now_iso: Optional[str] = None,
    ) -> ClaimValidationResult:
        """Validates a single numerical claim against available EvidenceItems.

        Follows strict verification:
        1. If explicit evidence_id is cited:
           - ID must exist in evidence items
           - Cited EvidenceItem must not be stale
           - Cited EvidenceItem must match metric category
           - Numerical value must match evidence
        2. If no explicit ID cited:
           - Must match a valid, fresh, unconflicted EvidenceItem
        """
        conflicts = EvidenceValidator.detect_conflicts(evidence_items, now_iso=now_iso)

        # Build evidence indexes
        by_id: Dict[str, EvidenceItem] = {}
        for ev in evidence_items:
            if ev.evidence_id:
                by_id[ev.evidence_id] = ev

        # Case 1: Explicit evidence ID cited in text
        if claim.cited_evidence_id:
            cited_id = claim.cited_evidence_id
            if cited_id not in by_id:
                return ClaimValidationResult(
                    claim=claim,
                    is_valid=False,
                    rejection_reason="invalid_evidence_id",
                )

            ev_item = by_id[cited_id]

            # Check staleness
            if EvidenceValidator.is_evidence_stale(ev_item, now_iso):
                return ClaimValidationResult(
                    claim=claim,
                    is_valid=False,
                    supporting_evidence_id=cited_id,
                    supporting_evidence_item=ev_item,
                    rejection_reason="stale_evidence",
                )

            # Check metric alignment
            if not EvidenceValidator._is_metric_compatible(claim.metric_name, ev_item.metric_name):
                return ClaimValidationResult(
                    claim=claim,
                    is_valid=False,
                    supporting_evidence_id=cited_id,
                    supporting_evidence_item=ev_item,
                    rejection_reason="unrelated_evidence_citation",
                )

            # Check value match
            if not EvidenceValidator._values_match(claim.claimed_value, ev_item.metric_value):
                return ClaimValidationResult(
                    claim=claim,
                    is_valid=False,
                    supporting_evidence_id=cited_id,
                    supporting_evidence_item=ev_item,
                    rejection_reason="value_mismatch",
                )

            return ClaimValidationResult(
                claim=claim,
                is_valid=True,
                supporting_evidence_id=cited_id,
                supporting_evidence_item=ev_item,
            )

        # Case 2: No explicit ID cited in text
        matching_items: List[EvidenceItem] = []
        for ev in evidence_items:
            if EvidenceValidator._is_metric_compatible(claim.metric_name, ev.metric_name):
                if EvidenceValidator._values_match(claim.claimed_value, ev.metric_value):
                    matching_items.append(ev)

        if not matching_items:
            return ClaimValidationResult(
                claim=claim,
                is_valid=False,
                rejection_reason="no_evidence_available",
            )

        # Check if all matching items are stale
        fresh_items = [ev for ev in matching_items if not EvidenceValidator.is_evidence_stale(ev, now_iso)]
        if not fresh_items:
            return ClaimValidationResult(
                claim=claim,
                is_valid=False,
                supporting_evidence_item=matching_items[0],
                supporting_evidence_id=matching_items[0].evidence_id,
                rejection_reason="stale_evidence",
            )

        # Check conflict
        if claim.metric_name in conflicts:
            return ClaimValidationResult(
                claim=claim,
                is_valid=False,
                rejection_reason="conflicting_evidence",
            )

        selected = fresh_items[0]
        return ClaimValidationResult(
            claim=claim,
            is_valid=True,
            supporting_evidence_id=selected.evidence_id,
            supporting_evidence_item=selected,
        )

    @staticmethod
    def validate_response_claims(
        text: str,
        evidence_items: List[EvidenceItem],
        now_iso: Optional[str] = None,
    ) -> ResponseClaimValidationReport:
        """Extracts and validates all numerical assertions in response text against evidence."""
        claims = EvidenceValidator.extract_numerical_claims(text)
        results: List[ClaimValidationResult] = []
        valid_claims: List[ClaimValidationResult] = []
        invalid_claims: List[ClaimValidationResult] = []
        reasons: List[str] = []

        for c in claims:
            res = EvidenceValidator.validate_claim(c, evidence_items, now_iso)
            results.append(res)
            if res.is_valid:
                valid_claims.append(res)
            else:
                invalid_claims.append(res)
                reasons.append(
                    f"Claim '{c.raw_text}' ({c.metric_name}={c.claimed_value}) rejected: {res.rejection_reason}"
                )

        return ResponseClaimValidationReport(
            is_valid=len(invalid_claims) == 0,
            claims=results,
            valid_claims=valid_claims,
            invalid_claims=invalid_claims,
            rejection_reasons=reasons,
        )

    @staticmethod
    def suppress_unsupported_claims(
        text: str,
        evidence_items: List[EvidenceItem],
        fallback_text: Optional[str] = None,
        now_iso: Optional[str] = None,
    ) -> str:
        """Deterministically suppresses or recomposes sentences containing unsupported claims.

        If a sentence or clause contains an unsubstantiated numerical figure, it is removed.
        If all content is suppressed or filtering is ambiguous, returns fallback_text.
        """
        report = EvidenceValidator.validate_response_claims(text, evidence_items, now_iso)
        if report.is_valid:
            return text

        lines = text.split("\n")
        retained_lines: List[str] = []

        for line in lines:
            line_str = line.strip()
            if not line_str:
                retained_lines.append("")
                continue

            # Split line on sentence boundaries, punctuation, colons, or semicolons
            segments = [s.strip() for s in re.split(r"(?<=[.!?।;:])\s+", line_str) if s.strip()]
            retained_segments: List[str] = []

            for seg in segments:
                # Check if this segment contains any invalid claim
                seg_claims = EvidenceValidator.extract_numerical_claims(seg)
                seg_has_invalid = False
                for sc in seg_claims:
                    res = EvidenceValidator.validate_claim(sc, evidence_items, now_iso)
                    if not res.is_valid:
                        seg_has_invalid = True
                        break

                if not seg_has_invalid:
                    retained_segments.append(seg)
                else:
                    # Try compound clause splitting (and / आणि / तथा / व / commas)
                    sub_clauses = [c.strip() for c in re.split(r",\s+(?:and\s+)?|\s+(?:and|व|आणि|तथा|एवं)\s+", seg, flags=re.IGNORECASE) if c.strip()]
                    if len(sub_clauses) > 1:
                        valid_sub: List[str] = []
                        for sub in sub_clauses:
                            sub_claims = EvidenceValidator.extract_numerical_claims(sub)
                            if not any(
                                not EvidenceValidator.validate_claim(sc, evidence_items, now_iso).is_valid
                                for sc in sub_claims
                            ):
                                if sub.strip():
                                    valid_sub.append(sub.strip())
                        if valid_sub:
                            if len(valid_sub) == 1:
                                retained_segments.append(valid_sub[0])
                            elif len(valid_sub) == 2:
                                retained_segments.append(f"{valid_sub[0]} and {valid_sub[1]}")
                            else:
                                retained_segments.append(f"{', '.join(valid_sub[:-1])}, and {valid_sub[-1]}")

            if retained_segments:
                retained_lines.append(" ".join(retained_segments))

        cleaned_text = "\n".join(retained_lines).strip()
        if not cleaned_text or len(cleaned_text) < 5:
            return fallback_text or text

        return cleaned_text

    @staticmethod
    def audit_evidence(
        evidence_items: List[EvidenceItem],
        critical_metrics: List[str],
        now_iso: Optional[str] = None,
    ) -> EvidenceValidationReport:
        """Audits whether required metrics have supporting evidence items.

        Args:
            evidence_items: List of collected evidence citations.
            critical_metrics: Metric names that must be substantiated (e.g. 'significant_wave_height').
            now_iso: Optional current UTC timestamp for staleness check.

        Returns:
            EvidenceValidationReport detailing coverage, validity, and gaps.
        """
        # Ensure items have IDs
        evidence_items = EvidenceValidator.ensure_evidence_ids(evidence_items)

        available_metrics: Set[str] = set()
        for ev in evidence_items:
            if ev.metric_name:
                available_metrics.add(ev.metric_name)
                # Add aliases
                for group, aliases in METRIC_ALIASES.items():
                    if ev.metric_name in aliases:
                        available_metrics.add(group)

        missing = [m for m in critical_metrics if m not in available_metrics]
        stale_warnings: List[str] = []

        for ev in evidence_items:
            if EvidenceValidator.is_evidence_stale(ev, now_iso):
                stale_warnings.append(
                    f"Evidence for {ev.metric_name or ev.source_name} (ID: {ev.evidence_id}) is stale or expired at {ev.valid_to}."
                )

        conflicts = EvidenceValidator.detect_conflicts(evidence_items)
        conflicting_metric_names = list(conflicts.keys())

        is_valid = len(missing) == 0 and len(evidence_items) > 0 and len(conflicting_metric_names) == 0
        quality = "robust" if is_valid and not stale_warnings else (
            "compromised" if not is_valid and not evidence_items else "partial"
        )

        return EvidenceValidationReport(
            is_valid=is_valid,
            total_claims_checked=len(critical_metrics),
            verified_evidence_count=len(evidence_items),
            unverified_claims=missing,
            stale_evidence_warnings=stale_warnings,
            conflicting_metrics=conflicting_metric_names,
            quality_summary=quality,
        )
