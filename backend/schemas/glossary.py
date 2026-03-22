"""Glossary schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TermCreate(BaseModel):
    source_term: str
    translated_term: str
    category: str = "general"
    reasoning: str | None = None
    is_override: bool = True


class TermUpdate(BaseModel):
    translated_term: str | None = None
    category: str | None = None
    reasoning: str | None = None
    is_override: bool | None = None


class TermResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    source_term: str
    translated_term: str
    alternatives: str | None
    reasoning: str | None
    category: str
    confidence: float
    use_count: int
    last_used_chapter: int | None
    is_override: bool
    created_at: datetime


class TranslationMemoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    source_text: str
    translated_text: str
    source_language: str
    target_language: str
    context: str | None
    use_count: int
