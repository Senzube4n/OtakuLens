"""MCP tool definitions for MangaLens.

Every tool creates its own async database session via
``async_session_factory`` so that they can be invoked independently
from the FastAPI request lifecycle.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, select, or_

from backend.database import async_session_factory
from backend.models.chapter import Chapter
from backend.models.character import Character, Relationship
from backend.models.glossary import TermDecision, TranslationMemory
from backend.models.page import Page
from backend.models.reading_progress import ReadingProgress
from backend.models.series import Series
from backend.models.text_region import TextRegion

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _safe_json_loads(raw: str | None) -> list | dict | None:
    """Parse a JSON string, returning ``None`` on failure."""
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _series_to_dict(s: Series) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "title_original": s.title_original,
        "source_language": s.source_language,
        "target_language": s.target_language,
        "reading_direction": s.reading_direction,
        "cover_image_path": s.cover_image_path,
        "description": s.description,
        "source_url": s.source_url,
        "status": s.status,
        "auto_download": s.auto_download,
        "auto_translate": s.auto_translate,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _chapter_to_dict(c: Chapter) -> dict:
    return {
        "id": c.id,
        "series_id": c.series_id,
        "chapter_number": c.chapter_number,
        "title": c.title,
        "page_count": c.page_count,
        "status": c.status,
        "error_message": c.error_message,
        "summary": c.summary,
        "translated_at": c.translated_at.isoformat() if c.translated_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _character_to_dict(c: Character) -> dict:
    return {
        "id": c.id,
        "series_id": c.series_id,
        "name": c.name,
        "name_original": c.name_original,
        "aliases": _safe_json_loads(c.aliases),
        "description": c.description,
        "personality_traits": _safe_json_loads(c.personality_traits),
        "speech_patterns": _safe_json_loads(c.speech_patterns),
        "voice_profile": c.voice_profile,
        "first_appearance_chapter": c.first_appearance_chapter,
        "status": c.status,
        "status_as_of_chapter": c.status_as_of_chapter,
        "auto_generated": c.auto_generated,
    }


def _term_to_dict(t: TermDecision) -> dict:
    return {
        "id": t.id,
        "series_id": t.series_id,
        "source_term": t.source_term,
        "translated_term": t.translated_term,
        "alternatives": _safe_json_loads(t.alternatives),
        "reasoning": t.reasoning,
        "category": t.category,
        "confidence": t.confidence,
        "use_count": t.use_count,
        "last_used_chapter": t.last_used_chapter,
        "is_override": t.is_override,
    }


def _tm_to_dict(tm: TranslationMemory) -> dict:
    return {
        "id": tm.id,
        "series_id": tm.series_id,
        "source_text": tm.source_text,
        "translated_text": tm.translated_text,
        "source_language": tm.source_language,
        "target_language": tm.target_language,
        "chapter_id": tm.chapter_id,
        "context": tm.context,
        "use_count": tm.use_count,
    }


# ======================================================================
# Tool implementations — each returns JSON-serializable data
# ======================================================================


async def list_series() -> list[dict]:
    """List all manga/comic series with basic info."""
    async with async_session_factory() as session:
        result = await session.execute(
            select(Series).order_by(Series.updated_at.desc())
        )
        series_list = result.scalars().all()
        return [_series_to_dict(s) for s in series_list]


async def get_series(series_id: str) -> dict:
    """Get detailed information about a specific series, including
    its chapter list.
    """
    async with async_session_factory() as session:
        series = await session.get(Series, series_id)
        if series is None:
            return {"error": f"Series '{series_id}' not found"}

        result = await session.execute(
            select(Chapter)
            .where(Chapter.series_id == series_id)
            .order_by(Chapter.chapter_number.desc())
        )
        chapters = result.scalars().all()

        data = _series_to_dict(series)
        data["chapters"] = [_chapter_to_dict(c) for c in chapters]
        return data


async def translate_chapter(
    series_id: str,
    chapter_number: float,
    image_dir: str,
) -> dict:
    """Start translating a chapter from local image files.

    Creates the Chapter and Page records in the database and sets the
    chapter status to ``pending`` so the pipeline can pick it up.

    Parameters
    ----------
    series_id:
        ID of the series this chapter belongs to.
    chapter_number:
        Chapter number (e.g. 1.0, 12.5).
    image_dir:
        Absolute path to the directory containing page images.
    """
    image_path = Path(image_dir)
    if not image_path.is_dir():
        return {"error": f"Directory not found: {image_dir}"}

    image_extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".gif"}
    image_files = sorted(
        f for f in image_path.iterdir() if f.suffix.lower() in image_extensions
    )
    if not image_files:
        return {"error": f"No image files found in {image_dir}"}

    async with async_session_factory() as session:
        # Verify series exists
        series = await session.get(Series, series_id)
        if series is None:
            return {"error": f"Series '{series_id}' not found"}

        # Check for existing chapter
        result = await session.execute(
            select(Chapter).where(
                Chapter.series_id == series_id,
                Chapter.chapter_number == chapter_number,
            )
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            return {
                "error": f"Chapter {chapter_number} already exists",
                "chapter_id": existing.id,
                "status": existing.status,
            }

        # Create chapter
        chapter = Chapter(
            series_id=series_id,
            chapter_number=chapter_number,
            page_count=len(image_files),
            status="pending",
        )
        session.add(chapter)
        await session.flush()

        # Create page records
        for idx, img_file in enumerate(image_files, start=1):
            page = Page(
                chapter_id=chapter.id,
                page_number=idx,
                original_path=str(img_file),
            )
            session.add(page)

        await session.commit()

        return {
            "chapter_id": chapter.id,
            "series_id": series_id,
            "chapter_number": chapter_number,
            "page_count": len(image_files),
            "status": "pending",
            "message": "Chapter created and queued for translation.",
        }


async def get_chapter_status(chapter_id: str) -> dict:
    """Check the current pipeline progress for a chapter."""
    async with async_session_factory() as session:
        chapter = await session.get(Chapter, chapter_id)
        if chapter is None:
            return {"error": f"Chapter '{chapter_id}' not found"}

        # Count pages in each status
        result = await session.execute(
            select(Page.status, func.count(Page.id))
            .where(Page.chapter_id == chapter_id)
            .group_by(Page.status)
        )
        page_status_counts = {row[0]: row[1] for row in result.all()}

        return {
            "chapter_id": chapter.id,
            "series_id": chapter.series_id,
            "chapter_number": chapter.chapter_number,
            "status": chapter.status,
            "error_message": chapter.error_message,
            "page_count": chapter.page_count,
            "page_statuses": page_status_counts,
            "translated_at": (
                chapter.translated_at.isoformat() if chapter.translated_at else None
            ),
        }


async def get_glossary(series_id: str) -> list[dict]:
    """Get all glossary term decisions for a series."""
    async with async_session_factory() as session:
        result = await session.execute(
            select(TermDecision)
            .where(TermDecision.series_id == series_id)
            .order_by(TermDecision.category, TermDecision.source_term)
        )
        terms = result.scalars().all()
        return [_term_to_dict(t) for t in terms]


async def update_term(term_id: str, translated_term: str) -> dict:
    """Override the translated term for a glossary entry."""
    async with async_session_factory() as session:
        term = await session.get(TermDecision, term_id)
        if term is None:
            return {"error": f"Term '{term_id}' not found"}

        term.translated_term = translated_term
        term.is_override = True
        term.updated_at = datetime.now(timezone.utc)
        await session.commit()

        return _term_to_dict(term)


async def get_characters(
    series_id: str,
    max_chapter: int | None = None,
) -> list[dict]:
    """Get characters for a series, optionally gated by chapter number
    to avoid spoilers.

    Parameters
    ----------
    series_id:
        The series to query.
    max_chapter:
        If provided, only return characters whose
        ``first_appearance_chapter`` is at most this value.
    """
    async with async_session_factory() as session:
        stmt = select(Character).where(Character.series_id == series_id)

        if max_chapter is not None:
            # Include characters with no first_appearance_chapter set
            # (they are assumed safe) or those that appear at or before
            # the specified chapter.
            stmt = stmt.where(
                or_(
                    Character.first_appearance_chapter.is_(None),
                    Character.first_appearance_chapter <= max_chapter,
                )
            )

        stmt = stmt.order_by(Character.first_appearance_chapter.asc().nulls_first())
        result = await session.execute(stmt)
        characters = result.scalars().all()

        char_list = [_character_to_dict(c) for c in characters]

        # If spoiler-gated, strip status info that reveals future events
        if max_chapter is not None:
            for char_dict in char_list:
                sac = char_dict.get("status_as_of_chapter")
                if sac is not None and sac > max_chapter:
                    char_dict["status"] = "unknown"
                    char_dict["status_as_of_chapter"] = None

        return char_list


async def get_chapter_translation(chapter_id: str) -> dict:
    """Get all translated text regions for a chapter, organized by page."""
    async with async_session_factory() as session:
        chapter = await session.get(Chapter, chapter_id)
        if chapter is None:
            return {"error": f"Chapter '{chapter_id}' not found"}

        result = await session.execute(
            select(Page)
            .where(Page.chapter_id == chapter_id)
            .order_by(Page.page_number)
        )
        pages = result.scalars().all()

        pages_data: list[dict] = []
        for page in pages:
            result = await session.execute(
                select(TextRegion)
                .where(TextRegion.page_id == page.id)
                .order_by(TextRegion.bbox_y, TextRegion.bbox_x)
            )
            regions = result.scalars().all()

            pages_data.append(
                {
                    "page_number": page.page_number,
                    "page_id": page.id,
                    "status": page.status,
                    "original_path": page.original_path,
                    "translated_path": page.translated_path,
                    "regions": [
                        {
                            "id": r.id,
                            "bbox": [r.bbox_x, r.bbox_y, r.bbox_w, r.bbox_h],
                            "original_text": r.original_text,
                            "translated_text": r.translated_text,
                            "region_type": r.region_type,
                            "speaker": r.speaker,
                            "ocr_confidence": r.ocr_confidence,
                            "translation_note": r.translation_note,
                            "font_style": r.font_style,
                            "manually_reviewed": r.manually_reviewed,
                        }
                        for r in regions
                    ],
                }
            )

        return {
            "chapter_id": chapter.id,
            "series_id": chapter.series_id,
            "chapter_number": chapter.chapter_number,
            "status": chapter.status,
            "summary": chapter.summary,
            "pages": pages_data,
        }


async def search_translation_memory(
    series_id: str,
    query: str,
) -> list[dict]:
    """Search past translations for a series by source or target text.

    Uses a simple case-insensitive LIKE query.
    """
    async with async_session_factory() as session:
        like_pattern = f"%{query}%"
        result = await session.execute(
            select(TranslationMemory)
            .where(
                TranslationMemory.series_id == series_id,
                or_(
                    TranslationMemory.source_text.ilike(like_pattern),
                    TranslationMemory.translated_text.ilike(like_pattern),
                ),
            )
            .order_by(TranslationMemory.use_count.desc())
            .limit(50)
        )
        memories = result.scalars().all()
        return [_tm_to_dict(tm) for tm in memories]


async def get_reading_progress(series_id: str) -> dict:
    """Get the reader's current progress for a series."""
    async with async_session_factory() as session:
        result = await session.execute(
            select(ReadingProgress).where(
                ReadingProgress.series_id == series_id
            )
        )
        progress = result.scalar_one_or_none()

        if progress is None:
            return {
                "series_id": series_id,
                "last_chapter_number": 0.0,
                "last_page_number": 0,
                "total_chapters_read": 0,
                "completed": False,
                "started": False,
            }

        return {
            "series_id": series_id,
            "last_chapter_number": progress.last_chapter_number,
            "last_page_number": progress.last_page_number,
            "total_chapters_read": progress.total_chapters_read,
            "completed": progress.completed,
            "started": True,
            "last_read_at": progress.last_read_at.isoformat() if progress.last_read_at else None,
            "started_at": progress.started_at.isoformat() if progress.started_at else None,
        }


async def update_reading_progress(
    series_id: str,
    chapter: float,
    page: int = 0,
) -> dict:
    """Update the reader's progress for a series.

    Creates a new progress record if one doesn't exist yet.
    """
    async with async_session_factory() as session:
        result = await session.execute(
            select(ReadingProgress).where(
                ReadingProgress.series_id == series_id
            )
        )
        progress = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)

        if progress is None:
            progress = ReadingProgress(
                series_id=series_id,
                last_chapter_number=chapter,
                last_page_number=page,
                last_read_at=now,
                started_at=now,
                total_chapters_read=1,
            )
            session.add(progress)
        else:
            # Only bump total_chapters_read if we advanced to a new chapter
            if chapter > progress.last_chapter_number:
                chapters_advanced = int(chapter) - int(progress.last_chapter_number)
                progress.total_chapters_read += max(chapters_advanced, 1)
            progress.last_chapter_number = chapter
            progress.last_page_number = page
            progress.last_read_at = now

        await session.commit()

        return {
            "series_id": series_id,
            "last_chapter_number": progress.last_chapter_number,
            "last_page_number": progress.last_page_number,
            "total_chapters_read": progress.total_chapters_read,
            "completed": progress.completed,
            "last_read_at": progress.last_read_at.isoformat(),
        }
