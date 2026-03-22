"""TextRegion schemas."""

from pydantic import BaseModel, ConfigDict


class TextRegionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    page_id: str
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int
    original_text: str
    translated_text: str | None
    region_type: str
    speaker: str | None
    ocr_confidence: float
    translation_note: str | None
    font_size: int | None
    font_style: str | None
    manually_reviewed: bool


class TextRegionUpdate(BaseModel):
    translated_text: str | None = None
    region_type: str | None = None
    speaker: str | None = None
    manually_reviewed: bool | None = None
