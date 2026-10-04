"""Bind graph-selected mission intents to retained deterministic assessments."""
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from backend.app.contracts.assessment import TripAssessmentRequest, TripSimulationRequest
from backend.app.contracts.chat import (
    AgentTraceItem,
    Confidence,
    ConfidenceLevel,
    EvidenceItem,
    Recommendation,
    RecommendationStatus,
)
from backend.app.contracts.mission import DecisionObject
from backend.app.services.mission_evidence import get_assessment, get_bundle


def request_from_assessment(a):
    c = a.trip_context
    return TripAssessmentRequest(origin_harbor=c.origin_harbor, coordinates=c.coordinates,
        craft_profile=c.craft_profile, vessel_size=c.vessel_size,
        departure_time=c.departure_time, return_time=c.return_time,
        destination_id=c.target_pfz, language_preference=c.language_preference,
        data_mode=a.conditions.data_mode, evidence_bundle_id=a.evidence_bundle_id)


def proposed_request(baseline, message):
    """Bounded time/craft edits; ambiguous edits require clarification."""
    req = request_from_assessment(baseline)
    if not req.departure_time or not req.return_time:
        return None
    dep = datetime.fromisoformat(req.departure_time.replace("Z", "+00:00"))
    ret = datetime.fromisoformat(req.return_time.replace("Z", "+00:00"))
    text = message.lower()
    for word, number in (("one", 1), ("two", 2), ("three", 3), ("four", 4), ("six", 6), ("twelve", 12), ("twenty-four", 24)):
        text = re.sub(rf"\b{word}\b", str(number), text)
    offset = re.search(r"(?:\+|leave\s+|depart\s+)?(\d+)\s*(?:hours?|hrs?)\s*(?:later|delay)?", text)
    clock = re.search(r"(?:at|बजे|वाजता)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", text)
    new_dep = None
    if offset:
        new_dep = dep + timedelta(hours=int(offset.group(1)))
    elif clock:
        hour, minute = int(clock.group(1)), int(clock.group(2) or 0)
        meridiem = clock.group(3)
        if meridiem and not 1 <= hour <= 12:
            return None
        if meridiem:
            hour = hour % 12 + (12 if meridiem == "pm" else 0)
        if hour > 23 or minute > 59:
            return None
        new_dep = dep.astimezone(ZoneInfo("Asia/Kolkata")).replace(hour=hour, minute=minute, second=0, microsecond=0)
    if new_dep:
        req.departure_time = new_dep.isoformat()
        req.return_time = (new_dep + (ret - dep)).isoformat()
    craft = next((v for k, v in (("trawler", "mechanized_trawler"), ("traditional", "traditional_non_motorized"), ("motorized", "motorized_boat")) if k in text), None)
    if craft:
        req.craft_profile = craft
    size = next((v for v in ("small", "medium", "large") if re.search(rf"\b{v}\b", text)), None)
    if size:
        req.vessel_size = size
    return req if new_dep or craft or size else None


def _derive_pfz_confidence(selected, bundle_record, departure_time_iso, language):
    """Derive PFZ advisory confidence independently of the voyage brief."""
    candidates = selected.pfz_candidates or []
    c_mode = (selected.conditions.data_mode or "").upper()
    from backend.app.agents.localization import localize_operational_text
    localize = lambda t: localize_operational_text(t, language)

    # 1. Candidate availability check
    if not candidates:
        return Confidence(
            level=ConfidenceLevel.LOW,
            reasons=[
                localize("No supported fishing candidate in retained evidence."),
                localize("Advisory confidence limited by absence of qualifying thermal front or chlorophyll gradient data for this window."),
            ],
        )

    top = candidates[0]
    cand_id = top.get("candidate_id", "Zone")
    dist = top.get("distance_nautical_miles", 0)
    bearing = top.get("bearing_degrees", 0)

    # 2. Temporal validity evaluation against planned departure time
    pfz_data = bundle_record.get("pfz") if bundle_record else None
    valid_to_raw = pfz_data.get("valid_to") if pfz_data else (top.get("valid_to") or top.get("valid_until"))
    valid_from_raw = (pfz_data.get("valid_from") or pfz_data.get("bulletin_date")) if pfz_data else (top.get("valid_from") or top.get("detected_at"))

    # Missing validity -> LOW
    if not valid_to_raw or not valid_from_raw or not departure_time_iso:
        return Confidence(
            level=ConfidenceLevel.LOW,
            reasons=[
                localize(f"PFZ candidate {cand_id} identified, but advisory validity window is unknown or missing."),
                localize("Cannot certify confidence without verified active forecast interval."),
            ],
        )

    try:
        dep_dt = datetime.fromisoformat(departure_time_iso.replace("Z", "+00:00"))
        vt_dt = datetime.fromisoformat(valid_to_raw.replace("Z", "+00:00"))
        vf_dt = datetime.fromisoformat(valid_from_raw.replace("Z", "+00:00"))
        if dep_dt.tzinfo is None:
            dep_dt = dep_dt.replace(tzinfo=ZoneInfo("UTC"))
        if vt_dt.tzinfo is None:
            vt_dt = vt_dt.replace(tzinfo=ZoneInfo("UTC"))
        if vf_dt.tzinfo is None:
            vf_dt = vf_dt.replace(tzinfo=ZoneInfo("UTC"))
    except Exception:
        return Confidence(
            level=ConfidenceLevel.LOW,
            reasons=[
                localize(f"PFZ candidate {cand_id} identified, but validity timestamps are malformed or unparseable."),
                localize("Unparseable temporal window prevents establishing advisory freshness."),
            ],
        )

    # Inverted window check (malformed)
    if vf_dt > vt_dt:
        return Confidence(
            level=ConfidenceLevel.LOW,
            reasons=[
                localize(f"PFZ candidate {cand_id} identified, but validity window is malformed (valid_from is after valid_to)."),
            ],
        )

    # Expired check (evaluated strictly before demo/snapshot status)
    if dep_dt > vt_dt:
        return Confidence(
            level=ConfidenceLevel.LOW,
            reasons=[
                localize(f"PFZ candidate {cand_id} identified, but underlying advisory validity window has expired."),
                localize("Thermal and chlorophyll boundaries may have shifted due to sea surface currents."),
            ],
        )

    # Not yet valid check
    if dep_dt < vf_dt:
        return Confidence(
            level=ConfidenceLevel.LOW,
            reasons=[
                localize(f"PFZ candidate {cand_id} identified, but advisory validity commences after departure time."),
                localize("Future advisory data cannot certify current departure fishing opportunities."),
            ],
        )

    # 3. Geographic coverage check
    cov_status = ""
    if pfz_data:
        cov_status = str(pfz_data.get("coverage_status") or (pfz_data.get("freshness_flags") or {}).get("coverage_status") or "").upper()
    if cov_status in ("UNAVAILABLE", "GEOGRAPHIC_FALLBACK", "UNSUPPORTED", "FALLBACK"):
        return Confidence(
            level=ConfidenceLevel.LOW,
            reasons=[
                localize(f"PFZ candidate {cand_id} falls outside certified coverage area ({cov_status})."),
                localize("Unsupported geographic coverage prevents establishing high advisory confidence."),
            ],
        )

    # 4. Reject contradictory fallback/unavailable/degraded metadata
    quality_flags = [str(f).lower() for f in (pfz_data.get("quality_flags") or [])] if pfz_data else []
    freshness_flags = pfz_data.get("freshness_flags") if (pfz_data and isinstance(pfz_data.get("freshness_flags"), dict)) else {}
    has_contradictory_degraded = (
        any(f in ("degraded", "fallback", "geographic_fallback", "unavailable", "stale", "synthetic_timestamps") for f in quality_flags)
        or any(bool(freshness_flags.get(k)) for k in ("degraded", "fallback", "is_fallback", "unavailable"))
        or cov_status in ("FALLBACK", "GEOGRAPHIC_FALLBACK", "UNAVAILABLE")
    )
    if has_contradictory_degraded:
        return Confidence(
            level=ConfidenceLevel.LOW,
            reasons=[
                localize(f"PFZ candidate {cand_id} has contradictory advisory metadata (flagged with degraded or fallback attributes)."),
                localize("Advisory confidence restricted to LOW due to degraded data quality indicators."),
            ],
        )

    # 5. Source verification & Input Origin evaluation
    pfz_data_mode = (pfz_data.get("data_mode") or pfz_data.get("source_data_mode") or c_mode or "").upper() if pfz_data else c_mode
    is_demo = pfz_data_mode in ("DEMO", "SNAPSHOT", "SYNTHETIC", "MOCK", "SIMULATED")

    if is_demo:
        # Valid demo/snapshot candidates receive MEDIUM with scenario wording
        return Confidence(
            level=ConfidenceLevel.MEDIUM,
            reasons=[
                localize(f"PFZ candidate {cand_id} identified at {dist} nm bearing {bearing}° from retained mission evidence."),
                localize("Potential fishing zone derived from modeled thermal and chlorophyll gradient calculation lineage."),
                localize("Advisory confidence rated MEDIUM due to simulated/snapshot reference data mode."),
            ],
        )

    # For operational/live data, check canonical provenance classification
    # Must NOT recognize official origin solely from source-name strings
    is_verified_live = ("verified_live" in quality_flags or bool(freshness_flags.get("verified_live")))
    is_official_source = (
        "official_source" in quality_flags
        or bool(freshness_flags.get("is_official"))
        or bool(freshness_flags.get("authority_verified"))
    )

    if pfz_data_mode != "LIVE" or not is_verified_live or not is_official_source:
        # Fresh unverified or source-name-only claim -> MEDIUM (never HIGH)
        return Confidence(
            level=ConfidenceLevel.MEDIUM,
            reasons=[
                localize(f"PFZ candidate {cand_id} identified at {dist} nm bearing {bearing}° from unverified candidate telemetry."),
                localize("Advisory lacks canonical verified official provider certification."),
                localize("Advisory confidence restricted to MEDIUM due to unverified source evidence."),
            ],
        )

    # Certified coverage requires explicit verification, not unknown
    is_coverage_certified = cov_status in ("OK", "CERTIFIED", "SUPPORTED", "LOCAL") or (
        bool(freshness_flags.get("coverage_certified")) or ("certified_coverage" in quality_flags)
    )
    if not is_coverage_certified:
        return Confidence(
            level=ConfidenceLevel.MEDIUM,
            reasons=[
                localize(f"PFZ candidate {cand_id} identified at {dist} nm bearing {bearing}° with unverified geographic coverage."),
                localize("Advisory coverage is not explicitly certified for this local mission corridor."),
                localize("Advisory confidence restricted to MEDIUM due to uncertified coverage."),
            ],
        )

    # Check whether oceanographic inputs (thermal front, chlorophyll) are established
    has_oceanographic_inputs = bool(
        top.get("has_thermal_front")
        or top.get("has_chlorophyll_boundary")
        or (pfz_data and (pfz_data.get("thermal_fronts") or pfz_data.get("chlorophyll_boundaries")))
        or ("oceanographic_inputs_verified" in quality_flags)
    )

    reasons = [
        localize(f"High confidence identification of PFZ candidate {cand_id} ({dist} nm, bearing {bearing}°) from verified official advisory."),
    ]
    if has_oceanographic_inputs:
        reasons.append(localize("Direct oceanographic thermal front and chlorophyll boundaries verified within coastal coverage."))
    else:
        reasons.append(localize("Advisory candidate coordinates and bulletin validity verified within certified coastal coverage."))

    return Confidence(
        level=ConfidenceLevel.HIGH,
        reasons=reasons,
    )


def _build_retained_evidence(selected):
    """Build unified evidence rows from retained assessment without refetching or fabricating metadata."""
    bundle_id = selected.evidence_bundle_id or "bundle"
    craft = selected.trip_context.craft_profile if selected.trip_context else "vessel"
    cond = selected.conditions
    bundle_record = get_bundle(bundle_id)
    bundle_data = (bundle_record.get("bundle") if isinstance(bundle_record, dict) else None) or {}
    pfz_record = (bundle_record.get("pfz") if isinstance(bundle_record, dict) else None)

    source_items = []
    source_id_map = {}  # domain -> evidence_id
    seen_domains = set()

    # 1. Gather preserved DataProvenance records if present (preserves partial provenance independently)
    prov_list = getattr(cond, "provenance", None) or bundle_data.get("provenance") or []
    for i, prov in enumerate(prov_list):
        prov_dict = prov.model_dump() if hasattr(prov, "model_dump") else (prov if isinstance(prov, dict) else {})
        p_name = prov_dict.get("provider_name") or None
        s_name = prov_dict.get("source_name") or "Telemetry Source"
        ev_id = f"{bundle_id}:source:prov_{i}"
        ev_item = EvidenceItem(
            evidence_id=ev_id,
            source_name=s_name,
            provider_name=p_name,
            source_url=prov_dict.get("source_url"),
            observed_time=prov_dict.get("observed_time"),
            valid_from=prov_dict.get("valid_from"),
            valid_to=prov_dict.get("valid_to"),
            retrieved_at=prov_dict.get("retrieved_at"),  # Preserve None if unknown
            quality_flags=prov_dict.get("quality_flags") or [],
            data_mode=prov_dict.get("data_mode") or cond.data_mode,
            lineage_id=prov_dict.get("lineage_id"),
            coverage=prov_dict.get("coverage"),  # Preserve actual coverage without substitution
        )
        source_items.append(ev_item)

        s_lower = (s_name or "").lower()
        p_lower = (p_name or "").lower()
        combined = f"{s_lower} {p_lower}"
        if any(k in combined for k in ("marine", "osf", "wave", "ocean", "swan")) and "marine" not in seen_domains:
            source_id_map["marine"] = ev_id
            seen_domains.add("marine")
        elif any(k in combined for k in ("weather", "wind", "aws", "atmos", "imd coastal")) and "weather" not in seen_domains:
            source_id_map["weather"] = ev_id
            seen_domains.add("weather")
        elif any(k in combined for k in ("hazard", "cyclone", "squall", "bulletin")) and "hazard" not in seen_domains:
            source_id_map["hazard"] = ev_id
            seen_domains.add("hazard")

    # Helper to extract from payload dict/model without inventing provider names or timestamps
    def _extract_from_payload(payload_obj, domain_key, default_sname):
        if not payload_obj:
            return
        p_dict = payload_obj.model_dump() if hasattr(payload_obj, "model_dump") else (payload_obj if isinstance(payload_obj, dict) else {})
        s_name = p_dict.get("source_name") or default_sname
        p_name = p_dict.get("provider_name") or (p_dict.get("freshness_flags") or {}).get("provider_name") or None
        ev_id = f"{bundle_id}:source:{domain_key}"
        ff = p_dict.get("freshness_flags")
        from backend.app.agents.integrations.adapters import ProviderToolAdapter
        from backend.app.agents.integrations.dev2 import MarineConditionsPayload, WeatherConditionsPayload, HazardBulletinPayload
        model = {"marine": MarineConditionsPayload, "weather": WeatherConditionsPayload, "hazard": HazardBulletinPayload}[domain_key]
        normalized = model.model_validate(p_dict)
        source_mode, flags = ProviderToolAdapter._resolve_provenance(normalized, eval_time_iso=selected.trip_context.departure_time)

        retrieved = p_dict.get("retrieved_at") or (ff.get("retrieved_at") if isinstance(ff, dict) else None)
        obs_time = p_dict.get("observed_at") or p_dict.get("observed_time") or p_dict.get("issued_at")
        cov = p_dict.get("coverage") or p_dict.get("harbor") or (ff.get("coverage_status") if isinstance(ff, dict) else None)

        source_items.append(EvidenceItem(
            evidence_id=ev_id,
            source_name=s_name,
            provider_name=p_name,
            source_url=p_dict.get("source_url"),
            observed_time=obs_time,
            valid_from=p_dict.get("valid_from"),
            valid_to=p_dict.get("valid_to"),
            retrieved_at=retrieved,
            quality_flags=flags,
            data_mode=source_mode,
            lineage_id=p_dict.get("lineage_id") or ProviderToolAdapter._resolve_lineage(normalized, source_mode),
            coverage=cov,
        ))
        source_id_map[domain_key] = ev_id
        seen_domains.add(domain_key)

    if "marine" not in seen_domains:
        m_payload = getattr(cond, "marine", None) or bundle_data.get("marine")
        _extract_from_payload(m_payload, "marine", "Marine Ocean Forecast")

    if "weather" not in seen_domains:
        w_payload = getattr(cond, "weather", None) or bundle_data.get("weather")
        _extract_from_payload(w_payload, "weather", "Coastal Weather Bulletin")

    if "hazard" not in seen_domains:
        h_payload = getattr(cond, "hazard", None) or bundle_data.get("hazard")
        _extract_from_payload(h_payload, "hazard", "Severe Weather Bulletin")

    # PFZ source record
    if "pfz" not in seen_domains and (pfz_record or selected.pfz_candidates):
        pfz_dict = pfz_record if isinstance(pfz_record, dict) else {}
        pfz_sname = pfz_dict.get("source_name") or (
            "Potential Fishing Zone Advisory" if selected.pfz_candidates else "PFZ Advisory"
        )
        pfz_pname = pfz_dict.get("provider_name") or (pfz_dict.get("freshness_flags") or {}).get("provider_name") or None
        pfz_id = f"{bundle_id}:source:pfz"
        source_items.append(EvidenceItem(
            evidence_id=pfz_id,
            source_name=pfz_sname,
            provider_name=pfz_pname,
            source_url=pfz_dict.get("source_url"),
            observed_time=pfz_dict.get("bulletin_date") or pfz_dict.get("detected_at"),
            valid_from=pfz_dict.get("valid_from") or pfz_dict.get("bulletin_date"),
            valid_to=pfz_dict.get("valid_to"),
            retrieved_at=pfz_dict.get("retrieved_at"),
            quality_flags=list(pfz_dict.get("quality_flags") or []),
            data_mode=pfz_dict.get("data_mode") or pfz_dict.get("source_data_mode") or "UNKNOWN_SOURCE",
            lineage_id=pfz_dict.get("lineage_id"),
            coverage=pfz_dict.get("coverage") or (pfz_dict.get("freshness_flags") or {}).get("coverage_status"),
        ))
        source_id_map["pfz"] = pfz_id

    # 2. Map deterministic threshold comparisons already present in the assessment
    # Does NOT reconstruct verdicts using guessed fields or default hazard_active=False
    derived_items = []
    for row in (selected.evidence or []):
        m_name = row.get("metric_name") if isinstance(row, dict) else getattr(row, "metric_name", None)
        if not m_name:
            continue
        row_dict = row if isinstance(row, dict) else row.model_dump()
        m_lower = m_name.lower()

        # Link calculations ONLY to sources that actually support them
        sup_source_id = None
        if any(k in m_lower for k in ("wave", "swell", "sea_state", "current")):
            sup_source_id = source_id_map.get("marine")
        elif any(k in m_lower for k in ("wind", "gust", "visibility")):
            sup_source_id = source_id_map.get("weather")
        elif any(k in m_lower for k in ("hazard", "cyclone", "squall")):
            sup_source_id = source_id_map.get("hazard")
        elif "pfz" in m_lower:
            sup_source_id = source_id_map.get("pfz")

        derived_items.append(EvidenceItem(
            evidence_id=f"{bundle_id}:calc:{m_name}",
            source_name=row_dict.get("description") or f"Threshold Check: {m_name}",
            provider_name="ORCA Deterministic Safety Rules",
            metric_name=m_name,
            metric_value=row_dict.get("observed_value"),
            metric_unit=row_dict.get("unit"),
            quality_flags=["DERIVED_CALCULATION"],
            lineage_id=sup_source_id,  # Exactly matching supporting source in bundle, or None
            data_mode="CALCULATED",
            retrieved_at=None,
            observed_time=None,  # Calculations are not observations
            valid_from=None,
            valid_to=None,
            coverage=f"{craft} limits" if craft else None,
        ))

    from backend.app.services.field_context import applicable_field_signals
    for signal in applicable_field_signals(selected.conditions.field_signals, selected.trip_context.departure_time):
        source_items.append(EvidenceItem(evidence_id=f"{bundle_id}:field:{signal['public_id']}",
            source_name="[FIELD SIGNAL] " + signal["observation_type"], provider_name="Anonymous community report",
            data_mode="DEMO" if signal.get("is_demo") else "FIELD_SIGNAL",
            quality_flags=["COMMUNITY", "NON_AUTHORITATIVE", signal["verification_status"]],
            observed_time=signal["observed_at"], valid_from=signal["observed_at"], valid_to=signal["valid_until"],
            coverage=signal.get("harbor_reference"), lineage_id=signal["public_id"]))
    return source_items + derived_items


def bind_mission_response(response, profile, message):
    """Keep orchestration trace; project the same domain authority to all views."""
    assessment_id = profile.get("baseline_assessment_id")
    if not assessment_id:
        return response
    baseline = get_assessment(assessment_id)
    response.evidence_bundle_id = baseline.evidence_bundle_id
    response.mission_assessment = baseline.model_dump(mode="json")
    intent = response.intent.upper()
    # Informational queries retain their distinct graph-generated answer.
    supported = {"SAFETY", "GO_NO_GO_SAFETY", "WHAT_IF", "WHAT_CHANGED", "EXPLANATION", "ANALYTICAL_EXPLANATION", "ROUTE", "ALTERNATIVE", "PFZ", "HAZARDS", "CONDITIONS"}
    if intent == "ANALYTICAL_EXPLANATION" and not re.search(r"why|decision|departure|safe|risk", message, re.I):
        return response
    if intent not in supported:
        return response
    selected = baseline
    delta = None
    if intent == "WHAT_IF":
        proposed = proposed_request(baseline, message)
        if proposed is None:
            response.answer = "Choose a departure time (for example, 11:00 AM), a delay in hours, or a vessel change to compare. Your active plan is unchanged."
        else:
            from backend.app.api.v1.assessments import compare_trip
            comparison = compare_trip(TripSimulationRequest(baseline=request_from_assessment(baseline), simulated=proposed, baseline_assessment_id=baseline.assessment_id))
            selected, delta = comparison.simulated, comparison.delta
            response.proposed_assessment = selected.model_dump(mode="json")
    elif intent == "WHAT_CHANGED" and baseline.trip_context.parent_assessment_id:
        from backend.app.api.v1.assessments import decision_delta
        delta = decision_delta(get_assessment(baseline.trip_context.parent_assessment_id), baseline)
    from backend.app.contracts.chat import RecommendationStatus
    brief = selected.brief
    if not brief:
        return response
    from backend.app.agents.localization import localize_operational_text
    localize = lambda t: localize_operational_text(t, response.language)
    factors = brief.negative_factors or brief.positive_factors

    response.assessment_id = selected.assessment_id
    response.evidence = _build_retained_evidence(selected)
    bundle_record = get_bundle(selected.evidence_bundle_id)

    if intent == "PFZ":
        rec_status = RecommendationStatus.INFORMATIONAL
        cand_list = [f"{p.get('candidate_id')}: {p.get('distance_nautical_miles')} nm, bearing {p.get('bearing_degrees')} degrees." for p in selected.pfz_candidates[:3]]
        cand_text = "\n".join(cand_list) if cand_list else localize("No supported fishing candidate in retained evidence.")
        pfz_summary = f"Potential Fishing Zone advisory: {', '.join(p.get('candidate_id') for p in selected.pfz_candidates[:2])} identified from retained mission evidence." if selected.pfz_candidates else "Potential Fishing Zone advisory: No supported fishing candidate in retained evidence."
        pfz_factors = [
            f"PFZ candidate {p.get('candidate_id')} identified at {p.get('distance_nautical_miles')} nm bearing {p.get('bearing_degrees')}°" for p in selected.pfz_candidates[:2]
        ] or ["No supported fishing candidate in retained evidence."]
        pfz_factors.append("Informational advisory only — voyage navigation and departure safety must be independently assessed")
        pfz_action = "Obtain voyage safety assessment and verify local harbor bulletins before departure."

        pfz_confidence = _derive_pfz_confidence(selected, bundle_record, selected.trip_context.departure_time, response.language)
        response.confidence = pfz_confidence

        response.recommendation = Recommendation(
            status=rec_status,
            summary=localize(pfz_summary),
            decisive_factors=[localize(x) for x in pfz_factors],
            non_decisive_factors=[],
            threshold_comparisons=[],
            next_action=localize(pfz_action),
            confidence=pfz_confidence,
        )
        conf_level_val = pfz_confidence.level.value if hasattr(pfz_confidence.level, 'value') else str(pfz_confidence.level)
        response.decision_object = DecisionObject(
            decision=rec_status,
            confidence=conf_level_val,
            decisive_factor=localize("Informational advisory only — voyage navigation and departure safety must be independently assessed"),
            supporting_factors=[localize(x) for x in pfz_factors],
            evidence=response.evidence,
            recommended_action=localize(pfz_action),
            timestamp=selected.assessed_at,
            alternatives=[r for r in selected.route_candidates if r.get("departure_supported")],
            uncertainty=pfz_confidence.reasons,
        ).model_dump(mode="json")
    else:
        response.confidence = Confidence(level=brief.confidence, reasons=brief.confidence_reasons)
        response.recommendation = Recommendation(status=selected.decision, summary=localize(brief.summary),
            decisive_factors=[localize(x) for x in factors], non_decisive_factors=[localize(x) for x in brief.positive_factors],
            threshold_comparisons=selected.evidence, next_action=localize(brief.recommended_action),
            confidence=response.confidence)
        response.decision_object = DecisionObject(decision=selected.decision, confidence=brief.confidence,
            decisive_factor=localize(factors[0] if factors else brief.summary), supporting_factors=factors[1:],
            evidence=response.evidence, recommended_action=localize(brief.recommended_action), timestamp=selected.assessed_at,
            alternatives=[r for r in selected.route_candidates if r.get("departure_supported")],
            uncertainty=brief.confidence_reasons).model_dump(mode="json")

    response.decision_delta = delta.model_dump(mode="json") if delta else None
    if intent == "WHAT_IF" and delta:
        response.answer = f"{delta.original_decision.value} → {delta.new_decision.value}. " + " ".join(delta.changed_factors + delta.added_factors + [localize(brief.recommended_action)])
    elif intent == "WHAT_CHANGED":
        response.answer = (" ".join((delta.changed_factors + delta.added_factors + delta.removed_factors)) if delta else "No applied mission revision to compare yet.") + " " + localize(brief.recommended_action)
    elif intent in ("ROUTE", "ALTERNATIVE"):
        response.answer = "\n".join(f"{r.get('name')}: {r.get('distance_km')} km, {r.get('eta_hours')} hours. " + ("Supported within evaluated limits." if r.get("departure_supported") else "; ".join(r.get("rejection_reasons", []))) for r in selected.route_candidates) + "\n" + localize(brief.recommended_action)
    elif intent == "PFZ":
        notice = localize("Potential Fishing Zone advisory for fishing opportunity identification only; voyage navigation and departure clearance must be independently assessed.")
        notice_label = "सूचना" if response.language in ("hi", "mr") else "Notice"
        response.answer = f"{cand_text}\n\n{notice_label}: {notice}"
    elif intent == "HAZARDS":
        h = selected.conditions.hazard
        response.answer = f"{h.headline if h else 'Hazard evidence unavailable.'} Valid {h.valid_from if h else 'unknown'} to {h.valid_to if h else 'unknown'}. " + localize(brief.recommended_action)
    elif intent == "CONDITIONS":
        m, w = selected.conditions.marine, selected.conditions.weather
        response.answer = f"{selected.trip_context.origin_harbor}: waves {m.significant_wave_height_m if m else 'unknown'} m; wind {w.wind_speed_knots if w else 'unknown'} knots; visibility {w.visibility_km if w else 'unknown'} km. " + localize(brief.recommended_action)
    elif intent != "WHAT_IF":
        response.answer = " ".join([localize(brief.summary), *[localize(x) for x in factors[:2]], localize(brief.recommended_action)])
    # Proposal does not update the active mission until explicitly applied.
    response.mission_state = baseline.mission_state.model_dump(mode="json") if baseline.mission_state else None
    if any("NON_AUTHORITATIVE" in e.quality_flags for e in response.evidence):
        response.answer += " \n[FIELD SIGNAL] Nearby community context is available in evidence; it cannot override the mission decision or official warnings."
    response.agent_collaboration = None  # No derived agent execution claims.
    response.trace.append(AgentTraceItem(step=len(response.trace) + 1, node="retained_mission_evaluation", agent="domain", tool_name="trip_assessment",
        action=f"Projected {selected.assessment_id} from evidence {selected.evidence_bundle_id}; active mission unchanged until Apply.", status="completed"))
    return response
