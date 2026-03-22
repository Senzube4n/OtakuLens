"""Inpainting engine — removes detected text from manga pages using LaMa or OpenCV."""

import asyncio
import logging
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from backend.schemas.pipeline import OCRRegionResult

logger = logging.getLogger(__name__)


class InpaintingEngine:
    """Removes text from manga pages by inpainting detected regions."""

    def __init__(self):
        self._lama_model = None
        self._lama_available: bool | None = None  # None = not yet checked

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def remove_text(
        self,
        image_path: Path,
        regions: list[OCRRegionResult],
        output_path: Path,
    ) -> Path:
        """Remove text from all detected regions and save the cleaned image."""
        image_path = Path(image_path)
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if not regions:
            # No text to remove — just copy the image
            img = Image.open(image_path)
            img.save(output_path)
            logger.info("No regions to inpaint for %s, copied original", image_path.name)
            return output_path

        img = Image.open(image_path).convert("RGB")
        mask = self._create_mask(img.size, regions, dilation=10)

        loop = asyncio.get_event_loop()

        # Try LaMa first, fall back to OpenCV
        try:
            result = await loop.run_in_executor(None, self._inpaint_lama, img, mask)
            result.save(output_path)
            logger.info("LaMa inpainting complete for %s", image_path.name)
            return output_path
        except Exception as exc:
            logger.warning(
                "LaMa inpainting failed for %s: %s. Falling back to OpenCV.",
                image_path.name,
                exc,
            )

        # OpenCV fallback
        mask_np = np.array(mask.convert("L"))
        await loop.run_in_executor(
            None, self._inpaint_opencv, str(image_path), mask_np, str(output_path)
        )
        logger.info("OpenCV inpainting complete for %s", image_path.name)
        return output_path

    # ------------------------------------------------------------------
    # Mask creation
    # ------------------------------------------------------------------

    def _create_mask(
        self,
        image_size: tuple[int, int],
        regions: list[OCRRegionResult],
        dilation: int = 10,
    ) -> Image.Image:
        """Create a binary mask from OCR bounding boxes, dilated slightly for coverage."""
        w, h = image_size
        mask = np.zeros((h, w), dtype=np.uint8)

        for region in regions:
            x, y, rw, rh = region.bbox
            # Clamp to image bounds
            x1 = max(0, x)
            y1 = max(0, y)
            x2 = min(w, x + rw)
            y2 = min(h, y + rh)
            mask[y1:y2, x1:x2] = 255

        # Dilate the mask to cover edges/strokes that OCR bbox may miss
        if dilation > 0:
            kernel = np.ones((dilation, dilation), np.uint8)
            mask = cv2.dilate(mask, kernel, iterations=1)

        return Image.fromarray(mask, mode="L")

    # ------------------------------------------------------------------
    # LaMa inpainting
    # ------------------------------------------------------------------

    def _inpaint_lama(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        """Inpaint using simple-lama-inpainting. Synchronous — run in executor."""
        if self._lama_available is False:
            raise RuntimeError("LaMa was previously determined to be unavailable")

        try:
            from simple_lama_inpainting import SimpleLama

            if self._lama_model is None:
                logger.info("Loading LaMa inpainting model (first use)...")
                self._lama_model = SimpleLama()
                self._lama_available = True

            result = self._lama_model(image, mask)
            return result
        except ImportError:
            self._lama_available = False
            raise RuntimeError("simple-lama-inpainting is not installed")
        except Exception:
            # If model loading or inference fails, mark as unavailable for this session
            self._lama_available = False
            raise

    # ------------------------------------------------------------------
    # OpenCV fallback
    # ------------------------------------------------------------------

    def _inpaint_opencv(
        self, image_path: str, mask: np.ndarray, output_path: str
    ) -> None:
        """Inpaint using OpenCV INPAINT_TELEA. Synchronous — run in executor."""
        img = cv2.imread(image_path)
        if img is None:
            raise FileNotFoundError(f"OpenCV could not read image: {image_path}")

        # Ensure mask dimensions match image
        if mask.shape[:2] != img.shape[:2]:
            mask = cv2.resize(mask, (img.shape[1], img.shape[0]))

        result = cv2.inpaint(img, mask, inpaintRadius=7, flags=cv2.INPAINT_TELEA)
        cv2.imwrite(output_path, result)
