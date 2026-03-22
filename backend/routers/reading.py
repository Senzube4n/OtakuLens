"""Reading progress and recap router."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Chapter, ChapterSummary, ReadingProgress, Series

router = APIRouter()


class ProgressUpdate(BaseModel):
    last_chapter_number: float
    last_page_number: int = 0
    completed: bool = False


class ProgressResponse(BaseModel):
    series_id: str
    last_chapter_number: float
    last_page_number: int
    last_read_at: datetime
    started_at: datetime
    completed: bool
    total_chapters_read: int


class ChapterSummaryOut(BaseModel):
    chapter_number: float
    title: str | None
    summary: str
    key_events: str | None
    new_characters: str | None
    new_terms: str | None


class RecapResponse(BaseModel):
    series_id: str
    up_to_chapter: float
    summaries: list[ChapterSummaryOut]


@router.get("/{series_id}/progress", response_model=ProgressResponse)
async def get_progress(series_id: str, db: AsyncSession = Depends(get_db)):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    stmt = select(ReadingProgress).where(
        ReadingProgress.series_id == series_id
    )
    result = await db.execute(stmt)
    progress = result.scalar_one_or_none()
    if not progress:
        raise HTTPException(status_code=404, detail="No reading progress found")

    return ProgressResponse(
        series_id=progress.series_id,
        last_chapter_number=progress.last_chapter_number,
        last_page_number=progress.last_page_number,
        last_read_at=progress.last_read_at,
        started_at=progress.started_at,
        completed=progress.completed,
        total_chapters_read=progress.total_chapters_read,
    )


@router.put("/{series_id}/progress", response_model=ProgressResponse)
async def update_progress(
    series_id: str,
    payload: ProgressUpdate,
    db: AsyncSession = Depends(get_db),
):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    stmt = select(ReadingProgress).where(
        ReadingProgress.series_id == series_id
    )
    result = await db.execute(stmt)
    progress = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if progress is None:
        progress = ReadingProgress(
            series_id=series_id,
            last_chapter_number=payload.last_chapter_number,
            last_page_number=payload.last_page_number,
            completed=payload.completed,
            last_read_at=now,
            started_at=now,
            total_chapters_read=int(payload.last_chapter_number),
        )
        db.add(progress)
    else:
        # Update chapters-read count if advancing
        if payload.last_chapter_number > progress.last_chapter_number:
            chapters_advanced = int(payload.last_chapter_number) - int(
                progress.last_chapter_number
            )
            progress.total_chapters_read += max(chapters_advanced, 0)
        progress.last_chapter_number = payload.last_chapter_number
        progress.last_page_number = payload.last_page_number
        progress.completed = payload.completed
        progress.last_read_at = now

    await db.flush()
    await db.refresh(progress)

    return ProgressResponse(
        series_id=progress.series_id,
        last_chapter_number=progress.last_chapter_number,
        last_page_number=progress.last_page_number,
        last_read_at=progress.last_read_at,
        started_at=progress.started_at,
        completed=progress.completed,
        total_chapters_read=progress.total_chapters_read,
    )


@router.get("/{series_id}/recap", response_model=RecapResponse)
async def get_recap(series_id: str, db: AsyncSession = Depends(get_db)):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    # Determine current reading position
    prog_stmt = select(ReadingProgress).where(
        ReadingProgress.series_id == series_id
    )
    prog_result = await db.execute(prog_stmt)
    progress = prog_result.scalar_one_or_none()

    up_to_chapter = progress.last_chapter_number if progress else 0.0

    # Get chapter summaries up to current position
    stmt = (
        select(Chapter, ChapterSummary)
        .join(ChapterSummary, ChapterSummary.chapter_id == Chapter.id)
        .where(Chapter.series_id == series_id)
        .where(Chapter.chapter_number <= up_to_chapter)
        .order_by(Chapter.chapter_number)
    )
    result = await db.execute(stmt)
    rows = result.all()

    summaries = [
        ChapterSummaryOut(
            chapter_number=chapter.chapter_number,
            title=chapter.title,
            summary=cs.summary,
            key_events=cs.key_events,
            new_characters=cs.new_characters,
            new_terms=cs.new_terms,
        )
        for chapter, cs in rows
    ]

    return RecapResponse(
        series_id=series_id,
        up_to_chapter=up_to_chapter,
        summaries=summaries,
    )
