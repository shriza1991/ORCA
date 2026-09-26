"""Sector Situation Domain and API Contracts for SAMUDRA.

Represents the authoritative sector situation response consumed by the
Authority Command Deck, combining dynamic canonical fleet counts, active
sector hazards, and deterministic risk evaluation from ObservationBundle.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.contracts.chat import Recommendation, RecommendationStatus, EvidenceItem


class SectorSituationResponse(BaseModel):
    """Authoritative situation evaluation for a coastal surveillance sector."""

    sector_id: str = Field(..., description="Canonical sector public ID (e.g. 'sector-ratnagiri')")
    sector_name: str = Field(..., description="Canonical sector display name (e.g. 'Ratnagiri Sector (MH-03)')")
    harbor_id: str = Field(..., description="Associated canonical harbor ID (e.g. 'harbor-ratnagiri')")
    harbor_name: str = Field(..., description="Associated harbor name (e.g. 'Ratnagiri')")
    situation_status: RecommendationStatus = Field(
        ..., description="Authoritative risk engine recommendation status: GO | CAUTION | NO_GO | UNKNOWN"
    )
    fleet_count: Optional[int] = Field(
        ..., ge=0, description="Count of canonical vessels; null when the source is unavailable"
    )
    active_hazard_count: Optional[int] = Field(
        ..., ge=0, description="Count of active hazards; null when the source is unavailable"
    )
    evaluated_at: str = Field(..., description="ISO-8601 UTC evaluation timestamp")
    summary: str = Field(..., description="Executive situation summary from the deterministic risk engine")
    recommendation: Recommendation = Field(
        ..., description="Complete deterministic risk assessment with decisive factors and threshold checks"
    )
    evidence: List[EvidenceItem] = Field(
        default_factory=list, description="Ground-truth evidence records supporting the risk status"
    )
    warnings: List[str] = Field(
        default_factory=list, description="Data quality, staleness, or operational advisory warnings"
    )
    data_mode: Optional[str] = Field(None, description="Source mode used to produce this situation")


class SectorHazard(BaseModel):
    """Canonical active hazard relevant to one Authority sector."""

    hazard_id: str
    hazard_type: str
    severity: str
    status: str
    headline: str
    geometry: Dict[str, Any]
    valid_from: str
    valid_to: str
    provenance: Dict[str, Any] = Field(default_factory=dict)


class SectorHazardsResponse(BaseModel):
    sector_id: str
    hazards: List[SectorHazard] = Field(default_factory=list)


class VesselHazardAssociation(BaseModel):
    vessel_id: str
    hazard_id: str
    sector_id: str
    association_type: str = "IN_HAZARD_AREA"
    evaluated_at: str
    vessel_position: List[float]


class SectorHazardAssociationsResponse(BaseModel):
    sector_id: str
    associations: List[VesselHazardAssociation] = Field(default_factory=list)


class VesselHazardOperationalAlert(BaseModel):
    alert_id: str
    alert_type: str = "VESSEL_IN_ACTIVE_HAZARD_AREA"
    sector_id: str
    vessel_id: str
    hazard_id: str
    severity: str
    status: str = "ACTIVE"
    observed_at: str
    summary: str


class SectorOperationalAlertsResponse(BaseModel):
    sector_id: str
    alerts: List[VesselHazardOperationalAlert] = Field(default_factory=list)
