"""Character and Relationship schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CharacterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    name: str
    name_original: str | None
    aliases: str | None  # JSON
    description: str | None
    personality_traits: str | None  # JSON
    speech_patterns: str | None  # JSON
    voice_profile: str | None
    first_appearance_chapter: int | None
    status: str
    auto_generated: bool
    created_at: datetime


class CharacterUpdate(BaseModel):
    name: str | None = None
    name_original: str | None = None
    description: str | None = None
    voice_profile: str | None = None


class RelationshipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    character_a_id: str
    character_b_id: str
    relationship_type: str
    description: str | None
    started_chapter: int | None
    ended_chapter: int | None
    auto_generated: bool
