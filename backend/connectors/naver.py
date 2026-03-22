"""Naver Webtoon connector — fetches chapter images from comic.naver.com."""

import logging
import re
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

from backend.connectors.base import SourceConnector

logger = logging.getLogger(__name__)

# Naver requires specific headers to serve images
NAVER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Referer": "https://comic.naver.com/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}


class NaverWebtoonConnector(SourceConnector):
    """Connector for Naver Webtoon (comic.naver.com)."""

    name = "naver_webtoon"
    supported_languages = ["ko"]

    async def search(self, query: str) -> list[dict]:
        """Search Naver Webtoon by title."""
        url = f"https://comic.naver.com/search?keyword={query}"
        async with httpx.AsyncClient(headers=NAVER_HEADERS, follow_redirects=True, timeout=15) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning("Naver search failed: %d", resp.status_code)
                return []

        soup = BeautifulSoup(resp.text, "html.parser")
        results = []

        # Find search result items
        for item in soup.select(".SearchResult__thumbnail_area--EDGEY, .ContentTitle__title_area--x24vt, a[href*='/webtoon/list']"):
            link = item.get("href", "") if item.name == "a" else ""
            if not link:
                a_tag = item.find("a")
                link = a_tag["href"] if a_tag else ""
            if "/webtoon/list" not in link:
                continue

            title_match = re.search(r"titleId=(\d+)", link)
            if not title_match:
                continue

            title_id = title_match.group(1)
            title_text = item.get_text(strip=True)
            if not title_text:
                continue

            results.append({
                "id": title_id,
                "title": title_text,
                "url": f"https://comic.naver.com/webtoon/list?titleId={title_id}",
                "source": "naver_webtoon",
            })

        return results[:20]

    async def get_chapters(self, series_id: str) -> list[dict]:
        """Get all available chapters for a Naver Webtoon series."""
        chapters = []
        page = 1

        async with httpx.AsyncClient(headers=NAVER_HEADERS, follow_redirects=True, timeout=15) as client:
            while True:
                url = f"https://comic.naver.com/webtoon/list?titleId={series_id}&page={page}"
                resp = await client.get(url)
                if resp.status_code != 200:
                    break

                soup = BeautifulSoup(resp.text, "html.parser")

                # Find episode links
                found = False
                for link in soup.select("a[href*='/webtoon/detail']"):
                    href = link.get("href", "")
                    no_match = re.search(r"no=(\d+)", href)
                    if not no_match:
                        continue

                    found = True
                    ep_no = int(no_match.group(1))
                    title = link.get_text(strip=True)

                    chapters.append({
                        "id": f"{series_id}_{ep_no}",
                        "number": ep_no,
                        "title": title,
                        "url": f"https://comic.naver.com{href}" if href.startswith("/") else href,
                    })

                if not found:
                    break
                page += 1
                if page > 50:  # Safety limit
                    break

        # Deduplicate and sort
        seen = set()
        unique = []
        for ch in chapters:
            if ch["id"] not in seen:
                seen.add(ch["id"])
                unique.append(ch)
        unique.sort(key=lambda c: c["number"])
        return unique

    async def get_page_images(self, chapter_url: str) -> list[bytes]:
        """Download all page images from a Naver Webtoon chapter."""
        async with httpx.AsyncClient(headers=NAVER_HEADERS, follow_redirects=True, timeout=30) as client:
            # Fetch the chapter page
            resp = await client.get(chapter_url)
            if resp.status_code != 200:
                logger.error("Failed to fetch chapter page: %d %s", resp.status_code, chapter_url)
                return []

            soup = BeautifulSoup(resp.text, "html.parser")

            # Find webtoon images — Naver uses specific viewer container
            image_urls = []

            # Method 1: Look for the webtoon viewer images
            for img in soup.select("#sectionContWide img, .wt_viewer img, #comic_view_area img"):
                src = img.get("src", "") or img.get("data-src", "")
                if src and ("imgcomic" in src or "content-images" in src or "postfiles" in src):
                    image_urls.append(src)

            # Method 2: Regex fallback for image URLs in page source
            if not image_urls:
                img_pattern = re.findall(
                    r'(https?://[^\s"\']+\.(?:jpe?g|png|webp))',
                    resp.text,
                )
                for url in img_pattern:
                    if any(kw in url for kw in ["imgcomic", "content-image", "postfiles", "comic.naver"]):
                        image_urls.append(url)

            if not image_urls:
                logger.warning("No images found on chapter page: %s", chapter_url)
                return []

            logger.info("Found %d images in chapter", len(image_urls))

            # Download all images with proper Referer
            images = []
            for img_url in image_urls:
                try:
                    img_resp = await client.get(img_url, headers={
                        **NAVER_HEADERS,
                        "Referer": chapter_url,
                    })
                    if img_resp.status_code == 200 and len(img_resp.content) > 1000:
                        images.append(img_resp.content)
                except Exception as e:
                    logger.warning("Failed to download image %s: %s", img_url, e)

            return images

    async def check_new_chapters(self, series_id: str, last_known: float) -> list[dict]:
        """Check for chapters newer than last_known."""
        all_chapters = await self.get_chapters(series_id)
        return [ch for ch in all_chapters if ch["number"] > last_known]

    async def download_chapter_to_disk(
        self, chapter_url: str, output_dir: Path
    ) -> list[Path]:
        """Download chapter images and save them to disk."""
        output_dir.mkdir(parents=True, exist_ok=True)
        images = await self.get_page_images(chapter_url)

        paths = []
        for i, img_data in enumerate(images, 1):
            # Detect format from magic bytes
            ext = ".jpg"
            if img_data[:4] == b"\x89PNG":
                ext = ".png"
            elif img_data[:4] == b"RIFF":
                ext = ".webp"

            path = output_dir / f"page_{i:04d}{ext}"
            path.write_bytes(img_data)
            paths.append(path)
            logger.debug("Saved page %d to %s", i, path)

        return paths
