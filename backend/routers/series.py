"""Series CRUD router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Chapter, Series
from backend.schemas.series import SeriesCreate, SeriesResponse, SeriesUpdate

router = APIRouter()


@router.post("/", response_model=SeriesResponse, status_code=201)
async def create_series(
    payload: SeriesCreate, db: AsyncSession = Depends(get_db)
):
    series = Series(**payload.model_dump())
    db.add(series)
    await db.flush()
    await db.refresh(series)
    return SeriesResponse.model_validate(series, from_attributes=True).model_copy(
        update={"chapter_count": 0}
    )


@router.get("/", response_model=list[SeriesResponse])
async def list_series(db: AsyncSession = Depends(get_db)):
    chapter_count_sub = (
        select(func.count(Chapter.id))
        .where(Chapter.series_id == Series.id)
        .correlate(Series)
        .scalar_subquery()
        .label("chapter_count")
    )
    stmt = select(Series, chapter_count_sub).order_by(Series.updated_at.desc())
    result = await db.execute(stmt)
    rows = result.all()
    out: list[SeriesResponse] = []
    for series, count in rows:
        resp = SeriesResponse.model_validate(series, from_attributes=True)
        resp.chapter_count = count or 0
        out.append(resp)
    return out


@router.get("/{series_id}", response_model=SeriesResponse)
async def get_series(series_id: str, db: AsyncSession = Depends(get_db)):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    count_stmt = select(func.count(Chapter.id)).where(
        Chapter.series_id == series_id
    )
    result = await db.execute(count_stmt)
    chapter_count = result.scalar() or 0
    resp = SeriesResponse.model_validate(series, from_attributes=True)
    resp.chapter_count = chapter_count
    return resp


@router.patch("/{series_id}", response_model=SeriesResponse)
async def update_series(
    series_id: str, payload: SeriesUpdate, db: AsyncSession = Depends(get_db)
):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(series, key, value)
    await db.flush()
    await db.refresh(series)
    count_stmt = select(func.count(Chapter.id)).where(
        Chapter.series_id == series_id
    )
    result = await db.execute(count_stmt)
    chapter_count = result.scalar() or 0
    resp = SeriesResponse.model_validate(series, from_attributes=True)
    resp.chapter_count = chapter_count
    return resp


@router.delete("/{series_id}", status_code=204)
async def delete_series(series_id: str, db: AsyncSession = Depends(get_db)):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    await db.delete(series)
    await db.flush()
