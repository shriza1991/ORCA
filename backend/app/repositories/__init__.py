"""PFZ Snapshot Repository for ORCA.

Owned by Dev 2 (Backend Platform).

Provides an in-memory store for INCOIS PFZ snapshot data.
In future milestones, this will be backed by PostGIS spatial storage.

The repository:
- Stores PFZSourceDataPayload snapshots keyed by bulletin_date
- Retrieves the most recent snapshot within a freshness window
- Provides harbour-based filtering helpers for Dev 4's PFZ ranking engine
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from backend.app.agents.integrations.dev2 import PFZSourceDataPayload

logger = logging.getLogger(__name__)


class PFZRepository:
    """In-memory repository for INCOIS PFZ advisory snapshots.

    Thread-safety: not required for the SIH hackathon prototype scope
    (single-process, single-threaded FastAPI with asyncio).

    Key: bulletin_date ISO string → PFZSourceDataPayload
    """

    def __init__(self) -> None:
        self._store: Dict[str, PFZSourceDataPayload] = {}

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    def save(self, payload: PFZSourceDataPayload) -> None:
        """Upsert a PFZ advisory snapshot keyed by bulletin date."""
        key = payload.bulletin_date
        self._store[key] = payload
        logger.debug("PFZRepository: saved snapshot for bulletin_date=%s", key)

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    def get_latest(self, max_age_hours: float = 24.0) -> Optional[PFZSourceDataPayload]:
        """Return the most recent PFZ snapshot within the freshness window.

        Returns None if no snapshot exists or all snapshots are stale.
        """
        if not self._store:
            return None

        now_utc = datetime.now(timezone.utc)
        freshest: Optional[Tuple[datetime, PFZSourceDataPayload]] = None

        for key, payload in self._store.items():
            try:
                dt = datetime.fromisoformat(key)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue

            age_hours = (now_utc - dt).total_seconds() / 3600.0
            if age_hours > max_age_hours:
                continue

            if freshest is None or dt > freshest[0]:
                freshest = (dt, payload)

        return freshest[1] if freshest else None

    def get_all_features(self, max_age_hours: float = 24.0) -> List[Dict]:
        """Return all PFZ features from the latest fresh snapshot."""
        latest = self.get_latest(max_age_hours=max_age_hours)
        if latest is None:
            return []
        return list(latest.features)

    def count(self) -> int:
        """Return the total number of stored snapshots."""
        return len(self._store)

    def clear(self) -> None:
        """Remove all stored snapshots (used in testing)."""
        self._store.clear()


# ---------------------------------------------------------------------------
# Module-level singleton (one per process; injected in tests)
# ---------------------------------------------------------------------------
pfz_repository = PFZRepository()
