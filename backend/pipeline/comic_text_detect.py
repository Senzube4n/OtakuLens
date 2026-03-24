"""Comic text detection wrapper — uses comic-text-detector to find text regions
that standard OCR engines miss, especially stylized/artistic text in manga/manhwa.

Strategy:
1. comic-text-detector finds ALL text regions (including artistic text)
2. EasyOCR/PaddleOCR reads the standard text
3. For regions CTD found but OCR couldn't read → crop and send to Claude vision
4. This minimizes Claude API token usage (only cropped regions, not full pages)
"""

import asyncio
import base64
import io
import logging
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from backend.schemas.pipeline import OCRRegionResult

logger = logging.getLogger(__name__)

# Add vendor path for comic-text-detector
CTD_PATH = Path(__file__).resolve().parent.parent.parent / "vendor" / "comic-text-detector"


class ComicTextDetector:
    """Wrapper around dmMaze/comic-text-detector ONNX model."""

    def __init__(self):
        self._model = None

    def _ensure_loaded(self):
        if self._model is not None:
            return

        model_path = CTD_PATH / "data" / "comictextdetector.pt.onnx"
        if not model_path.exists():
            logger.warning("Comic text detector model not found at %s", model_path)
            return

        # Add CTD to sys.path temporarily for imports
        ctd_str = str(CTD_PATH)
        if ctd_str not in sys.path:
            sys.path.insert(0, ctd_str)

        try:
            from inference import TextDetector
            self._model = TextDetector(
                model_path=str(model_path),
                input_size=1024,
                device="cpu",
            )
            logger.info("Comic text detector loaded (ONNX, CPU)")
        except Exception as e:
            logger.warning("Failed to load comic text detector: %s", e)
            self._model = None

    async def detect_regions(self, image_path: Path) -> list[dict]:
        """Detect text regions using comic-text-detector.

        Returns list of dicts with keys: bbox (x,y,w,h), language, vertical
        """
        self._ensure_loaded()
        if self._model is None:
            return []

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._detect_sync, image_path)

    def _detect_sync(self, image_path: Path) -> list[dict]:
        img = cv2.imread(str(image_path))
        if img is None:
            return []

        try:
            _, _, blk_list = self._model(img)
        except Exception as e:
            logger.warning("CTD detection failed for %s: %s", image_path.name, e)
            return []

        results = []
        for blk in blk_list:
            x1, y1, x2, y2 = blk.xyxy
            w, h = x2 - x1, y2 - y1
            if w < 10 or h < 10:
                continue
            results.append({
                "bbox": (x1, y1, w, h),
                "xyxy": (x1, y1, x2, y2),
                "language": blk.language,
                "vertical": blk.vertical,
            })

        logger.info("CTD detected %d text regions in %s", len(results), image_path.name)
        return results


class VisionOCR:
    """Uses Claude vision API to read text from cropped image regions.
    Only called for regions that standard OCR couldn't read — minimizes token usage.
    """

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key
        self.model = model
        self._client = None

    def _ensure_client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(api_key=self.api_key)

    async def read_text_regions(
        self,
        image_path: Path,
        regions: list[dict],
        source_language: str = "ko",
    ) -> list[OCRRegionResult]:
        """Read text from specific regions of an image using Claude vision.

        Crops each region, sends as a single batch to Claude, minimizing API calls.
        Returns OCRRegionResults for regions where text was successfully read.
        """
        if not regions:
            return []

        self._ensure_client()
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self._read_sync, image_path, regions, source_language
        )

    def _read_sync(
        self, image_path: Path, regions: list[dict], source_language: str
    ) -> list[OCRRegionResult]:
        img = Image.open(image_path)
        img_w, img_h = img.size

        # Crop each region with padding
        crops = []
        valid_regions = []
        for region in regions:
            x1, y1, x2, y2 = region["xyxy"]
            # Add 10% padding
            pad_x = int((x2 - x1) * 0.1)
            pad_y = int((y2 - y1) * 0.1)
            cx1 = max(0, x1 - pad_x)
            cy1 = max(0, y1 - pad_y)
            cx2 = min(img_w, x2 + pad_x)
            cy2 = min(img_h, y2 + pad_y)

            crop = img.crop((cx1, cy1, cx2, cy2))

            # Encode to base64 JPEG (smaller than PNG for photos)
            buf = io.BytesIO()
            crop.save(buf, format="JPEG", quality=85)
            b64 = base64.standard_b64encode(buf.getvalue()).decode("utf-8")
            crops.append(b64)
            valid_regions.append(region)

        if not crops:
            return []

        # Build a single Claude request with all crops
        lang_names = {"ko": "Korean", "zh": "Chinese", "ja": "Japanese"}
        lang_name = lang_names.get(source_language, source_language)

        content = []
        content.append({
            "type": "text",
            "text": (
                f"Read the {lang_name} text in each image below. "
                f"These are cropped regions from a manhwa/manga page containing stylized or artistic text. "
                f"For each image, output ONLY the text you can read, one per line, prefixed with the image number. "
                f"Format: 1: <text here>\n2: <text here>\n"
                f"If you cannot read any text in an image, write: N: [unreadable]"
            ),
        })

        for i, b64 in enumerate(crops):
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": b64,
                },
            })
            content.append({
                "type": "text",
                "text": f"Image {i + 1}:",
            })

        try:
            response = self._client.messages.create(
                model=self.model,
                max_tokens=500,
                messages=[{"role": "user", "content": content}],
            )
            response_text = response.content[0].text
        except Exception as e:
            logger.warning("Claude vision OCR failed: %s", e)
            return []

        # Parse response
        results = []
        for line in response_text.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            # Parse "N: text" format
            if ":" not in line:
                continue
            idx_str, text = line.split(":", 1)
            text = text.strip()
            try:
                idx = int(idx_str.strip()) - 1
            except ValueError:
                continue

            if 0 <= idx < len(valid_regions) and text and "[unreadable]" not in text.lower():
                region = valid_regions[idx]
                x, y, w, h = region["bbox"]
                results.append(OCRRegionResult(
                    bbox=(x, y, w, h),
                    polygon=[
                        [x, y], [x + w, y], [x + w, y + h], [x, y + h]
                    ],
                    text=text,
                    confidence=0.85,  # Claude vision is generally reliable
                ))

        logger.info(
            "Claude vision OCR read %d/%d regions from %s",
            len(results), len(crops), image_path.name,
        )
        return results


def find_unread_regions(
    ctd_regions: list[dict],
    ocr_results: list[OCRRegionResult],
    overlap_threshold: float = 0.3,
) -> list[dict]:
    """Find CTD regions that weren't read by standard OCR.

    Returns CTD regions that don't sufficiently overlap with any OCR result.
    These are candidates for Claude vision fallback.
    """
    unread = []
    for ctd in ctd_regions:
        cx, cy, cw, ch = ctd["bbox"]
        has_ocr_match = False

        for ocr in ocr_results:
            ox, oy, ow, oh = ocr.bbox
            # Calculate IoU
            ix1 = max(cx, ox)
            iy1 = max(cy, oy)
            ix2 = min(cx + cw, ox + ow)
            iy2 = min(cy + ch, oy + oh)

            if ix2 > ix1 and iy2 > iy1:
                intersection = (ix2 - ix1) * (iy2 - iy1)
                area_ctd = cw * ch
                if area_ctd > 0 and intersection / area_ctd > overlap_threshold:
                    has_ocr_match = True
                    break

        if not has_ocr_match:
            unread.append(ctd)

    return unread
