"""Trip Assessments Router.

Exposes the unified trip assessment pipeline.
"""
from fastapi import APIRouter, HTTPException, status
from typing import Any

from backend.app.contracts.assessment import TripAssessmentRequest, TripAssessmentResponse, TripSimulationRequest, TripSimulationResponse
from backend.app.contracts.mission import DecisionDelta
from backend.app.services.assessment_service import AssessmentService

router = APIRouter(prefix="/trip-assessments", tags=["trip-assessments"])


@router.post("/simulate")
def simulate_trip(request: "TripSimulationRequest") -> "TripSimulationResponse":
    """Re-evaluate both missions with the same source mode; never trust a client verdict."""
    if request.baseline.data_mode != request.simulated.data_mode:
        raise HTTPException(status_code=422, detail="Both missions must use the same data mode.")
    baseline = AssessmentService.assess_trip(request.baseline)
    simulated = AssessmentService.assess_trip(request.simulated)
    before = {row.get("metric_name"): row for row in baseline.evidence}
    changes = []
    for row in simulated.evidence:
        old = before.get(row.get("metric_name"))
        if old and (old.get("observed_value") != row.get("observed_value") or old.get("threshold_value") != row.get("threshold_value")):
            changes.append(f"{row['metric_name'].replace('_', ' ')}: {old.get('observed_value')} â†’ {row.get('observed_value')} {row.get('unit') or ''}; limit {old.get('threshold_value')} â†’ {row.get('threshold_value')}")
    b_factors = baseline.brief.negative_factors if baseline.brief else []
    s_factors = simulated.brief.negative_factors if simulated.brief else []
    delta = DecisionDelta(
        original_decision=baseline.decision, new_decision=simulated.decision,
        decision_changed=baseline.decision != simulated.decision,
        added_factors=[x for x in s_factors if x not in b_factors],
        removed_factors=[x for x in b_factors if x not in s_factors],
        changed_factors=changes,
        temporal_changes={"departure_before": baseline.trip_context.departure_time, "departure_after": simulated.trip_context.departure_time, "return_before": baseline.trip_context.return_time, "return_after": simulated.trip_context.return_time},
        summary=simulated.brief.recommended_action if simulated.brief else "Review the scenario evidence.",
    )
    return TripSimulationResponse(baseline=baseline, simulated=simulated, delta=delta)

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assess trip: {str(exc)}"
        )
