"""Offline In-Memory Persistence Store for ORCA.

Owned by Dev 2 (Backend Platform).
Provides ephemeral, thread-safe in-memory caching and fallback for runs,
conversations, evidence items, and map layers when PostgreSQL/PostGIS is
unavailable or experiencing transient connectivity failures.

CRITICAL INVARIANTS:
1. Ephemeral: In-memory state is transient and valid for the current process lifetime.
2. Honest Provenance: Records served from this store are explicitly flagged with
   persistence_status="offline_in_memory" and persisted=False.
3. No Fabrication: Never fabricates durable database persistence.
"""

from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class OfflinePersistenceStore:
    """Thread-safe in-memory store for runs, conversations, evidence, and map layers."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._threads: Dict[str, List[str]] = {}  # thread_id -> list of run_ids
        self._evidence: Dict[str, List[Dict[str, Any]]] = {}  # run_id -> list of evidence dicts
        self._map_layers: Dict[str, Dict[str, Any]] = {}  # layer_id -> map layer dict
        self._run_layers: Dict[str, List[str]] = {}  # run_id -> list of layer_ids

    def clear(self) -> None:
        """Clear all in-memory records (useful for test isolation)."""
        with self._lock:
            self._runs.clear()
            self._threads.clear()
            self._evidence.clear()
            self._map_layers.clear()
            self._run_layers.clear()

    def create_run(
        self,
        run_id: str | uuid.UUID,
        thread_id: str,
        metadata_json: Optional[Dict[str, Any]] = None,
        status: str = "RUNNING",
    ) -> Dict[str, Any]:
        """Record the initiation of a run in memory."""
        r_id = str(run_id)
        now = utcnow_iso()
        record = {
            "id": r_id,
            "thread_id": thread_id,
            "status": status,
            "started_at": now,
            "completed_at": None,
            "error_message": None,
            "metadata_json": dict(metadata_json or {}),
            "persisted": False,
            "persistence_status": "offline_in_memory",
        }
        with self._lock:
            self._runs[r_id] = record
            if thread_id not in self._threads:
                self._threads[thread_id] = []
            if r_id not in self._threads[thread_id]:
                self._threads[thread_id].append(r_id)
        return record

    def update_run(
        self,
        run_id: str | uuid.UUID,
        status: Optional[str] = None,
        error_message: Optional[str] = None,
        metadata_json: Optional[Dict[str, Any]] = None,
        response: Optional[Dict[str, Any]] = None,
        trace: Optional[List[Dict[str, Any]]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update run completion, status, metadata, response, or trace in memory."""
        r_id = str(run_id)
        with self._lock:
            run = self._runs.get(r_id)
            if not run:
                return None
            if status:
                run["status"] = status
                if status in ("COMPLETED", "PARTIAL", "FAILED", "CANCELLED"):
                    run["completed_at"] = utcnow_iso()
            if error_message is not None:
                run["error_message"] = error_message
            if metadata_json:
                run["metadata_json"].update(metadata_json)
            if response:
                run["metadata_json"]["response"] = response
            if trace is not None:
                run["metadata_json"]["trace"] = trace
            return dict(run)

    def get_active_run_in_thread(self, thread_id: str) -> Optional[Dict[str, Any]]:
        """Find any currently RUNNING run in the thread (for duplicate protection)."""
        with self._lock:
            run_ids = self._threads.get(thread_id, [])
            for r_id in run_ids:
                run = self._runs.get(r_id)
                if run and run.get("status") == "RUNNING":
                    return dict(run)
            return None

    def save_evidence(
        self,
        run_id: str | uuid.UUID,
        source: str,
        raw_data: Dict[str, Any],
        extracted_entities: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Record an evidence item in memory."""
        r_id = str(run_id)
        ev_id = raw_data.get("evidence_id") or str(uuid.uuid4())
        item = {
            "id": ev_id,
            "run_id": r_id,
            "source": source,
            "raw_data": raw_data,
            "extracted_entities": extracted_entities or {},
            "created_at": utcnow_iso(),
            "persisted": False,
        }
        with self._lock:
            if r_id not in self._evidence:
                self._evidence[r_id] = []
            self._evidence[r_id].append(item)
        return item

    def save_map_layer(
        self,
        run_id: str | uuid.UUID,
        layer_type: str,
        geojson_geom: Dict[str, Any],
        properties: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Record a map layer in memory."""
        r_id = str(run_id)
        l_id = properties.get("layer_id") or str(uuid.uuid4())
        layer = {
            "id": l_id,
            "run_id": r_id,
            "layer_type": layer_type,
            "geometry": geojson_geom,
            "properties": properties,
            "created_at": utcnow_iso(),
            "persisted": False,
        }
        with self._lock:
            self._map_layers[l_id] = layer
            if r_id not in self._run_layers:
                self._run_layers[r_id] = []
            if l_id not in self._run_layers[r_id]:
                self._run_layers[r_id].append(l_id)
        return layer

    def get_run_with_details(self, run_id: str | uuid.UUID) -> Optional[Dict[str, Any]]:
        """Reconstruct full structured run record from in-memory offline state."""
        r_id = str(run_id)
        with self._lock:
            run = self._runs.get(r_id)
            if not run:
                return None

            ev_list = self._evidence.get(r_id, [])
            layer_ids = self._run_layers.get(r_id, [])
            map_list = [self._map_layers[lid] for lid in layer_ids if lid in self._map_layers]

            metadata = run.get("metadata_json", {})
            return {
                "id": r_id,
                "thread_id": run["thread_id"],
                "status": run["status"],
                "started_at": run["started_at"],
                "completed_at": run["completed_at"],
                "error_message": run["error_message"],
                "request_id": metadata.get("request_id"),
                "data_mode": metadata.get("data_mode"),
                "request": metadata.get("request"),
                "response": metadata.get("response"),
                "trace": metadata.get("trace", []),
                "evidence_count": len(ev_list),
                "evidence": ev_list,
                "map_layer_count": len(map_list),
                "map_layers": map_list,
                "persisted": False,
                "persistence_status": "offline_in_memory",
                "warnings": [
                    "[OFFLINE-EPHEMERAL] Ephemeral in-memory record. Not saved to persistent database."
                ],
            }

    def get_runs_by_thread(self, thread_id: str) -> List[Dict[str, Any]]:
        """Return all runs for a conversation thread in chronological order."""
        with self._lock:
            run_ids = self._threads.get(thread_id, [])
            results = []
            for r_id in run_ids:
                details = self.get_run_with_details(r_id)
                if details:
                    results.append(details)
            return results

    def get_map_layer(self, layer_id: str | uuid.UUID) -> Optional[Dict[str, Any]]:
        """Retrieve a specific map layer by ID."""
        l_id = str(layer_id)
        with self._lock:
            layer = self._map_layers.get(l_id)
            if not layer:
                return None
            return dict(layer)


# Global singleton instance
offline_persistence_store = OfflinePersistenceStore()
