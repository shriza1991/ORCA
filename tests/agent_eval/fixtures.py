"""Standard Agent Evaluation Fixture Library for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Defines the benchmark evaluation test suite for:
- 8 Canonical Scenarios (S1-S8)
- Multilingual inquiries (English, Hindi, Marathi)
- Intent classification, tool planning, and evidence requirements

NOTE: In Milestone M0, fixtures are declared and validated for schema consistency.
Full end-to-end evaluation execution runs in Milestone M1 once LangGraph nodes are wired.
"""

from typing import List

from backend.app.agents.intent import IntentCategory
from backend.app.contracts.chat import RecommendationStatus
from tests.agent_eval.eval_types import AgentEvalCase

BENCHMARK_EVAL_CASES: List[AgentEvalCase] = [
    # -------------------------------------------------------------------------
    # Scenario S1: Normal Conditions (Calm Weather, GO)
    # -------------------------------------------------------------------------
    AgentEvalCase(
        case_id="EVAL-S1-EN-NORMAL",
        scenario_ref="S1",
        query="Is it safe to go fishing tomorrow morning from Ratnagiri?",
        context={"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat"},
        expected_language="en",
        expected_intent=IntentCategory.SAFETY,
        expected_tools=[
            "marine_weather_forecast",
            "cyclone_hazard_bulletin",
            "evaluate_safety_risk",
        ],
        expected_safety_behavior=RecommendationStatus.GO,
        expected_evidence_requirements=["significant_wave_height", "wind_speed_knots"],
        is_implemented=False,
        notes="S1 baseline: calm wave height (< 1.2m), low wind, no active IMD warnings.",
    ),
    # -------------------------------------------------------------------------
    # Scenario S1 (Marathi Variant)
    # -------------------------------------------------------------------------
    AgentEvalCase(
        case_id="EVAL-S1-MR-NORMAL",
        scenario_ref="S1",
        query="उद्या सकाळी रत्नागिरीवरून समुद्रात मासेमारीसाठी जाणे सुरक्षित आहे का?",
        context={"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat"},
        expected_language="mr",
        expected_intent=IntentCategory.SAFETY,
        expected_tools=[
            "marine_weather_forecast",
            "cyclone_hazard_bulletin",
            "evaluate_safety_risk",
        ],
        expected_safety_behavior=RecommendationStatus.GO,
        expected_evidence_requirements=["significant_wave_height", "wind_speed_knots"],
        is_implemented=False,
        notes="S1 Marathi query: Must detect language 'mr' and respond in Marathi.",
    ),
    # -------------------------------------------------------------------------
    # Scenario S2: Elevated Sea State (CAUTION)
    # -------------------------------------------------------------------------
    AgentEvalCase(
        case_id="EVAL-S2-EN-ELEVATED",
        scenario_ref="S2",
        query="What is the sea condition off Veraval tomorrow? Can motorized craft operate?",
        context={"origin_harbor": "Veraval", "craft_profile": "motorized_boat"},
        expected_language="en",
        expected_intent=IntentCategory.SAFETY,
        expected_tools=[
            "marine_weather_forecast",
            "cyclone_hazard_bulletin",
            "evaluate_safety_risk",
        ],
        expected_safety_behavior=RecommendationStatus.CAUTION,
        expected_evidence_requirements=["significant_wave_height", "swell_period"],
        is_implemented=False,
        notes="S2: wave height 2.2m near threshold. Status must be CAUTION, not soft-pedaled.",
    ),
    # -------------------------------------------------------------------------
    # Scenario S3: Severe Weather / Cyclone Warning (NO_GO)
    # -------------------------------------------------------------------------
    AgentEvalCase(
        case_id="EVAL-S3-HI-CYCLONE",
        scenario_ref="S3",
        query="क्या कल सुबह पोरबंदर से नाव लेकर निकल सकते हैं? कोई तूफान की चेतावनी है?",
        context={"origin_harbor": "Porbandar", "craft_profile": "motorized_boat"},
        expected_language="hi",
        expected_intent=IntentCategory.SAFETY,
        expected_tools=[
            "marine_weather_forecast",
            "cyclone_hazard_bulletin",
            "evaluate_safety_risk",
        ],
        expected_safety_behavior=RecommendationStatus.NO_GO,
        expected_evidence_requirements=["cyclone_bulletin", "wind_gust_knots"],
        is_implemented=False,
        notes="S3 Hindi query: Active IMD depression/cyclone warning triggers strict NO_GO.",
    ),
    # -------------------------------------------------------------------------
    # Scenario S4: Stale or Degraded Forecast (UNKNOWN / CAUTION with warnings)
    # -------------------------------------------------------------------------
    AgentEvalCase(
        case_id="EVAL-S4-EN-STALE-DATA",
        scenario_ref="S4",
        query="Is it safe to depart from Malpe tomorrow?",
        context={"origin_harbor": "Malpe", "craft_profile": "motorized_boat"},
        expected_language="en",
        expected_intent=IntentCategory.SAFETY,
        expected_tools=[
            "marine_weather_forecast",
            "cyclone_hazard_bulletin",
            "evaluate_safety_risk",
        ],
        expected_safety_behavior=RecommendationStatus.UNKNOWN,
        expected_evidence_requirements=["significant_wave_height"],
        is_implemented=False,
        notes="S4: Missing/expired sensor feed must result in UNKNOWN with explicit degradation warning.",
    ),
    # -------------------------------------------------------------------------
    # Scenario S5: Nearest Potential Fishing Zone (PFZ)
    # -------------------------------------------------------------------------
    AgentEvalCase(
        case_id="EVAL-S5-EN-PFZ-SEARCH",
        scenario_ref="S5",
        query="Where is the nearest potential fishing zone from Ratnagiri today?",
        context={"origin_harbor": "Ratnagiri", "craft_profile": "motorized_boat"},
        expected_language="en",
        expected_intent=IntentCategory.PFZ,
        expected_tools=[
            "fetch_pfz_advisories",
            "marine_weather_forecast",
            "compute_pfz_distances",
            "evaluate_safety_risk",
        ],
        expected_safety_behavior=RecommendationStatus.GO,
        expected_evidence_requirements=["pfz_advisory_id", "distance_nautical_miles"],
        is_implemented=False,
        notes="S5: Must query INCOIS PFZ layer, compute nautical miles, and verify passage safety.",
    ),
    # -------------------------------------------------------------------------
    # Scenario S6: Hazard Geofence Intersection (HAZARD_BOUNDARY / NO_GO)
    # -------------------------------------------------------------------------
    AgentEvalCase(
        case_id="EVAL-S6-EN-GEOFENCE-INTERSECT",
        scenario_ref="S6",
        query="Can we fish near the naval firing range off Goa this weekend?",
        context={"origin_harbor": "Panaji", "craft_profile": "mechanized_trawler"},
        expected_language="en",
        expected_intent=IntentCategory.HAZARDS,
        expected_tools=[
            "check_geofence_hazards",
            "cyclone_hazard_bulletin",
            "evaluate_safety_risk",
        ],
        expected_safety_behavior=RecommendationStatus.NO_GO,
        expected_evidence_requirements=["geofence_id", "restriction_status"],
        is_implemented=False,
        notes="S6: Restricted defense/MPA zone intersection must trigger deterministic NO_GO.",
    ),
    # -------------------------------------------------------------------------
    # Scenario S7: Multi-Route Comparison (ROUTE)
    # -------------------------------------------------------------------------
    AgentEvalCase(
        case_id="EVAL-S7-EN-ROUTE-COMPARE",
        scenario_ref="S7",
        query="Which passage is safer to reach the outer fishing bank from Veraval?",
        context={"origin_harbor": "Veraval", "craft_profile": "mechanized_trawler"},
        expected_language="en",
        expected_intent=IntentCategory.ROUTE,
        expected_tools=[
            "generate_candidate_routes",
            "marine_weather_forecast",
            "evaluate_route_exposure",
            "evaluate_safety_risk",
        ],
        expected_safety_behavior=RecommendationStatus.CAUTION,
        expected_evidence_requirements=["route_exposure_score", "significant_wave_height"],
        is_implemented=False,
        notes="S7: Comparative route scoring between Route A (inshore) and Route B (exposed channel).",
    ),
    # -------------------------------------------------------------------------
    # Scenario S8: Analytical Explanation (ANALYTICAL_EXPLANATION)
    # -------------------------------------------------------------------------
    AgentEvalCase(
        case_id="EVAL-S8-EN-EXPLANATION",
        scenario_ref="S8",
        query="Why was the northern passage marked as NO_GO even though wind is low?",
        context={"origin_harbor": "Veraval"},
        expected_language="en",
        expected_intent=IntentCategory.ANALYTICAL_EXPLANATION,
        expected_tools=["fetch_active_evidence_context"],
        expected_safety_behavior=RecommendationStatus.NO_GO,
        expected_evidence_requirements=["geofence_id"],
        is_implemented=False,
        notes="S8: Agent explains that maritime boundary/shallow reef is the decisive factor.",
    ),
]


def get_eval_case(case_id: str) -> AgentEvalCase:
    """Retrieves an evaluation case by unique ID."""
    for case in BENCHMARK_EVAL_CASES:
        if case.case_id == case_id:
            return case
    raise KeyError(f"Evaluation case '{case_id}' not found.")
