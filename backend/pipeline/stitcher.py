"""Strip stitcher — combines adjacent vertical webtoon strips for better OCR.

Webtoons are served as narrow vertical strips (e.g., 690x1600px each).
Large text or speech bubbles can span 2-3 strips. OCR on individual strips
misses this text because it only sees partial characters.

This module stitches adjacent strips into larger panels, runs OCR on the
stitched versions, then maps detected regions back to individual strip
coordinates for inpainting and typesetting.
"""

import asyncio
import logging
from pathlib import Path

from PIL import Image

from backend.schemas.pipeline import OCRPageResult, OCRRegionResult

logger = logging.getLogger(__name__)

# If all pages have the same width AND height <= 2x width, treat as webtoon strips
WEBTOON_ASPECT_THRESHOLD = 4.0  # height/width ratio — typical webtoon strips are ~2.3
STITCH_GROUP_SIZE = 3  # Stitch 3 strips at a time for overlap coverage


def is_webtoon_layout(image_paths: list[Path]) -> bool:
    """Detect if pages are vertical webtoon strips that should be stitched."""
    if len(image_paths) < 5:
        return False

    widths = []
    ratios = []
    for p in image_paths[:20]:  # Sample first 20
        try:
            img = Image.open(p)
            w, h = img.size
            widths.append(w)
            ratios.append(h / w if w > 0 else 0)
        except Exception:
            continue

    if not widths:
        return False

    # Check if widths are consistent (all same width = webtoon strips)
    avg_width = sum(widths) / len(widths)
    consistent_width = all(abs(w - avg_width) < 50 for w in widths)

    # Check aspect ratio — webtoon strips are tall and narrow
    avg_ratio = sum(ratios) / len(ratios)
    is_tall = avg_ratio > 1.5

    result = consistent_width and is_tall and len(image_paths) >= 5
    if result:
        logger.info(
            "Detected webtoon layout: %d strips, avg width=%d, avg ratio=%.1f",
            len(image_paths), int(avg_width), avg_ratio,
        )
    return result


async def stitch_and_ocr(
    ocr_engine,
    pages_with_paths: list[tuple[int, Path]],  # [(page_number, resolved_path), ...]
    chapter_id: str,
    broadcast_fn,
    total_pages: int,
) -> list[OCRPageResult]:
    """Stitch adjacent strips, run OCR on stitched panels, map results back.

    Strategy:
    1. Create overlapping groups of 3 strips: [1,2,3], [2,3,4], [3,4,5], ...
    2. Stitch each group vertically into one tall image
    3. Run OCR on each stitched image
    4. Map detected regions back to the original strip they belong to
    5. Deduplicate overlapping detections
    """
    loop = asyncio.get_event_loop()

    # Also run OCR on individual pages to catch text that fits in one strip
    individual_results: dict[int, list[OCRRegionResult]] = {}
    stitched_results: dict[int, list[OCRRegionResult]] = {}

    # Initialize per-page results
    for page_num, _ in pages_with_paths:
        individual_results[page_num] = []
        stitched_results[page_num] = []

    # Step 1: Individual OCR (parallel)
    async def ocr_individual(page_num: int, path: Path):
        regions = await ocr_engine.detect_text(path)
        individual_results[page_num] = regions

    tasks = [ocr_individual(pn, pp) for pn, pp in pages_with_paths]
    await asyncio.gather(*tasks)

    await broadcast_fn(chapter_id, "ocr", 0.4, "Individual OCR complete, stitching strips...")

    # Step 2: Create stitched groups and run OCR
    sorted_pages = sorted(pages_with_paths, key=lambda x: x[0])

    for i in range(0, len(sorted_pages) - 1):
        # Stitch pairs (i, i+1)
        group = sorted_pages[i:i + 2]

        try:
            stitched_path = await loop.run_in_executor(
                None, _stitch_images, [p for _, p in group]
            )
        except Exception as e:
            logger.warning("Failed to stitch pages %s: %s", [pn for pn, _ in group], e)
            continue

        try:
            stitched_regions = await ocr_engine.detect_text(stitched_path)
        except Exception as e:
            logger.warning("OCR failed on stitched image: %s", e)
            continue
        finally:
            # Clean up temp file
            try:
                stitched_path.unlink()
            except Exception:
                pass

        # Map regions back to original pages
        page_heights = []
        for _, p in group:
            try:
                img = Image.open(p)
                page_heights.append(img.size[1])
            except Exception:
                page_heights.append(0)

        _map_regions_to_pages(stitched_regions, group, page_heights, stitched_results)

    await broadcast_fn(chapter_id, "ocr", 0.8, "Merging OCR results...")

    # Step 3: Merge individual and stitched results, deduplicating
    final_results = []
    for page_num, path in sorted_pages:
        merged = _merge_regions(
            individual_results.get(page_num, []),
            stitched_results.get(page_num, []),
        )
        final_results.append(OCRPageResult(page_number=page_num, regions=merged))

        await broadcast_fn(
            chapter_id, "ocr",
            0.8 + 0.2 * (page_num / total_pages),
            f"Merged OCR results for page {page_num}",
            current_page=page_num,
            total_pages=total_pages,
        )

    return final_results


def _stitch_images(paths: list[Path]) -> Path:
    """Vertically stitch images into one tall image. Returns temp file path."""
    images = [Image.open(p) for p in paths]
    max_width = max(img.width for img in images)

    # Resize all to same width if needed
    resized = []
    for img in images:
        if img.width != max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
        resized.append(img)

    total_height = sum(img.height for img in resized)
    stitched = Image.new("RGB", (max_width, total_height))

    y_offset = 0
    for img in resized:
        stitched.paste(img, (0, y_offset))
        y_offset += img.height

    # Save to temp file
    temp_path = paths[0].parent / f"_stitched_{paths[0].stem}_{paths[-1].stem}.png"
    stitched.save(temp_path)
    return temp_path


def _map_regions_to_pages(
    regions: list[OCRRegionResult],
    group: list[tuple[int, Path]],
    page_heights: list[int],
    results_map: dict[int, list[OCRRegionResult]],
) -> None:
    """Map OCR regions from a stitched image back to individual pages."""
    # Calculate cumulative heights to determine which page a region belongs to
    cumulative = [0]
    for h in page_heights:
        cumulative.append(cumulative[-1] + h)

    for region in regions:
        # Find which page the center of this region falls on
        region_center_y = region.bbox[1] + region.bbox[3] // 2

        for idx in range(len(group)):
            page_num = group[idx][0]
            page_top = cumulative[idx]
            page_bottom = cumulative[idx + 1]

            if page_top <= region_center_y < page_bottom:
                # Adjust coordinates relative to this page
                adjusted = OCRRegionResult(
                    bbox=(
                        region.bbox[0],
                        region.bbox[1] - page_top,
                        region.bbox[2],
                        region.bbox[3],
                    ),
                    polygon=[[p[0], p[1] - page_top] for p in region.polygon],
                    text=region.text,
                    confidence=region.confidence,
                )

                # Only add if the region mostly falls within this page
                adj_top = adjusted.bbox[1]
                adj_bottom = adj_top + adjusted.bbox[3]
                page_h = page_heights[idx]

                if adj_top >= -20 and adj_bottom <= page_h + 20:
                    # Clamp coordinates
                    clamped = OCRRegionResult(
                        bbox=(
                            max(0, adjusted.bbox[0]),
                            max(0, adjusted.bbox[1]),
                            adjusted.bbox[2],
                            min(adjusted.bbox[3], page_h - max(0, adjusted.bbox[1])),
                        ),
                        polygon=adjusted.polygon,
                        text=adjusted.text,
                        confidence=adjusted.confidence,
                    )
                    results_map.setdefault(page_num, []).append(clamped)
                break


def _merge_regions(
    individual: list[OCRRegionResult],
    stitched: list[OCRRegionResult],
) -> list[OCRRegionResult]:
    """Merge individual and stitched OCR results, deduplicating overlaps."""
    if not stitched:
        return individual
    if not individual:
        return stitched

    merged = list(individual)

    for s_region in stitched:
        is_duplicate = False
        for i_region in list(merged):  # Iterate copy to allow removal
            if _regions_overlap(s_region, i_region, threshold=0.5):
                if s_region.confidence > i_region.confidence:
                    try:
                        merged.remove(i_region)
                    except ValueError:
                        pass
                    merged.append(s_region)
                is_duplicate = True
                break

        if not is_duplicate:
            merged.append(s_region)

    return merged


def _regions_overlap(a: OCRRegionResult, b: OCRRegionResult, threshold: float = 0.5) -> bool:
    """Check if two regions overlap by more than threshold (IoU)."""
    ax1, ay1 = a.bbox[0], a.bbox[1]
    ax2, ay2 = ax1 + a.bbox[2], ay1 + a.bbox[3]
    bx1, by1 = b.bbox[0], b.bbox[1]
    bx2, by2 = bx1 + b.bbox[2], by1 + b.bbox[3]

    # Intersection
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    if ix2 <= ix1 or iy2 <= iy1:
        return False

    intersection = (ix2 - ix1) * (iy2 - iy1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a + area_b - intersection

    if union <= 0:
        return False

    return (intersection / union) >= threshold
