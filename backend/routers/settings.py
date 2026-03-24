"""Application settings router."""

from fastapi import APIRouter

from backend.config import settings, should_use_gpu, detect_gpu_available
from backend.schemas.pipeline import SettingsResponse, SettingsUpdate

router = APIRouter()


def _build_settings_response() -> SettingsResponse:
    return SettingsResponse(
        has_api_key=bool(settings.anthropic_api_key),
        default_source_lang=settings.default_source_lang,
        default_target_lang=settings.default_target_lang,
        claude_model=settings.claude_model,
        compute_mode=settings.compute_mode,
        gpu_available=detect_gpu_available(),
        using_gpu=should_use_gpu(),
    )


@router.get("/", response_model=SettingsResponse)
async def get_settings():
    return _build_settings_response()


@router.put("/", response_model=SettingsResponse)
async def update_settings(payload: SettingsUpdate):
    if payload.anthropic_api_key is not None:
        settings.anthropic_api_key = payload.anthropic_api_key
    if payload.default_source_lang is not None:
        settings.default_source_lang = payload.default_source_lang
    if payload.default_target_lang is not None:
        settings.default_target_lang = payload.default_target_lang
    if payload.compute_mode is not None:
        if payload.compute_mode not in ("auto", "cpu", "gpu"):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="compute_mode must be 'auto', 'cpu', or 'gpu'")
        settings.compute_mode = payload.compute_mode

    return _build_settings_response()
