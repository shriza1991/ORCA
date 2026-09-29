from backend.app.contracts.assessment import TripAssessmentRequest
from backend.app.services.assessment_service import AssessmentService


def _assess(departure: str, return_time: str):
    return AssessmentService.assess_trip(
        TripAssessmentRequest(
            origin_harbor="Ratnagiri harbour",
            craft_profile="motorized_boat",
            departure_time=departure,
            return_time=return_time,
            destination_id="PFZ-ZONE-1",
            data_mode="DEMO",
        )
    )


def _stable_decision_object(response):
    return {
        "decision": response.decision.value,
        "brief": response.brief.model_dump() if response.brief else None,
        "conditions": response.conditions.model_dump(exclude={"captured_at"}),
        "pfz_candidates": response.pfz_candidates,
        "route_candidates": response.route_candidates,
        "stability": response.stability.model_dump() if response.stability else None,
        "safe_window": response.safe_window.model_dump() if response.safe_window else None,
    }


def test_pinned_fisher_demo_is_repeatable_and_has_canonical_route_metrics():
    responses = [
        _assess("2026-09-28T23:30:00Z", "2026-09-29T07:50:00Z")
        for _ in range(3)
    ]

    assert responses[0].decision.value == "GO"
    assert responses[0].safe_window.window_summary.endswith("15:00 IST.")
    assert [_stable_decision_object(response) for response in responses].count(
        _stable_decision_object(responses[0])
    ) == 3

    zone_one = responses[0].pfz_candidates[0]
    assert zone_one["distance_nautical_miles"] == 25.3
    assert zone_one["bearing_degrees"] == 229.5
    assert zone_one["water_depth_m"] == 35.0
    assert zone_one["sea_surface_temp_c"] == 28.9
    assert zone_one["chlorophyll_mg_m3"] == 1.6

    direct = next(route for route in responses[0].route_candidates if route["route_id"] == "ROUTE-B-DIRECT")
    assert direct["distance_km"] == 46.9
    assert direct["one_way_fuel_liters"] == 9.5
    assert direct["round_trip_distance_km"] == 93.8
    assert direct["round_trip_fuel_liters"] == 19.0


def test_pinned_fisher_demo_what_if_recomputes_window_decision():
    baseline = _assess("2026-09-28T23:30:00Z", "2026-09-29T07:50:00Z")
    delayed = _assess("2026-09-29T05:30:00Z", "2026-09-29T13:30:00Z")

    assert baseline.decision.value == "GO"
    assert delayed.decision.value == "CAUTION"
    assert baseline.brief is not None
    assert delayed.brief is not None
    assert baseline.brief.summary != delayed.brief.summary


def test_normal_hazard_bulletin_does_not_activate_hazard_stability():
    response = _assess("2026-09-28T23:30:00Z", "2026-09-29T07:50:00Z")

    assert response.conditions.hazard is not None
    assert response.conditions.hazard.severity == "NORMAL"
    assert response.conditions.hazard.cyclone_warning_active is False
    assert response.conditions.hazard.squall_alert is False
    assert response.stability is not None
    assert "Active Bulletin" not in response.stability.headline
