from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from markitdown import MarkItDown


@dataclass(frozen=True)
class ConvertedMarkdownDocument:
    markdown: str
    title: str | None = None


class MarkItDownService:
    def __init__(self) -> None:
        self._converter: MarkItDown | None = None

    def convert_file(self, file_path: Path) -> ConvertedMarkdownDocument:
        result = self._get_converter().convert(file_path)
        markdown = self._normalize_markdown(result.markdown)
        title = result.title.strip() if result.title else None
        return ConvertedMarkdownDocument(markdown=markdown, title=title or None)

    def _get_converter(self) -> MarkItDown:
        if self._converter is None:
            self._converter = MarkItDown()
        return self._converter

    @staticmethod
    def _normalize_markdown(markdown: str) -> str:
        return markdown.replace("\r\n", "\n").strip()


markitdown_service = MarkItDownService()