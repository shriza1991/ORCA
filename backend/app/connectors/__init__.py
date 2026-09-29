"""External Data Connectors Package for ORCA.

Owned by Dev 2 (Backend Platform).

Provides typed connector implementations.
"""

from __future__ import annotations

from backend.app.connectors.base import BaseLiveConnector, validate_coordinates, validate_iso8601
from backend.app.connectors.errors import (
    ConnectorAuthenticationError,
    ConnectorError,
    ConnectorInvalidConfigurationError,
    ConnectorMalformedResponseError,
    ConnectorMissingSnapshotError,
    ConnectorRateLimitError,
    ConnectorStaleSnapshotError,
    ConnectorTimeoutError,
    ConnectorUpstreamUnavailableError,
)
from backend.app.connectors.health import get_connector_health
from backend.app.connectors.manager import ConnectorManager
from backend.app.connectors.modes import DataMode
from backend.app.connectors.snapshot import SnapshotConnector, SnapshotMetadata

__all__ = [
    "BaseLiveConnector",
    "ConnectorAuthenticationError",
    "ConnectorError",
    "ConnectorInvalidConfigurationError",
    "ConnectorMalformedResponseError",
    "ConnectorManager",
    "ConnectorMissingSnapshotError",
    "ConnectorRateLimitError",
    "ConnectorStaleSnapshotError",
    "ConnectorTimeoutError",
    "ConnectorUpstreamUnavailableError",
    "DataMode",
    "SnapshotConnector",
    "SnapshotMetadata",
    "get_connector_health",
    "validate_coordinates",
    "validate_iso8601",
]
