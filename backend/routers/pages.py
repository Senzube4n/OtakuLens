"""Page and image serving router."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.config import settings
from backend.database import get_db
from backend.models import Chapter, Page
from backend.schemas.page import PageDetailResponse, PageResponse

router = APIRouter()


@router.get(
    "/chapters/{chapter_id}/pages",
    response_model=list[PageResponse],
)
async def list_pages(chapter_id: str, db: AsyncSession = Depends(get_db)):
    chapter = await db.get(Chapter, chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    stmt = (
        select(Page)
        .where(Page.chapter_id == chapter_id)
        .order_by(Page.page_number)
    )
    result = await db.execute(stmt)
    pages = result.scalars().all()
    return [PageResponse.model_validate(p, from_attributes=True) for p in pages]


@router.get("/pages/{page_id}", response_model=PageDetailResponse)
async def get_page(page_id: str, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Page)
        .options(selectinload(Page.text_regions))
        .where(Page.id == page_id)
    )
    result = await db.execute(stmt)
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return PageDetailResponse.model_validate(page, from_attributes=True)


@router.get("/pages/{page_id}/image/{variant}")
async def get_page_image(
    page_id: str,
    variant: str,
    db: AsyncSession = Depends(get_db),
):
    if variant not in ("original", "cleaned", "translated"):
        raise HTTPException(
            status_code=400,
            detail="Variant must be one of: original, cleaned, translated",
        )

    page = await db.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    path_map = {
        "original": page.original_path,
        "cleaned": page.cleaned_path,
        "translated": page.translated_path,
    }
    relative_path = path_map[variant]
    if not relative_path:
        raise HTTPException(
            status_code=404,
            detail=f"{variant.capitalize()} image not available",
        )

    file_path = settings.base_dir / relative_path
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    # Determine media type from extension
    suffix = file_path.suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
    }
    media_type = media_types.get(suffix, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
    )
