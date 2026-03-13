from __future__ import annotations

import zipfile
from pathlib import Path

from app.core.errors import ExportError
from app.models.document_state import SessionContext, TemplateSection

try:
    from docx import Document as DocxDocument
except ImportError:  # pragma: no cover - optional dependency path
    DocxDocument = None


class TranslationService:
    def inject_translations(
        self,
        *,
        session: SessionContext,
        translations: dict[str, dict[str, str]],
        output_directory: Path,
        output_file_name: str | None = None,
    ) -> tuple[Path, list[Path], list[str]]:
        if session.template_structure.file_type != "docx":
            raise ExportError("Export currently requires an original .docx template so layout and styling can be preserved.")
        if DocxDocument is None:
            raise ExportError("python-docx is not installed, so .docx export is unavailable.")

        output_directory.mkdir(parents=True, exist_ok=True)
        generated_files: list[Path] = []
        warnings: list[str] = []
        base_name = (output_file_name or session.output_file_name or session.template_path.stem).strip() or session.template_path.stem

        for language, translated_sections in translations.items():
            target_path = output_directory / f"{base_name}.{language.lower()}.docx"
            document = DocxDocument(str(session.template_path))
            for section in session.template_structure.sections:
                translated_text = translated_sections.get(f"{section.id}::content") or translated_sections.get(section.id)
                translated_title = translated_sections.get(f"{section.id}::title")
                if not translated_text and not translated_title:
                    continue
                warning = self._apply_section_translation(document, section, translated_text, translated_title)
                if warning:
                    warnings.append(f"{language}: {warning}")
            document.save(str(target_path))
            generated_files.append(target_path)

        archive_path = output_directory / f"{base_name}.zip"
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file_path in generated_files:
                archive.write(file_path, arcname=file_path.name)
        return archive_path, generated_files, warnings

    def _apply_section_translation(
        self,
        document: DocxDocument,
        section: TemplateSection,
        translated_text: str | None,
        translated_title: str | None,
    ) -> str | None:
        if translated_title and section.heading_paragraph_index is not None and section.heading_paragraph_index < len(document.paragraphs):
            document.paragraphs[section.heading_paragraph_index].text = translated_title

        if not translated_text:
            return None

        if not section.content_paragraph_indices:
            return f"Section '{section.title}' has no writable body paragraphs in the template."

        first_index = section.content_paragraph_indices[0]
        if first_index >= len(document.paragraphs):
            return f"Section '{section.title}' points to an invalid paragraph index."

        first_paragraph = document.paragraphs[first_index]
        first_paragraph.text = translated_text

        for redundant_index in section.content_paragraph_indices[1:]:
            if redundant_index < len(document.paragraphs):
                document.paragraphs[redundant_index].text = ""
        return None


translation_service = TranslationService()