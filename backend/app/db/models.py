"""Database ORM models.

Owned by Dev 2 (Backend Platform).
Provides SQLAlchemy declarative models mapped to PostgreSQL with PostGIS support.
"""

from datetime import datetime, timezone
import uuid
import enum

from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry

from backend.app.db.session import Base

def utcnow():
    return datetime.now(timezone.utc)


class ConversationThread(Base):
    __tablename__ = "conversation_threads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id = Column(String, unique=True, index=True, nullable=False)
    context_json = Column(JSONB, nullable=False, default={})
    schema_version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    runs = relationship("Run", back_populates="thread", cascade="all, delete-orphan")


class RunStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Run(Base):
    __tablename__ = "runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id = Column(String, ForeignKey("conversation_threads.thread_id", ondelete="CASCADE"), nullable=False)
    run_status = Column(Enum(RunStatus), nullable=False, default=RunStatus.PENDING)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(String, nullable=True)
    metadata_json = Column(JSONB, nullable=False, default={})

    thread = relationship("ConversationThread", back_populates="runs")
    evidence_items = relationship("EvidenceItem", back_populates="run", cascade="all, delete-orphan")
    map_layers = relationship("MapLayer", back_populates="run", cascade="all, delete-orphan")


class EvidenceItem(Base):
    __tablename__ = "evidence_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    source = Column(String, nullable=False)
    raw_data = Column(JSONB, nullable=False, default={})
    extracted_entities = Column(JSONB, nullable=False, default={})
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    run = relationship("Run", back_populates="evidence_items")


class MapLayer(Base):
    __tablename__ = "map_layers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False)
    layer_type = Column(String, nullable=False)
    geometry = Column(Geometry(geometry_type="GEOMETRY", srid=4326), nullable=False)
    properties = Column(JSONB, nullable=False, default={})
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    run = relationship("Run", back_populates="map_layers")


class ConnectorSnapshot(Base):
    __tablename__ = "connector_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_name = Column(String, nullable=False, index=True)
    payload = Column(JSONB, nullable=False)
    validity_window = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class ConnectorStatus(Base):
    __tablename__ = "connector_status"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_name = Column(String, unique=True, nullable=False, index=True)
    is_online = Column(Boolean, default=False, nullable=False)
    last_checked = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    error_state = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class SavedTripSubscription(Base):
    __tablename__ = "saved_trip_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_id = Column(String, unique=True, index=True, nullable=False, default=lambda: str(uuid.uuid4()))
    origin_harbor = Column(String, nullable=False, index=True)
    craft_profile = Column(String, nullable=False)
    vessel_size = Column(String, default="medium", nullable=True)
    data_mode = Column(String, default="LIVE", nullable=True)
    mission_context_json = Column(JSONB, nullable=True)
    departure_time = Column(DateTime(timezone=True), nullable=True)
    return_time = Column(DateTime(timezone=True), nullable=True)
    language = Column(String, default="en", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class ActionableAlert(Base):
    __tablename__ = "actionable_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("saved_trip_subscriptions.id", ondelete="CASCADE"), nullable=False, index=True)
    assessment_id = Column(String, nullable=True)
    alert_type = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=False)
    recommended_action = Column(String, nullable=False)
    geometry_geojson = Column(JSONB, nullable=True)
    valid_from = Column(DateTime(timezone=True), nullable=True)
    valid_to = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="ACTIVE", nullable=False, index=True)
    is_acknowledged = Column(Boolean, default=False, nullable=False)
    identity_hash = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class TripAssessmentRecord(Base):
    __tablename__ = "trip_assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assessed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    origin_harbor = Column(String, nullable=True, index=True)
    craft_profile = Column(String, nullable=False)
    decision = Column(String, nullable=False, index=True)
    evidence_json = Column(JSONB, nullable=False, default={})
    is_durable = Column(Boolean, default=True, nullable=False)


# =============================================================================
# SYNTHETIC DEMO DATASET MODELS (ORCA_DEMO_V1)
# =============================================================================
from sqlalchemy import Float, JSON


class DemoStakeholder(Base):
    __tablename__ = "demo_stakeholders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, nullable=False, index=True)
    display_name = Column(String, nullable=False)
    metadata_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoHarbor(Base):
    __tablename__ = "demo_harbors"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    state = Column(String, nullable=False)
    metadata_json = Column(JSON, nullable=False, default=dict)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoFisher(Base):
    __tablename__ = "demo_fishers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    preferred_language = Column(String, default="en", nullable=False)
    home_harbor_id = Column(String, ForeignKey("demo_harbors.public_id", ondelete="CASCADE"), nullable=False)
    craft_profile = Column(String, default="motorized_boat", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    metadata_json = Column(JSON, nullable=False, default=dict)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoVessel(Base):
    __tablename__ = "demo_vessels"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    owner_fisher_id = Column(String, ForeignKey("demo_fishers.public_id", ondelete="CASCADE"), nullable=True)
    vessel_type = Column(String, nullable=False)
    length_m = Column(Float, nullable=True)
    capacity_tons = Column(Float, nullable=True)
    home_harbor_id = Column(String, ForeignKey("demo_harbors.public_id", ondelete="CASCADE"), nullable=False)
    status = Column(String, default="OPERATIONAL", nullable=False)
    metadata_json = Column(JSON, nullable=False, default=dict)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoTrip(Base):
    __tablename__ = "demo_trips"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    fisher_id = Column(String, ForeignKey("demo_fishers.public_id", ondelete="CASCADE"), nullable=False)
    vessel_id = Column(String, ForeignKey("demo_vessels.public_id", ondelete="CASCADE"), nullable=False)
    origin_harbor_id = Column(String, ForeignKey("demo_harbors.public_id", ondelete="CASCADE"), nullable=False)
    destination_name = Column(String, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="PLANNED", nullable=False)
    metadata_json = Column(JSON, nullable=False, default=dict)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoMarineObservation(Base):
    __tablename__ = "demo_marine_observations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    harbor_id = Column(String, ForeignKey("demo_harbors.public_id", ondelete="CASCADE"), nullable=False)
    observation_time = Column(DateTime(timezone=True), nullable=False, index=True)
    wind_speed_knots = Column(Float, nullable=True)
    wind_direction_deg = Column(Float, nullable=True)
    wind_gust_knots = Column(Float, nullable=True)
    wave_height_m = Column(Float, nullable=True)
    wave_period_sec = Column(Float, nullable=True)
    current_speed_knots = Column(Float, nullable=True)
    current_direction_deg = Column(Float, nullable=True)
    tide_level_m = Column(Float, nullable=True)
    tide_phase = Column(String, nullable=True)
    sea_surface_temp_c = Column(Float, nullable=True)
    units_json = Column(JSON, nullable=False, default=dict)
    tide_datum = Column(String, default="LAT", nullable=False)
    source_name = Column(String, default="synthetic-demo", nullable=False)
    source_type = Column(String, default="SYNTHETIC_HOURLY", nullable=False)
    coverage_metadata = Column(JSON, nullable=False, default=dict)
    qc_status = Column(String, default="VALID", nullable=False)
    is_stale = Column(Boolean, default=False, nullable=False)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoEOGridCell(Base):
    __tablename__ = "demo_eo_grid_cells"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    cell_id = Column(String, index=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    observation_time = Column(DateTime(timezone=True), nullable=False, index=True)
    sst_c = Column(Float, nullable=True)
    chlorophyll_mg_m3 = Column(Float, nullable=True)
    uncertainty = Column(Float, nullable=True)
    qc_status = Column(String, default="VALID", nullable=False)
    cloud_fraction = Column(Float, default=0.0, nullable=False)
    source_name = Column(String, default="synthetic-demo", nullable=False)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoPFZCandidate(Base):
    __tablename__ = "demo_pfz_candidates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    detected_at = Column(DateTime(timezone=True), nullable=False)
    valid_to = Column(DateTime(timezone=True), nullable=False)
    confidence = Column(String, default="HIGH", nullable=False)
    sst_gradient = Column(Float, nullable=True)
    chlorophyll_value = Column(Float, nullable=True)
    depth_m = Column(Float, nullable=True)
    bearing_deg = Column(Float, nullable=True)
    distance_km = Column(Float, nullable=True)
    qc_status = Column(String, default="VALID", nullable=False)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoGeofence(Base):
    __tablename__ = "demo_geofences"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    polygon_type = Column(String, nullable=False)
    restriction_level = Column(String, default="NO_GO", nullable=False)
    is_hard_restriction = Column(Boolean, default=True, nullable=False)
    geometry_geojson = Column(JSON, nullable=False)
    properties_json = Column(JSON, nullable=False, default=dict)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoRouteNode(Base):
    __tablename__ = "demo_route_nodes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    node_name = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    depth_m = Column(Float, nullable=True)
    is_sheltered = Column(Boolean, default=False, nullable=False)
    properties_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoRouteEdge(Base):
    __tablename__ = "demo_route_edges"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    from_node_id = Column(String, ForeignKey("demo_route_nodes.public_id", ondelete="CASCADE"), nullable=False)
    to_node_id = Column(String, ForeignKey("demo_route_nodes.public_id", ondelete="CASCADE"), nullable=False)
    distance_nm = Column(Float, nullable=False)
    route_name = Column(String, nullable=False)
    hazard_exposure_score = Column(Float, default=0.0, nullable=False)
    properties_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoHazardEvent(Base):
    __tablename__ = "demo_hazard_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    event_type = Column(String, nullable=False)
    severity = Column(String, default="WARNING", nullable=False)
    headline = Column(String, nullable=False)
    geometry_geojson = Column(JSON, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    status = Column(String, default="ACTIVE", nullable=False)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoNotification(Base):
    __tablename__ = "demo_notifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    recipient_role = Column(String, nullable=False, index=True)
    fisher_id = Column(String, ForeignKey("demo_fishers.public_id", ondelete="CASCADE"), nullable=True)
    vessel_id = Column(String, ForeignKey("demo_vessels.public_id", ondelete="CASCADE"), nullable=True)
    trip_id = Column(String, ForeignKey("demo_trips.public_id", ondelete="CASCADE"), nullable=True)
    hazard_id = Column(String, ForeignKey("demo_hazard_events.public_id", ondelete="CASCADE"), nullable=True)
    geofence_id = Column(String, ForeignKey("demo_geofences.public_id", ondelete="CASCADE"), nullable=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    severity = Column(String, default="INFO", nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    is_acknowledged = Column(Boolean, default=False, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class DemoVesselReplayPosition(Base):
    __tablename__ = "demo_vessel_replay_positions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    public_id = Column(String, unique=True, index=True, nullable=False)
    vessel_id = Column(String, ForeignKey("demo_vessels.public_id", ondelete="CASCADE"), nullable=False, index=True)
    trip_id = Column(String, ForeignKey("demo_trips.public_id", ondelete="CASCADE"), nullable=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed_knots = Column(Float, nullable=True)
    heading_deg = Column(Float, nullable=True)
    provenance_json = Column(JSON, nullable=False, default=dict)
    namespace = Column(String, default="ORCA_DEMO_V1", index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

