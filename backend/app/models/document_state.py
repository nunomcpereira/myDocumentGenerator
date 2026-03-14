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
    heading_paragraph_index: int | None = None
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
    scenario_id: str | None = None
    prompt: str | None = None
    export_languages: list[str] = Field(default_factory=list)
    output_file_name: str | None = None
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class LoadedFileReference(BaseModel):
    kind: Literal["template", "good_example", "bad_example"]
    file_name: str
    download_path: str


class IngestResponse(BaseModel):
    session_id: str
    template: TemplateStructure
    draft_state: DocumentDraftState
    loaded_files: list[LoadedFileReference] = Field(default_factory=list)
    output_file_name: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatSectionUpdate(BaseModel):
    section_id: str | None = None
    title: str | None = None
    content: str = ""
    status: Literal["missing", "in_progress", "complete"] = "in_progress"


class ChatResult(BaseModel):
    assistant_message: str
    summary: str | None = None
    section_updates: list[ChatSectionUpdate] = Field(default_factory=list)


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
    output_file_name: str | None = None


class ExportResponse(BaseModel):
    session_id: str
    archive_path: str
    generated_files: list[str]
    output_file_name: str | None = None
    warnings: list[str] = Field(default_factory=list)


TranslationProviderId = Literal["llm", "azure", "google"]


class TranslationProviderOption(BaseModel):
    id: TranslationProviderId
    label: str
    description: str
    configured: bool
    required_env: list[str] = Field(default_factory=list)


class TranslationConfigurationResponse(BaseModel):
    active_provider: TranslationProviderId
    options: list[TranslationProviderOption] = Field(default_factory=list)
    source: str = ".env"
    restart_required: bool = True


class ExampleSnippet(BaseModel):
    file_name: str
    quality: Literal["good", "bad"]
    content: str


class RetrievalContext(BaseModel):
    good_examples: list[ExampleSnippet] = Field(default_factory=list)
    bad_examples: list[ExampleSnippet] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ScenarioSummary(BaseModel):
    scenario_id: str
    template_file_name: str | None = None
    prompt: str | None = None
    target_languages: list[str] = Field(default_factory=list)
    output_file_name: str | None = None
    updated_at: datetime


class SaveScenarioRequest(BaseModel):
    session_id: str
    scenario_id: str
    prompt: str | None = None
    target_languages: list[str] = Field(default_factory=list)
    output_file_name: str | None = None


class SaveScenarioResponse(BaseModel):
    scenario_id: str
    session_id: str
    prompt: str | None = None
    target_languages: list[str] = Field(default_factory=list)
    output_file_name: str | None = None
    updated_at: datetime


class LoadScenarioRequest(BaseModel):
    scenario_id: str


class LoadScenarioResponse(BaseModel):
    scenario_id: str
    session_id: str
    template: TemplateStructure
    draft_state: DocumentDraftState
    preview_markdown: str
    warnings: list[str] = Field(default_factory=list)
    prompt: str | None = None
    target_languages: list[str] = Field(default_factory=list)
    loaded_files: list[LoadedFileReference] = Field(default_factory=list)
    output_file_name: str | None = None