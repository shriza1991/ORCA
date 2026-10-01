"""Bind graph-selected mission intents to retained deterministic assessments."""
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from backend.app.contracts.assessment import TripAssessmentRequest, TripSimulationRequest
from backend.app.contracts.chat import AgentTraceItem, Confidence, EvidenceItem, Recommendation
from backend.app.contracts.mission import DecisionObject
from backend.app.services.mission_evidence import get_assessment


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
    brief = selected.brief
    if not brief:
        return response
    from backend.app.agents.localization import localize_operational_text
    localize = lambda t: localize_operational_text(t, response.language)
    factors = brief.negative_factors or brief.positive_factors
    response.recommendation = Recommendation(status=selected.decision, summary=localize(brief.summary),
        decisive_factors=[localize(x) for x in factors], non_decisive_factors=[localize(x) for x in brief.positive_factors],
        threshold_comparisons=selected.evidence, next_action=localize(brief.recommended_action))
    response.confidence = Confidence(level=brief.confidence, reasons=brief.confidence_reasons)
    response.assessment_id = selected.assessment_id
    response.evidence = [EvidenceItem(evidence_id=f"{selected.evidence_bundle_id}:{row.get('metric_name', i)}",
        source_name="Retained mission domain evaluation", metric_name=row.get("metric_name"), metric_value=row.get("observed_value"),
        metric_unit=row.get("unit"), quality_flags=[selected.conditions.provenance_mode], retrieved_at=selected.conditions.captured_at)
        for i, row in enumerate(selected.evidence) if row.get("metric_name")]
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
        response.answer = "\n".join(f"{p.get('candidate_id')}: {p.get('distance_nautical_miles')} nm, bearing {p.get('bearing_degrees')} degrees." for p in selected.pfz_candidates[:3]) or "No supported fishing candidate in retained evidence."
        response.answer += "\n" + localize(brief.recommended_action)
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
    response.agent_collaboration = None  # No derived agent execution claims.
    response.trace.append(AgentTraceItem(step=len(response.trace) + 1, node="retained_mission_evaluation", agent="domain", tool_name="trip_assessment",
        action=f"Projected {selected.assessment_id} from evidence {selected.evidence_bundle_id}; active mission unchanged until Apply.", status="completed"))
    return response
