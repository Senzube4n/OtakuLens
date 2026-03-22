"""Pre-translation analyzer — uses Claude to build a translation guide from OCR text."""

import json
import logging

import anthropic

from backend.config import SUPPORTED_LANGUAGES
from backend.schemas.pipeline import (
    AnalysisCharacter,
    AnalysisRelationship,
    AnalysisTerm,
    OCRPageResult,
    TranslationGuide,
)

logger = logging.getLogger(__name__)


class PreTranslationAnalyzer:
    """Analyzes all OCR'd text before translation to build a consistency guide."""

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def analyze(
        self,
        ocr_pages: list[OCRPageResult],
        source_lang: str,
        target_lang: str,
        existing_glossary: list[dict] | None = None,
        existing_characters: list[dict] | None = None,
    ) -> TranslationGuide:
        """Analyze all OCR text and produce a TranslationGuide for translation."""
        source_name = SUPPORTED_LANGUAGES.get(source_lang, {}).get("name", source_lang)
        target_name = SUPPORTED_LANGUAGES.get(target_lang, {}).get("name", target_lang)

        system_prompt = self._build_system_prompt(
            source_name, target_name, existing_glossary, existing_characters
        )
        user_message = self._build_user_message(ocr_pages, source_name, target_name)

        logger.info(
            "Running pre-translation analysis: %d pages, %s -> %s",
            len(ocr_pages),
            source_name,
            target_name,
        )

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text = response.content[0].text
        guide = self._parse_response(raw_text)

        logger.info(
            "Analysis complete: %d characters, %d terms, %d relationships",
            len(guide.characters),
            len(guide.terms),
            len(guide.relationships),
        )
        return guide

    # ------------------------------------------------------------------
    # Prompt construction
    # ------------------------------------------------------------------

    def _build_system_prompt(
        self,
        source_name: str,
        target_name: str,
        existing_glossary: list[dict] | None,
        existing_characters: list[dict] | None,
    ) -> str:
        parts = [
            f"You are an expert manga/comic translation analyst specializing in {source_name} to {target_name} translation.",
            "Your task is to analyze the raw OCR text from a comic chapter and produce a translation guide.",
            "",
            "Analyze the text for:",
            "1. CHARACTERS: Identify all speaking characters. For each, provide their name in both languages, personality traits, speech patterns, and a voice profile describing how they should sound in the target language.",
            "2. TERMS: Identify proper nouns, special terminology, skills, locations, titles, and culturally specific terms that need consistent translation. Provide the source term, your recommended translation, alternatives considered, and reasoning.",
            "3. RELATIONSHIPS: Identify how characters relate to each other (ally, enemy, mentor, romantic, family, rival, etc.).",
            "4. CHAPTER SUMMARY: A brief summary of what happens in this chapter.",
            "5. TONE: The overall tone (comedic, dramatic, action-heavy, slice-of-life, dark, etc.).",
            "6. CONTEXT NOTES: Any cultural context, idioms, wordplay, or nuances that translators should be aware of.",
            "",
            "Return ONLY valid JSON matching this schema (no markdown fences):",
            json.dumps(TranslationGuide.model_json_schema(), indent=2),
        ]

        if existing_glossary:
            parts.append("")
            parts.append("EXISTING GLOSSARY (maintain consistency with these established translations):")
            for entry in existing_glossary:
                parts.append(f"  - {entry.get('source_term', '')} -> {entry.get('translated_term', '')} (category: {entry.get('category', 'general')})")

        if existing_characters:
            parts.append("")
            parts.append("KNOWN CHARACTERS (maintain consistency with established characterization):")
            for char in existing_characters:
                parts.append(f"  - {char.get('name', '')} (original: {char.get('name_original', '')}): {char.get('description', '')}")

        return "\n".join(parts)

    def _build_user_message(
        self,
        ocr_pages: list[OCRPageResult],
        source_name: str,
        target_name: str,
    ) -> str:
        parts = [
            f"Below is all the OCR-detected text from a comic chapter ({source_name} source).",
            f"Analyze it and produce a translation guide for {target_name} translation.",
            "",
        ]

        for page in ocr_pages:
            parts.append(f"=== PAGE {page.page_number} ===")
            for i, region in enumerate(page.regions):
                parts.append(f"[Region {i}] (confidence: {region.confidence:.2f}): {region.text}")
            parts.append("")

        parts.append("Produce the analysis JSON now.")
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Response parsing
    # ------------------------------------------------------------------

    def _parse_response(self, raw_text: str) -> TranslationGuide:
        """Parse Claude's JSON response into a TranslationGuide."""
        text = raw_text.strip()

        # Strip markdown code fences if present
        if text.startswith("```"):
            first_newline = text.index("\n")
            last_fence = text.rfind("```")
            if last_fence > first_newline:
                text = text[first_newline + 1 : last_fence].strip()

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.error("Failed to parse analysis JSON, returning empty guide. Raw: %s", text[:500])
            return TranslationGuide()

        # Build guide from parsed data, tolerating partial/malformed fields
        characters = []
        for c in data.get("characters", []):
            try:
                characters.append(AnalysisCharacter(**c))
            except Exception:
                logger.warning("Skipping malformed character entry: %s", c)

        terms = []
        for t in data.get("terms", []):
            try:
                terms.append(AnalysisTerm(**t))
            except Exception:
                logger.warning("Skipping malformed term entry: %s", t)

        relationships = []
        for r in data.get("relationships", []):
            try:
                relationships.append(AnalysisRelationship(**r))
            except Exception:
                logger.warning("Skipping malformed relationship entry: %s", r)

        return TranslationGuide(
            characters=characters,
            terms=terms,
            relationships=relationships,
            chapter_summary=data.get("chapter_summary", ""),
            tone=data.get("tone", ""),
            context_notes=data.get("context_notes", ""),
        )
