"""Glossary (term decisions) and translation memory router."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Series, TermDecision, TranslationMemory
from backend.schemas.glossary import (
    TermCreate,
    TermResponse,
    TermUpdate,
    TranslationMemoryResponse,
)

router = APIRouter()


@router.get(
    "/series/{series_id}/glossary",
    response_model=list[TermResponse],
)
async def list_terms(
    series_id: str,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    stmt = (
        select(TermDecision)
        .where(TermDecision.series_id == series_id)
        .order_by(TermDecision.source_term)
    )
    if category:
        stmt = stmt.where(TermDecision.category == category)
    result = await db.execute(stmt)
    terms = result.scalars().all()
    return [TermResponse.model_validate(t, from_attributes=True) for t in terms]


@router.post(
    "/series/{series_id}/glossary",
    response_model=TermResponse,
    status_code=201,
)
async def create_term(
    series_id: str,
    payload: TermCreate,
    db: AsyncSession = Depends(get_db),
):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    term = TermDecision(
        series_id=series_id,
        **payload.model_dump(),
    )
    db.add(term)
    await db.flush()
    await db.refresh(term)
    return TermResponse.model_validate(term, from_attributes=True)


@router.patch("/glossary/{term_id}", response_model=TermResponse)
async def update_term(
    term_id: str,
    payload: TermUpdate,
    db: AsyncSession = Depends(get_db),
):
    term = await db.get(TermDecision, term_id)
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(term, key, value)
    await db.flush()
    await db.refresh(term)
    return TermResponse.model_validate(term, from_attributes=True)


@router.delete("/glossary/{term_id}", status_code=204)
async def delete_term(term_id: str, db: AsyncSession = Depends(get_db)):
    term = await db.get(TermDecision, term_id)
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
    await db.delete(term)
    await db.flush()


@router.get(
    "/series/{series_id}/translation-memory",
    response_model=list[TranslationMemoryResponse],
)
async def list_translation_memory(
    series_id: str, db: AsyncSession = Depends(get_db)
):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    stmt = (
        select(TranslationMemory)
        .where(TranslationMemory.series_id == series_id)
        .order_by(TranslationMemory.use_count.desc())
    )
    result = await db.execute(stmt)
    entries = result.scalars().all()
    return [
        TranslationMemoryResponse.model_validate(e, from_attributes=True)
        for e in entries
    ]
