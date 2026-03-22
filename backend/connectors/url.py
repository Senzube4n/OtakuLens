"""URLConnector — generic URL image extractor for manga/comic pages.

Given a webpage URL, this connector fetches the page, finds ``<img>``
tags, downloads images that look like comic pages (based on size), and
returns the raw bytes.
"""

import logging
from io import BytesIO
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from PIL import Image

from backend.connectors.base import SourceConnector

logger = logging.getLogger(__name__)

# Images smaller than these thresholds are treated as icons / UI elements
# and skipped.  Manga pages are typically at least 400 px wide and tall.
MIN_WIDTH = 300
MIN_HEIGHT = 400
MIN_BYTES = 30_000  # ~30 KB

# Maximum number of images to download from a single page to avoid
# runaway requests.
MAX_IMAGES = 200

# Timeout for individual image downloads (seconds).
REQUEST_TIMEOUT = 30.0

# Default headers to blend in with a regular browser.
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


class URLConnector(SourceConnector):
    """Extracts comic/manga page images from an arbitrary URL."""

    name: str = "url"
    supported_languages: list[str] = []  # language-agnostic

    def __init__(
        self,
        *,
        min_width: int = MIN_WIDTH,
        min_height: int = MIN_HEIGHT,
        min_bytes: int = MIN_BYTES,
        max_images: int = MAX_IMAGES,
        request_timeout: float = REQUEST_TIMEOUT,
    ):
        self.min_width = min_width
        self.min_height = min_height
        self.min_bytes = min_bytes
        self.max_images = max_images
        self.request_timeout = request_timeout

    # ------------------------------------------------------------------
    # SourceConnector interface
    # ------------------------------------------------------------------

    async def search(self, query: str) -> list[dict]:
        """URL connector does not support search.

        To use this connector the caller provides a direct URL.
        """
        return []

    async def get_chapters(self, series_id: str) -> list[dict]:
        """Not applicable — the URL connector works with individual pages."""
        return []

    async def get_page_images(self, chapter_id: str) -> list[bytes]:
        """Treat *chapter_id* as a URL, fetch the page, and extract images.

        This is the primary entry point for the URL connector.
        """
        return await self.extract_images(chapter_id)

    async def check_new_chapters(
        self, series_id: str, last_known: float
    ) -> list[dict]:
        """URL connector does not support polling for new chapters."""
        return []

    # ------------------------------------------------------------------
    # Core extraction logic
    # ------------------------------------------------------------------

    async def extract_images(
        self,
        url: str,
        *,
        referer: str | None = None,
    ) -> list[bytes]:
        """Fetch *url*, find image tags, and download page-like images.

        Parameters
        ----------
        url:
            The webpage to scrape for images.
        referer:
            Optional ``Referer`` header override.  When ``None``, the
            page URL itself is used.
        """
        headers = {**DEFAULT_HEADERS}
        if referer:
            headers["Referer"] = referer

        async with httpx.AsyncClient(
            headers=headers,
            timeout=self.request_timeout,
            follow_redirects=True,
            http2=True,
        ) as client:
            # 1. Fetch the HTML page
            page_resp = await client.get(url)
            page_resp.raise_for_status()
            html = page_resp.text

            # 2. Parse and collect candidate image URLs
            img_urls = self._extract_image_urls(html, url)
            logger.info(
                "Found %d candidate image URLs on %s", len(img_urls), url
            )

            # 3. Download and filter
            headers["Referer"] = url
            images: list[bytes] = []
            for img_url in img_urls[: self.max_images]:
                img_data = await self._download_image(client, img_url)
                if img_data is not None:
                    images.append(img_data)

        logger.info(
            "Extracted %d page images from %s", len(images), url
        )
        return images

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _extract_image_urls(self, html: str, base_url: str) -> list[str]:
        """Parse HTML and return a deduplicated, ordered list of image URLs."""
        soup = BeautifulSoup(html, "html.parser")
        seen: set[str] = set()
        urls: list[str] = []

        for img in soup.find_all("img"):
            # Prefer data-src (lazy-load) over src
            raw = (
                img.get("data-src")
                or img.get("data-lazy-src")
                or img.get("data-original")
                or img.get("src")
            )
            if not raw:
                continue

            # Skip data URIs and SVGs
            if raw.startswith("data:") or raw.endswith(".svg"):
                continue

            absolute = urljoin(base_url, raw)
            if absolute not in seen:
                seen.add(absolute)
                urls.append(absolute)

        return urls

    async def _download_image(
        self, client: httpx.AsyncClient, url: str
    ) -> bytes | None:
        """Download a single image and return its bytes if it passes
        the size filters.  Returns ``None`` for non-page images.
        """
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.debug("Failed to download %s: %s", url, exc)
            return None

        data = resp.content
        content_type = resp.headers.get("content-type", "")

        # Must look like an image
        if not content_type.startswith("image/"):
            return None

        # Quick byte-size filter
        if len(data) < self.min_bytes:
            return None

        # Pixel-dimension filter
        try:
            img = Image.open(BytesIO(data))
            width, height = img.size
        except Exception:
            return None

        if width < self.min_width or height < self.min_height:
            return None

        return data
