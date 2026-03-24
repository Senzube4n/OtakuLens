"""OCR engine — detects text regions in manga/comic pages using EasyOCR or PaddleOCR."""

import asyncio
import logging
from pathlib import Path

import numpy as np

from backend.config import SUPPORTED_LANGUAGES
from backend.schemas.pipeline import OCRRegionResult

logger = logging.getLogger(__name__)


class OCREngine:
    """Language-aware OCR engine that auto-selects between EasyOCR and PaddleOCR."""

    def __init__(self, source_language: str = "ko"):
        self.source_language = source_language
        lang_cfg = SUPPORTED_LANGUAGES.get(source_language)
        if lang_cfg is None:
            raise ValueError(
                f"Unsupported source language '{source_language}'. "
                f"Supported: {list(SUPPORTED_LANGUAGES.keys())}"
            )
        self.lang_config = lang_cfg
        self.ocr_backend = lang_cfg["ocr"]  # "easyocr" or "paddleocr"

        # Lazy-initialized model handles
        self._easyocr_reader = None
        self._paddleocr_engine = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def detect_text(self, image_path: Path) -> list[OCRRegionResult]:
        """Run OCR on an image and return detected text regions."""
        image_path = Path(image_path)
        if not image_path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        loop = asyncio.get_event_loop()

        if self.ocr_backend == "paddleocr":
            raw_results = await loop.run_in_executor(
                None, self._run_paddleocr, str(image_path)
            )
        else:
            raw_results = await loop.run_in_executor(
                None, self._run_easyocr, str(image_path)
            )

        # Convert to OCRRegionResult, filtering low-confidence detections
        regions: list[OCRRegionResult] = []
        for item in raw_results:
            polygon, text, confidence = item
            if confidence < 0.3:
                continue
            if not text or not text.strip():
                continue
            # Filter OCR garbage — single punctuation/symbol characters
            cleaned = text.strip()
            if len(cleaned) <= 2 and all(
                c in "!@#$%^&*()_+-=[]{}|;:',.<>?/~`0123456789 " for c in cleaned
            ):
                continue

            bbox = self._polygon_to_bbox(polygon)
            # Skip degenerate bboxes
            if bbox[2] < 2 or bbox[3] < 2:
                continue

            regions.append(
                OCRRegionResult(
                    bbox=bbox,
                    polygon=polygon,
                    text=text.strip(),
                    confidence=round(float(confidence), 4),
                )
            )

        logger.info(
            "OCR detected %d regions in %s (backend=%s)",
            len(regions),
            image_path.name,
            self.ocr_backend,
        )
        return regions

    # ------------------------------------------------------------------
    # EasyOCR backend
    # ------------------------------------------------------------------

    def _run_easyocr(self, image_path: str) -> list:
        """Synchronous EasyOCR call. Returns list of (polygon, text, confidence)."""
        import easyocr

        if self._easyocr_reader is None:
            lang_code = self.lang_config["easyocr_code"]
            # Always include English alongside the source language for mixed text
            langs = [lang_code]
            if lang_code != "en":
                langs.append("en")
            logger.info("Initializing EasyOCR reader for languages: %s", langs)
            self._easyocr_reader = easyocr.Reader(langs, gpu=True, verbose=False)

        raw = self._easyocr_reader.readtext(image_path)
        # EasyOCR returns: list of (bbox_points, text, confidence)
        # bbox_points is a list of 4 [x, y] pairs
        results = []
        for bbox_points, text, confidence in raw:
            polygon = [[int(round(p[0])), int(round(p[1]))] for p in bbox_points]
            results.append((polygon, text, confidence))
        return results

    # ------------------------------------------------------------------
    # PaddleOCR backend
    # ------------------------------------------------------------------

    def _run_paddleocr(self, image_path: str) -> list:
        """Synchronous PaddleOCR call. Returns list of (polygon, text, confidence)."""
        from paddleocr import PaddleOCR

        if self._paddleocr_engine is None:
            paddle_lang = self.lang_config.get("paddle_lang", "ch")
            logger.info("Initializing PaddleOCR for language: %s", paddle_lang)
            self._paddleocr_engine = PaddleOCR(
                use_angle_cls=True,
                lang=paddle_lang,
                show_log=False,
                use_gpu=True,
            )

        raw = self._paddleocr_engine.ocr(image_path, cls=True)
        results = []
        # PaddleOCR returns a list of lists (one per image); we only process one image
        if raw and raw[0]:
            for line in raw[0]:
                # line = [polygon_points, (text, confidence)]
                polygon_points = line[0]
                text, confidence = line[1]
                polygon = [[int(round(p[0])), int(round(p[1]))] for p in polygon_points]
                results.append((polygon, text, confidence))
        return results

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _polygon_to_bbox(polygon: list[list[int]]) -> tuple[int, int, int, int]:
        """Convert a 4-point polygon to an axis-aligned bounding box (x, y, w, h)."""
        pts = np.array(polygon)
        x_min = int(pts[:, 0].min())
        y_min = int(pts[:, 1].min())
        x_max = int(pts[:, 0].max())
        y_max = int(pts[:, 1].max())
        return (x_min, y_min, x_max - x_min, y_max - y_min)
