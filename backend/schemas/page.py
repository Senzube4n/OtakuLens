"""Page schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chapter_id: str
    page_number: int
    original_path: str
    cleaned_path: str | None
    translated_path: str | None
    width: int
    height: int
    status: str
    created_at: datetime


class PageDetailResponse(PageResponse):
    text_regions: list["TextRegionResponse"] = []


from backend.schemas.text_region import TextRegionResponse  # noqa: E402

PageDetailResponse.model_rebuild()
