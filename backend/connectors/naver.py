"""Naver Webtoon connector — fetches chapter images via comic.naver.com API."""

import logging
import re
from pathlib import Path

import httpx

from backend.connectors.base import SourceConnector

logger = logging.getLogger(__name__)

NAVER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Referer": "https://comic.naver.com/",
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}

API_BASE = "https://comic.naver.com/api"


class NaverWebtoonConnector(SourceConnector):
    """Connector for Naver Webtoon using their internal JSON API."""

    name = "naver_webtoon"
    supported_languages = ["ko"]

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(headers=NAVER_HEADERS, follow_redirects=True, timeout=20)

    async def search(self, query: str) -> list[dict]:
        """Search Naver Webtoon by title."""
        async with self._client() as client:
            resp = await client.get(
                f"{API_BASE}/search/all",
                params={"keyword": query, "searchType": "WEBTOON"},
            )
            if resp.status_code != 200:
                logger.warning("Naver search API returned %d", resp.status_code)
                return []

            data = resp.json()
            results = []
            # The search API nests results under searchWebtoonResult or similar
            for key in ("searchWebtoonResult", "searchResult", "titleList"):
                items = data.get(key, {})
                if isinstance(items, dict):
                    items = items.get("titleList", [])
                if isinstance(items, list):
                    for item in items:
                        title_id = str(item.get("titleId", ""))
                        title = item.get("titleName", "") or item.get("name", "")
                        if title_id and title:
                            results.append({
                                "id": title_id,
                                "title": title,
                                "url": f"https://comic.naver.com/webtoon/list?titleId={title_id}",
                                "source": "naver_webtoon",
                                "thumbnail": item.get("thumbnailUrl", ""),
                            })

            # Fallback: try the old HTML search if API didn't return results
            if not results:
                results = await self._search_html(client, query)

            return results[:20]

    async def _search_html(self, client: httpx.AsyncClient, query: str) -> list[dict]:
        """Fallback HTML-based search."""
        resp = await client.get(f"https://comic.naver.com/search", params={"keyword": query})
        if resp.status_code != 200:
            return []
        results = []
        for match in re.finditer(r'titleId=(\d+)', resp.text):
            title_id = match.group(1)
            if title_id not in [r["id"] for r in results]:
                results.append({
                    "id": title_id,
                    "title": f"Series {title_id}",
                    "url": f"https://comic.naver.com/webtoon/list?titleId={title_id}",
                    "source": "naver_webtoon",
                })
        return results

    async def get_series_info(self, title_id: str) -> dict:
        """Get series metadata."""
        async with self._client() as client:
            resp = await client.get(f"{API_BASE}/article/list/info", params={"titleId": title_id})
            if resp.status_code == 200:
                return resp.json()
            return {}

    async def get_chapters(self, series_id: str) -> list[dict]:
        """Get all chapters using the JSON API with pagination."""
        chapters = []
        page = 1

        async with self._client() as client:
            while True:
                resp = await client.get(
                    f"{API_BASE}/article/list",
                    params={"titleId": series_id, "page": page, "sort": "ASC"},
                )
                if resp.status_code != 200:
                    logger.warning("Naver chapter list API returned %d", resp.status_code)
                    break

                data = resp.json()
                articles = data.get("articleList", [])
                if not articles:
                    break

                for a in articles:
                    ep_no = a.get("no", 0)
                    subtitle = a.get("subtitle", f"Episode {ep_no}")
                    chapters.append({
                        "id": f"{series_id}_{ep_no}",
                        "number": ep_no,
                        "title": subtitle,
                        "url": f"https://comic.naver.com/webtoon/detail?titleId={series_id}&no={ep_no}",
                        "thumbnail": a.get("thumbnailUrl", ""),
                    })

                # Check if there are more pages
                page_info = data.get("pageInfo", {})
                total_pages = page_info.get("totalPages", 1)
                if page >= total_pages:
                    break
                page += 1

        chapters.sort(key=lambda c: c["number"])
        return chapters

    async def get_page_images(self, chapter_url: str) -> list[bytes]:
        """Download all page images from a chapter.

        Naver serves the chapter viewer as an SPA, but the image URLs
        can be found via the article content API or by parsing the
        initial HTML/JSON payload.
        """
        # Extract titleId and no from URL
        title_match = re.search(r"titleId=(\d+)", chapter_url)
        no_match = re.search(r"no=(\d+)", chapter_url)
        if not title_match or not no_match:
            logger.error("Cannot parse titleId/no from URL: %s", chapter_url)
            return []

        title_id = title_match.group(1)
        ep_no = no_match.group(1)

        async with self._client() as client:
            image_urls = []

            # Method 1: Try the article detail API
            detail_resp = await client.get(
                f"{API_BASE}/article/detail",
                params={"titleId": title_id, "no": ep_no},
            )
            if detail_resp.status_code == 200:
                detail = detail_resp.json()
                # Images may be in imageList, cutList, or similar
                for key in ("imageList", "cutList", "articleImages"):
                    img_list = detail.get(key, [])
                    if isinstance(img_list, list):
                        for img in img_list:
                            url = img.get("imageUrl", "") or img.get("url", "") or (img if isinstance(img, str) else "")
                            if url and url.startswith("http"):
                                image_urls.append(url)

            # Method 2: Fetch the viewer page and extract image URLs from embedded JSON/HTML
            if not image_urls:
                viewer_resp = await client.get(chapter_url)
                if viewer_resp.status_code == 200:
                    # Look for image URLs in the page source (embedded in JSON or img tags)
                    patterns = [
                        r'"imageUrl"\s*:\s*"(https?://[^"]+)"',
                        r'"url"\s*:\s*"(https?://[^"]+\.(?:jpe?g|png|webp))"',
                        r'src="(https?://[^"]*(?:imgcomic|content-image|postfiles|comic\.pstatic)[^"]*)"',
                    ]
                    for pattern in patterns:
                        matches = re.findall(pattern, viewer_resp.text)
                        for url in matches:
                            if url not in image_urls and any(
                                kw in url for kw in ["comic", "pstatic", "postfiles", "content"]
                            ):
                                image_urls.append(url)

            if not image_urls:
                logger.warning("No images found for chapter %s ep %s", title_id, ep_no)
                return []

            logger.info("Found %d images for ep %s", len(image_urls), ep_no)

            # Download images with proper Referer
            images = []
            for img_url in image_urls:
                try:
                    img_resp = await client.get(
                        img_url,
                        headers={**NAVER_HEADERS, "Referer": chapter_url},
                    )
                    if img_resp.status_code == 200 and len(img_resp.content) > 1000:
                        images.append(img_resp.content)
                    else:
                        logger.debug("Skipped image (status=%d, size=%d): %s",
                                     img_resp.status_code, len(img_resp.content), img_url[:80])
                except Exception as e:
                    logger.warning("Failed to download %s: %s", img_url[:80], e)

            return images

    async def check_new_chapters(self, series_id: str, last_known: float) -> list[dict]:
        """Check for chapters newer than last_known."""
        all_chapters = await self.get_chapters(series_id)
        return [ch for ch in all_chapters if ch["number"] > last_known]

    async def download_chapter_to_disk(self, chapter_url: str, output_dir: Path) -> list[Path]:
        """Download chapter images and save to disk."""
        output_dir.mkdir(parents=True, exist_ok=True)
        images = await self.get_page_images(chapter_url)

        paths = []
        for i, img_data in enumerate(images, 1):
            ext = ".jpg"
            if img_data[:4] == b"\x89PNG":
                ext = ".png"
            elif img_data[:4] == b"RIFF":
                ext = ".webp"

            path = output_dir / f"page_{i:04d}{ext}"
            path.write_bytes(img_data)
            paths.append(path)

        logger.info("Downloaded %d pages to %s", len(paths), output_dir)
        return paths
