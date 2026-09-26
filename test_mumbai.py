import asyncio
from backend.app.services.assessment_service import AssessmentService
from backend.app.contracts.assessment import TripAssessmentRequest
import json

async def main():
    req = TripAssessmentRequest(
        origin_harbor="Mumbai",
        craft_profile="motorized_boat",
        destination_id="MH-PFZ-28",
        language_preference="en",
        data_mode="HYBRID"
    )
    res = AssessmentService.assess_trip(req)
    print("ROUTE CANDIDATES COUNT:", len(res.route_candidates))
    for i, r in enumerate(res.route_candidates):
        print(f"ROUTE {i}: {r['name']}, Distance: {r['distance_km']}")
        print(f"  Start: {r['waypoints'][0]}, End: {r['waypoints'][-1]}")

asyncio.run(main())
