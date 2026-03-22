# MangaLens (OtakuLens)

## What This Is
MangaLens is an open-core platform that translates raw manga/manhwa/manhua pages into fully typeset English pages with AI. It auto-builds a spoiler-gated series wiki (characters, relationships, terminology) that grows with every chapter.

## Tech Stack
- **Backend**: Python 3.11+, FastAPI, Celery + Redis, SQLAlchemy + PostgreSQL (SQLite for dev)
- **Frontend**: Next.js 14, React, TailwindCSS
- **Desktop**: Tauri 2 (Rust + web frontend)
- **OCR**: PaddleOCR (Chinese), EasyOCR (Korean/Japanese)
- **Image Processing**: OpenCV, Pillow, lama-cleaner (inpainting)
- **Translation**: Claude API (claude-sonnet-4-20250514)
- **MCP**: Python MCP SDK, Streamable HTTP

## Project Structure
```
backend/          - Python FastAPI server
  pipeline/       - OCR, analysis, translation, inpainting, typesetting
  models/         - SQLAlchemy models + Pydantic schemas
  services/       - Business logic (glossary, characters, relationships, etc.)
  connectors/     - Source connector plugins
  mcp/            - MCP server + tools
frontend/         - Next.js app
tauri/            - Tauri desktop wrapper
extensions/       - Browser + Tachiyomi extensions
```

## Key Architecture Decisions
- Zero-vetting: AI makes all translation decisions, logs reasoning, community corrects over time
- Two Claude calls per chapter: pre-analysis (builds guide) then translation (uses guide)
- Spoiler-gated everything: wiki data tagged with reveal chapter, filtered by reading progress
- Full chapter translation (never page-by-page) for context consistency
- Non-destructive pipeline: originals always preserved, every step reversible
- Source-agnostic plugin system for content sources

## Commands
```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install
npm run dev

# Both (docker)
docker-compose up
```

## Primary Languages
- Chinese → English, Korean → English
- Japanese → English (future)

## Ko-fi
https://ko-fi.com/therealsenzu
