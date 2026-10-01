"""Trip Assessments Router.

Exposes the unified trip assessment pipeline.
"""
from fastapi import APIRouter, HTTPException, status
from typing import Any

from backend.app.contracts.assessment import TripAssessmentRequest, TripAssessmentResponse, TripSimulationRequest, TripSimulationResponse
from backend.app.contracts.mission import DecisionDelta
from backend.app.services.assessment_service import AssessmentService

router = APIRouter(prefix="/trip-assessments", tags=["trip-assessments"])


def decision_delta(baseline, simulated):
    before = {row.get("metric_name"): row for row in baseline.evidence}
    changes = []
    for row in simulated.evidence:
        old = before.get(row.get("metric_name"))
        if old and (old.get("observed_value") != row.get("observed_value") or old.get("threshold_value") != row.get("threshold_value")):
            changes.append(f"{row['metric_name'].replace('_', ' ')}: {old.get('observed_value')} -> {row.get('observed_value')} {row.get('unit') or ''}; limit {old.get('threshold_value')} -> {row.get('threshold_value')}")
    b = baseline.brief.negative_factors if baseline.brief else []
    n = simulated.brief.negative_factors if simulated.brief else []
    return DecisionDelta(
        original_decision=baseline.decision, new_decision=simulated.decision,
        decision_changed=baseline.decision != simulated.decision,
        confidence_change=(f"{baseline.brief.confidence} -> {simulated.brief.confidence}" if baseline.brief and simulated.brief and baseline.brief.confidence != simulated.brief.confidence else None),
        added_factors=[x for x in n if x not in b], removed_factors=[x for x in b if x not in n],
        changed_factors=changes,
        temporal_changes={"departure_before": baseline.trip_context.departure_time, "departure_after": simulated.trip_context.departure_time, "return_before": baseline.trip_context.return_time, "return_after": simulated.trip_context.return_time},
        route_changes={"baseline_routes": [r.get("route_id") for r in baseline.route_candidates], "proposed_routes": [r.get("route_id") for r in simulated.route_candidates]},
        summary=simulated.brief.recommended_action if simulated.brief else "Review the scenario evidence.",
    )


def compare_trip(request):
    from backend.app.services.mission_evidence import get_assessment, EvidenceUnavailable
    if request.baseline.data_mode.upper() != request.simulated.data_mode.upper():
        raise HTTPException(status_code=422, detail="Both missions must use the same data mode.")
    try:
        if request.baseline_assessment_id:
            baseline = get_assessment(request.baseline_assessment_id)
            if baseline.conditions.data_mode.upper() != request.baseline.data_mode.upper():
                raise EvidenceUnavailable("Baseline mode does not match retained assessment.")
        else:
            baseline = AssessmentService.assess_trip(request.baseline)
        proposed = request.simulated.model_copy(deep=True)
        if proposed.evidence_bundle_id and proposed.evidence_bundle_id != baseline.evidence_bundle_id:
            raise EvidenceUnavailable("Comparison must use the baseline evidence bundle.")
        proposed.evidence_bundle_id = baseline.evidence_bundle_id
        proposed.parent_assessment_id = baseline.assessment_id
        # Keep one mission identity; proposal fields override its previous timing/vessel.
        proposed.mission_state = None
        simulated = AssessmentService.assess_trip(proposed)
        if simulated.mission_state and baseline.mission_state:
            simulated.mission_state.mission_id = baseline.mission_state.mission_id
        from backend.app.services.mission_evidence import retain_assessment
        retain_assessment(simulated)
        return TripSimulationResponse(baseline=baseline, simulated=simulated, delta=decision_delta(baseline, simulated))
    except EvidenceUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/simulate", response_model=TripSimulationResponse)
def simulate_trip(request: TripSimulationRequest) -> TripSimulationResponse:
    """Compare against retained inputs; no independent baseline refetch."""
    return compare_trip(request)


@router.get("/{assessment_id}", response_model=TripAssessmentResponse)
def replay_assessment(assessment_id: str):
    from backend.app.services.mission_evidence import get_assessment, EvidenceUnavailable
    try:
        return get_assessment(assessment_id)
    except EvidenceUnavailable as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{assessment_id}/refresh", response_model=TripSimulationResponse)
def refresh_assessment(assessment_id: str):
    """Same mission, new evidence: explicitly separate from a parameter simulation."""
    from backend.app.services.mission_evidence import get_assessment, EvidenceUnavailable
    try:
        baseline = get_assessment(assessment_id)
    except EvidenceUnavailable as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    c = baseline.trip_context
    refreshed = AssessmentService.assess_trip(TripAssessmentRequest(
        origin_harbor=c.origin_harbor, coordinates=c.coordinates, craft_profile=c.craft_profile,
        vessel_size=c.vessel_size, departure_time=c.departure_time, return_time=c.return_time,
        destination_id=c.target_pfz, data_mode=baseline.conditions.data_mode,
        language_preference=c.language_preference, mission_state=baseline.mission_state,
        parent_assessment_id=baseline.assessment_id))
    return TripSimulationResponse(baseline=baseline, simulated=refreshed, delta=decision_delta(baseline, refreshed))


@router.post(
    "",
    response_model=TripAssessmentResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate a unified Trip Assessment",
    description="Evaluates harbor, vessel profile, and timestamps against current marine conditions and hazards to produce a unified safety decision."
)
def create_trip_assessment(request: TripAssessmentRequest) -> Any:
    """Creates a new Trip Assessment."""
    try:
        response = AssessmentService.assess_trip(request)
        if response.decision == "UNKNOWN" and "Missing critical inputs" in str(response.alerts):
            # If critical validation fails early
            raise HTTPException(status_code=400, detail=str(response.alerts))
        return response
    except HTTPException:
        raise
    except Exception as exc:
        from backend.app.services.mission_evidence import EvidenceUnavailable
        if isinstance(exc, EvidenceUnavailable):
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assess trip: {str(exc)}"
        )
