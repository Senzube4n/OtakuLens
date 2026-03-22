"""Pipeline orchestrator — coordinates the full manga translation pipeline."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from backend.config import Settings
from backend.models.chapter import Chapter
from backend.models.character import Character
from backend.models.glossary import TermDecision
from backend.models.page import Page
from backend.models.text_region import TextRegion
from backend.pipeline.analyzer import PreTranslationAnalyzer
from backend.pipeline.inpainter import InpaintingEngine
from backend.pipeline.ocr_engine import OCREngine
from backend.pipeline.progress import progress_broadcaster
from backend.pipeline.translator import TranslationEngine
from backend.pipeline.typesetter import TypesettingEngine
from backend.schemas.pipeline import (
    OCRPageResult,
    OCRRegionResult,
    PipelineProgress,
    TranslatedRegion,
    TranslationGuide,
)

logger = logging.getLogger(__name__)


class PipelineOrchestrator:
    """Coordinates OCR, analysis, translation, inpainting, and typesetting."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession], settings: Settings):
        self.session_factory = session_factory
        self.settings = settings

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    async def process_chapter(self, chapter_id: str) -> None:
        """Run the full translation pipeline for a chapter."""
        async with self.session_factory() as session:
            # Load chapter with pages eagerly
            stmt = (
                select(Chapter)
                .options(selectinload(Chapter.pages).selectinload(Page.text_regions))
                .where(Chapter.id == chapter_id)
            )
            result = await session.execute(stmt)
            chapter = result.scalar_one_or_none()

            if chapter is None:
                logger.error("Chapter %s not found", chapter_id)
                return

            # Load series for language info and glossary
            await session.refresh(chapter, ["series"])
            series = chapter.series
            source_lang = series.source_language
            target_lang = series.target_language

            pages = sorted(chapter.pages, key=lambda p: p.page_number)
            total_pages = len(pages)

            if total_pages == 0:
                logger.warning("Chapter %s has no pages", chapter_id)
                await self._set_status(session, chapter, "failed", "No pages found")
                return

            logger.info(
                "Starting pipeline for chapter %s: %d pages, %s -> %s",
                chapter_id, total_pages, source_lang, target_lang,
            )

            try:
                # ===== STEP 1: OCR =====
                await self._set_status(session, chapter, "ocr")
                await self._broadcast(chapter_id, "ocr", 0.0, "Starting OCR...", total_pages=total_pages)

                ocr_engine = OCREngine(source_language=source_lang)
                ocr_pages = await self._run_ocr(ocr_engine, pages, chapter_id, total_pages)

                # Save OCR results to DB
                await self._save_ocr_results(session, pages, ocr_pages)

                # ===== STEP 2: PRE-ANALYSIS =====
                await self._set_status(session, chapter, "analyzing")
                await self._broadcast(chapter_id, "analysis", 0.0, "Analyzing text for translation guide...")

                analyzer = PreTranslationAnalyzer(
                    api_key=self.settings.anthropic_api_key,
                    model=self.settings.claude_model,
                )

                # Fetch existing glossary and characters for consistency
                existing_glossary = await self._load_glossary(session, series.id)
                existing_characters = await self._load_characters(session, series.id)

                guide = await analyzer.analyze(
                    ocr_pages=ocr_pages,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    existing_glossary=existing_glossary,
                    existing_characters=existing_characters,
                )

                # Save guide to chapter
                chapter.translation_guide = guide.model_dump_json()
                chapter.summary = guide.chapter_summary
                await session.commit()

                await self._broadcast(chapter_id, "analysis", 1.0, "Analysis complete")

                # ===== STEP 3: TRANSLATION =====
                await self._set_status(session, chapter, "translating")
                await self._broadcast(chapter_id, "translation", 0.0, "Translating text...")

                translator = TranslationEngine(
                    api_key=self.settings.anthropic_api_key,
                    model=self.settings.claude_model,
                )

                translation_result = await translator.translate(
                    ocr_pages=ocr_pages,
                    guide=guide,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    glossary=existing_glossary,
                )

                # Save translations to DB
                await self._save_translations(session, pages, translation_result.regions)
                await self._broadcast(chapter_id, "translation", 1.0, "Translation complete")

                # ===== STEP 4: INPAINTING =====
                await self._set_status(session, chapter, "inpainting")
                await self._broadcast(chapter_id, "inpainting", 0.0, "Removing text from pages...", total_pages=total_pages)

                inpainter = InpaintingEngine()
                await self._run_inpainting(inpainter, pages, ocr_pages, chapter_id, total_pages, session)

                # ===== STEP 5: TYPESETTING =====
                await self._set_status(session, chapter, "typesetting")
                await self._broadcast(chapter_id, "typesetting", 0.0, "Rendering translated text...", total_pages=total_pages)

                typesetter = TypesettingEngine(
                    font_dir=self.settings.get_font_dir(),
                    target_language=target_lang,
                )
                await self._run_typesetting(
                    typesetter, pages, ocr_pages, translation_result.regions, chapter_id, total_pages, session
                )

                # ===== STEP 6: POST-PROCESSING =====
                await self._post_process(session, series.id, chapter, guide)

                await self._set_status(session, chapter, "completed")
                chapter.translated_at = datetime.now(timezone.utc)
                await session.commit()

                await self._broadcast(chapter_id, "completed", 1.0, "Pipeline complete!")
                logger.info("Pipeline completed for chapter %s", chapter_id)

            except Exception as exc:
                logger.exception("Pipeline failed for chapter %s: %s", chapter_id, exc)
                await self._set_status(session, chapter, "failed", str(exc))
                await self._broadcast(chapter_id, "failed", 0.0, f"Pipeline failed: {exc}")

    # ------------------------------------------------------------------
    # Pipeline step runners
    # ------------------------------------------------------------------

    async def _run_ocr(
        self, engine: OCREngine, pages: list[Page], chapter_id: str, total_pages: int
    ) -> list[OCRPageResult]:
        """Run OCR on all pages in parallel."""

        async def ocr_one(page: Page) -> OCRPageResult:
            regions = await engine.detect_text(Path(page.original_path))
            await self._broadcast(
                chapter_id, "ocr",
                (page.page_number) / total_pages,
                f"OCR page {page.page_number}/{total_pages}",
                current_page=page.page_number,
                total_pages=total_pages,
            )
            return OCRPageResult(page_number=page.page_number, regions=regions)

        tasks = [ocr_one(page) for page in pages]
        results = await asyncio.gather(*tasks)
        return list(results)

    async def _run_inpainting(
        self,
        engine: InpaintingEngine,
        pages: list[Page],
        ocr_pages: list[OCRPageResult],
        chapter_id: str,
        total_pages: int,
        session: AsyncSession,
    ) -> None:
        """Inpaint all pages in parallel."""
        ocr_map = {op.page_number: op.regions for op in ocr_pages}

        async def inpaint_one(page: Page) -> None:
            regions = ocr_map.get(page.page_number, [])
            original = Path(page.original_path)
            cleaned = original.parent / f"{original.stem}_cleaned{original.suffix}"
            await engine.remove_text(original, regions, cleaned)
            page.cleaned_path = str(cleaned)
            page.status = "cleaned"
            await self._broadcast(
                chapter_id, "inpainting",
                (page.page_number) / total_pages,
                f"Inpainted page {page.page_number}/{total_pages}",
                current_page=page.page_number,
                total_pages=total_pages,
            )

        tasks = [inpaint_one(page) for page in pages]
        await asyncio.gather(*tasks)
        await session.commit()

    async def _run_typesetting(
        self,
        engine: TypesettingEngine,
        pages: list[Page],
        ocr_pages: list[OCRPageResult],
        translated_regions: list[TranslatedRegion],
        chapter_id: str,
        total_pages: int,
        session: AsyncSession,
    ) -> None:
        """Typeset all pages in parallel."""
        ocr_map = {op.page_number: op.regions for op in ocr_pages}
        # Group translated regions by page
        tr_map: dict[int, list[TranslatedRegion]] = {}
        for tr in translated_regions:
            tr_map.setdefault(tr.page_number, []).append(tr)

        async def typeset_one(page: Page) -> None:
            page_regions = tr_map.get(page.page_number, [])
            page_ocr = ocr_map.get(page.page_number, [])
            if not page_regions:
                # No text to typeset; use cleaned image as final
                page.translated_path = page.cleaned_path
                page.status = "typeset"
                return

            cleaned = Path(page.cleaned_path) if page.cleaned_path else Path(page.original_path)
            original = Path(page.original_path)
            output = original.parent / f"{original.stem}_translated{original.suffix}"

            await engine.typeset(cleaned, page_regions, page_ocr, output)
            page.translated_path = str(output)
            page.status = "typeset"
            await self._broadcast(
                chapter_id, "typesetting",
                (page.page_number) / total_pages,
                f"Typeset page {page.page_number}/{total_pages}",
                current_page=page.page_number,
                total_pages=total_pages,
            )

        tasks = [typeset_one(page) for page in pages]
        await asyncio.gather(*tasks)
        await session.commit()

    # ------------------------------------------------------------------
    # DB persistence helpers
    # ------------------------------------------------------------------

    async def _save_ocr_results(
        self, session: AsyncSession, pages: list[Page], ocr_pages: list[OCRPageResult]
    ) -> None:
        """Persist OCR results as TextRegion rows."""
        ocr_map = {op.page_number: op.regions for op in ocr_pages}

        for page in pages:
            regions = ocr_map.get(page.page_number, [])
            # Clear existing text regions for this page
            for existing in list(page.text_regions):
                await session.delete(existing)

            for i, region in enumerate(regions):
                tr = TextRegion(
                    page_id=page.id,
                    bbox_x=region.bbox[0],
                    bbox_y=region.bbox[1],
                    bbox_w=region.bbox[2],
                    bbox_h=region.bbox[3],
                    polygon_points=json.dumps(region.polygon),
                    original_text=region.text,
                    ocr_confidence=region.confidence,
                )
                session.add(tr)
            page.status = "ocr_done"

        await session.commit()

    async def _save_translations(
        self, session: AsyncSession, pages: list[Page], translated_regions: list[TranslatedRegion]
    ) -> None:
        """Update TextRegion rows with translation data."""
        # Build lookup: page_number -> page
        page_map = {p.page_number: p for p in pages}

        for tr in translated_regions:
            page = page_map.get(tr.page_number)
            if page is None:
                continue

            # Match by region_index ordering
            sorted_regions = sorted(page.text_regions, key=lambda r: (r.bbox_y, r.bbox_x))
            if tr.region_index < len(sorted_regions):
                db_region = sorted_regions[tr.region_index]
                db_region.translated_text = tr.translated_text
                db_region.region_type = tr.region_type
                db_region.speaker = tr.speaker
                db_region.translation_note = tr.note
                db_region.font_style = tr.font_style

        await session.commit()

    async def _load_glossary(self, session: AsyncSession, series_id: str) -> list[dict]:
        """Load existing term decisions for the series."""
        stmt = select(TermDecision).where(TermDecision.series_id == series_id)
        result = await session.execute(stmt)
        terms = result.scalars().all()
        return [
            {
                "source_term": t.source_term,
                "translated_term": t.translated_term,
                "category": t.category,
                "alternatives": json.loads(t.alternatives) if t.alternatives else [],
            }
            for t in terms
        ]

    async def _load_characters(self, session: AsyncSession, series_id: str) -> list[dict]:
        """Load existing characters for the series."""
        stmt = select(Character).where(Character.series_id == series_id)
        result = await session.execute(stmt)
        chars = result.scalars().all()
        return [
            {
                "name": c.name,
                "name_original": c.name_original or "",
                "description": c.description or "",
                "personality_traits": json.loads(c.personality_traits) if c.personality_traits else [],
                "speech_patterns": json.loads(c.speech_patterns) if c.speech_patterns else [],
                "voice_profile": c.voice_profile or "",
            }
            for c in chars
        ]

    async def _post_process(
        self, session: AsyncSession, series_id: str, chapter: Chapter, guide: TranslationGuide
    ) -> None:
        """Update glossary and create/update characters from the analysis guide."""
        # Upsert term decisions
        for term in guide.terms:
            stmt = select(TermDecision).where(
                TermDecision.series_id == series_id,
                TermDecision.source_term == term.source_term,
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                existing.use_count += 1
                existing.last_used_chapter = int(chapter.chapter_number)
            else:
                td = TermDecision(
                    series_id=series_id,
                    source_term=term.source_term,
                    translated_term=term.translated_term,
                    alternatives=json.dumps(term.alternatives) if term.alternatives else None,
                    reasoning=term.reasoning,
                    category=term.category,
                    last_used_chapter=int(chapter.chapter_number),
                )
                session.add(td)

        # Upsert characters
        for char in guide.characters:
            stmt = select(Character).where(
                Character.series_id == series_id,
                Character.name == char.name,
            )
            result = await session.execute(stmt)
            existing_char = result.scalar_one_or_none()

            if existing_char:
                # Update with latest info if auto-generated
                if existing_char.auto_generated:
                    if char.description:
                        existing_char.description = char.description
                    if char.voice_profile:
                        existing_char.voice_profile = char.voice_profile
                    if char.personality_traits:
                        existing_char.personality_traits = json.dumps(char.personality_traits)
                    if char.speech_patterns:
                        existing_char.speech_patterns = json.dumps(char.speech_patterns)
            else:
                new_char = Character(
                    series_id=series_id,
                    name=char.name,
                    name_original=char.name_original,
                    description=char.description,
                    personality_traits=json.dumps(char.personality_traits) if char.personality_traits else None,
                    speech_patterns=json.dumps(char.speech_patterns) if char.speech_patterns else None,
                    voice_profile=char.voice_profile,
                    first_appearance_chapter=int(chapter.chapter_number),
                    auto_generated=True,
                )
                session.add(new_char)

        await session.commit()

    # ------------------------------------------------------------------
    # Utility helpers
    # ------------------------------------------------------------------

    async def _set_status(
        self, session: AsyncSession, chapter: Chapter, status: str, error_message: str | None = None
    ) -> None:
        """Update chapter status in the database."""
        chapter.status = status
        chapter.error_message = error_message
        await session.commit()

    async def _broadcast(
        self,
        chapter_id: str,
        stage: str,
        progress: float,
        message: str,
        current_page: int | None = None,
        total_pages: int | None = None,
    ) -> None:
        """Send a progress update via WebSocket."""
        await progress_broadcaster.broadcast(
            chapter_id,
            PipelineProgress(
                chapter_id=chapter_id,
                stage=stage,
                progress=min(progress, 1.0),
                message=message,
                current_page=current_page,
                total_pages=total_pages,
            ),
        )
