"""Sector Situation Evaluation Domain Service for ORCA.

Integrates canonical surveillance sectors with:
1. Dynamic fleet count derived from canonical vessel records matching the sector's harbor.
2. Active sector hazard advisories.
3. Relevant observation feeds unified in ObservationBundle.
4. Authoritative risk evaluation via DeterministicRiskEngine.
5. Traceable ground-truth evidence and provenance.

Enforces critical safety invariant: UNKNOWN != GO.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.contracts.chat import (
    Confidence,
    ConfidenceLevel,
    EvidenceItem,
    Recommendation,
    RecommendationStatus,
)
from backend.app.contracts.observation import ObservationBundle
from backend.app.contracts.situation import SectorSituationResponse
from backend.app.domain.risk_engine import DeterministicRiskEngine
from backend.app.services.data_service import DataService

logger = logging.getLogger(__name__)

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "fixtures" / "synthetic" / "orca"

# ---------------------------------------------------------------------------
# In-memory canonical sector + harbor registry
# ---------------------------------------------------------------------------
# This mirrors the data/fixtures/synthetic/orca/sectors.json and
# harbors.json data and is used as a hardened final fallback when the fixture
# files cannot be resolved at runtime (e.g., Render working-directory).
# UPDATE this registry whenever the fixture data changes.
_CANONICAL_SECTORS_FALLBACK: List[Dict[str, Any]] = [
    {
        "public_id": "sector-ratnagiri",
        "name": "Ratnagiri Sector (MH-03)",
        "harbor_id": "harbor-ratnagiri",
        "center": [73.28, 16.99],
        "zoom": 8.8,
        "station_name": "Ratnagiri Coast Guard & Fisheries Post",
        "code": "MH-03",
        "polygon": [[72.5, 16.45], [73.35, 16.5], [73.34, 16.7], [73.3, 16.88], [73.3, 17.05],
                    [73.24, 17.32], [73.18, 17.55], [72.55, 17.55], [72.45, 17.0], [72.5, 16.45]],
    },
    {
        "public_id": "sector-malvan",
        "name": "Malvan Marine Zone (MH-04)",
        "harbor_id": "harbor-malvan",
        "center": [73.47, 16.06],
        "zoom": 9.5,
        "station_name": "Malvan Marine Surveillance Unit",
        "code": "MH-04",
        "polygon": [[73.25, 15.9], [73.55, 15.9], [73.52, 16.0], [73.49, 16.07],
                    [73.48, 16.16], [73.42, 16.25], [73.2, 16.25], [73.2, 16.05], [73.25, 15.9]],
    },
    {
        "public_id": "sector-goa",
        "name": "Goa Naval Corridor (GA-01)",
        "harbor_id": "harbor-panaji",
        "center": [73.83, 15.49],
        "zoom": 9.0,
        "station_name": "Goa Port & Naval Traffic Center",
        "code": "GA-01",
        "polygon": [[73.35, 15.05], [74.05, 15.05], [73.98, 15.25], [73.83, 15.42],
                    [73.82, 15.52], [73.74, 15.72], [73.68, 15.82], [73.38, 15.82],
                    [73.3, 15.45], [73.35, 15.05]],
    },
    {
        "public_id": "sector-mumbai",
        "name": "Mumbai Offshore (MH-01)",
        "harbor_id": "harbor-mumbai",
        "center": [72.87, 18.92],
        "zoom": 8.8,
        "station_name": "Mumbai Maritime Rescue Coordination Centre",
        "code": "MH-01",
        "polygon": [[72.1, 18.45], [72.95, 18.45], [72.9, 18.7], [72.85, 18.95],
                    [72.84, 19.18], [72.8, 19.38], [72.15, 19.38], [72.05, 18.95], [72.1, 18.45]],
    },
    {
        "public_id": "sector-veraval",
        "name": "Veraval Coastal Zone (GJ-02)",
        "harbor_id": "harbor-veraval",
        "center": [70.37, 20.90],
        "zoom": 8.5,
        "station_name": "Veraval Coastal Police & Fisheries Command",
        "code": "GJ-02",
        "polygon": [[69.75, 20.6], [70.92, 20.35], [70.95, 20.72], [70.75, 20.8],
                    [70.4, 20.92], [70.12, 21.15], [69.75, 21.32], [69.65, 20.95], [69.75, 20.6]],
    },
]

_CANONICAL_HARBORS_FALLBACK: List[Dict[str, Any]] = [
    {"public_id": "harbor-ratnagiri", "name": "Ratnagiri", "latitude": 16.99, "longitude": 73.28},
    {"public_id": "harbor-malvan", "name": "Malvan", "latitude": 16.06, "longitude": 73.47},
    {"public_id": "harbor-panaji", "name": "Panaji", "latitude": 15.49, "longitude": 73.83},
    {"public_id": "harbor-mumbai", "name": "Mumbai", "latitude": 18.92, "longitude": 72.87},
    {"public_id": "harbor-veraval", "name": "Veraval", "latitude": 20.90, "longitude": 70.37},
]


def _load_canonical_sectors() -> List[Dict[str, Any]]:
    """Loads canonical surveillance sectors.

    Priority order:
    1. DB (canonical truth when seeded)
    2. sectors.json fixture file
    3. In-memory hardened fallback (always succeeds — no Render path issues)
    """
    # 1. Try database first
    try:
        from backend.app.db.repositories import SyntheticDemoRepository
        from backend.app.db.session import SessionLocal
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_sectors()
            if items:
                from backend.app.api.v1.routes import _model_to_dict
                return [_model_to_dict(i) for i in items]
    except Exception as exc:
        logger.debug("Database get_sectors failed: %s", exc)

    # 2. Try fixture file (local dev / Docker)
    sectors_path = FIXTURES_DIR / "sectors.json"
    if sectors_path.exists():
        try:
            with open(sectors_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.debug("Failed reading sectors fixture: %s", exc)

    # 3. Hardened in-memory fallback — never returns empty
    logger.warning(
        "sectors.json not found at %s — using in-memory canonical fallback.",
        sectors_path,
    )
    return _CANONICAL_SECTORS_FALLBACK


def get_canonical_sectors() -> List[Dict[str, Any]]:
    """Return canonical sectors for API consumers.

    The loader keeps fixture-backed data authoritative and only returns the
    in-memory registry when the database and package-relative fixture are not
    available.  Returning a copy prevents callers from mutating the registry.
    """
    return [dict(sector) for sector in _load_canonical_sectors()]


def resolve_sector_harbor_id(sector_id: str) -> Optional[str]:
    """Resolve a sector identifier or display name to its canonical harbor."""
    sector = _resolve_canonical_sector(sector_id)
    return sector.get("harbor_id") if sector else None


def _resolve_canonical_sector(sector_id: str) -> Optional[Dict[str, Any]]:
    """Find canonical sector metadata by public_id or display name."""
    s = sector_id.strip()
    s_lower = s.lower()
    for sec in _load_canonical_sectors():
        if (
            sec.get("public_id") == s
            or sec.get("name") == s
            or sec.get("public_id", "").lower() == s_lower
            or sec.get("name", "").lower() == s_lower
        ):
            return sec
    return None


def resolve_authority_sector_context(sector_id: str) -> Optional[Dict[str, Any]]:
    """Resolve a canonical Authority sector public ID to request-scoped context.

    Display names are intentionally not accepted here: Authority chat sends the
    canonical public ID, then derives its harbor and coordinates from canonical
    fixture metadata.
    """
    normalized_id = sector_id.strip()
    sector = next(
        (item for item in _load_canonical_sectors() if item.get("public_id") == normalized_id),
        None,
    )
    if sector is None:
        return None

    harbor_id = sector.get("harbor_id")

    # Try fixture file first, then in-memory fallback
    harbor = None
    harbors_path = FIXTURES_DIR / "harbors.json"
    if harbors_path.exists():
        try:
            with open(harbors_path, "r", encoding="utf-8") as fixture:
                harbor = next(
                    (item for item in json.load(fixture) if item.get("public_id") == harbor_id),
                    None,
                )
        except Exception as exc:
            logger.debug("Failed reading canonical harbors fixture: %s", exc)

    if harbor is None:
        # Hardened in-memory fallback
        harbor = next(
            (h for h in _CANONICAL_HARBORS_FALLBACK if h.get("public_id") == harbor_id),
            None,
        )

    if harbor is None:
        return None

    return {
        "sector_id": sector["public_id"],
        "sector_name": sector.get("name"),
        "harbor_id": harbor_id,
        "origin_harbor": harbor["name"],
        "coordinates": [harbor["longitude"], harbor["latitude"]],
    }


def get_canonical_active_hazards_for_sector(
    sector_id: str, namespace: str = "ORCA_DEMO_V1"
) -> Optional[List[Dict[str, Any]]]:
    """Return the canonical active hazards assigned to a canonical sector.

    The synthetic records carry their Authority-sector applicability in
    provenance metadata. Status remains the established active/expired/future
    discriminator; no client-side or display-name inference is involved.
    """
    sector = next(
        (item for item in _load_canonical_sectors() if item.get("public_id") == sector_id),
        None,
    )
    if sector is None:
        return None

    from backend.app.domain.synthetic.generator import current_demo_dataset as generate_synthetic_demo_dataset

    hazards = generate_synthetic_demo_dataset()["hazards"]
    return [
        hazard
        for hazard in hazards
        if hazard.get("namespace") == namespace
        and hazard.get("status") == "ACTIVE"
        and sector_id in hazard.get("provenance_json", {}).get("affected_sector_ids", [])
    ]


def get_canonical_vessel_hazard_associations_for_sector(
    sector_id: str, namespace: str = "ORCA_DEMO_V1"
) -> Optional[List[Dict[str, Any]]]:
    """Observational current-position containment in canonical active hazards."""
    context = resolve_authority_sector_context(sector_id)
    if context is None:
        return None
    from backend.app.domain.synthetic.generator import current_demo_dataset as generate_synthetic_demo_dataset
    from shapely.geometry import Point, shape

    dataset = generate_synthetic_demo_dataset()
    hazards = get_canonical_active_hazards_for_sector(sector_id, namespace) or []
    vessels = [v for v in dataset["vessels"] if v.get("home_harbor_id") == context["harbor_id"]]
    latest_by_vessel: Dict[str, Dict[str, Any]] = {}
    for position in dataset["replay_positions"]:
        if position.get("vessel_id") not in {v["public_id"] for v in vessels}:
            continue
        vessel_id = position["vessel_id"]
        if vessel_id not in latest_by_vessel or position["timestamp"] > latest_by_vessel[vessel_id]["timestamp"]:
            latest_by_vessel[vessel_id] = position

    associations: List[Dict[str, Any]] = []
    for vessel_id, position in latest_by_vessel.items():
        vessel_point = Point(position["longitude"], position["latitude"])
        for hazard in hazards:
            try:
                hazard_geometry = shape(hazard["geometry_geojson"])
            except Exception:
                continue
            if hazard_geometry.covers(vessel_point):
                associations.append({
                    "vessel_id": vessel_id,
                    "hazard_id": hazard["public_id"],
                    "sector_id": sector_id,
                    "association_type": "IN_HAZARD_AREA",
                    "evaluated_at": position["timestamp"].isoformat(),
                    "vessel_position": [position["longitude"], position["latitude"]],
                })
    return associations


def get_canonical_operational_alerts_for_sector(
    sector_id: str, namespace: str = "ORCA_DEMO_V1"
) -> Optional[List[Dict[str, Any]]]:
    """Derive stable current operational alerts from P0-8B associations."""
    associations = get_canonical_vessel_hazard_associations_for_sector(sector_id, namespace)
    if associations is None:
        return None
    hazards = {
        hazard["public_id"]: hazard
        for hazard in get_canonical_active_hazards_for_sector(sector_id, namespace) or []
    }
    alerts: List[Dict[str, Any]] = []
    for association in associations:
        hazard = hazards.get(association["hazard_id"])
        if hazard is None:
            continue
        alerts.append({
            "alert_id": f"alert-{sector_id}-{association['vessel_id']}-{association['hazard_id']}",
            "sector_id": sector_id,
            "vessel_id": association["vessel_id"],
            "hazard_id": association["hazard_id"],
            "severity": hazard["severity"],
            "observed_at": association["evaluated_at"],
            "summary": f"Vessel {association['vessel_id']} is in active hazard area: {hazard['headline']}",
        })
    return alerts


def _get_canonical_vessels(harbor_id: str, namespace: str = "ORCA_DEMO_V1") -> List[Dict[str, Any]]:
    """Dynamically query canonical vessels assigned to a specific harbor."""
    try:
        from backend.app.db.repositories import SyntheticDemoRepository
        from backend.app.db.session import SessionLocal
        with SessionLocal() as session:
            repo = SyntheticDemoRepository(session)
            items = repo.get_vessels(namespace=namespace, harbor_id=harbor_id)
            if items:
                from backend.app.api.v1.routes import _model_to_dict
                return [_model_to_dict(i) for i in items]
    except Exception as exc:
        logger.debug("Database get_vessels failed: %s", exc)

    vessels_path = FIXTURES_DIR / "vessels.json"
    if vessels_path.exists():
        try:
            with open(vessels_path, "r", encoding="utf-8") as f:
                records = json.load(f)
                return [v for v in records if v.get("home_harbor_id") == harbor_id]
        except Exception as exc:
            logger.debug("Failed reading vessels fixture: %s", exc)
    return []


def _harbor_id_to_name(harbor_id: str) -> str:
    """Map canonical harbor_id to common harbor display name for weather/marine lookups."""
    mapping = {
        "harbor-ratnagiri": "Ratnagiri",
        "harbor-malvan": "Malvan",
        "harbor-panaji": "Panaji",
        "harbor-mumbai": "Mumbai",
        "harbor-veraval": "Veraval",
    }
    return mapping.get(harbor_id, harbor_id.replace("harbor-", "").capitalize())


def evaluate_sector_situation(
    sector_id: str,
    bundle: Optional[ObservationBundle] = None,
    reference_time: Optional[datetime | str] = None,
    craft_profile: str = "motorized_boat",
    namespace: str = "ORCA_DEMO_V1",
    data_service: Optional[DataService] = None,
) -> Optional[SectorSituationResponse]:
    """Evaluates the situation and deterministic risk for a canonical surveillance sector.

    Returns None if the sector cannot be resolved (caller should produce 404).
    """
    sector = _resolve_canonical_sector(sector_id)
    if not sector:
        return None

    public_id = sector.get("public_id", sector_id)
    sector_name = sector.get("name", sector_id)
    harbor_id = sector.get("harbor_id", "")
    harbor_name = _harbor_id_to_name(harbor_id)

    # 1. Fleet count dynamically queried from canonical records
    vessels = _get_canonical_vessels(harbor_id=harbor_id, namespace=namespace)
    fleet_count = len(vessels)

    # 2. Active hazards relevant to this sector
    active_hazards = get_canonical_active_hazards_for_sector(public_id, namespace=namespace) or []
    active_hazard_count = len(active_hazards)

    # 3. Assemble context & observation bundle
    context = ToolInvocationContext(
        origin_harbor=harbor_name,
        craft_profile=craft_profile,
    )

    if bundle is None:
        ds = data_service or DataService("DEMO")
        bundle = ds.get_observation_bundle(context)

    # 4. Deterministic Risk Engine evaluation
    risk_assessment = DeterministicRiskEngine.evaluate(
        context=context,
        bundle=bundle,
        reference_time=reference_time,
    )

    # 5. Extract evaluation timestamp
    if reference_time is not None:
        if isinstance(reference_time, datetime):
            eval_time_str = reference_time.isoformat()
        else:
            eval_time_str = str(reference_time)
    else:
        eval_time_str = datetime.now(UTC).isoformat()

    # 6. Build traceable ground-truth evidence items
    evidence_items: List[EvidenceItem] = []

    if bundle.marine is not None:
        evidence_items.append(
            EvidenceItem(
                evidence_id=f"EV-MARINE-{public_id}",
                source_name=bundle.marine.source_name or "INCOIS Ocean State Forecast",
                source_url=bundle.marine.source_url or "https://incois.gov.in/portal/osf",
                metric_name="significant_wave_height_m",
                metric_value=bundle.marine.significant_wave_height_m,
                unit="m",
                observed_time=bundle.marine.observed_at,
                valid_to=bundle.marine.valid_to,
                quality_flags=["official_source", "incois_osf"],
            )
        )

    if bundle.weather is not None:
        evidence_items.append(
            EvidenceItem(
                evidence_id=f"EV-WEATHER-{public_id}",
                source_name=bundle.weather.source_name or "IMD Coastal Weather",
                source_url=bundle.weather.source_url or "https://mausam.imd.gov.in",
                metric_name="wind_speed_knots",
                metric_value=bundle.weather.wind_speed_knots,
                unit="knots",
                observed_time=bundle.weather.observed_at,
                valid_to=bundle.weather.valid_to,
                quality_flags=["official_source", "imd_aws"],
            )
        )

    if bundle.hazard is not None:
        evidence_items.append(
            EvidenceItem(
                evidence_id=f"EV-HAZARD-{public_id}",
                source_name=bundle.hazard.source_name or "IMD Marine Hazard Bulletin",
                source_url=bundle.hazard.source_url or "https://mausam.imd.gov.in/hazard",
                metric_name="hazard_severity",
                metric_value=bundle.hazard.severity,
                valid_from=bundle.hazard.valid_from,
                valid_to=bundle.hazard.valid_to,
                quality_flags=["official_source", "imd_hazard"],
            )
        )

    # Attach risk status evidence
    evidence_items.append(
        EvidenceItem(
            evidence_id=f"EV-STATUS-{public_id}",
            source_name="ORCA Deterministic Risk Engine",
            metric_name="risk_status",
            metric_value=risk_assessment.status.value,
            quality_flags=["DETERMINISTIC_EVAL"],
        )
    )

    # 7. Construct Recommendation envelope
    recommendation = Recommendation(
        status=risk_assessment.status,
        summary=risk_assessment.summary,
        decisive_factors=risk_assessment.decisive_factors,
        non_decisive_factors=risk_assessment.non_decisive_factors,
        threshold_comparisons=risk_assessment.threshold_comparisons,
        next_action=risk_assessment.recommended_action,
        confidence=Confidence(
            level=risk_assessment.confidence_level,
            reasons=risk_assessment.confidence_reasons,
        ),
        provenance=risk_assessment.provenance,
        evidence_ids=risk_assessment.evidence_ids,
        warnings=risk_assessment.warnings,
    )

    return SectorSituationResponse(
        sector_id=public_id,
        sector_name=sector_name,
        harbor_id=harbor_id,
        harbor_name=harbor_name,
        situation_status=risk_assessment.status,
        fleet_count=fleet_count,
        active_hazard_count=active_hazard_count,
        evaluated_at=eval_time_str,
        summary=risk_assessment.summary,
        recommendation=recommendation,
        evidence=evidence_items,
        warnings=risk_assessment.warnings,
        data_mode=bundle.data_mode,
    )
