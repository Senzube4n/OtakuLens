"""Chapter upload and management router."""

import asyncio
import logging
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database import async_session_factory, get_db
from backend.models import Chapter, Page, Series
from backend.schemas.chapter import ChapterDetailResponse, ChapterResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _natural_sort_key(filename: str) -> list:
    """Sort key that handles embedded numbers naturally (e.g. page2 < page10)."""
    parts = re.split(r"(\d+)", filename)
    result: list = []
    for part in parts:
        if part.isdigit():
            result.append(int(part))
        else:
            result.append(part.lower())
    return result


async def _run_pipeline(chapter_id: str, series_id: str) -> None:
    """Run the translation pipeline in background."""
    try:
        from backend.pipeline.orchestrator import PipelineOrchestrator

        orchestrator = PipelineOrchestrator(async_session_factory, settings)
        await orchestrator.process_chapter(chapter_id)
    except ImportError:
        logger.warning(
            "PipelineOrchestrator not available; chapter %s will stay pending",
            chapter_id,
        )
    except Exception:
        logger.exception("Pipeline failed for chapter %s", chapter_id)
        async with async_session_factory() as db:
            chapter = await db.get(Chapter, chapter_id)
            if chapter:
                chapter.status = "failed"
                chapter.error_message = "Pipeline crashed unexpectedly"
                await db.commit()


@router.post(
    "/series/{series_id}/chapters/upload",
    response_model=ChapterResponse,
    status_code=201,
)
async def upload_chapter(
    series_id: str,
    files: list[UploadFile] = File(...),
    chapter_number: float = Form(1.0),
    title: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    # Verify series exists
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    # Create chapter record
    chapter = Chapter(
        series_id=series_id,
        chapter_number=chapter_number,
        title=title,
        page_count=len(files),
        status="pending",
    )
    db.add(chapter)
    await db.flush()

    # Build upload directory
    upload_dir = settings.get_upload_dir() / series_id / chapter.id
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Sort files naturally by filename
    sorted_files = sorted(files, key=lambda f: _natural_sort_key(f.filename or ""))

    # Save files and create Page records
    pages: list[Page] = []
    for idx, upload_file in enumerate(sorted_files, start=1):
        filename = upload_file.filename or f"page_{idx:04d}.png"
        file_path = upload_dir / filename
        content = await upload_file.read()
        file_path.write_bytes(content)

        # Get image dimensions
        width, height = 0, 0
        try:
            from PIL import Image as PILImage
            img = PILImage.open(file_path)
            width, height = img.size
        except Exception:
            pass

        # Resolve path relative to base_dir for storage
        relative_path = file_path.relative_to(settings.base_dir)

        page = Page(
            chapter_id=chapter.id,
            page_number=idx,
            original_path=str(relative_path),
            width=width,
            height=height,
            status="pending",
        )
        db.add(page)
        pages.append(page)

    # Set cover image if series has none
    if not series.cover_image_path and pages:
        series.cover_image_path = pages[0].original_path

    await db.flush()
    await db.refresh(chapter)

    # Kick off pipeline in background
    asyncio.create_task(_run_pipeline(chapter.id, series_id))

    return ChapterResponse.model_validate(chapter, from_attributes=True)


@router.get(
    "/series/{series_id}/chapters",
    response_model=list[ChapterResponse],
)
async def list_chapters(series_id: str, db: AsyncSession = Depends(get_db)):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    stmt = (
        select(Chapter)
        .where(Chapter.series_id == series_id)
        .order_by(Chapter.chapter_number)
    )
    result = await db.execute(stmt)
    chapters = result.scalars().all()
    return [
        ChapterResponse.model_validate(c, from_attributes=True) for c in chapters
    ]


@router.get("/chapters/{chapter_id}", response_model=ChapterDetailResponse)
async def get_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return ChapterDetailResponse.model_validate(chapter, from_attributes=True)


@router.post("/chapters/{chapter_id}/retry", response_model=ChapterResponse)
async def retry_chapter(chapter_id: str, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.status != "failed":
        raise HTTPException(
            status_code=400, detail="Only failed chapters can be retried"
        )
    chapter.status = "pending"
    chapter.error_message = None
    await db.flush()
    await db.refresh(chapter)

    asyncio.create_task(_run_pipeline(chapter.id, chapter.series_id))

    return ChapterResponse.model_validate(chapter, from_attributes=True)
