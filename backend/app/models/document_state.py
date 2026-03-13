from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class TemplateSection(BaseModel):
    id: str
    title: str
    level: int = 1
    prompt_hint: str | None = None
    source_excerpt: str | None = None
    content_paragraph_indices: list[int] = Field(default_factory=list)


class TemplateStructure(BaseModel):
    file_name: str
    file_type: Literal["docx", "pdf"]
    sections: list[TemplateSection] = Field(default_factory=list)
    extracted_outline: list[str] = Field(default_factory=list)


class DraftSectionState(BaseModel):
    section_id: str
    title: str
    content: str = ""
    status: Literal["missing", "in_progress", "complete"] = "missing"
    last_updated_at: datetime | None = None


class DocumentDraftState(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid4()))
    sections: list[DraftSectionState] = Field(default_factory=list)
    summary: str | None = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SessionContext(BaseModel):
    session_id: str
    template_path: Path
    template_structure: TemplateStructure
    draft_state: DocumentDraftState
    good_example_paths: list[Path] = Field(default_factory=list)
    bad_example_paths: list[Path] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class IngestResponse(BaseModel):
    session_id: str
    template: TemplateStructure
    draft_state: DocumentDraftState
    warnings: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResult(BaseModel):
    assistant_message: str
    summary: str | None = None
    section_updates: list[DraftSectionState] = Field(default_factory=list)


class ChatResponse(BaseModel):
    session_id: str
    assistant_message: str
    draft_state: DocumentDraftState
    preview_markdown: str
    next_required_sections: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    llm_available: bool = True


class ExportRequest(BaseModel):
    session_id: str
    target_languages: list[str]


class ExportResponse(BaseModel):
    session_id: str
    archive_path: str
    generated_files: list[str]
    warnings: list[str] = Field(default_factory=list)


class ExampleSnippet(BaseModel):
    file_name: str
    quality: Literal["good", "bad"]
    content: str


class RetrievalContext(BaseModel):
    good_examples: list[ExampleSnippet] = Field(default_factory=list)
    bad_examples: list[ExampleSnippet] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)