"""Source connectors for fetching manga/comic images."""

from backend.connectors.base import SourceConnector
from backend.connectors.local import LocalConnector
from backend.connectors.registry import ConnectorRegistry, connector_registry
from backend.connectors.url import URLConnector

__all__ = [
    "SourceConnector",
    "LocalConnector",
    "URLConnector",
    "ConnectorRegistry",
    "connector_registry",
]
