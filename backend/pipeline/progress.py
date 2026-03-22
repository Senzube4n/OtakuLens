"""Progress broadcaster — manages WebSocket connections for real-time pipeline progress."""

import logging
from collections import defaultdict

from fastapi import WebSocket

from backend.schemas.pipeline import PipelineProgress

logger = logging.getLogger(__name__)


class ProgressBroadcaster:
    """Singleton that manages WebSocket connections per chapter and broadcasts progress updates."""

    def __init__(self):
        # chapter_id -> set of active WebSocket connections
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    def connect(self, chapter_id: str, websocket: WebSocket) -> None:
        """Register a WebSocket connection for a chapter's progress updates."""
        self._connections[chapter_id].add(websocket)
        logger.debug("WebSocket connected for chapter %s (total: %d)", chapter_id, len(self._connections[chapter_id]))

    def disconnect(self, chapter_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        conns = self._connections.get(chapter_id)
        if conns:
            conns.discard(websocket)
            if not conns:
                del self._connections[chapter_id]
        logger.debug("WebSocket disconnected for chapter %s", chapter_id)

    async def broadcast(self, chapter_id: str, progress: PipelineProgress) -> None:
        """Send a progress update to all connected clients for a chapter.

        Dead connections are removed automatically.
        """
        conns = self._connections.get(chapter_id)
        if not conns:
            return

        payload = progress.model_dump_json()
        dead: list[WebSocket] = []

        for ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        # Clean up dead connections
        for ws in dead:
            conns.discard(ws)
            logger.debug("Removed dead WebSocket for chapter %s", chapter_id)

        if not conns:
            del self._connections[chapter_id]


# Module-level singleton
progress_broadcaster = ProgressBroadcaster()
