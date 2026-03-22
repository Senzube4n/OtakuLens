"""Chapter schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ChapterCreate(BaseModel):
    chapter_number: float = 1.0
    title: str | None = None


class ChapterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    chapter_number: float
    title: str | None
    page_count: int
    status: str
    error_message: str | None
    summary: str | None
    created_at: datetime
    translated_at: datetime | None


class ChapterDetailResponse(ChapterResponse):
    translation_guide: str | None = None
