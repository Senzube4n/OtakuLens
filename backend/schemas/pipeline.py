"""Pipeline schemas — progress, OCR results, translation types."""

from pydantic import BaseModel


class PipelineProgress(BaseModel):
    chapter_id: str
    stage: str  # ocr, analysis, translation, inpainting, typesetting, completed, failed
    progress: float  # 0.0 - 1.0
    message: str
    current_page: int | None = None
    total_pages: int | None = None


class OCRRegionResult(BaseModel):
    bbox: tuple[int, int, int, int]  # x, y, w, h
    polygon: list[list[int]]  # 4-point polygon
    text: str
    confidence: float


class OCRPageResult(BaseModel):
    page_number: int
    regions: list[OCRRegionResult]


class AnalysisCharacter(BaseModel):
    name: str
    name_original: str
    description: str = ""
    personality_traits: list[str] = []
    speech_patterns: list[str] = []
    voice_profile: str = ""


class AnalysisTerm(BaseModel):
    source_term: str
    translated_term: str
    alternatives: list[str] = []
    reasoning: str = ""
    category: str = "general"


class AnalysisRelationship(BaseModel):
    character_a: str
    character_b: str
    relationship_type: str
    description: str = ""


class TranslationGuide(BaseModel):
    characters: list[AnalysisCharacter] = []
    terms: list[AnalysisTerm] = []
    relationships: list[AnalysisRelationship] = []
    chapter_summary: str = ""
    tone: str = ""
    context_notes: str = ""


class TranslatedRegion(BaseModel):
    page_number: int
    region_index: int
    original_text: str
    translated_text: str
    speaker: str | None = None
    region_type: str = "speech_bubble"
    note: str | None = None
    font_style: str = "normal"


class TranslationResult(BaseModel):
    regions: list[TranslatedRegion]


class SettingsUpdate(BaseModel):
    anthropic_api_key: str | None = None
    default_source_lang: str | None = None
    default_target_lang: str | None = None
    compute_mode: str | None = None  # "auto", "cpu", or "gpu"


class SettingsResponse(BaseModel):
    has_api_key: bool
    default_source_lang: str
    default_target_lang: str
    claude_model: str
    compute_mode: str
    gpu_available: bool
    using_gpu: bool
