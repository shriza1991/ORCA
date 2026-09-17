"""Deterministic Synthetic Demo Data Generator for SAMUDRA.

Generates the canonical SAMUDRA_DEMO_V1 dataset derived deterministically
from a fixed reference timestamp (2026-09-12T06:00:00Z).

Models official source structures for:
- INCOIS Ocean State Forecasts (OSF) and PFZ Advisories
- IMD Coastal Weather & Marine Hazard Bulletins
- MOSDAC / ISRO Satellite EO Products (Oceansat OCM & INSAT SST)
- SAMUDRA-owned application entities (Fishers, Vessels, Trips, Routes, etc.)
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

# Authoritative reference timestamp for deterministic generation
REFERENCE_TIME = datetime(2026, 9, 12, 6, 0, 0, tzinfo=timezone.utc)
SYNTHETIC_NAMESPACE = "SAMUDRA_DEMO_V1"
DATASET_VERSION = "synthetic_demo_v1"

PROVENANCE_BASE = {
    "mode": "SYNTHETIC",
    "source": "synthetic-demo",
    "dataset_version": DATASET_VERSION,
    "namespace": SYNTHETIC_NAMESPACE,
    "generated_at": REFERENCE_TIME.isoformat(),
}


def generate_stakeholders() -> List[Dict[str, Any]]:
    """5 Stakeholder demo identities."""
    roles = [
        ("demo-fisher-01", "fisher", "Demo Fisher", {"tier": "lead_mariner", "badge": "Master Fisher"}),
        ("demo-researcher-01", "researcher", "Demo Marine Researcher", {"institution": "National Marine Institute", "focus": "Ocean Ecology"}),
        ("demo-authority-01", "coastal_authority", "Demo Coastal Authority Officer", {"department": "Maharashtra Maritime Board", "rank": "Port Officer"}),
        ("demo-disaster-01", "disaster_management", "Demo Disaster Management Responder", {"agency": "State Disaster Response Force", "unit": "Coastal Quick Response"}),
        ("demo-operator-01", "maritime_operator", "Demo Maritime Operator", {"fleet_size": 18, "sector": "Commercial Coastal Operations"}),
    ]
    return [
        {
            "public_id": pid,
            "role": role,
            "display_name": name,
            "metadata_json": {**meta, "provenance": PROVENANCE_BASE},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for pid, role, name, meta in roles
    ]


def generate_harbors() -> List[Dict[str, Any]]:
    """Demo harbors for coastal surveillance and fishing operations."""
    harbors = [
        {
            "public_id": "harbor-ratnagiri",
            "name": "Ratnagiri",
            "latitude": 16.99,
            "longitude": 73.28,
            "state": "Maharashtra",
            "metadata_json": {"coastal_zone": "Konkan", "vhf_channel": 16, "tide_station_id": "RAT-01"},
            "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA"},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        },
        {
            "public_id": "harbor-malvan",
            "name": "Malvan",
            "latitude": 16.06,
            "longitude": 73.47,
            "state": "Maharashtra",
            "metadata_json": {"coastal_zone": "Sindhudurg", "vhf_channel": 16, "tide_station_id": "MAL-01"},
            "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA"},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        },
    ]

    existing_ids = {h["public_id"] for h in harbors}
    required_additional_harbors = [
        {
            "public_id": "harbor-panaji",
            "name": "Panaji",
            "latitude": 15.49,
            "longitude": 73.83,
            "state": "Goa",
            "metadata_json": {"coastal_zone": "Goa Coast", "vhf_channel": 16, "tide_station_id": "PAN-01"},
            "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA"},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        },
        {
            "public_id": "harbor-mumbai",
            "name": "Mumbai",
            "latitude": 18.92,
            "longitude": 72.87,
            "state": "Maharashtra",
            "metadata_json": {"coastal_zone": "Mumbai Coastal", "vhf_channel": 16, "tide_station_id": "BOM-01"},
            "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA"},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        },
        {
            "public_id": "harbor-veraval",
            "name": "Veraval",
            "latitude": 20.90,
            "longitude": 70.37,
            "state": "Gujarat",
            "metadata_json": {"coastal_zone": "Saurashtra Coast", "vhf_channel": 16, "tide_station_id": "VER-01"},
            "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA"},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        },
    ]
    for h in required_additional_harbors:
        if h["public_id"] not in existing_ids:
            harbors.append(h)
            existing_ids.add(h["public_id"])
    return harbors


def generate_fishers() -> List[Dict[str, Any]]:
    """8 Fishers with English, Hindi, and Marathi preferences."""
    fishers_def = [
        ("fisher-01", "Suresh Patil", "mr", "harbor-ratnagiri", "motorized_boat", True, {"experience_yrs": 18, "mobile_device": "Android KaiOS"}),
        ("fisher-02", "Ramesh Kadam", "mr", "harbor-ratnagiri", "mechanized_trawler", True, {"experience_yrs": 24, "mobile_device": "Android"}),
        ("fisher-03", "Abdul Khan", "hi", "harbor-ratnagiri", "motorized_boat", True, {"experience_yrs": 12, "mobile_device": "Android"}),
        ("fisher-04", "Dinesh Sharma", "hi", "harbor-ratnagiri", "artisanal_craft", True, {"experience_yrs": 9, "mobile_device": "Android Feature"}),
        ("fisher-05", "Anthony Fernandes", "en", "harbor-malvan", "motorized_boat", True, {"experience_yrs": 15, "mobile_device": "iOS"}),
        ("fisher-06", "Anand Tandel", "mr", "harbor-malvan", "mechanized_trawler", True, {"experience_yrs": 30, "mobile_device": "Android"}),
        ("fisher-07", "Vijay Joshi", "en", "harbor-malvan", "artisanal_craft", True, {"experience_yrs": 7, "mobile_device": "Android"}),
        ("fisher-08", "Sunil Verma", "hi", "harbor-malvan", "motorized_boat", True, {"experience_yrs": 14, "mobile_device": "Android"}),
    ]
    return [
        {
            "public_id": fid,
            "name": name,
            "preferred_language": lang,
            "home_harbor_id": harbor,
            "craft_profile": craft,
            "is_active": active,
            "metadata_json": meta,
            "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA"},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for fid, name, lang, harbor, craft, active, meta in fishers_def
    ]


def generate_vessels() -> List[Dict[str, Any]]:
    """14 Vessels with varied specifications across 5 coastal sectors."""
    vessels_def = [
        ("vessel-01", "Matsya Sagar 01", "fisher-01", "motorized_boat", 9.5, 3.0, "harbor-ratnagiri", "OPERATIONAL", {"engine_hp": 30, "hull_material": "FRP"}),
        ("vessel-02", "Konkan Pride", "fisher-02", "mechanized_trawler", 18.0, 15.0, "harbor-ratnagiri", "OPERATIONAL", {"engine_hp": 120, "hull_material": "Wood"}),
        ("vessel-03", "Al-Bahr Explorer", "fisher-03", "motorized_boat", 10.2, 4.0, "harbor-ratnagiri", "OPERATIONAL", {"engine_hp": 40, "hull_material": "FRP"}),
        ("vessel-04", "Samudra Ratna", "fisher-04", "artisanal_craft", 6.5, 1.2, "harbor-ratnagiri", "DOCKED", {"engine_hp": 10, "hull_material": "Wood"}),
        ("vessel-05", "Sea Hawk Goa", "fisher-05", "motorized_boat", 11.0, 4.5, "harbor-malvan", "OPERATIONAL", {"engine_hp": 45, "hull_material": "FRP"}),
        ("vessel-06", "Sindhudurg Queen", "fisher-06", "mechanized_trawler", 20.5, 22.0, "harbor-malvan", "OPERATIONAL", {"engine_hp": 160, "hull_material": "Steel"}),
        ("vessel-07", "Kripa Sagar", "fisher-07", "artisanal_craft", 7.0, 1.5, "harbor-malvan", "DOCKED", {"engine_hp": 9.9, "hull_material": "Wood"}),
        ("vessel-08", "Pawan Putra", "fisher-08", "motorized_boat", 9.8, 3.2, "harbor-malvan", "OPERATIONAL", {"engine_hp": 35, "hull_material": "FRP"}),
        # Goa vessels (harbor-panaji)
        ("vessel-09", "Goa Pearl", "fisher-05", "motorized_boat", 10.5, 3.8, "harbor-panaji", "OPERATIONAL", {"engine_hp": 38, "hull_material": "FRP"}),
        ("vessel-10", "Zuari Pioneer", "fisher-06", "mechanized_trawler", 19.0, 18.0, "harbor-panaji", "OPERATIONAL", {"engine_hp": 130, "hull_material": "Steel"}),
        # Mumbai vessels (harbor-mumbai)
        ("vessel-11", "Mumbai Sagarika", "fisher-01", "motorized_boat", 11.2, 4.2, "harbor-mumbai", "OPERATIONAL", {"engine_hp": 42, "hull_material": "FRP"}),
        ("vessel-12", "Bombay Sentinel", "fisher-02", "mechanized_trawler", 21.0, 24.0, "harbor-mumbai", "OPERATIONAL", {"engine_hp": 175, "hull_material": "Steel"}),
        # Veraval vessels (harbor-veraval)
        ("vessel-13", "Somnath Jyoti", "fisher-03", "motorized_boat", 9.6, 3.1, "harbor-veraval", "OPERATIONAL", {"engine_hp": 32, "hull_material": "FRP"}),
        ("vessel-14", "Saurashtra Sagar", "fisher-04", "mechanized_trawler", 18.5, 16.5, "harbor-veraval", "OPERATIONAL", {"engine_hp": 125, "hull_material": "Wood"}),
    ]
    return [
        {
            "public_id": vid,
            "name": name,
            "owner_fisher_id": owner,
            "vessel_type": vtype,
            "length_m": length,
            "capacity_tons": cap,
            "home_harbor_id": harbor,
            "status": status,
            "metadata_json": meta,
            "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA"},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for vid, name, owner, vtype, length, cap, harbor, status, meta in vessels_def
    ]


def generate_trips() -> List[Dict[str, Any]]:
    """18 Trips overlapping calm, elevated, hazard, PFZ, and geofence conditions across 5 sectors."""
    trips_def = [
        ("trip-01", "fisher-01", "vessel-01", "harbor-ratnagiri", "Ratnagiri Inshore Fishing Zone", REFERENCE_TIME - timedelta(hours=6), REFERENCE_TIME + timedelta(hours=2), "IN_PROGRESS", {"target_catch": "Mackerel", "condition_overlap": "CALM"}),
        ("trip-02", "fisher-02", "vessel-02", "harbor-ratnagiri", "Ratnagiri Outer Bank", REFERENCE_TIME - timedelta(hours=12), REFERENCE_TIME - timedelta(hours=1), "COMPLETED", {"target_catch": "Ribbonfish", "condition_overlap": "ELEVATED"}),
        ("trip-03", "fisher-03", "vessel-03", "harbor-ratnagiri", "South Konkan Passage", REFERENCE_TIME - timedelta(hours=2), REFERENCE_TIME + timedelta(hours=8), "IN_PROGRESS", {"target_catch": "Pomfret", "condition_overlap": "HAZARD_SQUALL_INTERSECTION"}),
        ("trip-04", "fisher-04", "vessel-04", "harbor-ratnagiri", "Mirya Bay Nearshore", REFERENCE_TIME - timedelta(hours=4), REFERENCE_TIME - timedelta(hours=1), "COMPLETED", {"target_catch": "Prawns", "condition_overlap": "CALM"}),
        ("trip-05", "fisher-05", "vessel-05", "harbor-malvan", "Malvan North Perimeter", REFERENCE_TIME - timedelta(hours=5), REFERENCE_TIME + timedelta(hours=3), "IN_PROGRESS", {"target_catch": "Kingfish", "condition_overlap": "GEOFENCE_PROXIMITY"}),
        ("trip-06", "fisher-06", "vessel-06", "harbor-malvan", "PFZ Sector Alpha", REFERENCE_TIME + timedelta(hours=1), REFERENCE_TIME + timedelta(hours=14), "PLANNED", {"target_catch": "Tuna", "condition_overlap": "PFZ_CANDIDATE"}),
        ("trip-07", "fisher-07", "vessel-07", "harbor-malvan", "Tarkarli Coastal Bank", REFERENCE_TIME - timedelta(hours=8), REFERENCE_TIME - timedelta(hours=2), "COMPLETED", {"target_catch": "Sardines", "condition_overlap": "ROUTE_A_SHELTERED"}),
        ("trip-08", "fisher-08", "vessel-08", "harbor-malvan", "Malvan Outer Deep Bank", REFERENCE_TIME + timedelta(hours=2), REFERENCE_TIME + timedelta(hours=10), "PLANNED", {"target_catch": "Squid", "condition_overlap": "ROUTE_B_EXPOSED"}),
        ("trip-09", "fisher-01", "vessel-01", "harbor-ratnagiri", "Coastal Patrol Corridor", REFERENCE_TIME + timedelta(hours=12), REFERENCE_TIME + timedelta(hours=20), "PLANNED", {"target_catch": "None (Operator)", "condition_overlap": "OPERATOR_SURVEILLANCE"}),
        ("trip-10", "fisher-05", "vessel-05", "harbor-malvan", "Sindhudurg Bio-Station", REFERENCE_TIME + timedelta(hours=18), REFERENCE_TIME + timedelta(hours=30), "PLANNED", {"target_catch": "Water Samples", "condition_overlap": "RESEARCHER_CRUISE"}),
        ("trip-11", "fisher-02", "vessel-02", "harbor-ratnagiri", "Monsoon Wave Baseline Sector", REFERENCE_TIME + timedelta(hours=24), REFERENCE_TIME + timedelta(hours=36), "PLANNED", {"target_catch": "Mixed Pelagic", "condition_overlap": "HIGH_WAVE"}),
        ("trip-12", "fisher-06", "vessel-06", "harbor-malvan", "Emergency Standby Sector", REFERENCE_TIME - timedelta(hours=1), REFERENCE_TIME + timedelta(hours=6), "IN_PROGRESS", {"target_catch": "Standby Escort", "condition_overlap": "DISASTER_MANAGEMENT_STANDBY"}),
        # Goa trips for vessel-09 and vessel-10
        ("trip-13", "fisher-05", "vessel-09", "harbor-panaji", "Goa Coastal Patrol Zone", REFERENCE_TIME - timedelta(hours=6), REFERENCE_TIME + timedelta(hours=2), "IN_PROGRESS", {"target_catch": "Kingfish", "condition_overlap": "CALM"}),
        ("trip-14", "fisher-06", "vessel-10", "harbor-panaji", "Mormugao Deep Water Corridor", REFERENCE_TIME - timedelta(hours=5), REFERENCE_TIME + timedelta(hours=3), "IN_PROGRESS", {"target_catch": "Tuna", "condition_overlap": "ELEVATED"}),
        # Mumbai trips for vessel-11 and vessel-12
        ("trip-15", "fisher-01", "vessel-11", "harbor-mumbai", "Mumbai Offshore Nearshore", REFERENCE_TIME - timedelta(hours=6), REFERENCE_TIME + timedelta(hours=2), "IN_PROGRESS", {"target_catch": "Pomfret", "condition_overlap": "CALM"}),
        ("trip-16", "fisher-02", "vessel-12", "harbor-mumbai", "Bombay High Perimeter", REFERENCE_TIME - timedelta(hours=5), REFERENCE_TIME + timedelta(hours=3), "IN_PROGRESS", {"target_catch": "Ribbonfish", "condition_overlap": "OPERATOR_SURVEILLANCE"}),
        # Veraval trips for vessel-13 and vessel-14
        ("trip-17", "fisher-03", "vessel-13", "harbor-veraval", "Veraval Coastal Zone", REFERENCE_TIME - timedelta(hours=6), REFERENCE_TIME + timedelta(hours=2), "IN_PROGRESS", {"target_catch": "Prawns", "condition_overlap": "CALM"}),
        ("trip-18", "fisher-04", "vessel-14", "harbor-veraval", "Saurashtra Deep Bank", REFERENCE_TIME - timedelta(hours=5), REFERENCE_TIME + timedelta(hours=3), "IN_PROGRESS", {"target_catch": "Mixed Pelagic", "condition_overlap": "HIGH_WAVE"}),
    ]
    return [
        {
            "public_id": tid,
            "fisher_id": fid,
            "vessel_id": vid,
            "origin_harbor_id": harbor,
            "destination_name": dest,
            "start_time": start,
            "end_time": end,
            "status": status,
            "metadata_json": meta,
            "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA"},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for tid, fid, vid, harbor, dest, start, end, status, meta in trips_def
    ]


def generate_marine_observations() -> List[Dict[str, Any]]:
    """48 hourly observations per harbor (96 total) matching INCOIS OSF and IMD CWB source formats."""
    observations = []
    harbors = [("harbor-ratnagiri", "Ratnagiri", 1.2, 12.0), ("harbor-malvan", "Malvan", 1.1, 10.0)]

    for harbor_id, harbor_name, base_wave, base_wind in harbors:
        for offset in range(-24, 24):
            obs_time = REFERENCE_TIME + timedelta(hours=offset)
            obs_id = f"obs-{harbor_name.lower()}-{offset:+03d}h"

            hour_mod = (obs_time.hour + 6) % 24
            wind_var = 3.0 * ((hour_mod - 12) / 12.0)
            wave_var = 0.25 * ((hour_mod - 12) / 12.0)
            
            wind_speed = round(max(4.0, base_wind + wind_var), 1)
            wind_gust = round(wind_speed + 4.5, 1)
            wind_dir = round((230.0 + offset * 1.5) % 360.0, 1)
            wave_height = round(max(0.6, base_wave + wave_var), 2)
            max_wave = round(wave_height * 1.5, 2)
            swell_height = round(wave_height * 0.65, 2)
            wave_period = 8.0
            current_speed = 1.0
            current_dir = 180.0
            tide_level = round(1.2 + 0.8 * ((hour_mod % 12 - 6) / 6.0), 2)
            tide_phase = "FLOOD" if (hour_mod % 12 < 6) else "EBB"
            sst = 28.2
            qc_status = "VALID"
            qc_flag = 0
            is_stale = False

            # Intentional Quality Cases
            if offset == -20:
                is_stale = True
                qc_status = "STALE"
                qc_flag = 9
            elif offset == 2:
                # Missing value sentinel in source: None / -999.0
                wind_gust = None
                wave_period = None
                qc_status = "MISSING_DATA"
                qc_flag = 0
            elif offset == 8:
                qc_status = "DEGRADED_QC_WARNING"
                qc_flag = 1

            obs_record = {
                "public_id": obs_id,
                "harbor_id": harbor_id,
                "observation_time": obs_time,
                # Source native INCOIS variables
                "swh": wave_height,
                "mwh": max_wave,
                "swell_height": swell_height,
                "swell_period": wave_period,
                "current_speed": current_speed,
                "current_direction": current_dir,
                "sst": sst,
                "qc_flag": qc_flag,
                # Source native IMD variables
                "wind_speed_knots": wind_speed,
                "wind_direction_deg": wind_dir,
                "wind_gust_knots": wind_gust,
                "visibility_km": 10.0,
                # Normalized columns for persistence
                "wave_height_m": wave_height,
                "wave_period_sec": wave_period,
                "current_speed_knots": current_speed,
                "current_direction_deg": current_dir,
                "tide_level_m": tide_level,
                "tide_phase": tide_phase,
                "sea_surface_temp_c": sst,
                "units_json": {
                    "wave_height": "meters",
                    "wind_speed": "knots",
                    "current_speed": "knots",
                    "sea_surface_temp": "celsius",
                    "tide_level": "meters",
                },
                "tide_datum": "LAT",
                "source_name": "INCOIS OSF / IMD Coastal Bulletin (SYNTHETIC)",
                "source_type": "SYNTHETIC_HOURLY",
                "coverage_metadata": {
                    "station": harbor_name,
                    "sensor_type": "SYNTHETIC_BUOY_RADAR",
                    "is_simulated": True,
                },
                "qc_status": qc_status,
                "is_stale": is_stale,
                "provenance_json": {
                    **PROVENANCE_BASE,
                    "intended_provider": "INCOIS_AND_IMD",
                    "source_product": "INCOIS Ocean State Forecast / IMD Coastal Bulletin",
                    "official_documentation": "https://incois.gov.in/portal/osf",
                    "harbor": harbor_name,
                    "hour_offset": offset,
                },
                "namespace": SYNTHETIC_NAMESPACE,
                "created_at": REFERENCE_TIME,
            }
            observations.append(obs_record)

    return observations


def generate_eo_grid_cells() -> List[Dict[str, Any]]:
    """25 grid cells per day across 14 daily time slices (350 records total) matching MOSDAC/ISRO Oceansat OCM strictly in the open Arabian Sea."""
    eo_records = []
    lats = [16.0 + i * 0.3 for i in range(5)]
    lons = [71.7 + j * 0.25 for j in range(5)]

    for day_offset in range(-13, 1):
        obs_date = REFERENCE_TIME + timedelta(days=day_offset)
        for r_idx, lat in enumerate(lats):
            for c_idx, lon in enumerate(lons):
                cell_code = f"CELL-{r_idx:02d}-{c_idx:02d}"
                public_id = f"eo-{cell_code}-d{abs(day_offset):02d}"

                sst = round(28.0 + 0.5 * (r_idx - 2) - 0.2 * day_offset, 2)
                chlorophyll = round(0.8 + 0.3 * (c_idx - 1) + 0.05 * abs(day_offset), 2)
                uncertainty = 0.12
                qa_flags = 0
                qc_status = "VALID"
                cloud_fraction = 0.05

                # Edge cases in spatial grid
                if (r_idx, c_idx) == (0, 0):
                    qa_flags = 1
                    qc_status = "CLOUD_OBSCURED"
                    cloud_fraction = 0.85
                    sst = None
                    chlorophyll = None
                    uncertainty = None
                elif (r_idx, c_idx) == (4, 4):
                    qa_flags = 2
                    qc_status = "NO_DATA"
                    cloud_fraction = 0.0
                    sst = None
                    chlorophyll = None
                    uncertainty = None
                elif (r_idx, c_idx) == (2, 3):
                    qa_flags = 0
                    qc_status = "DEGRADED_QC_WARNING"
                    uncertainty = 0.48

                eo_records.append({
                    "public_id": public_id,
                    "cell_id": cell_code,
                    "latitude": round(lat, 3),
                    "longitude": round(lon, 3),
                    "observation_time": obs_date,
                    # MOSDAC source fields
                    "SST": sst,
                    "CHL_A": chlorophyll,
                    "QA_FLAGS": qa_flags,
                    "PIXEL_UNCERTAINTY": uncertainty,
                    # Normalized columns
                    "sst_c": sst,
                    "chlorophyll_mg_m3": chlorophyll,
                    "uncertainty": uncertainty,
                    "qc_status": qc_status,
                    "cloud_fraction": cloud_fraction,
                    "source_name": "MOSDAC / ISRO Oceansat-3 OCM (SYNTHETIC)",
                    "provenance_json": {
                        **PROVENANCE_BASE,
                        "intended_provider": "MOSDAC_ISRO",
                        "source_product": "Oceansat-3 OCM L3 Chlorophyll & INSAT-3D Thermal SST",
                        "official_documentation": "https://www.mosdac.gov.in",
                        "note": "Synthetic environmental observation, NOT measured fishing catch productivity",
                    },
                    "namespace": SYNTHETIC_NAMESPACE,
                    "created_at": REFERENCE_TIME,
                })

    return eo_records


def generate_pfz_candidates() -> List[Dict[str, Any]]:
    """12 PFZ candidates matching INCOIS PFZ vector feature advisory structure."""
    candidates_def = [
        ("pfz-01", 16.92, 73.15, REFERENCE_TIME - timedelta(hours=4), REFERENCE_TIME + timedelta(hours=20), "HIGH", 0.9, 1.6, 28.0, 245.0, 15.2, "VALID"),
        ("pfz-02", 17.05, 73.05, REFERENCE_TIME - timedelta(hours=6), REFERENCE_TIME + timedelta(hours=18), "HIGH", 1.1, 1.8, 35.0, 290.0, 25.8, "VALID"),
        ("pfz-03", 16.12, 73.30, REFERENCE_TIME - timedelta(hours=3), REFERENCE_TIME + timedelta(hours=21), "HIGH", 0.85, 1.5, 24.0, 250.0, 19.5, "VALID"),
        ("pfz-04", 16.80, 72.90, REFERENCE_TIME - timedelta(hours=8), REFERENCE_TIME + timedelta(hours=16), "MEDIUM", 0.7, 1.2, 45.0, 235.0, 44.0, "VALID"),
        ("pfz-05", 16.50, 72.70, REFERENCE_TIME - timedelta(hours=12), REFERENCE_TIME + timedelta(hours=12), "MEDIUM", 0.65, 1.1, 60.0, 215.0, 78.5, "VALID"),
        ("pfz-06", 16.95, 73.10, REFERENCE_TIME - timedelta(hours=48), REFERENCE_TIME - timedelta(hours=12), "HIGH", 1.0, 1.7, 30.0, 260.0, 20.0, "EXPIRED"),
        ("pfz-07", 16.20, 71.80, REFERENCE_TIME - timedelta(hours=2), REFERENCE_TIME + timedelta(hours=22), "HIGH", 1.3, 2.2, 120.0, 250.0, 165.0, "OUT_OF_RADIUS"),
        ("pfz-08", 16.65, 73.10, REFERENCE_TIME - timedelta(hours=5), REFERENCE_TIME + timedelta(hours=19), "LOW", 0.35, 0.6, 38.0, 200.0, 42.0, "LOW_CONFIDENCE"),
        ("pfz-09", 17.20, 72.85, REFERENCE_TIME - timedelta(hours=5), REFERENCE_TIME + timedelta(hours=19), "HIGH", 1.2, 1.9, 52.0, 310.0, 51.0, "VALID"),
        ("pfz-10", 15.95, 73.25, REFERENCE_TIME - timedelta(hours=4), REFERENCE_TIME + timedelta(hours=20), "HIGH", 0.95, 1.8, 30.0, 210.0, 28.0, "VALID"),
        ("pfz-11", 16.40, 72.60, REFERENCE_TIME - timedelta(hours=7), REFERENCE_TIME + timedelta(hours=17), "MEDIUM", 0.75, 1.3, 75.0, 220.0, 95.0, "VALID"),
        ("pfz-12", 17.50, 71.50, REFERENCE_TIME - timedelta(hours=60), REFERENCE_TIME - timedelta(hours=24), "MEDIUM", 0.8, 1.4, 150.0, 315.0, 198.0, "EXPIRED"),
    ]
    return [
        {
            "public_id": pid,
            "latitude": lat,
            "longitude": lon,
            "detected_at": det,
            "valid_to": val,
            "confidence": conf,
            "sst_gradient": grad,
            "chlorophyll_value": chl,
            "depth_m": depth,
            "bearing_deg": bear,
            "distance_km": dist,
            "qc_status": qc,
            "provenance_json": {
                **PROVENANCE_BASE,
                "intended_provider": "INCOIS",
                "source_product": "INCOIS Potential Fishing Zone (PFZ) Integrated Advisory",
                "official_documentation": "https://incois.gov.in/portal/pfz",
            },
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for pid, lat, lon, det, val, conf, grad, chl, depth, bear, dist, qc in candidates_def
    ]


def generate_geofences() -> List[Dict[str, Any]]:
    """5 Geographically coherent valid polygon geofences."""
    geofences_def = [
        (
            "geofence-01",
            "Naval Firing Range Foxtrot (Goa-Konkan Sector)",
            "NAVAL_FIRING_RANGE",
            "NO_GO",
            True,
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [73.16, 15.30], [73.12, 15.36], [73.10, 15.42], [73.12, 15.48],
                        [73.16, 15.53], [73.22, 15.55], [73.28, 15.55], [73.34, 15.52],
                        [73.36, 15.46], [73.36, 15.38], [73.33, 15.32], [73.25, 15.30],
                        [73.16, 15.30],
                    ]
                ],
            },
            {"issuing_agency": "Indian Navy", "active_schedule": "Continuous Live Firing", "penalty": "Confiscation & Detention"},
        ),
        (
            "geofence-02",
            "Malvan Marine Sanctuary & Coral Conservation Zone",
            "MARINE_PROTECTED_AREA",
            "NO_GO",
            True,
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [73.438, 16.015], [73.455, 16.012], [73.478, 16.020], [73.488, 16.038],
                        [73.482, 16.058], [73.475, 16.072], [73.460, 16.078], [73.442, 16.070],
                        [73.432, 16.052], [73.430, 16.032], [73.438, 16.015],
                    ]
                ],
            },
            {"issuing_agency": "Forest & Wildlife Department", "protected_species": ["Corals", "Dolphins", "Sea Turtles"]},
        ),
        (
            "geofence-03",
            "Ratnagiri Port Security Perimeter",
            "SECURITY_ZONE",
            "CAUTION",
            False,
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [73.250, 16.965], [73.275, 16.955], [73.295, 16.962], [73.308, 16.980],
                        [73.308, 17.005], [73.295, 17.025], [73.272, 17.028], [73.250, 17.015],
                        [73.242, 16.990], [73.250, 16.965],
                    ]
                ],
            },
            {"issuing_agency": "Port Security Directorate", "speed_limit_knots": 6.0},
        ),
        (
            "geofence-04",
            "Angria Bank Shallow Shoal Hazard Polygon",
            "SHALLOW_SHOAL",
            "CAUTION",
            False,
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [72.02, 16.52], [72.08, 16.50], [72.16, 16.54], [72.22, 16.64],
                        [72.22, 16.74], [72.16, 16.82], [72.08, 16.85], [72.02, 16.82],
                        [71.96, 16.72], [71.96, 16.60], [72.02, 16.52],
                    ]
                ],
            },
            {"min_depth_m": 8.5, "navigational_hazard": "Submerged Coral Shoal"},
        ),
        (
            "geofence-05",
            "Maharashtra Coastal Baseline Operational Boundary",
            "OPERATIONAL_BOUNDARY",
            "ADVISORY",
            False,
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [72.50, 15.80], [73.60, 15.80], [73.55, 16.20], [73.32, 16.60],
                        [73.28, 17.00], [73.18, 17.40], [72.85, 18.20], [72.78, 19.00],
                        [72.15, 19.00], [72.20, 18.20], [72.35, 17.40], [72.45, 16.60],
                        [72.50, 15.80],
                    ]
                ],
            },
            {"jurisdiction": "State Coastal Police & Coast Guard Sector"},
        ),
    ]

    return [
        {
            "public_id": gid,
            "name": name,
            "polygon_type": ptype,
            "restriction_level": rlevel,
            "is_hard_restriction": hard,
            "geometry_geojson": geom,
            "properties_json": props,
            "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA_MARITIME_AUTHORITY"},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for gid, name, ptype, rlevel, hard, geom, props in geofences_def
    ]


def generate_route_graph() -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """24 water-only route nodes and 32 route edges supporting route comparisons."""
    nodes_def = [
        ("node-01", "Ratnagiri Harbor Pier", 16.990, 73.280, 8.0, True),
        ("node-02", "Mirya Bay Entrance", 17.010, 73.265, 14.0, True),
        ("node-03", "Pawash Inshore Channel North", 16.900, 73.285, 12.0, True),
        ("node-04", "Pawash Inshore Channel South", 16.780, 73.300, 15.0, True),
        ("node-05", "Ratnagiri Outer Anchorage", 16.995, 73.230, 28.0, False),
        ("node-06", "Ratnagiri Deep Water Waypoint 1", 16.900, 73.150, 42.0, False),
        ("node-07", "Ratnagiri Deep Water Waypoint 2", 16.750, 73.100, 55.0, False),
        ("node-08", "Vijaybhoomi Offshore Junction", 16.550, 73.150, 48.0, False),
        ("node-09", "Vijaybhoomi Coastal Channel", 16.550, 73.320, 18.0, True),
        ("node-10", "Devgad North Passage", 16.420, 73.340, 16.0, True),
        ("node-11", "Devgad Offshore Waypoint", 16.400, 73.180, 46.0, False),
        ("node-12", "Devgad Harbor Approaches", 16.375, 73.370, 11.0, True),
        ("node-13", "Mithbav Coastal Pass", 16.280, 73.400, 14.0, True),
        ("node-14", "Achara Inshore Channel", 16.200, 73.430, 13.0, True),
        ("node-15", "Malvan North Shoal Bypass", 16.120, 73.440, 16.0, True),
        ("node-16", "Malvan Harbor Jetty", 16.060, 73.470, 7.5, True),
        ("node-17", "Malvan Outer Anchorage", 16.050, 73.410, 26.0, False),
        ("node-18", "Malvan Deep Sea Sector 1", 16.000, 73.250, 58.0, False),
        ("node-19", "Sindhudurg South Gateway", 15.850, 73.480, 22.0, False),
        ("node-20", "PFZ Sector Alpha Point 1", 16.920, 73.150, 38.0, False),
        ("node-21", "PFZ Sector Alpha Point 2", 17.050, 73.050, 45.0, False),
        ("node-22", "PFZ Sector Bravo Point 1", 16.120, 73.300, 32.0, False),
        ("node-23", "Goa-Konkan Transit Node 1", 15.650, 73.400, 40.0, False),
        ("node-24", "Goa-Konkan Transit Node 2", 15.450, 73.350, 52.0, False),
    ]

    nodes = [
        {
            "public_id": nid,
            "node_name": name,
            "latitude": lat,
            "longitude": lon,
            "depth_m": depth,
            "is_sheltered": sheltered,
            "properties_json": {"provenance": PROVENANCE_BASE},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for nid, name, lat, lon, depth, sheltered in nodes_def
    ]

    edges_def = [
        ("edge-01", "node-01", "node-02", 1.5, "Route A - Inshore Sheltered Channel", 0.1),
        ("edge-02", "node-01", "node-03", 5.5, "Route A - Inshore Sheltered Channel", 0.1),
        ("edge-03", "node-03", "node-04", 7.2, "Route A - Inshore Sheltered Channel", 0.15),
        ("edge-04", "node-04", "node-09", 14.0, "Route A - Inshore Sheltered Channel", 0.2),
        ("edge-05", "node-09", "node-10", 8.0, "Route A - Inshore Sheltered Channel", 0.15),
        ("edge-06", "node-10", "node-12", 3.2, "Route A - Inshore Sheltered Channel", 0.1),
        ("edge-07", "node-12", "node-13", 6.0, "Route A - Inshore Sheltered Channel", 0.15),
        ("edge-08", "node-13", "node-14", 5.2, "Route A - Inshore Sheltered Channel", 0.15),
        ("edge-09", "node-14", "node-15", 5.0, "Route A - Inshore Sheltered Channel", 0.15),
        ("edge-10", "node-15", "node-16", 4.0, "Route A - Inshore Sheltered Channel", 0.1),
        ("edge-11", "node-01", "node-05", 3.0, "Route B - Exposed Open Sea Passage", 0.4),
        ("edge-12", "node-05", "node-06", 7.5, "Route B - Exposed Open Sea Passage", 0.65),
        ("edge-13", "node-06", "node-07", 9.5, "Route B - Exposed Open Sea Passage", 0.7),
        ("edge-14", "node-07", "node-08", 12.0, "Route B - Exposed Open Sea Passage", 0.75),
        ("edge-15", "node-08", "node-11", 9.2, "Route B - Exposed Open Sea Passage", 0.7),
        ("edge-16", "node-11", "node-17", 22.0, "Route B - Exposed Open Sea Passage", 0.65),
        ("edge-17", "node-17", "node-16", 3.5, "Route B - Exposed Open Sea Passage", 0.35),
        ("edge-18", "node-05", "node-20", 6.2, "PFZ Alpha Feeder", 0.5),
        ("edge-19", "node-20", "node-21", 9.0, "PFZ Alpha Corridor", 0.55),
        ("edge-20", "node-02", "node-21", 12.0, "Mirya to PFZ Alpha", 0.45),
        ("edge-21", "node-08", "node-09", 9.8, "Mid-coast Cross Transit", 0.35),
        ("edge-22", "node-11", "node-10", 9.4, "Devgad Offshore Link", 0.4),
        ("edge-23", "node-17", "node-22", 7.5, "Malvan to PFZ Bravo", 0.45),
        ("edge-24", "node-16", "node-18", 13.0, "Malvan Deep Sea Run", 0.6),
        ("edge-25", "node-18", "node-19", 16.0, "South Sindhudurg Run", 0.5),
        ("edge-26", "node-17", "node-19", 12.5, "Malvan to South Border", 0.45),
        ("edge-27", "node-19", "node-23", 13.0, "Goa North Transit", 0.55),
        ("edge-28", "node-23", "node-24", 12.5, "Goa Transit Channel", 0.8),
        ("edge-29", "node-18", "node-23", 22.0, "Outer Deep Transit", 0.75),
        ("edge-30", "node-06", "node-20", 1.8, "Deep Anchor to PFZ 1", 0.45),
        ("edge-31", "node-03", "node-06", 7.8, "Inshore to Offshore Link 1", 0.3),
        ("edge-32", "node-14", "node-22", 8.8, "Achara to PFZ Bravo", 0.35),
    ]

    edges = [
        {
            "public_id": eid,
            "from_node_id": fn,
            "to_node_id": tn,
            "distance_nm": dist,
            "route_name": rname,
            "hazard_exposure_score": exp,
            "properties_json": {"provenance": PROVENANCE_BASE},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for eid, fn, tn, dist, rname, exp in edges_def
    ]

    return nodes, edges


def generate_hazards() -> List[Dict[str, Any]]:
    """10 Synthetic Hazard events matching IMD Cyclone & Marine Warning Bulletins."""
    # Canonical Authority-sector applicability.  This preserves the existing
    # operational assignments without inferring membership from UI labels.
    affected_sector_ids = {
        "hazard-01": ["sector-ratnagiri"],
        "hazard-02": ["sector-ratnagiri"],
        "hazard-03": ["sector-goa"],
        "hazard-05": ["sector-ratnagiri"],
    }
    hazards_def = [
        (
            "hazard-01",
            "CYCLONE_SQUALL",
            "WARNING",
            "Severe Cyclone Squall Warning - Konkan Offshore Sector",
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [72.70, 16.35],
                        [73.10, 16.35],
                        [73.30, 16.60],
                        [73.38, 16.85],
                        [73.35, 17.15],
                        [73.15, 17.20],
                        [72.85, 17.15],
                        [72.65, 16.85],
                        [72.60, 16.55],
                        [72.70, 16.35],
                    ]
                ],
            },
            REFERENCE_TIME - timedelta(hours=2),
            REFERENCE_TIME + timedelta(hours=10),
            "ACTIVE",
        ),
        (
            "hazard-02",
            "HIGH_WAVE",
            "ALERT",
            "High Wave & Swell Surge Alert (2.8m - 3.4m) off Ratnagiri",
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [72.95, 16.82],
                        [73.25, 16.82],
                        [73.35, 16.95],
                        [73.32, 17.15],
                        [73.10, 17.20],
                        [72.95, 17.12],
                        [72.90, 16.98],
                        [72.95, 16.82],
                    ]
                ],
            },
            REFERENCE_TIME,
            REFERENCE_TIME + timedelta(hours=18),
            "ACTIVE",
        ),
        (
            "hazard-03",
            "HIGH_WIND",
            "WARNING",
            "Gale Wind Warning (32 to 38 knots) across South Maharashtra Waters",
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [72.65, 15.90],
                        [73.10, 15.92],
                        [73.45, 16.15],
                        [73.48, 16.50],
                        [73.35, 16.70],
                        [73.00, 16.68],
                        [72.70, 16.45],
                        [72.60, 16.15],
                        [72.65, 15.90],
                    ]
                ],
            },
            REFERENCE_TIME - timedelta(hours=6),
            REFERENCE_TIME + timedelta(hours=6),
            "ACTIVE",
        ),
        (
            "hazard-04",
            "THUNDERSTORM",
            "WATCH",
            "Coastal Thunderstorm & Intense Lightning Watch",
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [73.22, 16.05],
                        [73.45, 16.02],
                        [73.58, 16.18],
                        [73.57, 16.42],
                        [73.38, 16.48],
                        [73.24, 16.35],
                        [73.20, 16.18],
                        [73.22, 16.05],
                    ]
                ],
            },
            REFERENCE_TIME + timedelta(hours=12),
            REFERENCE_TIME + timedelta(hours=24),
            "PLANNED",
        ),
        (
            "hazard-05",
            "RESTRICTED_AREA_ACTIVITY",
            "WARNING",
            "Naval Surface Gunfire & Missile Firing Activity Notice",
            {
                "type": "Polygon",
                "coordinates": [
                    [
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
                    ]
                ],
            },
            REFERENCE_TIME - timedelta(hours=12),
            REFERENCE_TIME + timedelta(hours=36),
            "ACTIVE",
        ),
        (
            "hazard-06",
            "CYCLONE_SQUALL",
            "WARNING",
            "Past Squall Alert (Expired)",
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [72.52, 16.22],
                        [72.85, 16.20],
                        [72.98, 16.45],
                        [72.95, 16.78],
                        [72.78, 16.82],
                        [72.56, 16.65],
                        [72.48, 16.40],
                        [72.52, 16.22],
                    ]
                ],
            },
            REFERENCE_TIME - timedelta(hours=36),
            REFERENCE_TIME - timedelta(hours=12),
            "EXPIRED",
        ),
        (
            "hazard-07",
            "HIGH_WAVE",
            "WATCH",
            "Swell Surge Advisory - Sindhudurg Coastal Belt",
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [73.32, 15.82],
                        [73.52, 15.85],
                        [73.56, 16.05],
                        [73.54, 16.18],
                        [73.42, 16.22],
                        [73.34, 16.10],
                        [73.30, 15.95],
                        [73.32, 15.82],
                    ]
                ],
            },
            REFERENCE_TIME + timedelta(hours=6),
            REFERENCE_TIME + timedelta(hours=30),
            "PLANNED",
        ),
        (
            "hazard-08",
            "ADVISORY",
            "NORMAL",
            "Dense Morning Sea Fog & Visibility Reduction Advisory",
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [73.22, 16.92],
                        [73.38, 16.90],
                        [73.42, 17.02],
                        [73.39, 17.14],
                        [73.28, 17.15],
                        [73.21, 17.05],
                        [73.22, 16.92],
                    ]
                ],
            },
            REFERENCE_TIME + timedelta(hours=18),
            REFERENCE_TIME + timedelta(hours=24),
            "PLANNED",
        ),
        (
            "hazard-09",
            "CURRENT_SHEAR",
            "ALERT",
            "Strong Tidal Rip & Surface Current Shear (> 2.4 knots)",
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [73.12, 16.32],
                        [73.32, 16.30],
                        [73.36, 16.45],
                        [73.32, 16.58],
                        [73.20, 16.60],
                        [73.12, 16.48],
                        [73.10, 16.38],
                        [73.12, 16.32],
                    ]
                ],
            },
            REFERENCE_TIME,
            REFERENCE_TIME + timedelta(hours=14),
            "ACTIVE",
        ),
        (
            "hazard-10",
            "CYCLONE_SQUALL",
            "WARNING",
            "Monsoon Deep Depression Advisory (Expired Historical)",
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [72.05, 15.52],
                        [72.85, 15.48],
                        [73.18, 15.85],
                        [73.22, 16.40],
                        [73.15, 16.78],
                        [72.65, 16.82],
                        [72.15, 16.50],
                        [71.95, 16.00],
                        [72.05, 15.52],
                    ]
                ],
            },
            REFERENCE_TIME - timedelta(hours=72),
            REFERENCE_TIME - timedelta(hours=24),
            "EXPIRED",
        ),
    ]

    return [
        {
            "public_id": hid,
            "event_type": etype,
            "severity": sev,
            "headline": head,
            "geometry_geojson": geom,
            "start_time": start,
            "end_time": end,
            "status": status,
            "provenance_json": {
                **PROVENANCE_BASE,
                "intended_provider": "IMD_CYCLONE_DIVISION",
                "source_product": "IMD Severe Weather & Cyclone Warning Bulletin",
                "official_documentation": "https://rsmcnewdelhi.imd.gov.in",
                "affected_sector_ids": affected_sector_ids.get(hid, []),
            },
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for hid, etype, sev, head, geom, start, end, status in hazards_def
    ]


def generate_notifications() -> List[Dict[str, Any]]:
    """20 Linked Notifications/Alerts across stakeholders, vessels, and trips."""
    notifications_def = [
        ("notif-01", "fisher", "fisher-01", "vessel-01", "trip-01", "hazard-01", None, "Squall Warning in Sector", "Active cyclone squall warning issued for Konkan offshore. Exercise caution.", "WARNING", False, False, REFERENCE_TIME - timedelta(hours=1)),
        ("notif-02", "fisher", "fisher-02", "vessel-02", "trip-02", "hazard-02", None, "Elevated Wave Heights Observed", "Waves exceeding 2.8m recorded on outer banks. Safe return recommended.", "WARNING", True, True, REFERENCE_TIME - timedelta(hours=4)),
        ("notif-03", "fisher", "fisher-03", "vessel-03", "trip-03", "hazard-01", None, "CRITICAL: Approaching Squall Line", "Vessel heading directly into active squall corridor. Divert to sheltered passage.", "CRITICAL", False, False, REFERENCE_TIME - timedelta(minutes=30)),
        ("notif-04", "fisher", "fisher-05", "vessel-05", "trip-05", None, "geofence-02", "Malvan Sanctuary Boundary Alert", "Vessel within 500m of Malvan Marine Sanctuary boundary.", "INFO", False, False, REFERENCE_TIME - timedelta(hours=2)),
        ("notif-05", "coastal_authority", None, "vessel-03", "trip-03", "hazard-01", None, "Vessel in Hazard Alert Zone", "Matsya Sagar 03 operating near active squall polygon off Ratnagiri.", "WARNING", False, False, REFERENCE_TIME - timedelta(minutes=25)),
        ("notif-06", "disaster_management", None, "vessel-03", "trip-03", "hazard-01", None, "High Risk Distress Readiness", "SDRF coastal unit placed on standby for South Konkan vessel monitoring.", "CRITICAL", False, False, REFERENCE_TIME - timedelta(minutes=20)),
        ("notif-07", "maritime_operator", None, "vessel-01", "trip-01", None, None, "Departure Logged", "Vessel Matsya Sagar 01 departed Ratnagiri Harbor for Inshore sector.", "INFO", True, True, REFERENCE_TIME - timedelta(hours=6)),
        ("notif-08", "maritime_operator", None, "vessel-02", "trip-02", None, None, "Arrival Logged", "Vessel Konkan Pride arrived safely at Ratnagiri Harbor.", "INFO", True, True, REFERENCE_TIME - timedelta(hours=1)),
        ("notif-09", "researcher", None, None, None, None, None, "New Synthetic EO Data Ingested", "350 Synthetic EO SST and chlorophyll cells available for ecological analysis.", "INFO", True, False, REFERENCE_TIME - timedelta(hours=3)),
        ("notif-10", "coastal_authority", None, None, None, "hazard-05", "geofence-01", "Naval Live Firing Exercise Active", "Naval Firing Range Foxtrot is active until 2026-09-13T18:00Z.", "CRITICAL", False, False, REFERENCE_TIME - timedelta(hours=5)),
        ("notif-11", "fisher", "fisher-06", "vessel-06", "trip-06", None, None, "PFZ Candidate Advisory Available", "High confidence PFZ detected 19.5 km off Malvan. Favorable SST gradient.", "INFO", False, False, REFERENCE_TIME - timedelta(hours=2)),
        ("notif-12", "fisher", "fisher-04", "vessel-04", "trip-04", None, None, "Trip Completed", "Mirya Bay nearshore trip concluded without incident.", "INFO", True, True, REFERENCE_TIME - timedelta(hours=1)),
        ("notif-13", "fisher", "fisher-07", "vessel-07", "trip-07", None, None, "Sheltered Channel Advice", "Route A inshore channel recommended due to open sea swell.", "INFO", True, False, REFERENCE_TIME - timedelta(hours=7)),
        ("notif-14", "fisher", "fisher-08", "vessel-08", "trip-08", "hazard-03", None, "Gale Wind Warning", "32 knot gale gusts forecast for Outer Deep Bank.", "WARNING", False, False, REFERENCE_TIME - timedelta(minutes=45)),
        ("notif-15", "coastal_authority", None, "vessel-05", "trip-05", None, "geofence-02", "Sanctuary Perimeter Approach Logged", "Sea Hawk Goa approached Malvan Coral Sanctuary perimeter.", "INFO", True, True, REFERENCE_TIME - timedelta(hours=2)),
        ("notif-16", "disaster_management", None, None, None, "hazard-01", None, "Cyclone Squall Bulletin Dispatched", "Dispatched SMS and VHF safety broadcasts to 142 registered craft in Ratnagiri.", "WARNING", True, True, REFERENCE_TIME - timedelta(hours=2)),
        ("notif-17", "researcher", None, None, "trip-10", None, None, "Research Cruise Route Cleared", "Sindhudurg Bio-Station research voyage scheduled for departure.", "INFO", False, False, REFERENCE_TIME - timedelta(hours=8)),
        ("notif-18", "maritime_operator", None, "vessel-06", "trip-06", None, None, "Fuel & Departure Clearance", "Sindhudurg Queen cleared for departure to PFZ Sector Alpha.", "INFO", False, False, REFERENCE_TIME - timedelta(minutes=15)),
        ("notif-19", "fisher", "fisher-01", "vessel-01", "trip-01", "hazard-09", None, "Current Shear Warning", "Tidal current shear exceeding 2.0 knots detected at harbor entrance.", "WARNING", False, False, REFERENCE_TIME - timedelta(minutes=10)),
        ("notif-20", "disaster_management", None, None, None, "hazard-03", None, "Port Advisory: Small Craft Stay In Port", "Advisory issued for artisanal craft to remain docked during gale warning.", "CRITICAL", False, False, REFERENCE_TIME - timedelta(hours=4)),
    ]

    return [
        {
            "public_id": nid,
            "recipient_role": role,
            "fisher_id": fid,
            "vessel_id": vid,
            "trip_id": tid,
            "hazard_id": hid,
            "geofence_id": gid,
            "title": title,
            "message": msg,
            "severity": sev,
            "is_read": read,
            "is_acknowledged": ack,
            "timestamp": ts,
            "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA"},
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for nid, role, fid, vid, tid, hid, gid, title, msg, sev, read, ack, ts in notifications_def
    ]


def generate_sectors() -> List[Dict[str, Any]]:
    """Canonical demonstration surveillance sectors for coastal authority monitoring."""
    sectors_def = [
        (
            "sector-ratnagiri",
            "Ratnagiri Sector (MH-03)",
            "harbor-ratnagiri",
            [73.28, 16.99],
            8.8,
            "Ratnagiri Coast Guard & Fisheries Post",
            [
                [72.50, 16.45],
                [73.35, 16.50],
                [73.34, 16.70],
                [73.30, 16.88],
                [73.30, 17.05],
                [73.24, 17.32],
                [73.18, 17.55],
                [72.55, 17.55],
                [72.45, 17.00],
                [72.50, 16.45],
            ],
        ),
        (
            "sector-malvan",
            "Malvan Marine Zone (MH-04)",
            "harbor-malvan",
            [73.47, 16.06],
            9.5,
            "Malvan Marine Surveillance Unit",
            [
                [73.25, 15.90],
                [73.55, 15.90],
                [73.52, 16.00],
                [73.49, 16.07],
                [73.48, 16.16],
                [73.42, 16.25],
                [73.20, 16.25],
                [73.20, 16.05],
                [73.25, 15.90],
            ],
        ),
        (
            "sector-goa",
            "Goa Naval Corridor (GA-01)",
            "harbor-panaji",
            [73.83, 15.49],
            9.0,
            "Goa Port & Naval Traffic Center",
            [
                [73.35, 15.05],
                [74.05, 15.05],
                [73.98, 15.25],
                [73.83, 15.42],
                [73.82, 15.52],
                [73.74, 15.72],
                [73.68, 15.82],
                [73.38, 15.82],
                [73.30, 15.45],
                [73.35, 15.05],
            ],
        ),
        (
            "sector-mumbai",
            "Mumbai Offshore (MH-01)",
            "harbor-mumbai",
            [72.87, 18.92],
            8.8,
            "Mumbai Maritime Rescue Coordination Centre",
            [
                [72.10, 18.45],
                [72.95, 18.45],
                [72.90, 18.70],
                [72.85, 18.95],
                [72.84, 19.18],
                [72.80, 19.38],
                [72.15, 19.38],
                [72.05, 18.95],
                [72.10, 18.45],
            ],
        ),
        (
            "sector-veraval",
            "Veraval Coastal Zone (GJ-02)",
            "harbor-veraval",
            [70.37, 20.90],
            8.5,
            "Veraval Coastal Police & Fisheries Command",
            [
                [69.75, 20.60],
                [70.92, 20.35],
                [70.95, 20.72],
                [70.75, 20.80],
                [70.40, 20.92],
                [70.12, 21.15],
                [69.75, 21.32],
                [69.65, 20.95],
                [69.75, 20.60],
            ],
        ),
    ]

    return [
        {
            "public_id": sid,
            "name": name,
            "harbor_id": harbor,
            "center": center,
            "zoom": zoom,
            "station_name": station,
            "polygon": poly,
            "provenance_json": {
                **PROVENANCE_BASE,
                "intended_provider": "SAMUDRA_MARITIME_AUTHORITY",
                "note": "Demonstration surveillance sector boundary — not an official legal maritime demarcation",
            },
            "namespace": SYNTHETIC_NAMESPACE,
            "created_at": REFERENCE_TIME,
        }
        for sid, name, harbor, center, zoom, station, poly in sectors_def
    ]


def _calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate true forward bearing between two coordinates in degrees (0-360)."""
    d_lat = lat2 - lat1
    d_lon = lon2 - lon1
    if abs(d_lat) < 1e-6 and abs(d_lon) < 1e-6:
        return 0.0
    mid_lat = math.radians((lat1 + lat2) / 2.0)
    y = d_lon * math.cos(mid_lat)
    x = d_lat
    bearing = (math.degrees(math.atan2(y, x)) + 360.0) % 360.0
    return round(bearing, 1)


def _interpolate_corridor(wpts: list[tuple[float, float]], n_points: int = 30) -> list[tuple[float, float]]:
    """Smoothly interpolate n points along a sequence of maritime waypoints."""
    dists = [0.0]
    for i in range(len(wpts) - 1):
        d_lat = wpts[i + 1][0] - wpts[i][0]
        d_lon = wpts[i + 1][1] - wpts[i][1]
        seg_dist = math.hypot(d_lat, d_lon * math.cos(math.radians((wpts[i][0] + wpts[i + 1][0]) / 2.0)))
        dists.append(dists[-1] + seg_dist)
    total_dist = dists[-1]

    pts = []
    for step in range(n_points):
        target_dist = (step / (n_points - 1)) * total_dist
        for seg_idx in range(len(dists) - 1):
            if dists[seg_idx] <= target_dist <= dists[seg_idx + 1] or seg_idx == len(dists) - 2:
                seg_len = dists[seg_idx + 1] - dists[seg_idx]
                seg_frac = 0.0 if seg_len == 0 else (target_dist - dists[seg_idx]) / seg_len
                lat = wpts[seg_idx][0] + seg_frac * (wpts[seg_idx + 1][0] - wpts[seg_idx][0])
                lon = wpts[seg_idx][1] + seg_frac * (wpts[seg_idx + 1][1] - wpts[seg_idx][1])
                pts.append((round(lat, 4), round(lon, 4)))
                break
    return pts


def generate_vessel_replay_positions() -> List[Dict[str, Any]]:
    """420 Geographically verified progressive GPS positions for 14 canonical vessels (30 points each).

    Every vessel operates strictly within water/maritime channels and inside its designated
    surveillance sector polygon, avoiding any land crossing.
    """
    positions = []

    # Canonical maritime corridor waypoints strictly in water within assigned sectors:
    # (vessel_id, trip_id, [waypoint coordinates], base_speed_knots)
    vessel_corridors = [
        # Ratnagiri vessels (sector-ratnagiri / harbor-ratnagiri)
        ("vessel-01", "trip-01", [(16.990, 73.280), (16.985, 73.245), (16.910, 73.170)], 7.5),
        ("vessel-02", "trip-02", [(16.990, 73.280), (16.995, 73.230), (16.940, 73.060)], 9.0),
        ("vessel-03", "trip-03", [(16.990, 73.280), (16.980, 73.240), (16.720, 73.140)], 8.2),
        ("vessel-04", "trip-04", [(16.990, 73.280), (16.992, 73.255), (17.025, 73.250)], 5.0),
        # Malvan vessels (sector-malvan / harbor-malvan)
        ("vessel-05", "trip-05", [(16.060, 73.465), (16.090, 73.440), (16.140, 73.410)], 8.0),
        ("vessel-06", "trip-06", [(16.060, 73.465), (16.045, 73.415), (16.010, 73.370)], 9.5),
        ("vessel-07", "trip-07", [(16.060, 73.465), (16.035, 73.455), (16.010, 73.445)], 4.8),
        ("vessel-08", "trip-08", [(16.060, 73.465), (16.045, 73.410), (16.030, 73.365)], 8.5),
        # Goa vessels (sector-goa / harbor-panaji)
        ("vessel-09", "trip-13", [(15.490, 73.790), (15.430, 73.720), (15.360, 73.660)], 7.5),
        ("vessel-10", "trip-14", [(15.490, 73.790), (15.560, 73.730), (15.630, 73.670)], 8.8),
        # Mumbai vessels (sector-mumbai / harbor-mumbai)
        ("vessel-11", "trip-15", [(18.910, 72.825), (18.830, 72.750), (18.740, 72.670)], 8.0),
        ("vessel-12", "trip-16", [(18.940, 72.790), (19.050, 72.670), (19.160, 72.560)], 9.2),
        # Veraval vessels (sector-veraval / harbor-veraval)
        ("vessel-13", "trip-17", [(20.890, 70.360), (20.810, 70.280), (20.730, 70.190)], 7.6),
        ("vessel-14", "trip-18", [(20.890, 70.360), (20.780, 70.330), (20.680, 70.300)], 8.6),
    ]

    for vid, tid, wpts, b_spd in vessel_corridors:
        coords = _interpolate_corridor(wpts, 30)
        for step in range(30):
            t_step = REFERENCE_TIME - timedelta(hours=6) + timedelta(minutes=12 * step)
            lat, lon = coords[step]
            if step == 0:
                hdg = _calculate_bearing(lat, lon, coords[1][0], coords[1][1])
                spd = round(max(2.5, b_spd * 0.65), 1)
            elif step == 29:
                hdg = _calculate_bearing(coords[28][0], coords[28][1], lat, lon)
                spd = round(max(2.0, b_spd * 0.70), 1)
            else:
                hdg = _calculate_bearing(coords[step - 1][0], coords[step - 1][1], coords[step + 1][0], coords[step + 1][1])
                spd = round(max(2.5, b_spd + 0.4 * math.sin(step * 0.5)), 1)

            positions.append({
                "public_id": f"pos-{vid}-{step:02d}",
                "vessel_id": vid,
                "trip_id": tid,
                "timestamp": t_step,
                "latitude": lat,
                "longitude": lon,
                "speed_knots": spd,
                "heading_deg": hdg,
                "provenance_json": {**PROVENANCE_BASE, "intended_provider": "SAMUDRA_VESSEL_TRACKING"},
                "namespace": SYNTHETIC_NAMESPACE,
                "created_at": REFERENCE_TIME,
            })

    return positions


def generate_synthetic_demo_dataset() -> Dict[str, List[Dict[str, Any]]]:
    """Generates all entity groups into a single dictionary."""
    return {
        "stakeholders": generate_stakeholders(),
        "harbors": generate_harbors(),
        "fishers": generate_fishers(),
        "vessels": generate_vessels(),
        "trips": generate_trips(),
        "marine_observations": generate_marine_observations(),
        "eo_grid_cells": generate_eo_grid_cells(),
        "pfz_candidates": generate_pfz_candidates(),
        "geofences": generate_geofences(),
        "route_nodes": generate_route_graph()[0],
        "route_edges": generate_route_graph()[1],
        "hazards": generate_hazards(),
        "notifications": generate_notifications(),
        "replay_positions": generate_vessel_replay_positions(),
        "sectors": generate_sectors(),
    }
