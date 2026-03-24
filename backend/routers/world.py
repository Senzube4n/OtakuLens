"""World entities and relationship map router."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Character, Relationship, Series, WorldEntity
from backend.schemas.world import (
    RelationshipMapEdge,
    RelationshipMapNode,
    RelationshipMapResponse,
    WorldEntityResponse,
)

router = APIRouter()


@router.get(
    "/series/{series_id}/world-entities",
    response_model=list[WorldEntityResponse],
)
async def list_world_entities(
    series_id: str,
    max_chapter: int | None = Query(None, description="Spoiler gate: only show entities appearing up to this chapter"),
    db: AsyncSession = Depends(get_db),
):
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    stmt = (
        select(WorldEntity)
        .where(WorldEntity.series_id == series_id)
        .order_by(WorldEntity.first_appearance_chapter.asc().nullslast(), WorldEntity.name)
    )
    if max_chapter is not None:
        stmt = stmt.where(
            (WorldEntity.first_appearance_chapter <= max_chapter)
            | (WorldEntity.first_appearance_chapter.is_(None))
        )
    result = await db.execute(stmt)
    entities = result.scalars().all()
    return [
        WorldEntityResponse.model_validate(e, from_attributes=True) for e in entities
    ]


@router.get(
    "/series/{series_id}/relationship-map",
    response_model=RelationshipMapResponse,
)
async def get_relationship_map(
    series_id: str,
    max_chapter: int | None = Query(None, description="Spoiler gate: filter by first appearance / started chapter"),
    db: AsyncSession = Depends(get_db),
):
    """Return the full relationship graph: nodes (characters + world entities) and edges (relationships)."""
    series = await db.get(Series, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    # --- Nodes from Characters ---
    char_stmt = (
        select(Character)
        .where(Character.series_id == series_id)
        .order_by(Character.first_appearance_chapter.asc().nullslast())
    )
    if max_chapter is not None:
        char_stmt = char_stmt.where(
            (Character.first_appearance_chapter <= max_chapter)
            | (Character.first_appearance_chapter.is_(None))
        )
    char_result = await db.execute(char_stmt)
    characters = char_result.scalars().all()

    nodes: list[RelationshipMapNode] = []
    node_ids: set[str] = set()

    for c in characters:
        nodes.append(
            RelationshipMapNode(
                id=c.id,
                name=c.name,
                name_original=c.name_original,
                entity_type="character",
                description=c.description,
                aliases=c.aliases,
                personality_traits=c.personality_traits,
                voice_profile=c.voice_profile,
                first_appearance_chapter=c.first_appearance_chapter,
                status=c.status,
            )
        )
        node_ids.add(c.id)

    # --- Nodes from WorldEntities ---
    we_stmt = (
        select(WorldEntity)
        .where(WorldEntity.series_id == series_id)
        .order_by(WorldEntity.first_appearance_chapter.asc().nullslast())
    )
    if max_chapter is not None:
        we_stmt = we_stmt.where(
            (WorldEntity.first_appearance_chapter <= max_chapter)
            | (WorldEntity.first_appearance_chapter.is_(None))
        )
    we_result = await db.execute(we_stmt)
    world_entities = we_result.scalars().all()

    for e in world_entities:
        nodes.append(
            RelationshipMapNode(
                id=e.id,
                name=e.name,
                name_original=e.name_original,
                entity_type=e.entity_type,
                description=e.description,
                aliases=e.aliases,
                properties=e.properties,
                first_appearance_chapter=e.first_appearance_chapter,
            )
        )
        node_ids.add(e.id)

    # --- Edges from Relationships ---
    rel_stmt = (
        select(Relationship)
        .where(Relationship.series_id == series_id)
        .order_by(Relationship.started_chapter.asc().nullslast())
    )
    if max_chapter is not None:
        rel_stmt = rel_stmt.where(
            (Relationship.started_chapter <= max_chapter)
            | (Relationship.started_chapter.is_(None))
        )
    rel_result = await db.execute(rel_stmt)
    relationships = rel_result.scalars().all()

    edges: list[RelationshipMapEdge] = []
    for r in relationships:
        # Only include edges where both nodes are visible
        if r.character_a_id in node_ids and r.character_b_id in node_ids:
            edges.append(
                RelationshipMapEdge(
                    id=r.id,
                    source=r.character_a_id,
                    target=r.character_b_id,
                    relationship_type=r.relationship_type,
                    description=r.description,
                    started_chapter=r.started_chapter,
                    ended_chapter=r.ended_chapter,
                )
            )

    return RelationshipMapResponse(nodes=nodes, edges=edges)
