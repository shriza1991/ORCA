"""Canonical Evaluation Scenario Registry for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability) & Dev 4 (Domain Intelligence).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Maintains the authoritative S1–S8 canonical benchmark evaluation scenarios,
preserving existing numbering, multilingual fidelity, deterministic risk rules,
and semantic polygon classification.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

from backend.app.agents.intent import IntentCategory
from backend.app.agents.integrations.dev2 import (
    HazardBulletinPayload,
    MarineConditionsPayload,
    WeatherConditionsPayload,
)
from backend.app.contracts.chat import ConfidenceLevel, RecommendationStatus
from backend.app.scenarios.models import (
    PolygonType,
    ScenarioCategory,
    ScenarioDefinition,
    ScenarioExpectedOutcome,
    ScenarioInputData,
    ScenarioManifestItem,
    ScenarioPolygon,
)

logger = logging.getLogger(__name__)

# Common reference timestamps
VALID_NOW_ISO = "2026-09-10T06:00:00Z"
VALID_FUTURE_ISO = "2030-01-01T00:00:00Z"
VALID_EXPIRED_ISO = "2020-01-01T00:00:00Z"


# =============================================================================
# Geospatial Polygon Fixtures
# =============================================================================

POLYGON_NAVAL_RANGE_GOA = ScenarioPolygon(
    polygon_id="POLY-NAV-GOA-01",
    name="Naval Firing Range Foxtrot (Goa)",
    polygon_type=PolygonType.NAVAL_FIRING_RANGE,
    is_hard_restriction=True,
    coordinates=[
        [73.18, 15.30],
        [73.35, 15.28],
        [73.42, 15.36],
        [73.42, 15.48],
        [73.38, 15.54],
        [73.25, 15.55],
        [73.15, 15.52],
        [73.08, 15.45],
        [73.06, 15.38],
        [73.12, 15.32],
        [73.18, 15.30],
    ],
    description="Active naval artillery and missile testing sector — all civilian navigation strictly prohibited.",
)

POLYGON_MPA_MALVAN = ScenarioPolygon(
    polygon_id="POLY-MPA-MALVAN-02",
    name="Malvan Marine Sanctuary Core Zone",
    polygon_type=PolygonType.MPA_SANCTUARY_CORE,
    is_hard_restriction=True,
    coordinates=[
        [73.435, 16.035],
        [73.475, 16.032],
        [73.502, 16.048],
        [73.508, 16.075],
        [73.495, 16.102],
        [73.465, 16.115],
        [73.435, 16.105],
        [73.418, 16.082],
        [73.415, 16.055],
        [73.425, 16.040],
        [73.435, 16.035],
    ],
    description="Marine Protected Area sanctuary core — mechanized trawling and commercial anchoring barred.",
)

POLYGON_EEZ_WEST_COAST = ScenarioPolygon(
    polygon_id="POLY-EEZ-WEST-01",
    name="Indian Exclusive Economic Zone (West Coast)",
    polygon_type=PolygonType.EEZ_BOUNDARY,
    is_hard_restriction=False,
    coordinates=[
        [68.45, 20.00],
        [69.20, 18.50],
        [70.10, 16.80],
        [70.85, 15.20],
        [71.50, 14.00],
        [72.50, 14.00],
        [72.80, 15.50],
        [72.60, 17.20],
        [72.20, 18.80],
        [71.20, 20.00],
        [68.45, 20.00],
    ],
    description="Sovereign maritime economic advisory zone for Indian registered fishing craft.",
)

POLYGON_IMBL_GUJARAT = ScenarioPolygon(
    polygon_id="POLY-IMBL-GUJ-01",
    name="International Maritime Boundary Line Advisory Zone (Gujarat Sector)",
    polygon_type=PolygonType.IMBL_ADVISORY_BORDER,
    is_hard_restriction=False,
    coordinates=[
        [68.16, 23.68],
        [68.05, 23.60],
        [67.90, 23.48],
        [67.75, 23.35],
        [67.55, 23.15],
        [67.35, 22.95],
        [67.15, 22.75],
        [66.90, 22.50],
        [66.70, 22.25],
        [66.95, 22.10],
        [67.25, 22.35],
        [67.50, 22.60],
        [67.72, 22.82],
        [67.95, 23.05],
        [68.15, 23.28],
        [68.28, 23.50],
        [68.16, 23.68],
    ],
    description="Sensitive border approach corridor — mariners receive proximity alert without automatic no-go.",
)


# =============================================================================
# Canonical Benchmark Scenarios (S1–S8)
# =============================================================================

CANONICAL_SCENARIOS: Dict[str, ScenarioDefinition] = {
    # -------------------------------------------------------------------------
    # Scenario S1: Normal Favorable Conditions (Safe trip / GO)
    # -------------------------------------------------------------------------
    "S1": ScenarioDefinition(
        id="S1",
        name="Normal favorable conditions",
        category=ScenarioCategory.SAFETY,
        description="Calm sea state (< 1.2m significant wave height) and light winds (< 12 knots) with no active hazards. Evaluates clear GO departure recommendation.",
        harbor="Ratnagiri",
        query="Is it safe to go fishing off Ratnagiri coast for the next 6 hours?",
        multilingual_queries={
            "en": "Is it safe to go fishing off Ratnagiri coast for the next 6 hours?",
            "mr": "उद्या सकाळी रत्नागिरीवरून समुद्रात मासेमारीसाठी जाणे सुरक्षित आहे का?",
            "hi": "क्या कल सुबह रत्नागिरी से मछली पकड़ने जाना सुरक्षित है?",
        },
        inputs=ScenarioInputData(
            origin_harbor="Ratnagiri",
            craft_profile="motorized_boat",
            marine=MarineConditionsPayload(
                harbor="Ratnagiri",
                significant_wave_height_m=0.9,
                swell_height_m=0.6,
                swell_period_sec=6.5,
                surface_current_knots=0.8,
                sea_surface_temp_c=28.4,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="INCOIS Ocean State Forecast",
            ),
            weather=WeatherConditionsPayload(
                harbor="Ratnagiri",
                wind_speed_knots=10.0,
                wind_gust_knots=13.0,
                wind_direction_deg=250.0,
                visibility_km=12.0,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Coastal Weather Bulletin",
            ),
            hazard=HazardBulletinPayload(
                harbor="Ratnagiri",
                cyclone_warning_active=False,
                squall_alert=False,
                bulletin_id="IMD-NORMAL-01",
                severity="NORMAL",
                headline="Calm coastal sea state",
                valid_from=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Hazard Division",
            ),
            polygons=[POLYGON_EEZ_WEST_COAST],
        ),
        expected=ScenarioExpectedOutcome(
            intent=IntentCategory.SAFETY,
            status=RecommendationStatus.GO,
            confidence=ConfidenceLevel.HIGH,
            expected_tools=["marine_conditions", "weather_conditions", "hazard_search", "risk_evaluation"],
            decisive_factors_keywords=["wave", "wind", "calm", "safe", "0.9"],
            expected_evidence_metrics=["significant_wave_height", "wind_speed"],
            recommended_action_keywords=["proceed", "safe", "departure"],
        ),
        tags=["safety", "go", "normal_conditions", "incois", "imd"],
        ui_metadata={
            "icon": "shield-check",
            "badge": "GO",
            "badge_color": "emerald",
            "summary": "Calm seas (0.9m) and mild winds (10 kt). Ideal for motorized craft departure.",
        },
    ),

    # -------------------------------------------------------------------------
    # Scenario S2: Elevated Sea State (CAUTION / Dangerous sea boundary)
    # -------------------------------------------------------------------------
    "S2": ScenarioDefinition(
        id="S2",
        name="Elevated sea state",
        category=ScenarioCategory.SAFETY,
        description="Moderate wave state (2.2m wave height, 22 kt wind gusts) approaching vessel safety threshold. Evaluates operational CAUTION recommendation.",
        harbor="Veraval",
        query="Is it safe to go fishing off Veraval tomorrow? Can motorized craft operate in elevated sea state?",
        multilingual_queries={
            "en": "Is it safe to go fishing off Veraval tomorrow? Can motorized craft operate in elevated sea state?",
            "mr": "उद्या वेरावळवरून मासेमारीला जाणे सुरक्षित आहे का? वाढलेल्या लाटांमध्ये बोट चालेल का?",
            "hi": "क्या कल वेरावल से मछली पकड़ने जाना सुरक्षित है? क्या ऊंची लहरों में नाव चल सकती है?",
        },
        inputs=ScenarioInputData(
            origin_harbor="Veraval",
            craft_profile="motorized_boat",
            marine=MarineConditionsPayload(
                harbor="Veraval",
                significant_wave_height_m=2.2,
                swell_height_m=1.8,
                swell_period_sec=9.5,
                surface_current_knots=1.8,
                sea_surface_temp_c=27.2,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="INCOIS Ocean State Forecast",
            ),
            weather=WeatherConditionsPayload(
                harbor="Veraval",
                wind_speed_knots=21.0,
                wind_gust_knots=26.0,
                wind_direction_deg=220.0,
                visibility_km=8.0,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Coastal Weather Bulletin",
            ),
            hazard=HazardBulletinPayload(
                harbor="Veraval",
                cyclone_warning_active=False,
                squall_alert=True,
                bulletin_id="IMD-SQUALL-VERAVAL-01",
                severity="ALERT",
                headline="Squally weather watch off Saurashtra coast",
                valid_from=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Hazard Division",
            ),
            polygons=[POLYGON_EEZ_WEST_COAST],
        ),
        expected=ScenarioExpectedOutcome(
            intent=IntentCategory.SAFETY,
            status=RecommendationStatus.CAUTION,
            confidence=ConfidenceLevel.HIGH,
            expected_tools=["marine_conditions", "weather_conditions", "hazard_search", "risk_evaluation"],
            decisive_factors_keywords=["wave", "2.2", "caution", "wind"],
            expected_evidence_metrics=["significant_wave_height", "wind_speed"],
            recommended_action_keywords=["caution", "coastline", "5 nm", "watch"],
        ),
        tags=["safety", "caution", "elevated_sea", "wave_threshold"],
        ui_metadata={
            "icon": "shield-alert",
            "badge": "CAUTION",
            "badge_color": "amber",
            "summary": "Wave height 2.2m and 21 kt wind. Operation permitted only within 5 nm with VHF watch.",
        },
    ),

    # -------------------------------------------------------------------------
    # Scenario S3: Severe Marine / Cyclone Alert (Cyclone or severe hazard / NO_GO)
    # -------------------------------------------------------------------------
    "S3": ScenarioDefinition(
        id="S3",
        name="Severe marine / cyclone alert",
        category=ScenarioCategory.HAZARDS,
        description="Active IMD deep depression / cyclonic storm alert with 3.6m waves and 38 kt gale gusts. Evaluates strict NO_GO safety override.",
        harbor="Porbandar",
        query="क्या कल सुबह पोरबंदर से नाव लेकर निकल सकते हैं? कोई तूफान की चेतावनी है?",
        multilingual_queries={
            "en": "Can we sail out from Porbandar port tomorrow? Is there any cyclone warning?",
            "mr": "उद्या पोरबंदर बंदरातून बोट नेणे सुरक्षित आहे का? वादळाचा इशारा आहे का?",
            "hi": "क्या कल सुबह पोरबंदर से नाव लेकर निकल सकते हैं? कोई तूफान की चेतावनी है?",
        },
        inputs=ScenarioInputData(
            origin_harbor="Porbandar",
            craft_profile="motorized_boat",
            marine=MarineConditionsPayload(
                harbor="Porbandar",
                significant_wave_height_m=3.6,
                swell_height_m=2.9,
                swell_period_sec=11.0,
                surface_current_knots=2.8,
                sea_surface_temp_c=26.5,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="INCOIS Ocean State Forecast",
            ),
            weather=WeatherConditionsPayload(
                harbor="Porbandar",
                wind_speed_knots=34.0,
                wind_gust_knots=42.0,
                wind_direction_deg=200.0,
                visibility_km=4.0,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Coastal Weather Bulletin",
            ),
            hazard=HazardBulletinPayload(
                harbor="Porbandar",
                cyclone_warning_active=True,
                squall_alert=True,
                bulletin_id="IMD-CYCLONE-ARABIAN-03",
                severity="WARNING",
                headline="Cyclonic Storm Advisory: Red Alert for Gujarat Maritime Coast",
                valid_from=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Cyclone Warning Division",
            ),
            polygons=[POLYGON_EEZ_WEST_COAST],
        ),
        expected=ScenarioExpectedOutcome(
            intent=IntentCategory.HAZARDS,
            status=RecommendationStatus.NO_GO,
            confidence=ConfidenceLevel.HIGH,
            expected_tools=["marine_conditions", "weather_conditions", "hazard_search", "risk_evaluation"],
            decisive_factors_keywords=["cyclone", "wave", "3.6", "wind", "no-go", "no_go"],
            expected_evidence_metrics=["cyclone_bulletin", "significant_wave_height"],
            recommended_action_keywords=["remain", "moored", "port", "hold", "do not"],
        ),
        tags=["hazard", "cyclone", "no_go", "red_alert", "imd"],
        ui_metadata={
            "icon": "alert-triangle",
            "badge": "NO_GO",
            "badge_color": "rose",
            "summary": "Active IMD Cyclonic Storm Bulletin & 3.6m seas. Total departure ban in effect.",
        },
    ),

    # -------------------------------------------------------------------------
    # Scenario S4: Missing / Stale Critical Forecast (Missing/stale data / UNKNOWN)
    # -------------------------------------------------------------------------
    "S4": ScenarioDefinition(
        id="S4",
        name="Missing / stale critical forecast",
        category=ScenarioCategory.DATA_QUALITY,
        description="Sensor telemetry is expired or essential wave data is absent, triggering conservative UNKNOWN recommendation with explicit degradation warnings.",
        harbor="Malpe",
        query="Is it safe to depart from Malpe tomorrow morning on a fishing trip?",
        multilingual_queries={
            "en": "Is it safe to depart from Malpe tomorrow morning on a fishing trip?",
            "mr": "उद्या सकाळी मालपेवरून मासेमारीसाठी निघणे सुरक्षित आहे का?",
            "hi": "क्या कल सुबह मालपे से मछली पकड़ने के लिए निकलना सुरक्षित है?",
        },
        inputs=ScenarioInputData(
            origin_harbor="Malpe",
            craft_profile="motorized_boat",
            marine=MarineConditionsPayload(
                harbor="Malpe",
                significant_wave_height_m=1.2,
                swell_height_m=0.9,
                swell_period_sec=7.0,
                surface_current_knots=0.9,
                sea_surface_temp_c=28.0,
                observed_at=VALID_EXPIRED_ISO,
                valid_to=VALID_EXPIRED_ISO,  # Authentically expired timestamp
                source_name="INCOIS OSF Connector (Expired Feed)",
            ),
            weather=WeatherConditionsPayload(
                harbor="Malpe",
                wind_speed_knots=12.0,
                wind_gust_knots=15.0,
                wind_direction_deg=230.0,
                visibility_km=10.0,
                observed_at=VALID_EXPIRED_ISO,
                valid_to=VALID_EXPIRED_ISO,
                source_name="IMD Weather Connector (Expired Feed)",
            ),
            hazard=HazardBulletinPayload(
                harbor="Malpe",
                cyclone_warning_active=False,
                squall_alert=False,
                bulletin_id="IMD-STALE-01",
                severity="NORMAL",
                headline="Historical Coastal Bulletin",
                valid_from=VALID_EXPIRED_ISO,
                valid_to=VALID_EXPIRED_ISO,
                source_name="IMD Hazard Division",
            ),
            is_stale=True,
            stale_reason="Sensor feed expired > valid_to window. Telemetry is non-authoritative.",
            polygons=[POLYGON_EEZ_WEST_COAST],
        ),
        expected=ScenarioExpectedOutcome(
            intent=IntentCategory.SAFETY,
            status=RecommendationStatus.UNKNOWN,
            confidence=ConfidenceLevel.LOW,
            expected_tools=["marine_conditions", "weather_conditions", "hazard_search", "risk_evaluation"],
            decisive_factors_keywords=["stale", "expired", "unknown", "reliable", "unavailable"],
            expected_evidence_metrics=["significant_wave_height"],
            recommended_action_keywords=["hold", "verify", "authoritative", "do not"],
        ),
        tags=["data_quality", "stale_data", "unknown", "degradation_warning"],
        ui_metadata={
            "icon": "help-circle",
            "badge": "UNKNOWN",
            "badge_color": "slate",
            "summary": "Forecast feed is expired or degraded. System defaults to UNKNOWN for mariner safety.",
        },
    ),

    # -------------------------------------------------------------------------
    # Scenario S5: Nearest Potential Fishing Zone (PFZ discovery)
    # -------------------------------------------------------------------------
    "S5": ScenarioDefinition(
        id="S5",
        name="Nearest Potential Fishing Zone",
        category=ScenarioCategory.PFZ,
        description="Discovers active INCOIS PFZ line features, calculates geodesic distance, compass bearing, water depth, and verifies passage transit safety.",
        harbor="Ratnagiri",
        query="Where is the nearest potential fishing zone from Ratnagiri today?",
        multilingual_queries={
            "en": "Where is the nearest potential fishing zone from Ratnagiri today?",
            "mr": "रत्नागिरीवरून आज सर्वात जवळचा संभाव्य मासेमारी क्षेत्र (PFZ) कुठे आहे?",
            "hi": "रत्नागिरी से आज सबसे नजदीकी संभावित मत्स्य पालन क्षेत्र (PFZ) कहाँ है?",
        },
        inputs=ScenarioInputData(
            origin_harbor="Ratnagiri",
            craft_profile="motorized_boat",
            marine=MarineConditionsPayload(
                harbor="Ratnagiri",
                significant_wave_height_m=1.0,
                swell_height_m=0.7,
                swell_period_sec=7.0,
                surface_current_knots=0.9,
                sea_surface_temp_c=28.1,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="INCOIS Ocean State Forecast",
            ),
            weather=WeatherConditionsPayload(
                harbor="Ratnagiri",
                wind_speed_knots=11.0,
                wind_gust_knots=14.0,
                wind_direction_deg=240.0,
                visibility_km=10.0,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Coastal Weather Bulletin",
            ),
            hazard=HazardBulletinPayload(
                harbor="Ratnagiri",
                cyclone_warning_active=False,
                squall_alert=False,
                bulletin_id="IMD-NORMAL-05",
                severity="NORMAL",
                headline="Calm Coastal Conditions",
                valid_from=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Hazard Division",
            ),
            pfz_features=[
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [73.10, 16.95]},
                    "properties": {
                        "advisory_id": "PFZ-INCOIS-RTN-01",
                        "sst_c": 28.1,
                        "chlorophyll_mg_m3": 1.65,
                        "depth_m": 42.0,
                    },
                }
            ],
            polygons=[POLYGON_EEZ_WEST_COAST],
        ),
        expected=ScenarioExpectedOutcome(
            intent=IntentCategory.PFZ,
            status=RecommendationStatus.GO,
            confidence=ConfidenceLevel.HIGH,
            expected_tools=["marine_conditions", "pfz_search"],
            decisive_factors_keywords=["pfz", "nautical miles", "bearing", "distance"],
            expected_evidence_metrics=["pfz_advisory_id", "distance_nautical_miles"],
            recommended_action_keywords=["proceed", "transit", "coordinates"],
        ),
        tags=["pfz", "fisheries", "incois", "geodesic_ranking"],
        ui_metadata={
            "icon": "fish",
            "badge": "PFZ",
            "badge_color": "cyan",
            "summary": "PFZ zone located 14.2 nm West (bearing 278°). Safe passage conditions confirmed.",
        },
    ),

    # -------------------------------------------------------------------------
    # Scenario S6: Route Crosses Restricted Maritime Polygon (Geofence conflict / NO_GO)
    # -------------------------------------------------------------------------
    "S6": ScenarioDefinition(
        id="S6",
        name="Route crosses restricted maritime polygon",
        category=ScenarioCategory.HAZARDS,
        description="Direct route intersects an active Naval Firing Range polygon. Deterministic geospatial engine flags the conflict and enforces NO_GO.",
        harbor="Panaji",
        query="Can we fish near the naval firing range off Goa this weekend?",
        multilingual_queries={
            "en": "Can we fish near the naval firing range off Goa this weekend?",
            "mr": "या शनिवार-रविवार आम्ही गोव्याच्या नौदल फायरिंग रेंजजवळ मासेमारी करू शकतो का?",
            "hi": "क्या हम इस सप्ताहांत गोवा के नौसेना फायरिंग रेंज के पास मछली पकड़ सकते हैं?",
        },
        inputs=ScenarioInputData(
            origin_harbor="Panaji",
            craft_profile="mechanized_trawler",
            coordinates=[73.25, 15.42],  # Inside naval firing sector
            marine=MarineConditionsPayload(
                harbor="Panaji",
                significant_wave_height_m=1.3,
                swell_height_m=0.9,
                swell_period_sec=8.0,
                surface_current_knots=1.1,
                sea_surface_temp_c=28.5,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="INCOIS Ocean State Forecast",
            ),
            weather=WeatherConditionsPayload(
                harbor="Panaji",
                wind_speed_knots=12.0,
                wind_gust_knots=15.0,
                wind_direction_deg=230.0,
                visibility_km=10.0,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Coastal Weather Bulletin",
            ),
            hazard=HazardBulletinPayload(
                harbor="Panaji",
                cyclone_warning_active=False,
                squall_alert=False,
                bulletin_id="IMD-NORMAL-06",
                severity="NORMAL",
                headline="Calm Coastal Conditions",
                valid_from=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Hazard Division",
            ),
            polygons=[POLYGON_NAVAL_RANGE_GOA, POLYGON_EEZ_WEST_COAST],
        ),
        expected=ScenarioExpectedOutcome(
            intent=IntentCategory.HAZARDS,
            status=RecommendationStatus.NO_GO,
            confidence=ConfidenceLevel.HIGH,
            expected_tools=["marine_conditions", "hazard_search", "geospatial_hazard"],
            decisive_factors_keywords=["naval", "restricted", "firing range", "boundary", "no_go", "no-go"],
            expected_evidence_metrics=["geofence_id", "restriction_status"],
            recommended_action_keywords=["avoid", "alter course", "prohibited", "do not enter"],
        ),
        tags=["geofence", "naval_range", "hard_restriction", "no_go", "gis"],
        ui_metadata={
            "icon": "map-pin",
            "badge": "GEOFENCE_CONFLICT",
            "badge_color": "rose",
            "summary": "Intersection with Naval Firing Range Foxtrot. Direct entry prohibited by maritime defense order.",
        },
    ),

    # -------------------------------------------------------------------------
    # Scenario S7: Safer Alternative Route Comparison (Route comparison)
    # -------------------------------------------------------------------------
    "S7": ScenarioDefinition(
        id="S7",
        name="Safer alternative route comparison",
        category=ScenarioCategory.ROUTE,
        description="Compares an exposed open-sea passage (Route B, 2.1m waves) with a sheltered inshore channel (Route A, 1.3m waves) and recommends the safer option.",
        harbor="Veraval",
        query="Which of these two coastal routes from Veraval to Porbandar has lower wave risk?",
        multilingual_queries={
            "en": "Which of these two coastal routes from Veraval to Porbandar has lower wave risk?",
            "mr": "वेरावळ ते पोरबंदर या दोन सागरी मार्गांपैकी कोणता मार्ग लाटांच्या दृष्टीने अधिक सुरक्षित आहे?",
            "hi": "वेरावल से पोरबंदर के दो तटीय मार्गों में से कौन सा रास्ता कम जोखिम वाला और अधिक सुरक्षित है?",
        },
        inputs=ScenarioInputData(
            origin_harbor="Veraval",
            destination="Porbandar",
            craft_profile="mechanized_trawler",
            marine=MarineConditionsPayload(
                harbor="Veraval",
                significant_wave_height_m=1.8,
                swell_height_m=1.4,
                swell_period_sec=8.5,
                surface_current_knots=1.5,
                sea_surface_temp_c=27.8,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="INCOIS Ocean State Forecast",
            ),
            weather=WeatherConditionsPayload(
                harbor="Veraval",
                wind_speed_knots=17.0,
                wind_gust_knots=22.0,
                wind_direction_deg=225.0,
                visibility_km=9.0,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Coastal Weather Bulletin",
            ),
            hazard=HazardBulletinPayload(
                harbor="Veraval",
                cyclone_warning_active=False,
                squall_alert=False,
                bulletin_id="IMD-NORMAL-07",
                severity="NORMAL",
                headline="Moderate Coastal Conditions",
                valid_from=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Hazard Division",
            ),
            routes=[
                {
                    "route_id": "ROUTE-A-INSHORE",
                    "name": "Inshore Sheltered Channel",
                    "distance_km": 26.5,
                    "max_wave_height_m": 1.3,
                    "exposure_score": 2.1,
                },
                {
                    "route_id": "ROUTE-B-DIRECT",
                    "name": "Direct Open-Sea Channel",
                    "distance_km": 20.2,
                    "max_wave_height_m": 2.1,
                    "exposure_score": 4.8,
                },
            ],
            polygons=[POLYGON_EEZ_WEST_COAST],
        ),
        expected=ScenarioExpectedOutcome(
            intent=IntentCategory.ROUTE,
            status=RecommendationStatus.GO,
            confidence=ConfidenceLevel.HIGH,
            expected_tools=["marine_conditions", "weather_conditions", "hazard_search", "geospatial_hazard", "route_analysis", "risk_evaluation"],
            decisive_factors_keywords=["route", "exposure", "wave", "inshore", "channel"],
            expected_evidence_metrics=["exposure", "wave"],
            recommended_action_keywords=["route a", "sheltered", "inshore", "proceed", "standard"],
        ),
        tags=["route", "passage_comparison", "exposure_scoring", "navigation"],
        ui_metadata={
            "icon": "navigation",
            "badge": "ROUTE_COMPARE",
            "badge_color": "blue",
            "summary": "Route A (Inshore, 1.3m waves) recommended over exposed Route B (2.1m waves).",
        },
    ),

    # -------------------------------------------------------------------------
    # Scenario S8: Multi-lingual Multi-turn Follow-up (Marathi/Hindi conversational)
    # -------------------------------------------------------------------------
    "S8": ScenarioDefinition(
        id="S8",
        name="Multi-lingual multi-turn follow-up",
        category=ScenarioCategory.MULTILINGUAL,
        description="Processes conversational queries in Marathi and Hindi, evaluating language detection, localized response synthesis, and analytical explanation fidelity.",
        harbor="Ratnagiri",
        query="रत्नागिरीवरून उद्या सकाळी मासेमारीला जाणे सुरक्षित आहे का?",
        multilingual_queries={
            "en": "Is it safe to go fishing tomorrow morning from Ratnagiri?",
            "mr": "रत्नागिरीवरून उद्या सकाळी मासेमारीला जाणे सुरक्षित आहे का?",
            "hi": "क्या कल सुबह रत्नागिरी से समुद्र में जाना सुरक्षित रहेगा?",
        },
        inputs=ScenarioInputData(
            origin_harbor="Ratnagiri",
            craft_profile="motorized_boat",
            marine=MarineConditionsPayload(
                harbor="Ratnagiri",
                significant_wave_height_m=1.0,
                swell_height_m=0.7,
                swell_period_sec=6.5,
                surface_current_knots=0.8,
                sea_surface_temp_c=28.3,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="INCOIS Ocean State Forecast",
            ),
            weather=WeatherConditionsPayload(
                harbor="Ratnagiri",
                wind_speed_knots=10.0,
                wind_gust_knots=13.0,
                wind_direction_deg=250.0,
                visibility_km=11.0,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Coastal Weather Bulletin",
            ),
            hazard=HazardBulletinPayload(
                harbor="Ratnagiri",
                cyclone_warning_active=False,
                squall_alert=False,
                bulletin_id="IMD-NORMAL-08",
                severity="NORMAL",
                headline="Normal Coastal Weather",
                valid_from=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Hazard Division",
            ),
            polygons=[POLYGON_EEZ_WEST_COAST],
        ),
        expected=ScenarioExpectedOutcome(
            intent=IntentCategory.SAFETY,
            status=RecommendationStatus.GO,
            confidence=ConfidenceLevel.HIGH,
            expected_tools=["marine_conditions", "weather_conditions", "hazard_search", "risk_evaluation"],
            decisive_factors_keywords=["wave", "wind", "calm", "safe"],
            expected_evidence_metrics=["significant_wave_height", "wind_speed"],
            recommended_action_keywords=["सुरक्षित", "जाणे", "मासेमारी"],
        ),
        tags=["multilingual", "marathi", "hindi", "localization", "multi_turn"],
        ui_metadata={
            "icon": "globe",
            "badge": "MULTILINGUAL",
            "badge_color": "purple",
            "summary": "Full native Marathi & Hindi conversational support with immutable safety status headers.",
        },
    ),
}


# =============================================================================
# Additional Evaluation Scenarios (Temporal Reasoning & Dangerous Sea)
# =============================================================================

ADDITIONAL_EVAL_SCENARIOS: Dict[str, ScenarioDefinition] = {
    # -------------------------------------------------------------------------
    # Scenario S-TEMPORAL: Changing Weather / Temporal Reasoning
    # -------------------------------------------------------------------------
    "S-TEMPORAL": ScenarioDefinition(
        id="S-TEMPORAL",
        name="Changing weather / temporal reasoning",
        category=ScenarioCategory.TEMPORAL,
        description="Morning calm (0.8m wave, 8 kt wind) shifts to late afternoon squall and rising swell (2.4m, 24 kt gusts). Evaluates temporal safety windowing.",
        harbor="Ratnagiri",
        query="Can I depart Ratnagiri at 06:00 and return by 17:00 tomorrow? Will weather hold?",
        multilingual_queries={
            "en": "Can I depart Ratnagiri at 06:00 and return by 17:00 tomorrow? Will weather hold?",
            "mr": "उद्या सकाळी ६ वाजता जाऊन संध्याकाळी ५ पर्यंत परत येऊ शकतो का? हवामान बदलेल का?",
            "hi": "क्या कल सुबह 6 बजे निकलकर शाम 5 बजे तक वापस आ सकते हैं? क्या मौसम बदलेगा?",
        },
        inputs=ScenarioInputData(
            origin_harbor="Ratnagiri",
            craft_profile="motorized_boat",
            marine=MarineConditionsPayload(
                harbor="Ratnagiri",
                significant_wave_height_m=1.9,
                swell_height_m=1.5,
                swell_period_sec=8.0,
                surface_current_knots=1.4,
                sea_surface_temp_c=28.0,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="INCOIS Ocean State Forecast",
            ),
            weather=WeatherConditionsPayload(
                harbor="Ratnagiri",
                wind_speed_knots=19.0,
                wind_gust_knots=25.0,
                wind_direction_deg=235.0,
                visibility_km=8.0,
                observed_at=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Coastal Weather Bulletin",
            ),
            hazard=HazardBulletinPayload(
                harbor="Ratnagiri",
                cyclone_warning_active=False,
                squall_alert=True,
                bulletin_id="IMD-TEMPORAL-SQUALL-01",
                severity="ALERT",
                headline="Afternoon Squall Advisory: Wind and wave surge expected after 14:00 UTC",
                valid_from=VALID_NOW_ISO,
                valid_to=VALID_FUTURE_ISO,
                source_name="IMD Hazard Division",
            ),
            polygons=[POLYGON_EEZ_WEST_COAST],
        ),
        expected=ScenarioExpectedOutcome(
            intent=IntentCategory.SAFETY,
            status=RecommendationStatus.CAUTION,
            confidence=ConfidenceLevel.HIGH,
            expected_tools=["marine_conditions", "weather_conditions", "hazard_search", "risk_evaluation"],
            decisive_factors_keywords=["squall", "afternoon", "wave", "wind", "window"],
            expected_evidence_metrics=["significant_wave_height", "wind_speed"],
            recommended_action_keywords=["morning", "return early", "caution", "before"],
        ),
        tags=["temporal", "changing_weather", "squall", "time_window"],
        ui_metadata={
            "icon": "clock",
            "badge": "TEMPORAL",
            "badge_color": "amber",
            "summary": "Morning window safe; afternoon squall alert requires return to harbor before 14:00.",
        },
    ),
}


# =============================================================================
# Registry Public Helper Functions
# =============================================================================

def get_scenario(scenario_id: str) -> ScenarioDefinition:
    """Retrieve a scenario definition by ID (case-insensitive)."""
    norm_id = scenario_id.strip().upper()
    if norm_id in CANONICAL_SCENARIOS:
        return CANONICAL_SCENARIOS[norm_id]
    if norm_id in ADDITIONAL_EVAL_SCENARIOS:
        return ADDITIONAL_EVAL_SCENARIOS[norm_id]
    raise KeyError(f"Scenario '{scenario_id}' not found in canonical scenario registry.")


def list_canonical_scenarios() -> List[ScenarioDefinition]:
    """Returns the ordered list of all 8 canonical scenarios (S1–S8)."""
    return [CANONICAL_SCENARIOS[f"S{i}"] for i in range(1, 9)]


def list_all_scenarios() -> List[ScenarioDefinition]:
    """Returns all canonical S1–S8 and additional evaluation scenarios."""
    return list_canonical_scenarios() + list(ADDITIONAL_EVAL_SCENARIOS.values())


def get_scenario_manifest() -> List[ScenarioManifestItem]:
    """Returns lightweight descriptors for client UI display and API responses."""
    manifest = []
    for s in list_canonical_scenarios():
        manifest.append(
            ScenarioManifestItem(
                id=s.id,
                name=s.name,
                category=s.category.value,
                intent=s.expected.intent.value,
                harbor=s.harbor,
                expected_status=s.expected.status.value,
                expected_confidence=s.expected.confidence.value,
                description=s.description,
                query=s.query,
                tags=s.tags,
                ui_metadata=s.ui_metadata,
            )
        )
    return manifest
