"""Application settings router."""

from fastapi import APIRouter

from backend.config import settings
from backend.schemas.pipeline import SettingsResponse, SettingsUpdate

router = APIRouter()


@router.get("/", response_model=SettingsResponse)
async def get_settings():
    return SettingsResponse(
        has_api_key=bool(settings.anthropic_api_key),
        default_source_lang=settings.default_source_lang,
        default_target_lang=settings.default_target_lang,
        claude_model=settings.claude_model,
    )


@router.put("/", response_model=SettingsResponse)
async def update_settings(payload: SettingsUpdate):
    if payload.anthropic_api_key is not None:
        settings.anthropic_api_key = payload.anthropic_api_key
    if payload.default_source_lang is not None:
        settings.default_source_lang = payload.default_source_lang
    if payload.default_target_lang is not None:
        settings.default_target_lang = payload.default_target_lang

    return SettingsResponse(
        has_api_key=bool(settings.anthropic_api_key),
        default_source_lang=settings.default_source_lang,
        default_target_lang=settings.default_target_lang,
        claude_model=settings.claude_model,
    )
