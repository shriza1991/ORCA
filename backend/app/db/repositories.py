"""Data repositories.

Owned by Dev 2 (Backend Platform).
Encapsulates SQLAlchemy queries and transaction lifecycle.
"""

import sys
import uuid
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.app.db.models import (
    ConnectorSnapshot,
    ConnectorStatus,
    ConversationThread,
    DemoEOGridCell,
    DemoFisher,
    DemoGeofence,
    DemoHarbor,
    DemoHazardEvent,
    DemoMarineObservation,
    DemoNotification,
    DemoPFZCandidate,
    DemoRouteEdge,
    DemoRouteNode,
    DemoStakeholder,
    DemoTrip,
    DemoVessel,
    DemoVesselReplayPosition,
    EvidenceItem,
    MapLayer,
    Run,
    RunStatus,
)


class BaseRepository:
    def __init__(self, session: Session):
        self.session = session


class ConversationRepository(BaseRepository):
    def get_by_thread_id(self, thread_id: str) -> ConversationThread | None:
        return self.session.query(ConversationThread).filter_by(thread_id=thread_id).first()

    def create(self, thread_id: str, context_json: dict[str, Any], schema_version: int = 1) -> ConversationThread:
        thread = ConversationThread(
            thread_id=thread_id,
            context_json=context_json,
            schema_version=schema_version,
        )
        self.session.add(thread)
        try:
            self.session.commit()
            self.session.refresh(thread)
            return thread
        except SQLAlchemyError:
            self.session.rollback()
            raise

    def update(self, thread_id: str, context_json: dict[str, Any]) -> ConversationThread | None:
        thread = self.get_by_thread_id(thread_id)
        if thread:
            thread.context_json = context_json
            try:
                self.session.commit()
                self.session.refresh(thread)
            except SQLAlchemyError:
                self.session.rollback()
                raise
        return thread

    def delete(self, thread_id: str) -> bool:
        thread = self.get_by_thread_id(thread_id)
        if thread:
            try:
                self.session.delete(thread)
                self.session.commit()
                return True
            except SQLAlchemyError:
                self.session.rollback()
                raise
        return False


# Backward-compatible submodule alias for tests
sys.modules["backend.app.db.repositories.run"] = sys.modules[__name__]


class RunRepository(BaseRepository):
    def get_by_id(self, run_id: uuid.UUID) -> Run | None:
        return self.session.query(Run).filter_by(id=run_id).first()

    def create(self, thread_id: str, metadata_json: dict[str, Any] = None, run_id: uuid.UUID | None = None) -> Run:
        # Ensure conversation thread exists for FK constraint
        conv_repo = ConversationRepository(self.session)
        if not conv_repo.get_by_thread_id(thread_id):
            from backend.app.agents.memory import ThreadContext
            initial_context = ThreadContext(thread_id=thread_id).model_dump(mode="json")
            conv_repo.create(thread_id=thread_id, context_json=initial_context)

        run = Run(
            thread_id=thread_id,
            metadata_json=metadata_json or {},
            run_status=RunStatus.PENDING,
        )
        if run_id:
            run.id = run_id
            
        self.session.add(run)
        try:
            self.session.commit()
            self.session.refresh(run)
            return run
        except SQLAlchemyError:
            self.session.rollback()
            raise

    def get_all_by_thread(self, thread_id: str) -> list[Run]:
        return self.session.query(Run).filter_by(thread_id=thread_id).all()

    def update_status(self, run_id: uuid.UUID, status: RunStatus, error_message: str = None) -> Run | None:
        run = self.get_by_id(run_id)
        if run:
            run.run_status = status
            if error_message:
                run.error_message = error_message
            try:
                self.session.commit()
                self.session.refresh(run)
            except SQLAlchemyError:
                self.session.rollback()
                raise
        return run

    def get_run_with_details(self, run_id: uuid.UUID) -> dict[str, Any] | None:
        """Reconstruct full structured run record including evidence and map layers."""
        run = self.get_by_id(run_id)
        if not run:
            return None

        evidence_items = self.session.query(EvidenceItem).filter_by(run_id=run_id).all()
        map_layers = self.session.query(MapLayer).filter_by(run_id=run_id).all()

        metadata = run.metadata_json or {}
        return {
            "id": str(run.id),
            "thread_id": run.thread_id,
            "status": run.run_status.value,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "error_message": run.error_message,
            "request_id": metadata.get("request_id"),
            "data_mode": metadata.get("data_mode"),
            "request": metadata.get("request"),
            "response": metadata.get("response"),
            "trace": metadata.get("trace", []),
            "evidence_count": len(evidence_items),
            "evidence": [
                {
                    "id": str(ev.id),
                    "source": ev.source,
                    "raw_data": ev.raw_data,
                    "extracted_entities": ev.extracted_entities,
                    "created_at": ev.created_at.isoformat() if ev.created_at else None,
                }
                for ev in evidence_items
            ],
            "map_layer_count": len(map_layers),
            "map_layers": [
                {
                    "id": str(ml.id),
                    "layer_type": ml.layer_type,
                    "properties": ml.properties,
                    "created_at": ml.created_at.isoformat() if ml.created_at else None,
                }
                for ml in map_layers
            ],
        }


class EvidenceRepository(BaseRepository):
    def create(self, run_id: uuid.UUID, source: str, raw_data: dict, extracted_entities: dict) -> EvidenceItem:
        item = EvidenceItem(
            run_id=run_id,
            source=source,
            raw_data=raw_data,
            extracted_entities=extracted_entities,
        )
        self.session.add(item)
        try:
            self.session.commit()
            self.session.refresh(item)
            return item
        except SQLAlchemyError:
            self.session.rollback()
            raise

    def get_by_run_id(self, run_id: uuid.UUID) -> list[EvidenceItem]:
        return self.session.query(EvidenceItem).filter_by(run_id=run_id).all()


class MapLayerRepository(BaseRepository):
    def create_from_geojson(self, run_id: uuid.UUID, layer_type: str, geojson_geom: dict, properties: dict) -> MapLayer:
        from geoalchemy2.shape import from_shape
        from shapely.geometry import shape

        geom = shape(geojson_geom)
        wkb_geom = from_shape(geom, srid=4326)

        layer = MapLayer(
            run_id=run_id,
            layer_type=layer_type,
            geometry=wkb_geom,
            properties=properties,
        )
        self.session.add(layer)
        try:
            self.session.commit()
            self.session.refresh(layer)
            return layer
        except SQLAlchemyError:
            self.session.rollback()
            raise

    def get_by_run_id(self, run_id: uuid.UUID) -> list[MapLayer]:
        return self.session.query(MapLayer).filter_by(run_id=run_id).all()


class ConnectorSnapshotRepository(BaseRepository):
    def get_by_source(self, source_name: str) -> ConnectorSnapshot | None:
        return self.session.query(ConnectorSnapshot).filter_by(source_name=source_name).first()

    def create(self, source_name: str, payload: dict, validity_window: str = None) -> ConnectorSnapshot:
        snap = ConnectorSnapshot(
            source_name=source_name,
            payload=payload,
            validity_window=validity_window,
        )
        self.session.add(snap)
        try:
            self.session.commit()
            self.session.refresh(snap)
            return snap
        except SQLAlchemyError:
            self.session.rollback()
            raise


class ConnectorStatusRepository(BaseRepository):
    def upsert_status(self, source_name: str, is_online: bool, error_state: str = None) -> ConnectorStatus:
        status = self.session.query(ConnectorStatus).filter_by(source_name=source_name).first()
        if not status:
            status = ConnectorStatus(source_name=source_name)
            self.session.add(status)
        
        status.is_online = is_online
        status.error_state = error_state
        
        try:
            self.session.commit()
            self.session.refresh(status)
            return status
        except SQLAlchemyError:
            self.session.rollback()
            raise


class SyntheticDemoRepository(BaseRepository):
    """Repository for managing the SAMUDRA synthetic demo dataset."""

    def delete_by_namespace(self, namespace: str) -> dict[str, int]:
        """Delete all synthetic demo entities under a given namespace."""
        counts = {}
        # Order deletion to respect foreign keys (children before parents)
        deletion_order = [
            (DemoVesselReplayPosition, "vessel_replay_positions"),
            (DemoNotification, "notifications"),
            (DemoHazardEvent, "hazards"),
            (DemoRouteEdge, "route_edges"),
            (DemoRouteNode, "route_nodes"),
            (DemoGeofence, "geofences"),
            (DemoPFZCandidate, "pfz_candidates"),
            (DemoEOGridCell, "eo_grid_cells"),
            (DemoMarineObservation, "marine_observations"),
            (DemoTrip, "trips"),
            (DemoVessel, "vessels"),
            (DemoFisher, "fishers"),
            (DemoHarbor, "harbors"),
            (DemoStakeholder, "stakeholders"),
        ]

        try:
            for model_cls, key in deletion_order:
                deleted = self.session.query(model_cls).filter_by(namespace=namespace).delete(synchronize_session=False)
                counts[key] = deleted
            self.session.commit()
            return counts
        except SQLAlchemyError:
            self.session.rollback()
            raise

    def upsert_entities(self, model_cls: type, records: list[dict[str, Any]], match_key: str = "public_id") -> int:
        """Upsert a list of entity dictionaries into the database."""
        if not records:
            return 0
        try:
            for rec in records:
                match_val = rec.get(match_key)
                existing = None
                if match_val is not None:
                    existing = self.session.query(model_cls).filter(getattr(model_cls, match_key) == match_val).first()
                if existing:
                    for k, v in rec.items():
                        if hasattr(existing, k):
                            setattr(existing, k, v)
                else:
                    instance = model_cls(**{k: v for k, v in rec.items() if hasattr(model_cls, k)})
                    self.session.add(instance)
            self.session.commit()
            return len(records)
        except SQLAlchemyError:
            self.session.rollback()
            raise

    def get_counts_by_namespace(self, namespace: str) -> dict[str, int]:
        """Return counts of all synthetic demo entities in the given namespace."""
        models_map = {
            "stakeholders": DemoStakeholder,
            "harbors": DemoHarbor,
            "fishers": DemoFisher,
            "vessels": DemoVessel,
            "trips": DemoTrip,
            "marine_observations": DemoMarineObservation,
            "eo_grid_cells": DemoEOGridCell,
            "pfz_candidates": DemoPFZCandidate,
            "geofences": DemoGeofence,
            "route_nodes": DemoRouteNode,
            "route_edges": DemoRouteEdge,
            "hazards": DemoHazardEvent,
            "notifications": DemoNotification,
            "vessel_replay_positions": DemoVesselReplayPosition,
        }
        return {
            key: self.session.query(model_cls).filter_by(namespace=namespace).count()
            for key, model_cls in models_map.items()
        }

    def get_stakeholders(self, namespace: str = "SAMUDRA_DEMO_V1") -> list[DemoStakeholder]:
        return self.session.query(DemoStakeholder).filter_by(namespace=namespace).all()

    def get_harbors(self, namespace: str = "SAMUDRA_DEMO_V1") -> list[DemoHarbor]:
        return self.session.query(DemoHarbor).filter_by(namespace=namespace).all()

    def get_fishers(self, namespace: str = "SAMUDRA_DEMO_V1") -> list[DemoFisher]:
        return self.session.query(DemoFisher).filter_by(namespace=namespace).all()

    def get_vessels(
        self, namespace: str = "SAMUDRA_DEMO_V1", harbor_id: str | None = None
    ) -> list[DemoVessel]:
        q = self.session.query(DemoVessel).filter_by(namespace=namespace)
        if harbor_id:
            q = q.filter_by(home_harbor_id=harbor_id)
        return q.all()

    def get_trips(self, namespace: str = "SAMUDRA_DEMO_V1") -> list[DemoTrip]:
        return self.session.query(DemoTrip).filter_by(namespace=namespace).all()

    def get_marine_observations(
        self, namespace: str = "SAMUDRA_DEMO_V1", harbor_id: str | None = None
    ) -> list[DemoMarineObservation]:
        q = self.session.query(DemoMarineObservation).filter_by(namespace=namespace)
        if harbor_id:
            q = q.filter_by(harbor_id=harbor_id)
        return q.order_by(DemoMarineObservation.observation_time.asc()).all()

    def get_eo_grid_cells(
        self, namespace: str = "SAMUDRA_DEMO_V1", cell_id: str | None = None
    ) -> list[DemoEOGridCell]:
        q = self.session.query(DemoEOGridCell).filter_by(namespace=namespace)
        if cell_id:
            q = q.filter_by(cell_id=cell_id)
        return q.order_by(DemoEOGridCell.observation_time.asc()).all()

    def get_pfz_candidates(
        self, namespace: str = "SAMUDRA_DEMO_V1", valid_only: bool = False, as_of: Any = None
    ) -> list[DemoPFZCandidate]:
        q = self.session.query(DemoPFZCandidate).filter_by(namespace=namespace)
        if valid_only:
            q = q.filter(DemoPFZCandidate.qc_status == "VALID")
            if as_of:
                q = q.filter(DemoPFZCandidate.valid_to >= as_of)
        return q.all()

    def get_geofences(self, namespace: str = "SAMUDRA_DEMO_V1") -> list[DemoGeofence]:
        return self.session.query(DemoGeofence).filter_by(namespace=namespace).all()

    def get_route_nodes(self, namespace: str = "SAMUDRA_DEMO_V1") -> list[DemoRouteNode]:
        return self.session.query(DemoRouteNode).filter_by(namespace=namespace).all()

    def get_route_edges(self, namespace: str = "SAMUDRA_DEMO_V1") -> list[DemoRouteEdge]:
        return self.session.query(DemoRouteEdge).filter_by(namespace=namespace).all()

    def get_hazards(
        self, namespace: str = "SAMUDRA_DEMO_V1", status: str | None = None
    ) -> list[DemoHazardEvent]:
        q = self.session.query(DemoHazardEvent).filter_by(namespace=namespace)
        if status:
            q = q.filter_by(status=status)
        return q.all()

    def get_notifications(
        self,
        namespace: str = "SAMUDRA_DEMO_V1",
        role: str | None = None,
        is_read: bool | None = None,
        vessel_ids: list[str] | None = None,
    ) -> list[DemoNotification]:
        q = self.session.query(DemoNotification).filter_by(namespace=namespace)
        if role:
            q = q.filter_by(recipient_role=role)
        if is_read is not None:
            q = q.filter_by(is_read=is_read)
        if vessel_ids is not None:
            q = q.filter(DemoNotification.vessel_id.in_(vessel_ids))
        return q.order_by(DemoNotification.timestamp.desc()).all()

    def get_vessel_replay(
        self, namespace: str = "SAMUDRA_DEMO_V1", vessel_id: str | None = None
    ) -> list[DemoVesselReplayPosition]:
        q = self.session.query(DemoVesselReplayPosition).filter_by(namespace=namespace)
        if vessel_id:
            q = q.filter_by(vessel_id=vessel_id)
        return q.order_by(DemoVesselReplayPosition.timestamp.asc()).all()

