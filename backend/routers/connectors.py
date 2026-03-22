"""Source connectors router — list connectors and fetch images from URLs."""

import logging
import re
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectorInfo(BaseModel):
    id: str
    name: str
    description: str
    enabled: bool


class FetchURLRequest(BaseModel):
    url: str
    series_id: str | None = None
    chapter_label: str | None = None


class FetchURLResponse(BaseModel):
    images_downloaded: int
    save_directory: str


# Built-in connector registry.  Extensible later via plugins.
_CONNECTORS: list[ConnectorInfo] = [
    ConnectorInfo(
        id="url",
        name="URL Importer",
        description="Fetch manga page images from a direct URL or gallery page",
        enabled=True,
    ),
]

# Image extensions we accept
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
_IMAGE_URL_PATTERN = re.compile(
    r'(?:src|data-src|href)\s*=\s*["\']([^"\']+\.(?:png|jpe?g|webp|gif|bmp))["\']',
    re.IGNORECASE,
)


@router.get("/", response_model=list[ConnectorInfo])
async def list_connectors():
    return _CONNECTORS


@router.post("/fetch-url", response_model=FetchURLResponse)
async def fetch_url(payload: FetchURLRequest):
    """Fetch images from a URL.

    If the URL points directly to an image, downloads that single file.
    Otherwise, scrapes the page for image URLs and downloads them all.
    """
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    # Build save directory
    label = payload.chapter_label or "fetched"
    if payload.series_id:
        save_dir = settings.get_upload_dir() / payload.series_id / label
    else:
        save_dir = settings.get_upload_dir() / "unsorted" / label
    save_dir.mkdir(parents=True, exist_ok=True)

    image_urls: list[str] = []

    async with httpx.AsyncClient(
        follow_redirects=True, timeout=30.0, headers={"User-Agent": "MangaLens/0.1"}
    ) as client:
        # Check if URL itself is a direct image link
        if _is_image_url(url):
            image_urls.append(url)
        else:
            # Fetch the page and extract image URLs
            try:
                resp = await client.get(url)
                resp.raise_for_status()
            except httpx.HTTPError as exc:
                raise HTTPException(
                    status_code=502, detail=f"Failed to fetch URL: {exc}"
                )
            matches = _IMAGE_URL_PATTERN.findall(resp.text)
            for match in matches:
                absolute = _resolve_url(url, match)
                if absolute not in image_urls:
                    image_urls.append(absolute)

        if not image_urls:
            raise HTTPException(
                status_code=404, detail="No images found at the given URL"
            )

        # Download images
        downloaded = 0
        for idx, img_url in enumerate(image_urls, start=1):
            try:
                img_resp = await client.get(img_url)
                img_resp.raise_for_status()
                ext = _ext_from_url(img_url)
                filename = f"page_{idx:04d}{ext}"
                (save_dir / filename).write_bytes(img_resp.content)
                downloaded += 1
            except httpx.HTTPError:
                logger.warning("Failed to download image: %s", img_url)
                continue

    if downloaded == 0:
        raise HTTPException(status_code=502, detail="Could not download any images")

    relative_dir = save_dir.relative_to(settings.base_dir)
    return FetchURLResponse(
        images_downloaded=downloaded,
        save_directory=str(relative_dir),
    )


def _is_image_url(url: str) -> bool:
    path_part = url.split("?")[0].split("#")[0].lower()
    return any(path_part.endswith(ext) for ext in _IMAGE_EXTENSIONS)


def _ext_from_url(url: str) -> str:
    path_part = url.split("?")[0].split("#")[0].lower()
    for ext in _IMAGE_EXTENSIONS:
        if path_part.endswith(ext):
            return ext
    return ".jpg"


def _resolve_url(base: str, relative: str) -> str:
    if relative.startswith(("http://", "https://")):
        return relative
    if relative.startswith("//"):
        scheme = base.split("://")[0]
        return f"{scheme}:{relative}"
    if relative.startswith("/"):
        from urllib.parse import urlparse

        parsed = urlparse(base)
        return f"{parsed.scheme}://{parsed.netloc}{relative}"
    # Relative path
    base_trimmed = base.rsplit("/", 1)[0]
    return f"{base_trimmed}/{relative}"
