"""Translation engine — uses Claude to translate all text regions with context consistency."""

import json
import logging

import anthropic

from backend.config import SUPPORTED_LANGUAGES
from backend.schemas.pipeline import (
    OCRPageResult,
    TranslatedRegion,
    TranslationGuide,
    TranslationResult,
)

logger = logging.getLogger(__name__)

# Approximate text expansion ratios when translating between script families.
# CJK characters encode more meaning per character than Latin scripts.
EXPANSION_RATIOS = {
    ("cjk", "latin"): 1.8,
    ("cjk", "cyrillic"): 1.6,
    ("cjk", "arabic"): 1.4,
    ("latin", "cjk"): 0.6,
    ("cyrillic", "cjk"): 0.65,
    ("arabic", "cjk"): 0.7,
    ("latin", "latin"): 1.0,
    ("cjk", "cjk"): 1.0,
}

SCRIPT_FAMILY = {
    "ko": "cjk", "ja": "cjk", "zh": "cjk",
    "en": "latin", "es": "latin", "fr": "latin", "de": "latin",
    "pt": "latin", "it": "latin", "id": "latin", "tl": "latin",
    "tr": "latin", "pl": "latin", "vi": "latin",
    "ru": "latin", "uk": "cyrillic",
    "ar": "arabic", "hi": "latin", "bn": "latin", "th": "latin",
}


class TranslationEngine:
    """Translates OCR text using Claude with full context from the translation guide."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def translate(
        self,
        ocr_pages: list[OCRPageResult],
        guide: TranslationGuide,
        source_lang: str,
        target_lang: str,
        glossary: list[dict] | None = None,
    ) -> TranslationResult:
        """Translate all text regions across all pages in one Claude call."""
        source_name = SUPPORTED_LANGUAGES.get(source_lang, {}).get("name", source_lang)
        target_name = SUPPORTED_LANGUAGES.get(target_lang, {}).get("name", target_lang)

        source_script = SCRIPT_FAMILY.get(source_lang, "latin")
        target_script = SCRIPT_FAMILY.get(target_lang, "latin")
        expansion = EXPANSION_RATIOS.get((source_script, target_script), 1.0)

        system_prompt = self._build_system_prompt(
            source_name, target_name, guide, glossary, expansion
        )
        user_message = self._build_user_message(ocr_pages, source_name, target_name)

        total_regions = sum(len(p.regions) for p in ocr_pages)
        logger.info(
            "Translating %d regions across %d pages: %s -> %s",
            total_regions,
            len(ocr_pages),
            source_name,
            target_name,
        )

        # Batch if too many regions — each region needs ~80 tokens of JSON output
        # Claude max output is ~8K tokens, so batch at ~80 regions
        BATCH_SIZE = 60
        total_regions = sum(len(p.regions) for p in ocr_pages)

        if total_regions <= BATCH_SIZE:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=16384,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            raw_text = response.content[0].text
            result = self._parse_response(raw_text, ocr_pages)
        else:
            # Split pages into batches
            all_translated = []
            batches = []
            current_batch = []
            current_count = 0

            for page in ocr_pages:
                current_batch.append(page)
                current_count += len(page.regions)
                if current_count >= BATCH_SIZE:
                    batches.append(current_batch)
                    current_batch = []
                    current_count = 0
            if current_batch:
                batches.append(current_batch)

            logger.info("Splitting %d regions into %d batches", total_regions, len(batches))

            for batch_idx, batch in enumerate(batches):
                batch_msg = self._build_user_message(batch, source_name, target_name)
                batch_regions = sum(len(p.regions) for p in batch)

                logger.info("Translating batch %d/%d: %d regions", batch_idx + 1, len(batches), batch_regions)
                response = await self.client.messages.create(
                    model=self.model,
                    max_tokens=16384,
                    system=system_prompt,
                    messages=[{"role": "user", "content": batch_msg}],
                )
                raw_text = response.content[0].text
                batch_result = self._parse_response(raw_text, batch)
                all_translated.extend(batch_result.regions)

            from backend.schemas.pipeline import TranslationResult
            result = TranslationResult(regions=all_translated)

        logger.info("Translation complete: %d translated regions", len(result.regions))
        return result

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------

    def _build_system_prompt(
        self,
        source_name: str,
        target_name: str,
        guide: TranslationGuide,
        glossary: list[dict] | None,
        expansion_ratio: float,
    ) -> str:
        parts = [
            f"You are an expert {source_name}-to-{target_name} manga/comic translator.",
            "Translate all text regions provided while maintaining narrative consistency.",
            "",
            "TRANSLATION RULES:",
            f"1. Translate from {source_name} to natural, fluent {target_name}.",
            "2. Preserve the speaker's unique voice, tone, and personality.",
            "3. Adapt idioms and cultural references naturally for the target audience.",
            "4. Sound effects (SFX) should be transliterated or adapted appropriately.",
            f"5. Text expansion ratio is approximately {expansion_ratio:.1f}x. Keep translations concise to fit in speech bubbles.",
            "6. Maintain consistency with the glossary and character voices below.",
            "7. For each region, classify its type: speech_bubble, narration_box, sfx, sign, or thought_bubble.",
            "8. Identify the speaker if possible.",
            "",
        ]

        # Character voice profiles
        if guide.characters:
            parts.append("CHARACTER VOICE PROFILES:")
            for char in guide.characters:
                voice = char.voice_profile or "natural speech"
                patterns = ", ".join(char.speech_patterns) if char.speech_patterns else "none specified"
                parts.append(
                    f"  - {char.name} ({char.name_original}): Voice: {voice}. Patterns: {patterns}."
                )
            parts.append("")

        # Glossary
        if guide.terms:
            parts.append("TERM GLOSSARY (use these translations consistently):")
            for term in guide.terms:
                parts.append(f"  - {term.source_term} -> {term.translated_term}")
            parts.append("")

        if glossary:
            parts.append("SERIES GLOSSARY (established translations from previous chapters):")
            for entry in glossary:
                parts.append(
                    f"  - {entry.get('source_term', '')} -> {entry.get('translated_term', '')} ({entry.get('category', 'general')})"
                )
            parts.append("")

        if guide.context_notes:
            parts.append(f"CONTEXT NOTES: {guide.context_notes}")
            parts.append("")

        if guide.tone:
            parts.append(f"CHAPTER TONE: {guide.tone}")
            parts.append("")

        parts.extend([
            "OUTPUT FORMAT: Return ONLY a JSON array (no markdown fences) of objects, each with:",
            '  {"page_number": int, "region_index": int, "original_text": str, "translated_text": str, "speaker": str|null, "region_type": str, "note": str|null, "font_style": str}',
            "",
            'font_style must be one of: "normal", "bold", "italic", "bold_italic".',
            'region_type must be one of: "speech_bubble", "narration_box", "sfx", "sign", "thought_bubble".',
        ])

        return "\n".join(parts)

    def _build_user_message(
        self,
        ocr_pages: list[OCRPageResult],
        source_name: str,
        target_name: str,
    ) -> str:
        parts = [
            f"Translate the following {source_name} text regions to {target_name}.",
            "",
        ]

        for page in ocr_pages:
            parts.append(f"=== PAGE {page.page_number} ===")
            for i, region in enumerate(page.regions):
                parts.append(f"[P{page.page_number}R{i}] {region.text}")
            parts.append("")

        parts.append("Produce the translation JSON array now.")
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Response parsing
    # ------------------------------------------------------------------

    def _parse_response(
        self, raw_text: str, ocr_pages: list[OCRPageResult]
    ) -> TranslationResult:
        """Parse Claude's JSON response into a TranslationResult."""
        text = raw_text.strip()

        # Strip markdown code fences
        if text.startswith("```"):
            first_newline = text.index("\n")
            last_fence = text.rfind("```")
            if last_fence > first_newline:
                text = text[first_newline + 1 : last_fence].strip()

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.error("Failed to parse translation JSON. Raw: %s", text[:500])
            return self._fallback_result(ocr_pages)

        if not isinstance(data, list):
            # Might be wrapped in an object
            if isinstance(data, dict) and "regions" in data:
                data = data["regions"]
            else:
                logger.error("Unexpected translation response structure")
                return self._fallback_result(ocr_pages)

        regions = []
        for item in data:
            try:
                regions.append(TranslatedRegion(
                    page_number=item["page_number"],
                    region_index=item["region_index"],
                    original_text=item.get("original_text", ""),
                    translated_text=item.get("translated_text", ""),
                    speaker=item.get("speaker"),
                    region_type=item.get("region_type", "speech_bubble"),
                    note=item.get("note"),
                    font_style=item.get("font_style", "normal"),
                ))
            except Exception:
                logger.warning("Skipping malformed translation entry: %s", item)

        return TranslationResult(regions=regions)

    @staticmethod
    def _fallback_result(ocr_pages: list[OCRPageResult]) -> TranslationResult:
        """Create a fallback result that passes through original text when parsing fails."""
        regions = []
        for page in ocr_pages:
            for i, region in enumerate(page.regions):
                regions.append(TranslatedRegion(
                    page_number=page.page_number,
                    region_index=i,
                    original_text=region.text,
                    translated_text=region.text,
                    region_type="speech_bubble",
                    note="Translation parsing failed — original text preserved",
                ))
        return TranslationResult(regions=regions)
