"""Abstract base class for source connectors."""

from abc import ABC, abstractmethod


class SourceConnector(ABC):
    """Base class that all manga/comic source connectors must implement.

    Each connector provides a unified interface for discovering series,
    fetching chapter lists, downloading page images, and polling for
    new releases.
    """

    name: str = "base"
    supported_languages: list[str] = []

    @abstractmethod
    async def search(self, query: str) -> list[dict]:
        """Search the source for series matching *query*.

        Returns a list of dicts, each containing at minimum:
            - id:    str   — unique identifier within the source
            - title: str   — display title
            - url:   str | None — link to the series page
            - cover: str | None — cover image URL
            - language: str — ISO-639-1 language code
        """
        ...

    @abstractmethod
    async def get_chapters(self, series_id: str) -> list[dict]:
        """Return all known chapters for *series_id*, newest first.

        Each dict should contain:
            - id:             str   — chapter identifier
            - chapter_number: float — e.g. 1.0, 1.5
            - title:          str | None
            - published_at:   float | None — UTC timestamp
            - url:            str | None
        """
        ...

    @abstractmethod
    async def get_page_images(self, chapter_id: str) -> list[bytes]:
        """Download every page for *chapter_id* and return raw image bytes.

        The list is ordered by page number (index 0 = page 1).
        """
        ...

    @abstractmethod
    async def check_new_chapters(
        self, series_id: str, last_known: float
    ) -> list[dict]:
        """Return chapters with chapter_number greater than *last_known*.

        Uses the same dict format as :meth:`get_chapters`.
        """
        ...
