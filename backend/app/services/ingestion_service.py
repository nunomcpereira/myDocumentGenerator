from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from pypdf import PdfReader

from app.core.config import get_settings
from app.core.errors import UnsupportedTemplateError
from app.models.document_state import DraftSectionState, DocumentDraftState, SessionContext, TemplateSection, TemplateStructure
from app.services.rag_service import rag_service

try:
    from docx import Document as DocxDocument
except ImportError:  # pragma: no cover - optional dependency path
    DocxDocument = None


class IngestionService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def initialize_session(
        self,
        *,
        template_file: UploadFile,
        good_examples: list[UploadFile],
        bad_examples: list[UploadFile],
    ) -> SessionContext:
        session_id = str(uuid4())
        session_dir = self.settings.upload_root / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        template_path = await self._persist_file(session_dir, template_file)
        template_structure = self._parse_template(template_path)

        saved_good_examples = [await self._persist_file(session_dir, example) for example in good_examples]
        saved_bad_examples = [await self._persist_file(session_dir, example) for example in bad_examples]
        warnings = rag_service.index_examples(
            session_id,
            [(path.name, self._read_example_text(path)) for path in saved_good_examples],
            [(path.name, self._read_example_text(path)) for path in saved_bad_examples],
        )

        draft_state = DocumentDraftState(
            session_id=session_id,
            sections=[
                DraftSectionState(section_id=section.id, title=section.title)
                for section in template_structure.sections
            ],
            updated_at=datetime.now(UTC),
        )

        return SessionContext(
            session_id=session_id,
            template_path=template_path,
            template_structure=template_structure,
            draft_state=draft_state,
            good_example_paths=saved_good_examples,
            bad_example_paths=saved_bad_examples,
            output_file_name=template_path.stem,
            warnings=warnings,
        )

    async def _persist_file(self, directory: Path, upload: UploadFile) -> Path:
        file_path = directory / upload.filename
        content = await upload.read()
        file_path.write_bytes(content)
        await upload.close()
        return file_path

    def _parse_template(self, template_path: Path) -> TemplateStructure:
        suffix = template_path.suffix.lower()
        if suffix == ".docx":
            return self._parse_docx_template(template_path)
        if suffix == ".pdf":
            return self._parse_pdf_template(template_path)
        raise UnsupportedTemplateError("Only .docx and .pdf templates are supported.")

    def _parse_docx_template(self, template_path: Path) -> TemplateStructure:
        if DocxDocument is None:
            raise UnsupportedTemplateError("python-docx is not installed, so .docx templates cannot be parsed.")

        document = DocxDocument(str(template_path))
        sections: list[TemplateSection] = []
        current_section: TemplateSection | None = None
        extracted_outline: list[str] = []

        for index, paragraph in enumerate(document.paragraphs):
            text = paragraph.text.strip()
            if not text:
                continue
            style_name = paragraph.style.name.lower() if paragraph.style and paragraph.style.name else ""
            if style_name.startswith("heading"):
                level = self._extract_heading_level(style_name)
                section_id = f"section-{len(sections) + 1}"
                current_section = TemplateSection(
                    id=section_id,
                    title=text,
                    level=level,
                    source_excerpt=text,
                    heading_paragraph_index=index,
                )
                sections.append(current_section)
                extracted_outline.append(text)
                continue

            if current_section is None:
                section_id = f"section-{len(sections) + 1}"
                current_section = TemplateSection(
                    id=section_id,
                    title=f"Section {len(sections) + 1}",
                    level=1,
                    source_excerpt=text,
                )
                sections.append(current_section)
                extracted_outline.append(current_section.title)
            current_section.content_paragraph_indices.append(index)
            excerpt = current_section.source_excerpt or ""
            current_section.source_excerpt = f"{excerpt}\n{text}".strip()

        return TemplateStructure(
            file_name=template_path.name,
            file_type="docx",
            sections=sections,
            extracted_outline=extracted_outline,
        )

    def _parse_pdf_template(self, template_path: Path) -> TemplateStructure:
        reader = PdfReader(str(template_path))
        sections: list[TemplateSection] = []
        outline: list[str] = []
        for page_index, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            if not text:
                continue
            title = f"Page {page_index}"
            outline.append(title)
            sections.append(
                TemplateSection(
                    id=f"page-{page_index}",
                    title=title,
                    level=1,
                    source_excerpt=text[:1200],
                )
            )
        return TemplateStructure(
            file_name=template_path.name,
            file_type="pdf",
            sections=sections,
            extracted_outline=outline,
        )

    def _read_example_text(self, file_path: Path) -> str:
        suffix = file_path.suffix.lower()
        if suffix == ".pdf":
            reader = PdfReader(str(file_path))
            return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
        if suffix == ".docx" and DocxDocument is not None:
            document = DocxDocument(str(file_path))
            return "\n".join(paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()).strip()
        return file_path.read_text(encoding="utf-8", errors="ignore")

    @staticmethod
    def _extract_heading_level(style_name: str) -> int:
        for token in style_name.split():
            if token.isdigit():
                return int(token)
        digits = "".join(character for character in style_name if character.isdigit())
        return int(digits) if digits else 1


ingestion_service = IngestionService()