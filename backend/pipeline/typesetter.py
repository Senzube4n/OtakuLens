"""Typesetting engine — renders translated text onto cleaned manga pages."""

import asyncio
import logging
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from backend.schemas.pipeline import OCRRegionResult, TranslatedRegion

logger = logging.getLogger(__name__)

# Languages that need CJK-capable fonts
CJK_LANGUAGES = {"ko", "ja", "zh"}

# Default font size bounds
DEFAULT_MAX_FONT_SIZE = 36
DEFAULT_MIN_FONT_SIZE = 8


class TypesettingEngine:
    """Renders translated text onto cleaned manga page images."""

    def __init__(self, font_dir: Path, target_language: str = "en"):
        self.font_dir = Path(font_dir)
        self.target_language = target_language
        self._font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def typeset(
        self,
        cleaned_image_path: Path,
        regions: list[TranslatedRegion],
        ocr_regions: list[OCRRegionResult],
        output_path: Path,
    ) -> Path:
        """Render translated text into the cleaned image and save the result."""
        cleaned_image_path = Path(cleaned_image_path)
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            self._typeset_sync,
            cleaned_image_path,
            regions,
            ocr_regions,
            output_path,
        )
        return output_path

    # ------------------------------------------------------------------
    # Synchronous typesetting (runs in executor)
    # ------------------------------------------------------------------

    def _typeset_sync(
        self,
        cleaned_image_path: Path,
        regions: list[TranslatedRegion],
        ocr_regions: list[OCRRegionResult],
        output_path: Path,
    ) -> None:
        img = Image.open(cleaned_image_path).convert("RGB")
        draw = ImageDraw.Draw(img)

        # Build a lookup of OCR regions by index for bbox info
        ocr_map = {i: r for i, r in enumerate(ocr_regions)}

        for region in regions:
            ocr_region = ocr_map.get(region.region_index)
            if ocr_region is None:
                logger.warning(
                    "No OCR region found for region_index=%d on page %d, skipping",
                    region.region_index,
                    region.page_number,
                )
                continue

            text = region.translated_text
            if not text or not text.strip():
                continue

            bbox = ocr_region.bbox  # (x, y, w, h)
            font_path = self._select_font(region.region_type)

            # Choose text and outline colors based on region type
            if region.region_type == "sfx":
                text_color = (0, 0, 0)
                outline_color = (255, 255, 255)
            elif region.region_type == "narration_box":
                text_color = (0, 0, 0)
                outline_color = (255, 255, 255)
            else:
                text_color = (0, 0, 0)
                outline_color = (255, 255, 255)

            self._render_text_in_bbox(
                draw=draw,
                text=text,
                bbox=bbox,
                font_path=font_path,
                max_font_size=DEFAULT_MAX_FONT_SIZE,
                min_font_size=DEFAULT_MIN_FONT_SIZE,
                color=text_color,
                outline_color=outline_color,
            )

        img.save(output_path, quality=95)
        logger.info("Typeset %d regions onto %s", len(regions), output_path.name)

    # ------------------------------------------------------------------
    # Text rendering
    # ------------------------------------------------------------------

    def _render_text_in_bbox(
        self,
        draw: ImageDraw.ImageDraw,
        text: str,
        bbox: tuple[int, int, int, int],
        font_path: Path | None,
        max_font_size: int,
        min_font_size: int,
        color: tuple[int, int, int],
        outline_color: tuple[int, int, int],
    ) -> int:
        """Auto-fit text into the bounding box by decrementing font size. Returns the font size used."""
        x, y, w, h = bbox

        if w < 4 or h < 4:
            return 0

        # Padding inside the bbox
        pad = 2
        max_w = w - 2 * pad
        max_h = h - 2 * pad
        if max_w < 4 or max_h < 4:
            return 0

        best_font_size = min_font_size
        best_wrapped = text

        for size in range(max_font_size, min_font_size - 1, -1):
            font = self._load_font(font_path, size)
            wrapped = self._word_wrap(text, font, max_w)

            # Measure the wrapped text block
            text_bbox = draw.multiline_textbbox((0, 0), wrapped, font=font)
            text_w = text_bbox[2] - text_bbox[0]
            text_h = text_bbox[3] - text_bbox[1]

            if text_w <= max_w and text_h <= max_h:
                best_font_size = size
                best_wrapped = wrapped
                break
        else:
            # Even min font doesn't fit; use it anyway
            font = self._load_font(font_path, min_font_size)
            best_wrapped = self._word_wrap(text, font, max_w)
            best_font_size = min_font_size

        font = self._load_font(font_path, best_font_size)

        # Center the text block within the bbox
        text_bbox = draw.multiline_textbbox((0, 0), best_wrapped, font=font)
        text_w = text_bbox[2] - text_bbox[0]
        text_h = text_bbox[3] - text_bbox[1]

        tx = x + pad + (max_w - text_w) // 2
        ty = y + pad + (max_h - text_h) // 2

        # Draw outline stroke for readability
        stroke_width = max(1, best_font_size // 12)
        draw.multiline_text(
            (tx, ty),
            best_wrapped,
            font=font,
            fill=color,
            align="center",
            stroke_width=stroke_width,
            stroke_fill=outline_color,
        )

        return best_font_size

    # ------------------------------------------------------------------
    # Word wrapping
    # ------------------------------------------------------------------

    def _word_wrap(self, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> str:
        """Wrap text to fit within max_width pixels using the given font."""
        if self.target_language in CJK_LANGUAGES:
            return self._word_wrap_cjk(text, font, max_width)

        # For Latin-script languages, use word-level wrapping
        words = text.split()
        if not words:
            return text

        lines: list[str] = []
        current_line = words[0]

        for word in words[1:]:
            test_line = current_line + " " + word
            bbox = font.getbbox(test_line)
            line_w = bbox[2] - bbox[0]
            if line_w <= max_width:
                current_line = test_line
            else:
                lines.append(current_line)
                current_line = word

        lines.append(current_line)
        return "\n".join(lines)

    def _word_wrap_cjk(self, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> str:
        """Character-level wrapping for CJK languages (no spaces between words)."""
        lines: list[str] = []
        current_line = ""

        for char in text:
            test_line = current_line + char
            bbox = font.getbbox(test_line)
            line_w = bbox[2] - bbox[0]
            if line_w <= max_width:
                current_line = test_line
            else:
                if current_line:
                    lines.append(current_line)
                current_line = char

        if current_line:
            lines.append(current_line)

        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Font selection
    # ------------------------------------------------------------------

    def _select_font(self, region_type: str) -> Path | None:
        """Select a font file based on region type and target language.

        Naming convention in font_dir:
          - speech.ttf / speech.otf  — speech bubbles
          - narration.ttf            — narration boxes
          - sfx.ttf                  — sound effects
          - default.ttf              — general fallback
          - For CJK: cjk_speech.ttf, cjk_narration.ttf, cjk_default.ttf, etc.
        """
        prefix = "cjk_" if self.target_language in CJK_LANGUAGES else ""

        # Map region types to font name stems
        type_map = {
            "speech_bubble": "speech",
            "thought_bubble": "speech",
            "narration_box": "narration",
            "sfx": "sfx",
            "sign": "default",
        }

        stem = type_map.get(region_type, "default")

        # Search order: prefixed specific -> prefixed default -> unprefixed specific -> unprefixed default
        candidates = [
            f"{prefix}{stem}",
            f"{prefix}default",
            stem,
            "default",
        ]

        for name in candidates:
            for ext in (".ttf", ".otf", ".TTF", ".OTF"):
                path = self.font_dir / f"{name}{ext}"
                if path.exists():
                    return path

        # Try any font file in the directory
        if self.font_dir.exists():
            for f in self.font_dir.iterdir():
                if f.suffix.lower() in (".ttf", ".otf"):
                    return f

        return None

    def _load_font(self, font_path: Path | None, size: int) -> ImageFont.FreeTypeFont:
        """Load a font at a given size, with caching. Falls back to Pillow default."""
        cache_key = (str(font_path), size)
        if cache_key in self._font_cache:
            return self._font_cache[cache_key]

        if font_path and font_path.exists():
            try:
                font = ImageFont.truetype(str(font_path), size)
                self._font_cache[cache_key] = font
                return font
            except Exception:
                logger.warning("Failed to load font %s at size %d", font_path, size)

        # Pillow default font (bitmap, ignores size but works as last resort)
        try:
            font = ImageFont.load_default(size=size)
        except TypeError:
            # Older Pillow versions don't accept size parameter
            font = ImageFont.load_default()
        self._font_cache[cache_key] = font
        return font
