# MangaLens (OtakuLens)

## What This Is
MangaLens is an open-core platform that translates raw comic pages (manga, manhwa, manhua, or any comic) from ANY language to ANY language. It auto-builds a spoiler-gated series wiki (characters, relationships, terminology) that grows with every chapter translated.

## Tech Stack
- **Backend**: Python 3.10+, FastAPI, SQLAlchemy + SQLite (dev) / PostgreSQL (prod)
- **Frontend**: Next.js 14, React, TailwindCSS
- **OCR**: EasyOCR (80+ languages), PaddleOCR (Chinese)
- **Image Processing**: OpenCV, Pillow, simple-lama-inpainting
- **Translation**: Claude API (anthropic SDK)
- **MCP**: Python MCP SDK (FastMCP)
- **Browser Extension**: Chrome Manifest V3

## Project Structure
```
backend/           - Python FastAPI server
  pipeline/        - OCR, analysis, translation, inpainting, typesetting, orchestrator
  models/          - SQLAlchemy models (Series, Chapter, Page, TextRegion, Character, etc.)
  schemas/         - Pydantic request/response schemas
  routers/         - FastAPI route handlers
  connectors/      - Source connector plugins (local, URL, registry)
  mcp/             - MCP server + tools
  data/            - Uploads, output, fonts, SQLite DB
frontend/          - Next.js app (dashboard, reader, upload, settings)
extensions/browser - Chrome extension for in-page translation
```

## Commands
```bash
# Backend (from project root)
.venv/Scripts/python -m uvicorn backend.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev

# Both (docker)
docker-compose up
```

## Key Architecture
- **Language-agnostic**: any source → any target language (per-series setting)
- **Zero-vetting**: AI makes all translation decisions, logs reasoning
- **Two Claude calls per chapter**: pre-analysis (builds guide) → translation (uses guide)
- **Full chapter translation**: never page-by-page, for context consistency
- **Non-destructive pipeline**: originals always preserved
- **Pipeline stages**: OCR → Analyze → Translate → Inpaint → Typeset

## API Endpoints
- `POST /api/series/` — Create series (with source/target language)
- `POST /api/series/{id}/chapters/upload/` — Upload chapter images, triggers pipeline
- `GET /api/chapters/{id}/pages/` — List pages with text regions
- `GET /api/pages/{id}/image/{variant}/` — Serve original/cleaned/translated image
- `GET /api/settings/` — App settings
- `WS /ws/pipeline/{chapter_id}` — Real-time pipeline progress

## Environment
Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`.

## Ko-fi
https://ko-fi.com/therealsenzu
