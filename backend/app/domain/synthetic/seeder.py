"""Synthetic Demo Seeding Orchestrator for ORCA.

Handles dataset generation, source normalization, validation, idempotency,
namespace reset, and database persistence.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from sqlalchemy.orm import Session

from backend.app.db.models import (
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
)
from backend.app.db.repositories import SyntheticDemoRepository
from backend.app.domain.synthetic.generator import (
    DATASET_VERSION,
    REFERENCE_TIME,
    SYNTHETIC_NAMESPACE,
    generate_synthetic_demo_dataset,
)
from backend.app.domain.synthetic.validator import validate_synthetic_dataset

logger = logging.getLogger(__name__)


def seed_synthetic_demo(
    session: Session,
    reset_first: bool = False,
    dry_run: bool = False,
    namespace: str = SYNTHETIC_NAMESPACE,
) -> Dict[str, Any]:
    """Orchestrates deterministic seeding of the ORCA demo dataset.

    Args:
        session: Active SQLAlchemy session
        reset_first: If True, deletes all existing entities in target namespace before seeding
        dry_run: If True, validates and calculates counts without saving to DB
        namespace: Target isolation namespace (default: ORCA_DEMO_V1)

    Returns:
        Structured execution summary with exact counts and validation status.
    """
    repo = SyntheticDemoRepository(session)

    # 1. Reset namespace if requested
    deleted_count = 0
    if reset_first and not dry_run:
        logger.info("Resetting namespace '%s'...", namespace)
        deleted_count = repo.delete_by_namespace(namespace)
        logger.info("Removed %d entities from namespace '%s'.", deleted_count, namespace)

    # 2. Generate deterministic dataset
    dataset = generate_synthetic_demo_dataset()

    # Override namespace if custom namespace specified
    if namespace != SYNTHETIC_NAMESPACE:
        ns_pfx = f"{namespace.lower()}-"
        for entity_key, entity_list in dataset.items():
            for record in entity_list:
                record["namespace"] = namespace
                record["public_id"] = f"{ns_pfx}{record['public_id']}"
                if "provenance_json" in record and isinstance(record["provenance_json"], dict):
                    record["provenance_json"]["namespace"] = namespace
                for fk_field in [
                    "harbor_id",
                    "home_harbor_id",
                    "owner_fisher_id",
                    "fisher_id",
                    "vessel_id",
                    "trip_id",
                    "hazard_id",
                    "geofence_id",
                    "from_node_id",
                    "to_node_id",
                    "origin_harbor_id",
                ]:
                    if record.get(fk_field):
                        record[fk_field] = f"{ns_pfx}{record[fk_field]}"

    # 3. Geospatial & Relational Validation
    val_report = validate_synthetic_dataset(dataset)
    logger.info("Synthetic dataset validated: %s", val_report)

    if dry_run:
        return {
            "status": "DRY_RUN_SUCCESS",
            "mode": "SYNTHETIC",
            "dataset_version": DATASET_VERSION,
            "namespace": namespace,
            "reference_time": REFERENCE_TIME.isoformat(),
            "simulated_counts": {k: len(v) for k, v in dataset.items()},
            "validation": val_report,
            "records_deleted": deleted_count,
        }

    # 4. Insert / Upsert in topological dependency order
    entity_model_map = [
        ("stakeholders", DemoStakeholder),
        ("harbors", DemoHarbor),
        ("fishers", DemoFisher),
        ("vessels", DemoVessel),
        ("trips", DemoTrip),
        ("marine_observations", DemoMarineObservation),
        ("eo_grid_cells", DemoEOGridCell),
        ("pfz_candidates", DemoPFZCandidate),
        ("geofences", DemoGeofence),
        ("route_nodes", DemoRouteNode),
        ("route_edges", DemoRouteEdge),
        ("hazards", DemoHazardEvent),
        ("notifications", DemoNotification),
        ("replay_positions", DemoVesselReplayPosition),
    ]

    for entity_key, model_cls in entity_model_map:
        records = dataset[entity_key]
        repo.upsert_entities(model_cls, records, match_key="public_id")

    # 5. Fetch actual DB counts for verification
    db_counts = repo.get_counts_by_namespace(namespace)

    return {
        "status": "SUCCESS",
        "mode": "SYNTHETIC",
        "dataset_version": DATASET_VERSION,
        "namespace": namespace,
        "reference_time": REFERENCE_TIME.isoformat(),
        "seeded_counts": db_counts,
        "validation": val_report,
        "records_deleted": deleted_count,
    }


def reset_synthetic_demo(session: Session, namespace: str = SYNTHETIC_NAMESPACE) -> int:
    """Convenience helper to reset the synthetic demo namespace."""
    repo = SyntheticDemoRepository(session)
    return repo.delete_by_namespace(namespace)
