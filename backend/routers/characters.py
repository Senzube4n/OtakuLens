"""Character and relationship router."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Character, Relationship, Series
from backend.schemas.character import (
    CharacterResponse,
    CharacterUpdate,
    RelationshipResponse,
)

router = APIRouter()


@router.get(
    "/series/{series_id}/characters",
    response_model=list[CharacterResponse],
)
async def list_characters(
    series_id: str,
    max_chapter: int | None = Query(None, description="Spoiler gate: only show characters appearing up to this chapter"),
    db: AsyncSession = Depends(get_db),
):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    stmt = (
        select(Character)
        .where(Character.series_id == series_id)
        .order_by(Character.first_appearance_chapter.asc().nullslast(), Character.name)
    )
    if max_chapter is not None:
        stmt = stmt.where(
            (Character.first_appearance_chapter <= max_chapter)
            | (Character.first_appearance_chapter.is_(None))
        )
    result = await db.execute(stmt)
    characters = result.scalars().all()
    return [
        CharacterResponse.model_validate(c, from_attributes=True) for c in characters
    ]


@router.get("/characters/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: str, db: AsyncSession = Depends(get_db)
):
    character = await db.get(Character, character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    return CharacterResponse.model_validate(character, from_attributes=True)


@router.patch("/characters/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: str,
    payload: CharacterUpdate,
    db: AsyncSession = Depends(get_db),
):
    character = await db.get(Character, character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(character, key, value)
    await db.flush()
    await db.refresh(character)
    return CharacterResponse.model_validate(character, from_attributes=True)


@router.get(
    "/series/{series_id}/relationships",
    response_model=list[RelationshipResponse],
)
async def list_relationships(
    series_id: str,
    max_chapter: int | None = Query(None, description="Only show relationships started up to this chapter"),
    db: AsyncSession = Depends(get_db),
):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    stmt = (
        select(Relationship)
        .where(Relationship.series_id == series_id)
        .order_by(Relationship.started_chapter.asc().nullslast())
    )
    if max_chapter is not None:
        stmt = stmt.where(
            (Relationship.started_chapter <= max_chapter)
            | (Relationship.started_chapter.is_(None))
        )
    result = await db.execute(stmt)
    relationships = result.scalars().all()
    return [
        RelationshipResponse.model_validate(r, from_attributes=True)
        for r in relationships
    ]
