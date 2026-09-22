"""Trip Assessments Router.

Exposes the unified trip assessment pipeline.
"""
from fastapi import APIRouter, HTTPException, status
from typing import Any

from backend.app.contracts.assessment import TripAssessmentRequest, TripAssessmentResponse
from backend.app.services.assessment_service import AssessmentService

router = APIRouter(prefix="/trip-assessments", tags=["trip-assessments"])

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
