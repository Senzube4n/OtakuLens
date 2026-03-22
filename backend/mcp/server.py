"""MangaLens MCP server.

Exposes the translation pipeline and knowledge-base tools over the
Model Context Protocol using FastMCP.  Can be run standalone on port 8001
or mounted alongside the main FastAPI application.
"""

import logging

from mcp.server.fastmcp import FastMCP

from backend.config import settings
from backend.mcp import tools

logger = logging.getLogger(__name__)

mcp = FastMCP("MangaLens")


# ======================================================================
# Tool registrations
# ======================================================================


@mcp.tool()
async def list_series() -> list[dict]:
    """List all manga/comic series with basic info (title, language, status)."""
    return await tools.list_series()


@mcp.tool()
async def get_series(series_id: str) -> dict:
    """Get detailed information about a series including its chapter list.

    Parameters:
        series_id: The unique ID of the series.
    """
    return await tools.get_series(series_id)


@mcp.tool()
async def translate_chapter(
    series_id: str,
    chapter_number: float,
    image_dir: str,
) -> dict:
    """Start translating a chapter from local image files.

    Creates database records and queues the chapter for the translation
    pipeline.

    Parameters:
        series_id: The series this chapter belongs to.
        chapter_number: Chapter number (e.g. 1.0, 12.5).
        image_dir: Absolute path to the directory containing page images.
    """
    return await tools.translate_chapter(series_id, chapter_number, image_dir)


@mcp.tool()
async def get_chapter_status(chapter_id: str) -> dict:
    """Check the current pipeline progress for a chapter.

    Returns the chapter status, error messages, and per-page status
    breakdown.

    Parameters:
        chapter_id: The unique ID of the chapter.
    """
    return await tools.get_chapter_status(chapter_id)


@mcp.tool()
async def get_glossary(series_id: str) -> list[dict]:
    """Get all glossary term decisions for a series.

    Returns translated terms, alternatives, categories, and confidence
    scores.

    Parameters:
        series_id: The series to get the glossary for.
    """
    return await tools.get_glossary(series_id)


@mcp.tool()
async def update_term(term_id: str, translated_term: str) -> dict:
    """Override the translated term for a glossary entry.

    Marks the term as a manual override so the pipeline will prefer it
    in future translations.

    Parameters:
        term_id: The ID of the term to update.
        translated_term: The new translation to use.
    """
    return await tools.update_term(term_id, translated_term)


@mcp.tool()
async def get_characters(
    series_id: str,
    max_chapter: int | None = None,
) -> list[dict]:
    """Get characters for a series, optionally spoiler-gated by chapter.

    When max_chapter is provided, only characters that appear at or
    before that chapter are returned, and future status info is hidden.

    Parameters:
        series_id: The series to query.
        max_chapter: If set, hide characters and spoilers beyond this chapter.
    """
    return await tools.get_characters(series_id, max_chapter)


@mcp.tool()
async def get_chapter_translation(chapter_id: str) -> dict:
    """Get all translations for a chapter, organized by page.

    Returns original text, translated text, bounding boxes, speaker
    labels, and review status for every text region.

    Parameters:
        chapter_id: The chapter to retrieve translations for.
    """
    return await tools.get_chapter_translation(chapter_id)


@mcp.tool()
async def search_translation_memory(
    series_id: str,
    query: str,
) -> list[dict]:
    """Search past translations for a series.

    Matches against both source and translated text using case-insensitive
    search.  Returns up to 50 results ordered by usage frequency.

    Parameters:
        series_id: The series to search within.
        query: Text to search for in source or translated text.
    """
    return await tools.search_translation_memory(series_id, query)


@mcp.tool()
async def get_reading_progress(series_id: str) -> dict:
    """Get the reader's current progress for a series.

    Returns the last chapter and page read, total chapters read, and
    whether the series is completed.

    Parameters:
        series_id: The series to check progress for.
    """
    return await tools.get_reading_progress(series_id)


@mcp.tool()
async def update_reading_progress(
    series_id: str,
    chapter: float,
    page: int = 0,
) -> dict:
    """Update the reader's progress for a series.

    Creates a new progress record if none exists yet.

    Parameters:
        series_id: The series to update progress for.
        chapter: The chapter number the reader is on.
        page: The page number within the chapter (default 0).
    """
    return await tools.update_reading_progress(series_id, chapter, page)


# ======================================================================
# Standalone entry point
# ======================================================================

def main():
    """Run the MCP server standalone on the configured port."""
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    logger.info("Starting MangaLens MCP server on port %d", settings.mcp_port)

    mcp.run(transport="sse")


if __name__ == "__main__":
    main()
