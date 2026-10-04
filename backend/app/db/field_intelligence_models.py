"""Field Intelligence Network — Community Observation Model.

Implements the ORCA Field Intelligence Network (OFIN) schema.

Safety Invariants (from ORCA_IMPLEMENTATION_BLUEPRINT.md §7):
  C-1: Community signals NEVER override official hard constraints.
  C-2: Missing reports != safe; silence is not evidence of calm.
  C-3: All community observations labeled [FIELD SIGNAL] with corroboration + freshness.
  C-4: Trust reported categorically (UNVERIFIED / PHONE_VERIFIED / ESTABLISHED), never %.
  C-5: Community signals only modulate confidence MEDIUM<->HIGH when corroborated.

Privacy-by-design:
  - Default location precision: APPROXIMATE (5km H3 grid cell).
  - Exact coordinates never exposed in public query results.
  - Contributor identity stripped from public feeds.
"""

from datetime import datetime, timezone
import enum
import uuid

from sqlalchemy import Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from backend.app.db.session import Base


def _utcnow():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class ObservationTypeEnum(str, enum.Enum):
    """What the fisher/mariner observed."""
    ROUGH_SEA = "ROUGH_SEA"
    CALM_SEA = "CALM_SEA"
    HIGH_WIND = "HIGH_WIND"
    LOW_VISIBILITY = "LOW_VISIBILITY"
    JELLYFISH_BLOOM = "JELLYFISH_BLOOM"
    FISH_ACTIVITY = "FISH_ACTIVITY"
    DEBRIS = "DEBRIS"
    OIL_SLICK = "OIL_SLICK"
    VESSEL_IN_DISTRESS = "VESSEL_IN_DISTRESS"
    UNUSUAL_CURRENT = "UNUSUAL_CURRENT"
    ALGAL_BLOOM = "ALGAL_BLOOM"
    RESTRICTED_AREA_ACTIVITY = "RESTRICTED_AREA_ACTIVITY"
    OTHER = "OTHER"


class ConditionSeverityEnum(str, enum.Enum):
    """Severity / intensity of the observed condition."""
    MILD = "MILD"
    MODERATE = "MODERATE"
    SEVERE = "SEVERE"
    EXTREME = "EXTREME"


class ContributorTrustEnum(str, enum.Enum):
    """Categorical trust dimension. No decimal percentages (C-4)."""
    UNVERIFIED = "UNVERIFIED"
    PHONE_VERIFIED = "PHONE_VERIFIED"
    ESTABLISHED = "ESTABLISHED"


class LocationPrecisionEnum(str, enum.Enum):
    """How precise the stored location is."""
    APPROXIMATE = "APPROXIMATE"
    EXACT = "EXACT"


class VerificationStatusEnum(str, enum.Enum):
    """Observation verification / corroboration state."""
    UNVERIFIED = "UNVERIFIED"
    CORROBORATED = "CORROBORATED"
    OFFICIAL_CONFIRMED = "OFFICIAL_CONFIRMED"
    OFFICIAL_CONTRADICTED = "OFFICIAL_CONTRADICTED"
    EXPIRED = "EXPIRED"


# ---------------------------------------------------------------------------
# Field Observation Model
# ---------------------------------------------------------------------------

class FieldObservation(Base):
    """ORCA Field Intelligence Network -- single community observation."""

    __tablename__ = "field_observations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_id = Column(String, unique=True, index=True, nullable=False,
                       default=lambda: f"OBS-{str(uuid.uuid4())[:8].upper()}")

    # What was observed
    observation_type = Column(Enum(ObservationTypeEnum), nullable=False, index=True)
    severity = Column(Enum(ConditionSeverityEnum), nullable=True)
    description = Column(String, nullable=True)

    # When
    observed_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow, index=True)
    valid_until = Column(DateTime(timezone=True), nullable=True)

    # Where (approximate public location)
    approx_latitude = Column(Float, nullable=False)
    approx_longitude = Column(Float, nullable=False)
    approx_radius_km = Column(Float, nullable=False, default=5.0)
    # Private exact GPS - never returned in public API
    exact_latitude = Column(Float, nullable=True)
    exact_longitude = Column(Float, nullable=True)
    location_precision = Column(Enum(LocationPrecisionEnum),
                                nullable=False, default=LocationPrecisionEnum.APPROXIMATE)
    harbor_reference = Column(String, nullable=True, index=True)

    # Mission context at time of observation (stripped of PII)
    mission_context_json = Column(JSONB, nullable=True)

    # Contributor metadata (identity scrubbed from public APIs)
    contributor_trust = Column(Enum(ContributorTrustEnum),
                               nullable=False, default=ContributorTrustEnum.UNVERIFIED)
    contributor_hash = Column(String, nullable=True)

    # Corroboration / verification
    verification_status = Column(Enum(VerificationStatusEnum),
                                 nullable=False, default=VerificationStatusEnum.UNVERIFIED, index=True)
    corroboration_count = Column(Integer, nullable=False, default=0)
    official_agreement = Column(Boolean, nullable=True)

    # Evidence attachments (references to object storage keys)
    evidence_attachments_json = Column(JSONB, nullable=False, default=list)

    # Source lineage
    source_type = Column(String, nullable=False, default="COMMUNITY")
    data_mode = Column(String, nullable=False, default="FIELD_SIGNAL")
    is_demo = Column(Boolean, nullable=False, default=False, index=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)


class ObservationCorroboration(Base):
    """Tracks which observations corroborate each other."""

    __tablename__ = "observation_corroborations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    primary_observation_id = Column(UUID(as_uuid=True),
                                    ForeignKey("field_observations.id", ondelete="CASCADE"),
                                    nullable=False, index=True)
    corroborating_observation_id = Column(UUID(as_uuid=True),
                                          ForeignKey("field_observations.id", ondelete="CASCADE"),
                                          nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
