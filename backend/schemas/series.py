"""Series schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SeriesCreate(BaseModel):
    title: str
    title_original: str | None = None
    source_language: str = "ko"
    target_language: str = "en"
    reading_direction: str = "ltr"
    description: str | None = None
    source_url: str | None = None
    auto_download: bool = False
    auto_translate: bool = False


class SeriesUpdate(BaseModel):
    title: str | None = None
    title_original: str | None = None
    source_language: str | None = None
    target_language: str | None = None
    reading_direction: str | None = None
    description: str | None = None
    source_url: str | None = None
    status: str | None = None
    auto_download: bool | None = None
    auto_translate: bool | None = None


class SeriesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    title_original: str | None
    source_language: str
    target_language: str
    reading_direction: str
    cover_image_path: str | None
    description: str | None
    source_url: str | None
    status: str
    auto_download: bool
    auto_translate: bool
    created_at: datetime
    updated_at: datetime
    chapter_count: int = 0
