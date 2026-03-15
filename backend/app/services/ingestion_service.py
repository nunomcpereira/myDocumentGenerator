from __future__ import annotations

from dataclasses import dataclass
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


@dataclass
class ImportedSection:
    title: str
    content: str
    image_paths: list[Path]


class IngestionService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def initialize_session(
        self,
        *,
        template_file: UploadFile,
        enhancement_document_file: UploadFile | None,
        good_examples: list[UploadFile],
        bad_examples: list[UploadFile],
    ) -> SessionContext:
        session_id = str(uuid4())
        session_dir = self.settings.upload_root / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        template_path = await self._persist_file(session_dir, template_file)
        template_structure = self._parse_template(template_path)
        enhancement_document_path = await self._persist_file(session_dir, enhancement_document_file) if enhancement_document_file else None

        saved_good_examples = [await self._persist_file(session_dir, example) for example in good_examples]
        saved_bad_examples = [await self._persist_file(session_dir, example) for example in bad_examples]
        warnings = self.index_session_examples(
            session_id,
            saved_good_examples,
            saved_bad_examples,
            enhancement_document_path=enhancement_document_path,
        )

        draft_state, draft_warnings = self._build_initial_draft_state(
            session_id=session_id,
            template_structure=template_structure,
            enhancement_document_path=enhancement_document_path,
        )
        warnings.extend(draft_warnings)
        enhancement_image_paths, enhancement_section_image_paths, image_warnings = self.extract_preview_assets(
            session_id=session_id,
            template_path=template_path,
            template_structure=template_structure,
            enhancement_document_path=enhancement_document_path,
        )
        warnings.extend(image_warnings)

        return SessionContext(
            session_id=session_id,
            template_path=template_path,
            template_structure=template_structure,
            original_template_structure=template_structure.model_copy(deep=True),
            draft_state=draft_state,
            enhancement_document_path=enhancement_document_path,
            enhancement_image_paths=enhancement_image_paths,
            enhancement_section_image_paths=enhancement_section_image_paths,
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

    def index_session_examples(
        self,
        session_id: str,
        good_example_paths: list[Path],
        bad_example_paths: list[Path],
        *,
        enhancement_document_path: Path | None = None,
    ) -> list[str]:
        good_examples = [(path.name, self._read_example_text(path)) for path in good_example_paths]
        if enhancement_document_path is not None:
            good_examples.append((enhancement_document_path.name, self._read_example_text(enhancement_document_path)))
        bad_examples = [(path.name, self._read_example_text(path)) for path in bad_example_paths]
        return rag_service.index_examples(session_id, good_examples, bad_examples)

    def extract_preview_assets(
        self,
        *,
        session_id: str,
        template_path: Path,
        template_structure: TemplateStructure,
        enhancement_document_path: Path | None,
    ) -> tuple[list[Path], dict[str, list[Path]], list[str]]:
        if DocxDocument is None:
            return [], {}, []

        source_path = enhancement_document_path or template_path
        if source_path.suffix.lower() != ".docx":
            return [], {}, []

        image_output_dir = self.settings.upload_root / session_id / "preview_images"
        imported_sections = self._extract_existing_sections(source_path, image_output_dir=image_output_dir)
        warning_source = "enhancement document" if enhancement_document_path else "template"
        return self._build_section_image_mapping(template_structure, imported_sections, warning_source=warning_source)

    def _build_initial_draft_state(
        self,
        *,
        session_id: str,
        template_structure: TemplateStructure,
        enhancement_document_path: Path | None,
    ) -> tuple[DocumentDraftState, list[str]]:
        draft_state = DocumentDraftState(
            session_id=session_id,
            sections=[
                DraftSectionState(section_id=section.id, title=section.title)
                for section in template_structure.sections
            ],
            updated_at=datetime.now(UTC),
        )

        if enhancement_document_path is None:
            return draft_state, []

        warnings = self._hydrate_draft_from_existing_document(draft_state, template_structure, enhancement_document_path)
        draft_state.updated_at = datetime.now(UTC)
        return draft_state, warnings

    def _hydrate_draft_from_existing_document(
        self,
        draft_state: DocumentDraftState,
        template_structure: TemplateStructure,
        existing_document_path: Path,
    ) -> list[str]:
        warnings: list[str] = []
        template_sections = {self._normalize_title(section.title): section for section in template_structure.sections}
        draft_sections = {section.section_id: section for section in draft_state.sections}
        imported_sections = self._extract_existing_sections(existing_document_path)
        matched = 0

        for imported_section in imported_sections:
            if not imported_section.content.strip():
                continue
            template_section = template_sections.get(self._normalize_title(imported_section.title))
            if template_section is None:
                continue
            draft_section = draft_sections.get(template_section.id)
            if draft_section is None:
                continue
            draft_section.content = imported_section.content.strip()
            draft_section.status = "complete"
            draft_section.last_updated_at = datetime.now(UTC)
            matched += 1

        if matched == 0:
            imported_text = self._read_example_text(existing_document_path).strip()
            if imported_text and draft_state.sections:
                draft_state.sections[0].content = imported_text
                draft_state.sections[0].status = "in_progress"
                draft_state.sections[0].last_updated_at = datetime.now(UTC)
                warnings.append(
                    "The enhancement document could not be aligned to the template headings, so its content was placed in the first section for refinement."
                )
        else:
            draft_state.summary = f"Imported content from {existing_document_path.name} into {matched} template section(s)."

        return warnings

    def _extract_existing_sections(self, file_path: Path, image_output_dir: Path | None = None) -> list[ImportedSection]:
        suffix = file_path.suffix.lower()
        if suffix == ".docx" and DocxDocument is not None:
            document = DocxDocument(str(file_path))
            sections: list[ImportedSection] = []
            current_title: str | None = None
            current_lines: list[str] = []
            current_images: list[Path] = []
            image_index = 0

            def flush_current_section() -> None:
                if current_title and (current_lines or current_images):
                    sections.append(
                        ImportedSection(
                            title=current_title,
                            content="\n".join(current_lines).strip(),
                            image_paths=list(current_images),
                        )
                    )

            for paragraph in document.paragraphs:
                text = paragraph.text.strip()
                style_name = paragraph.style.name.lower() if paragraph.style and paragraph.style.name else ""
                paragraph_images, image_index = self._extract_docx_paragraph_images(
                    document,
                    paragraph,
                    image_output_dir,
                    image_index,
                )

                if style_name.startswith("heading") and text:
                    flush_current_section()
                    current_title = text
                    current_lines = []
                    current_images = []
                    continue

                if not text and not paragraph_images:
                    continue

                if current_title is None:
                    current_title = "Imported content"
                if text:
                    current_lines.append(text)
                if paragraph_images:
                    current_images.extend(paragraph_images)

            flush_current_section()
            return sections
        return []

    def _build_section_image_mapping(
        self,
        template_structure: TemplateStructure,
        imported_sections: list[ImportedSection],
        *,
        warning_source: str,
    ) -> tuple[list[Path], dict[str, list[Path]], list[str]]:
        image_paths_by_section: dict[str, list[Path]] = {}
        warnings: list[str] = []
        template_sections = {self._normalize_title(section.title): section for section in template_structure.sections}
        unmatched_images: list[Path] = []

        for imported_section in imported_sections:
            if not imported_section.image_paths:
                continue
            template_section = template_sections.get(self._normalize_title(imported_section.title))
            if template_section is None:
                unmatched_images.extend(imported_section.image_paths)
                continue
            image_paths_by_section.setdefault(template_section.id, []).extend(imported_section.image_paths)

        if unmatched_images and template_structure.sections:
            first_section_id = template_structure.sections[0].id
            image_paths_by_section.setdefault(first_section_id, []).extend(unmatched_images)
            warnings.append(
                f"Images from the {warning_source} could not be aligned to template headings, so they are shown in the first section preview."
            )

        all_image_paths: list[Path] = []
        for paths in image_paths_by_section.values():
            all_image_paths.extend(paths)
        return all_image_paths, image_paths_by_section, warnings

    @staticmethod
    def _extract_docx_paragraph_images(document: DocxDocument, paragraph, image_output_dir: Path | None, image_index: int) -> tuple[list[Path], int]:
        if image_output_dir is None:
            return [], image_index

        image_output_dir.mkdir(parents=True, exist_ok=True)
        image_paths: list[Path] = []
        for blip in paragraph._element.xpath(".//*[local-name()='blip']"):
            rel_id = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
            if not rel_id:
                continue
            image_part = document.part.related_parts.get(rel_id)
            if image_part is None:
                continue
            image_index += 1
            suffix = Path(str(image_part.partname)).suffix or ".png"
            image_path = image_output_dir / f"preview-image-{image_index}{suffix}"
            image_path.write_bytes(image_part.blob)
            image_paths.append(image_path)
        return image_paths, image_index

    @staticmethod
    def _normalize_title(value: str) -> str:
        return " ".join(value.lower().split())

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