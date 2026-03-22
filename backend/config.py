"""Application configuration loaded from environment variables."""

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


# Language code -> display name + OCR engine preference
SUPPORTED_LANGUAGES = {
    "ko": {"name": "Korean", "ocr": "easyocr", "easyocr_code": "ko"},
    "zh": {"name": "Chinese", "ocr": "paddleocr", "easyocr_code": "ch_sim", "paddle_lang": "ch"},
    "ja": {"name": "Japanese", "ocr": "easyocr", "easyocr_code": "ja"},
    "en": {"name": "English", "ocr": "easyocr", "easyocr_code": "en"},
    "es": {"name": "Spanish", "ocr": "easyocr", "easyocr_code": "es"},
    "fr": {"name": "French", "ocr": "easyocr", "easyocr_code": "fr"},
    "de": {"name": "German", "ocr": "easyocr", "easyocr_code": "de"},
    "pt": {"name": "Portuguese", "ocr": "easyocr", "easyocr_code": "pt"},
    "ru": {"name": "Russian", "ocr": "easyocr", "easyocr_code": "ru"},
    "ar": {"name": "Arabic", "ocr": "easyocr", "easyocr_code": "ar"},
    "hi": {"name": "Hindi", "ocr": "easyocr", "easyocr_code": "hi"},
    "bn": {"name": "Bengali", "ocr": "easyocr", "easyocr_code": "bn"},
    "id": {"name": "Indonesian", "ocr": "easyocr", "easyocr_code": "id"},
    "tl": {"name": "Tagalog", "ocr": "easyocr", "easyocr_code": "tl"},
    "it": {"name": "Italian", "ocr": "easyocr", "easyocr_code": "it"},
    "th": {"name": "Thai", "ocr": "easyocr", "easyocr_code": "th"},
    "vi": {"name": "Vietnamese", "ocr": "easyocr", "easyocr_code": "vi"},
    "tr": {"name": "Turkish", "ocr": "easyocr", "easyocr_code": "tr"},
    "pl": {"name": "Polish", "ocr": "easyocr", "easyocr_code": "pl"},
    "uk": {"name": "Ukrainian", "ocr": "easyocr", "easyocr_code": "uk"},
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database - use absolute path based on backend directory
    @property
    def database_url_resolved(self) -> str:
        if self.database_url.startswith("sqlite"):
            db_path = (Path(__file__).parent / "data" / "mangalens.db").resolve()
            db_path.parent.mkdir(parents=True, exist_ok=True)
            return f"sqlite+aiosqlite:///{db_path}"
        return self.database_url

    database_url: str = "sqlite+aiosqlite:///./data/mangalens.db"

    # API Keys
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"

    # Pipeline defaults
    default_source_lang: str = "ko"
    default_target_lang: str = "en"

    # Paths
    base_dir: Path = Path(__file__).parent
    upload_dir: Path = Path("data/uploads")
    output_dir: Path = Path("data/output")
    font_dir: Path = Path("data/fonts")

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]

    # Auto-download
    auto_download_interval_minutes: int = 30

    # MCP
    mcp_port: int = 8001

    def get_upload_dir(self) -> Path:
        p = self.base_dir / self.upload_dir
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_output_dir(self) -> Path:
        p = self.base_dir / self.output_dir
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_font_dir(self) -> Path:
        p = self.base_dir / self.font_dir
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
