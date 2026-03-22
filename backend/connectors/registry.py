"""ConnectorRegistry — central registry for all source connectors.

Also contains the auto-download scheduler that periodically polls
registered series for new chapters.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from backend.config import settings
from backend.connectors.base import SourceConnector
from backend.connectors.local import LocalConnector
from backend.connectors.url import URLConnector

logger = logging.getLogger(__name__)


class ConnectorRegistry:
    """Manages available :class:`SourceConnector` instances and exposes
    convenience methods for listing and retrieving them.
    """

    def __init__(self) -> None:
        self._connectors: dict[str, SourceConnector] = {}
        self._scheduler_task: asyncio.Task | None = None

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, connector: SourceConnector) -> None:
        """Register a connector instance, keyed by its ``name``."""
        if connector.name in self._connectors:
            logger.warning(
                "Overwriting connector '%s' with new instance", connector.name
            )
        self._connectors[connector.name] = connector
        logger.info("Registered connector: %s", connector.name)

    def register_defaults(self) -> None:
        """Register the built-in connectors (local, url)."""
        self.register(LocalConnector())
        self.register(URLConnector())

    # ------------------------------------------------------------------
    # Lookup
    # ------------------------------------------------------------------

    def get_connector(self, name: str) -> SourceConnector:
        """Return the connector registered under *name*.

        Raises ``KeyError`` if no such connector exists.
        """
        try:
            return self._connectors[name]
        except KeyError:
            available = ", ".join(self._connectors) or "(none)"
            raise KeyError(
                f"Unknown connector '{name}'. Available: {available}"
            )

    def list_connectors(self) -> list[dict]:
        """Return metadata about every registered connector."""
        return [
            {
                "name": c.name,
                "supported_languages": c.supported_languages,
            }
            for c in self._connectors.values()
        ]

    # ------------------------------------------------------------------
    # Auto-download scheduler
    # ------------------------------------------------------------------

    def start_scheduler(self) -> None:
        """Launch the background auto-download task.

        Safe to call multiple times — subsequent calls are no-ops if the
        task is already running.
        """
        if self._scheduler_task is not None and not self._scheduler_task.done():
            return
        self._scheduler_task = asyncio.create_task(self._auto_download_loop())
        logger.info("Auto-download scheduler started")

    def stop_scheduler(self) -> None:
        """Cancel the background scheduler if it is running."""
        if self._scheduler_task and not self._scheduler_task.done():
            self._scheduler_task.cancel()
            logger.info("Auto-download scheduler stopped")

    async def _auto_download_loop(self) -> None:
        """Periodically check all series with ``auto_download=True`` for
        new chapters and, if any are found, save their images to the
        upload directory.
        """
        interval_seconds = settings.auto_download_interval_minutes * 60
        while True:
            try:
                await self._check_all_series()
            except asyncio.CancelledError:
                logger.info("Auto-download scheduler cancelled")
                return
            except Exception:
                logger.exception("Error in auto-download loop")

            await asyncio.sleep(interval_seconds)

    async def _check_all_series(self) -> None:
        """Iterate over series with auto_download enabled and poll for
        new chapters via the appropriate connector.
        """
        from backend.database import async_session_factory
        from backend.models.chapter import Chapter
        from backend.models.series import Series

        async with async_session_factory() as session:
            result = await session.execute(
                select(Series).where(Series.auto_download.is_(True))
            )
            series_list = result.scalars().all()

        for series in series_list:
            await self._check_series_new_chapters(series)

    async def _check_series_new_chapters(self, series) -> None:
        """Check a single series for new chapters and persist any images
        that are found.
        """
        from pathlib import Path

        from sqlalchemy import func, select

        from backend.database import async_session_factory
        from backend.models.chapter import Chapter

        connector_name = self._connector_name_for_series(series)
        try:
            connector = self.get_connector(connector_name)
        except KeyError:
            logger.warning(
                "No connector '%s' for series '%s' — skipping",
                connector_name,
                series.title,
            )
            return

        # Find the highest chapter number already stored
        async with async_session_factory() as session:
            result = await session.execute(
                select(func.max(Chapter.chapter_number)).where(
                    Chapter.series_id == series.id
                )
            )
            last_known = result.scalar() or 0.0

        try:
            new_chapters = await connector.check_new_chapters(
                series.id, last_known
            )
        except Exception:
            logger.exception(
                "Failed to check new chapters for '%s'", series.title
            )
            return

        if not new_chapters:
            return

        logger.info(
            "Found %d new chapter(s) for '%s'",
            len(new_chapters),
            series.title,
        )

        for ch in new_chapters:
            await self._save_chapter_images(series, ch, connector)

    async def _save_chapter_images(
        self, series, chapter_info: dict, connector: SourceConnector
    ) -> None:
        """Download images for a new chapter and write them to the upload
        directory.  Also creates the corresponding DB records.
        """
        from backend.database import async_session_factory
        from backend.models.chapter import Chapter
        from backend.models.page import Page

        chapter_number = chapter_info["chapter_number"]
        chapter_dir = (
            settings.get_upload_dir()
            / series.id
            / f"chapter_{chapter_number}"
        )
        chapter_dir.mkdir(parents=True, exist_ok=True)

        try:
            images = await connector.get_page_images(chapter_info["id"])
        except Exception:
            logger.exception(
                "Failed to download images for chapter %.1f of '%s'",
                chapter_number,
                series.title,
            )
            return

        if not images:
            logger.warning(
                "No images returned for chapter %.1f of '%s'",
                chapter_number,
                series.title,
            )
            return

        # Write images to disk
        page_paths: list[str] = []
        for idx, img_bytes in enumerate(images, start=1):
            # Detect format from header bytes
            ext = _guess_extension(img_bytes)
            page_path = chapter_dir / f"page_{idx:04d}{ext}"
            page_path.write_bytes(img_bytes)
            page_paths.append(str(page_path))

        # Create DB records
        async with async_session_factory() as session:
            chapter = Chapter(
                series_id=series.id,
                chapter_number=chapter_number,
                title=chapter_info.get("title"),
                page_count=len(page_paths),
                status="pending",
            )
            session.add(chapter)
            await session.flush()  # populate chapter.id

            for idx, page_path in enumerate(page_paths, start=1):
                page = Page(
                    chapter_id=chapter.id,
                    page_number=idx,
                    original_path=page_path,
                )
                session.add(page)

            await session.commit()

        logger.info(
            "Saved %d pages for chapter %.1f of '%s'",
            len(page_paths),
            chapter_number,
            series.title,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _connector_name_for_series(series) -> str:
        """Determine which connector to use for a given series.

        If the series has a ``source_url``, use the URL connector;
        otherwise fall back to the local connector.
        """
        if series.source_url:
            return "url"
        return "local"


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------

def _guess_extension(data: bytes) -> str:
    """Return a file extension based on the image magic bytes."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:2] == b"\xff\xd8":
        return ".jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if data[:2] in (b"II", b"MM"):
        return ".tiff"
    if data[:2] == b"BM":
        return ".bmp"
    # Default to png
    return ".png"


# Singleton instance used across the application
connector_registry = ConnectorRegistry()
