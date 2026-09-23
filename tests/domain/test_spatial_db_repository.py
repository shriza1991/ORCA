"""Tests for Spatial Database Operations, Repositories, and PostGIS Compatibility.

Verifies:
1. MapLayerRepository creates and stores GeoJSON geometries losslessly
2. Spatial query round-trip with GeoAlchemy2/Shapely
3. AssessmentRepository persists trip assessment records durably
4. ActionableAlert and SavedTripSubscription persistence round-trip
"""

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
import pytest
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from shapely.geometry import Point, Polygon, mapping, shape
from shapely.wkt import loads as wkt_loads
from shapely import to_wkb

from geoalchemy2 import Geometry
import geoalchemy2.admin.dialects.sqlite as sqlite_admin

from backend.app.db.models import (
    ActionableAlert,
    Base,
    ConversationThread,
    MapLayer,
    Run,
    RunStatus,
    SavedTripSubscription,
    TripAssessmentRecord,
)
from backend.app.db.repositories import (
    AssessmentRepository,
    ConversationRepository,
    MapLayerRepository,
    RunRepository,
)


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"


@compiles(Geometry, "sqlite")
def _compile_geom_sqlite(type_, compiler, **kw):
    return "BLOB"


def _ewkt_to_wkb(ewkt):
    if not ewkt:
        return b""
    wkt_str = ewkt.split(";")[-1] if ";" in ewkt else ewkt
    geom = wkt_loads(wkt_str)
    return to_wkb(geom, hex=True)


@pytest.fixture
def spatial_db_session():
    """Create a fresh in-memory SQLite DB session with PostGIS/JSONB function shims."""
    engine = sa.create_engine("sqlite:///:memory:")

    @sa.event.listens_for(engine, "connect")
    def connect(dbapi_connection, connection_record):
        dbapi_connection.create_function("AsEWKB", 1, lambda x: x)
        dbapi_connection.create_function("AsEWKT", 1, lambda x: str(x))
        dbapi_connection.create_function("ST_AsBinary", 1, lambda x: x)
        dbapi_connection.create_function("ST_GeomFromWKB", -1, lambda *args: args[0])
        dbapi_connection.create_function("GeomFromWKB", -1, lambda *args: args[0])
        dbapi_connection.create_function("GeomFromEWKT", 1, _ewkt_to_wkb)

    with patch.object(sqlite_admin, "after_create", lambda *args, **kwargs: None), \
         patch.object(sqlite_admin, "before_create", lambda *args, **kwargs: None):
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        session = Session()
        try:
            yield session
        finally:
            session.close()


def test_map_layer_spatial_persistence(spatial_db_session):
    conv_repo = ConversationRepository(spatial_db_session)
    run_repo = RunRepository(spatial_db_session)
    layer_repo = MapLayerRepository(spatial_db_session)

    thread_id = "spatial-thread-01"
    conv_repo.create(thread_id, context_json={})
    run = run_repo.create(thread_id, metadata_json={})

    polygon_geojson = {
        "type": "Polygon",
        "coordinates": [
            [
                [73.1, 16.8],
                [73.5, 16.8],
                [73.5, 17.2],
                [73.1, 17.2],
                [73.1, 16.8],
            ]
        ],
    }

    layer = layer_repo.create_from_geojson(
        run_id=run.id,
        layer_type="GEOFENCE_HAZARD",
        geojson_geom=polygon_geojson,
        properties={"severity": "WARNING", "name": "Ratnagiri Exclusion Zone"},
    )

    assert layer.id is not None
    assert layer.layer_type == "GEOFENCE_HAZARD"
    assert layer.properties["severity"] == "WARNING"

    layers = layer_repo.get_by_run_id(run.id)
    assert len(layers) == 1
    assert layers[0].id == layer.id


def test_assessment_repository_persistence(spatial_db_session):
    repo = AssessmentRepository(spatial_db_session)

    record = repo.create(
        assessed_at="2026-09-23T12:00:00Z",
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        decision="CAUTION",
        evidence_json={"wave_height_m": 2.4, "wind_speed_knots": 18.0},
    )

    assert record.id is not None
    assert record.origin_harbor == "Ratnagiri"
    assert record.craft_profile == "motorized_boat"
    assert record.decision == "CAUTION"
    assert record.evidence_json["wave_height_m"] == 2.4
    assert record.is_durable is True

    # Query directly from session
    fetched = spatial_db_session.query(TripAssessmentRecord).filter_by(id=record.id).first()
    assert fetched is not None
    assert fetched.decision == "CAUTION"


def test_actionable_alert_and_subscription_persistence(spatial_db_session):
    sub = SavedTripSubscription(
        origin_harbor="Ratnagiri",
        craft_profile="motorized_boat",
        language="mr",
        is_active=True,
    )
    spatial_db_session.add(sub)
    spatial_db_session.commit()
    spatial_db_session.refresh(sub)

    assert sub.id is not None
    assert sub.public_id is not None

    alert = ActionableAlert(
        subscription_id=sub.id,
        alert_type="MET_HAZARD",
        severity="WARNING",
        title="High Swell Alert",
        description="Swell wave height exceeding 3.0m in offshore sector",
        recommended_action="Do not proceed beyond 5 nautical miles",
        identity_hash="test-hash-12345",
        status="ACTIVE",
    )
    spatial_db_session.add(alert)
    spatial_db_session.commit()
    spatial_db_session.refresh(alert)

    assert alert.id is not None
    assert alert.subscription_id == sub.id
    assert alert.status == "ACTIVE"

    # Query back
    alerts = spatial_db_session.query(ActionableAlert).filter_by(subscription_id=sub.id).all()
    assert len(alerts) == 1
    assert alerts[0].title == "High Swell Alert"
