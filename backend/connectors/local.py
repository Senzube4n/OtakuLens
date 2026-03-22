"""LocalConnector — handles locally uploaded manga/comic images.

Files are uploaded via the API and stored on the filesystem.  This
connector acts as a thin passthrough so that the pipeline can treat
local images the same way it treats images fetched from remote sources.
"""

import logging
from pathlib import Path

from backend.config import settings
from backend.connectors.base import SourceConnector

logger = logging.getLogger(__name__)


class LocalConnector(SourceConnector):
    """Source connector for files already present on the local filesystem."""

    name: str = "local"
    supported_languages: list[str] = list(
        __import__("backend.config", fromlist=["SUPPORTED_LANGUAGES"]).SUPPORTED_LANGUAGES.keys()
    )

    # ------------------------------------------------------------------
    # Search — not applicable for local files
    # ------------------------------------------------------------------

    async def search(self, query: str) -> list[dict]:
        """Local connector does not support search.

        Returns an empty list.  Series backed by local files are created
        directly through the upload API.
        """
        return []

    # ------------------------------------------------------------------
    # Chapters — list image directories under a series folder
    # ------------------------------------------------------------------

    async def get_chapters(self, series_id: str) -> list[dict]:
        """List chapter directories stored under the upload folder for *series_id*.

        The convention is:
            <upload_dir>/<series_id>/chapter_<number>/
        """
        series_dir = settings.get_upload_dir() / series_id
        if not series_dir.is_dir():
            logger.warning("Series directory not found: %s", series_dir)
            return []

        chapters: list[dict] = []
        for child in sorted(series_dir.iterdir()):
            if not child.is_dir():
                continue
            # Attempt to extract chapter number from folder name
            chapter_number = self._parse_chapter_number(child.name)
            if chapter_number is None:
                continue
            chapters.append(
                {
                    "id": child.name,
                    "chapter_number": chapter_number,
                    "title": None,
                    "published_at": child.stat().st_mtime,
                    "url": None,
                }
            )

        # Newest first
        chapters.sort(key=lambda c: c["chapter_number"], reverse=True)
        return chapters

    # ------------------------------------------------------------------
    # Page images — read files from disk
    # ------------------------------------------------------------------

    async def get_page_images(self, chapter_id: str) -> list[bytes]:
        """Read all image files from a chapter directory and return their bytes.

        *chapter_id* is expected to be a relative path under the upload
        directory (e.g. ``<series_id>/chapter_1``).
        """
        chapter_dir = settings.get_upload_dir() / chapter_id
        if not chapter_dir.is_dir():
            raise FileNotFoundError(f"Chapter directory not found: {chapter_dir}")

        image_extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".gif"}
        image_files = sorted(
            f
            for f in chapter_dir.iterdir()
            if f.suffix.lower() in image_extensions
        )

        if not image_files:
            logger.warning("No images found in %s", chapter_dir)
            return []

        pages: list[bytes] = []
        for img_path in image_files:
            pages.append(img_path.read_bytes())
        return pages

    async def get_page_image_paths(self, chapter_id: str) -> list[Path]:
        """Return file paths instead of raw bytes — useful when the
        pipeline can work directly with paths on disk.
        """
        chapter_dir = settings.get_upload_dir() / chapter_id
        if not chapter_dir.is_dir():
            raise FileNotFoundError(f"Chapter directory not found: {chapter_dir}")

        image_extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".gif"}
        return sorted(
            f
            for f in chapter_dir.iterdir()
            if f.suffix.lower() in image_extensions
        )

    # ------------------------------------------------------------------
    # New chapters — compare against known chapter numbers
    # ------------------------------------------------------------------

    async def check_new_chapters(
        self, series_id: str, last_known: float
    ) -> list[dict]:
        """Return local chapter directories with a number above *last_known*."""
        all_chapters = await self.get_chapters(series_id)
        return [c for c in all_chapters if c["chapter_number"] > last_known]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_chapter_number(folder_name: str) -> float | None:
        """Try to extract a numeric chapter value from a folder name.

        Handles patterns like ``chapter_1``, ``ch001``, ``Chapter 12.5``,
        or just bare numbers like ``003``.
        """
        import re

        # Strip common prefixes
        cleaned = re.sub(r"(?i)^(chapter|ch)[_\-\s]*", "", folder_name)
        # Take the first number-like token (int or float)
        match = re.search(r"(\d+(?:\.\d+)?)", cleaned)
        if match:
            return float(match.group(1))
        return None
