"""World entity schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WorldEntityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    entity_type: str
    name: str
    name_original: str | None
    aliases: str | None
    description: str | None
    properties: str | None
    first_appearance_chapter: int | None
    hierarchy_parent_id: str | None
    auto_generated: bool
    created_at: datetime


class RelationshipMapNode(BaseModel):
    """A node in the relationship graph (character or world entity)."""
    id: str
    name: str
    name_original: str | None = None
    entity_type: str  # character, item, location, faction, concept, etc.
    description: str | None = None
    aliases: str | None = None
    personality_traits: str | None = None
    voice_profile: str | None = None
    properties: str | None = None
    first_appearance_chapter: int | None = None
    status: str | None = None


class RelationshipMapEdge(BaseModel):
    """An edge in the relationship graph."""
    id: str
    source: str  # node id
    target: str  # node id
    relationship_type: str
    description: str | None = None
    started_chapter: int | None = None
    ended_chapter: int | None = None


class RelationshipMapResponse(BaseModel):
    """Full graph data for the 3D visualization."""
    nodes: list[RelationshipMapNode]
    edges: list[RelationshipMapEdge]
