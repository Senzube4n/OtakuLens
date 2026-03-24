"""MangaLens FastAPI application."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.database import init_db
from backend.pipeline.progress import progress_broadcaster


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables and ensure directories exist
    await init_db()
    settings.get_upload_dir()
    settings.get_output_dir()
    settings.get_font_dir()

    # Start auto-download scheduler
    from backend.connectors.registry import connector_registry
    connector_registry.register_defaults()
    connector_registry.start_scheduler()

    yield

    # Cleanup
    connector_registry.stop_scheduler()


app = FastAPI(title="MangaLens", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from backend.routers import (  # noqa: E402
    chapters,
    characters,
    connectors,
    glossary,
    pages,
    reading,
    series,
    settings as settings_router,
)

app.include_router(series.router, prefix="/api/series", tags=["series"])
app.include_router(chapters.router, prefix="/api", tags=["chapters"])
app.include_router(pages.router, prefix="/api", tags=["pages"])
app.include_router(glossary.router, prefix="/api", tags=["glossary"])
app.include_router(characters.router, prefix="/api", tags=["characters"])
app.include_router(reading.router, prefix="/api/reading", tags=["reading"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])
app.include_router(connectors.router, prefix="/api/connectors", tags=["connectors"])

# Serve uploaded and processed images
app.mount("/data", StaticFiles(directory=str(settings.base_dir / "data")), name="data")


@app.websocket("/ws/pipeline/{chapter_id}")
async def pipeline_ws(websocket: WebSocket, chapter_id: str):
    await progress_broadcaster.connect(chapter_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        progress_broadcaster.disconnect(chapter_id, websocket)


@app.get("/api/health")
async def health():
    from backend.config import get_gpu_info
    return {"status": "ok", "version": "0.1.0", "gpu": get_gpu_info()}


@app.get("/api/languages")
async def list_languages():
    from backend.config import SUPPORTED_LANGUAGES
    return {
        code: {"code": code, "name": info["name"]}
        for code, info in SUPPORTED_LANGUAGES.items()
    }
