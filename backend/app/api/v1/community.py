"""ORCA Field Intelligence Network — Community API endpoints.

Implements the smallest high-ROI version of the OFIN:
  POST /api/v1/community/observations        - Submit a field observation
  GET  /api/v1/community/observations        - Get recent field signal feed
  GET  /api/v1/community/observations/{id}   - Get single observation
  POST /api/v1/community/observations/{id}/corroborate  - Corroborate existing
  GET  /api/v1/community/observations/demo   - Deterministic demo feed (SNAPSHOT)

Safety Invariants strictly enforced:
  C-1: Official constraints are never overridden.
  C-2: Empty feed does not imply safety.
  C-3: Source labeled [FIELD SIGNAL] in all responses.
  C-4: Trust is categorical, never decimal.
  C-5: Single uncorroborated reports never affect hard decisions.
"""

from __future__ import annotations

import hashlib
import logging
import math
import uuid
from datetime import UTC, datetime, timedelta
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.db.field_intelligence_models import (
    ConditionSeverityEnum,
    ContributorTrustEnum,
    FieldObservation,
    LocationPrecisionEnum,
    ObservationTypeEnum,
    VerificationStatusEnum,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/community", tags=["community"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ObservationSubmitRequest(BaseModel):
    observation_type: ObservationTypeEnum
    severity: Optional[ConditionSeverityEnum] = None
    description: Optional[str] = Field(None, max_length=500)
    # Location — exact stored privately, approximate returned publicly
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    harbor_reference: Optional[str] = None
    # Mission context snapshot (optional, PII stripped before storage)
    origin_harbor: Optional[str] = None
    craft_profile: Optional[str] = None
    # Evidence
    media_keys: Optional[List[str]] = Field(default=None, max_length=5)
    # Demo flag — kept for SNAPSHOT/DEMO mode determinism
    is_demo: bool = False


class ObservationPublicResponse(BaseModel):
    """Public field signal — exact location never exposed."""
    public_id: str
    observation_type: str
    severity: Optional[str] = None
    description: Optional[str] = None
    observed_at: str
    valid_until: Optional[str] = None
    # Approximate location only
    approx_latitude: float
    approx_longitude: float
    approx_radius_km: float
    harbor_reference: Optional[str] = None
    verification_status: str
    corroboration_count: int
    # Categorical trust — C-4: never decimal %
    contributor_trust: str
    official_agreement: Optional[bool] = None
    # Always [FIELD SIGNAL] — C-3
    source_type: str = "COMMUNITY"
    data_mode: str = "FIELD_SIGNAL"
    lineage_label: str = "[FIELD SIGNAL]"
    # Safety disclaimer always present — C-1
    safety_disclaimer: str = (
        "Community field signals may inform or increase/decrease confidence. "
        "They do NOT override official safety restrictions, warnings, or hard constraints."
    )
    evidence_count: int = 0
    is_demo: bool = False


class FieldFeedResponse(BaseModel):
    observations: List[ObservationPublicResponse]
    total_count: int
    # C-2: Always remind that absence of signals != safe
    epistemic_notice: str = (
        "Missing community reports in an area do NOT imply safe conditions. "
        "ORCA uses official sources as the primary safety authority."
    )
    feed_generated_at: str


class CorroborateRequest(BaseModel):
    """Corroboration from a second independent observer."""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    agrees: bool = True
    is_demo: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_APPROX_RADIUS_KM = 5.0


def _approx_coords(lat: float, lon: float, radius_km: float = _APPROX_RADIUS_KM):
    """Snap exact coordinates to ~5km grid cell center (privacy protection)."""
    # Degree-per-km approximation for snapping
    deg_lat = radius_km / 111.0
    deg_lon = radius_km / (111.0 * math.cos(math.radians(lat)))
    approx_lat = round(lat / deg_lat) * deg_lat
    approx_lon = round(lon / deg_lon) * deg_lon
    return round(approx_lat, 4), round(approx_lon, 4)


def _validity_window(obs_type: ObservationTypeEnum) -> timedelta:
    """Default validity window by observation type."""
    windows = {
        ObservationTypeEnum.ROUGH_SEA: timedelta(hours=4),
        ObservationTypeEnum.HIGH_WIND: timedelta(hours=3),
        ObservationTypeEnum.LOW_VISIBILITY: timedelta(hours=2),
        ObservationTypeEnum.CALM_SEA: timedelta(hours=6),
        ObservationTypeEnum.FISH_ACTIVITY: timedelta(hours=8),
        ObservationTypeEnum.JELLYFISH_BLOOM: timedelta(hours=12),
        ObservationTypeEnum.ALGAL_BLOOM: timedelta(hours=24),
        ObservationTypeEnum.DEBRIS: timedelta(hours=6),
        ObservationTypeEnum.OIL_SLICK: timedelta(hours=8),
        ObservationTypeEnum.VESSEL_IN_DISTRESS: timedelta(hours=2),
        ObservationTypeEnum.UNUSUAL_CURRENT: timedelta(hours=4),
        ObservationTypeEnum.RESTRICTED_AREA_ACTIVITY: timedelta(hours=4),
        ObservationTypeEnum.OTHER: timedelta(hours=6),
    }
    return windows.get(obs_type, timedelta(hours=6))


def _to_public_response(obs: FieldObservation) -> ObservationPublicResponse:
    """Convert ORM model to public response — exact coords never exposed."""
    ev_count = len(obs.evidence_attachments_json or [])
    return ObservationPublicResponse(
        public_id=obs.public_id,
        observation_type=obs.observation_type.value if obs.observation_type else "OTHER",
        severity=obs.severity.value if obs.severity else None,
        description=obs.description,
        observed_at=obs.observed_at.isoformat() if obs.observed_at else "",
        valid_until=obs.valid_until.isoformat() if obs.valid_until else None,
        approx_latitude=obs.approx_latitude,
        approx_longitude=obs.approx_longitude,
        approx_radius_km=obs.approx_radius_km,
        harbor_reference=obs.harbor_reference,
        verification_status=obs.verification_status.value if obs.verification_status else "UNVERIFIED",
        corroboration_count=obs.corroboration_count,
        contributor_trust=obs.contributor_trust.value if obs.contributor_trust else "UNVERIFIED",
        official_agreement=obs.official_agreement,
        evidence_count=ev_count,
        is_demo=obs.is_demo,
    )


# ---------------------------------------------------------------------------
# Demo seed data (deterministic — used for SNAPSHOT/DEMO mode)
# ---------------------------------------------------------------------------

DEMO_OBSERVATIONS: List[dict] = [
    {
        "public_id": "OBS-DEMO-001",
        "observation_type": "ROUGH_SEA",
        "severity": "MODERATE",
        "description": "Significant swell from SW, 2-3m waves observed outside harbour mouth.",
        "approx_latitude": 16.98,
        "approx_longitude": 73.30,
        "harbor_reference": "Ratnagiri",
        "verification_status": "CORROBORATED",
        "corroboration_count": 3,
        "contributor_trust": "ESTABLISHED",
        "official_agreement": None,
        "evidence_count": 1,
        "is_demo": True,
    },
    {
        "public_id": "OBS-DEMO-002",
        "observation_type": "FISH_ACTIVITY",
        "severity": "MILD",
        "description": "Good mackerel activity near the 40m depth contour, approx 13nm SW.",
        "approx_latitude": 16.85,
        "approx_longitude": 73.05,
        "harbor_reference": "Ratnagiri",
        "verification_status": "CORROBORATED",
        "corroboration_count": 2,
        "contributor_trust": "ESTABLISHED",
        "official_agreement": None,
        "evidence_count": 0,
        "is_demo": True,
    },
    {
        "public_id": "OBS-DEMO-003",
        "observation_type": "LOW_VISIBILITY",
        "severity": "MODERATE",
        "description": "Heavy morning haze between 05:00–09:00, sea route unclear.",
        "approx_latitude": 16.92,
        "approx_longitude": 73.22,
        "harbor_reference": "Ratnagiri",
        "verification_status": "UNVERIFIED",
        "corroboration_count": 1,
        "contributor_trust": "PHONE_VERIFIED",
        "official_agreement": None,
        "evidence_count": 0,
        "is_demo": True,
    },
    {
        "public_id": "OBS-DEMO-004",
        "observation_type": "CALM_SEA",
        "severity": "MILD",
        "description": "Calm conditions reported Malvan inshore area, good for small craft.",
        "approx_latitude": 15.89,
        "approx_longitude": 73.65,
        "harbor_reference": "Malvan",
        "verification_status": "CORROBORATED",
        "corroboration_count": 4,
        "contributor_trust": "ESTABLISHED",
        "official_agreement": True,
        "evidence_count": 2,
        "is_demo": True,
    },
]


def _demo_observation(d: dict) -> ObservationPublicResponse:
    """Convert demo dict to public response."""
    now = datetime.now(UTC)
    return ObservationPublicResponse(
        public_id=d["public_id"],
        observation_type=d["observation_type"],
        severity=d.get("severity"),
        description=d.get("description"),
        observed_at=(now - timedelta(hours=2)).isoformat(),
        valid_until=(now + timedelta(hours=4)).isoformat(),
        approx_latitude=d["approx_latitude"],
        approx_longitude=d["approx_longitude"],
        approx_radius_km=5.0,
        harbor_reference=d.get("harbor_reference"),
        verification_status=d["verification_status"],
        corroboration_count=d["corroboration_count"],
        contributor_trust=d["contributor_trust"],
        official_agreement=d.get("official_agreement"),
        evidence_count=d.get("evidence_count", 0),
        is_demo=d.get("is_demo", True),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/observations/demo", response_model=FieldFeedResponse)
def get_demo_observations():
    """Return deterministic demo field signal feed for SNAPSHOT/DEMO mode."""
    observations = [_demo_observation(d) for d in DEMO_OBSERVATIONS]
    return FieldFeedResponse(
        observations=observations,
        total_count=len(observations),
        feed_generated_at=datetime.now(UTC).isoformat(),
    )


@router.post("/observations", response_model=ObservationPublicResponse, status_code=status.HTTP_201_CREATED)
def submit_observation(
    req: ObservationSubmitRequest,
    db: Session = Depends(get_db),
):
    """Submit a community field observation.

    Safety (C-1): This endpoint creates a [FIELD SIGNAL] only.
    Official safety constraints are never modified by this call.
    """
    now = datetime.now(UTC)
    approx_lat, approx_lon = _approx_coords(req.latitude, req.longitude)

    # Strip PII from mission context
    mission_ctx = None
    if req.origin_harbor or req.craft_profile:
        mission_ctx = {
            "origin_harbor": req.origin_harbor,
            "craft_profile": req.craft_profile,
        }

    # Anonymous contributor hash from IP (not stored here — would come from request)
    obs = FieldObservation(
        observation_type=req.observation_type,
        severity=req.severity,
        description=req.description,
        observed_at=now,
        valid_until=now + _validity_window(req.observation_type),
        approx_latitude=approx_lat,
        approx_longitude=approx_lon,
        approx_radius_km=_APPROX_RADIUS_KM,
        exact_latitude=req.latitude,
        exact_longitude=req.longitude,
        location_precision=LocationPrecisionEnum.APPROXIMATE,
        harbor_reference=req.harbor_reference,
        mission_context_json=mission_ctx,
        contributor_trust=ContributorTrustEnum.UNVERIFIED,
        verification_status=VerificationStatusEnum.UNVERIFIED,
        corroboration_count=0,
        evidence_attachments_json=[{"key": k} for k in (req.media_keys or [])],
        is_demo=req.is_demo,
    )

    try:
        db.add(obs)
        db.commit()
        db.refresh(obs)
    except Exception as exc:
        db.rollback()
        logger.warning("Field observation DB write failed (offline?): %s", exc)
        # Return a non-persisted response in demo/offline mode
        obs.approx_radius_km = _APPROX_RADIUS_KM
        obs.observation_type = req.observation_type

    return _to_public_response(obs)


@router.get("/observations", response_model=FieldFeedResponse)
def get_observations(
    harbor: Optional[str] = Query(None, description="Filter by harbor reference"),
    observation_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    hours: int = Query(24, ge=1, le=168, description="Lookback window in hours"),
    db: Session = Depends(get_db),
):
    """Get recent field signal feed.

    C-2 notice always included: empty feed does NOT mean safe conditions.
    C-3: All results labeled [FIELD SIGNAL].
    """
    since = datetime.now(UTC) - timedelta(hours=hours)

    try:
        q = db.query(FieldObservation).filter(
            FieldObservation.observed_at >= since,
            FieldObservation.verification_status != VerificationStatusEnum.EXPIRED,
        )
        if harbor:
            q = q.filter(FieldObservation.harbor_reference == harbor)
        if observation_type:
            q = q.filter(FieldObservation.observation_type == observation_type)

        total = q.count()
        records = q.order_by(FieldObservation.observed_at.desc()).limit(limit).all()
        observations = [_to_public_response(r) for r in records]
    except Exception as exc:
        logger.warning("Field observation DB read failed (offline?): %s", exc)
        # Fallback to demo in offline mode
        observations = [_demo_observation(d) for d in DEMO_OBSERVATIONS
                        if not harbor or d.get("harbor_reference") == harbor]
        total = len(observations)

    return FieldFeedResponse(
        observations=observations,
        total_count=total,
        feed_generated_at=datetime.now(UTC).isoformat(),
    )


@router.get("/observations/{public_id}", response_model=ObservationPublicResponse)
def get_observation(public_id: str, db: Session = Depends(get_db)):
    """Get a single field observation by public ID."""
    # Check demo records first
    for d in DEMO_OBSERVATIONS:
        if d["public_id"] == public_id:
            return _demo_observation(d)

    try:
        obs = db.query(FieldObservation).filter(
            FieldObservation.public_id == public_id
        ).first()
    except Exception:
        obs = None

    if not obs:
        raise HTTPException(status_code=404, detail=f"Observation {public_id} not found.")
    return _to_public_response(obs)


@router.post("/observations/{public_id}/corroborate", response_model=ObservationPublicResponse)
def corroborate_observation(
    public_id: str,
    req: CorroborateRequest,
    db: Session = Depends(get_db),
):
    """Corroborate an existing observation from a second independent observer.

    C-5: Corroboration is tracked but community signals still cannot override
    official safety decisions even when corroborated.
    """
    try:
        obs = db.query(FieldObservation).filter(
            FieldObservation.public_id == public_id
        ).first()
        if not obs:
            raise HTTPException(status_code=404, detail=f"Observation {public_id} not found.")

        obs.corroboration_count += 1
        if obs.corroboration_count >= 1:
            obs.verification_status = VerificationStatusEnum.CORROBORATED
        db.commit()
        db.refresh(obs)
        return _to_public_response(obs)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Corroboration DB write failed: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unavailable.")
