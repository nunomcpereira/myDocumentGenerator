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
    file_type: str
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
    original_template_structure: TemplateStructure | None = None
    source_preview_markdown: str | None = None
    draft_state: DocumentDraftState
    enhancement_document_path: Path | None = None
    enhancement_image_paths: list[Path] = Field(default_factory=list)
    enhancement_section_image_paths: dict[str, list[Path]] = Field(default_factory=dict)
    good_example_paths: list[Path] = Field(default_factory=list)
    bad_example_paths: list[Path] = Field(default_factory=list)
    scenario_id: str | None = None
    prompt: str | None = None
    prompt_sequence: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)
    export_languages: list[str] = Field(default_factory=list)
    output_file_name: str | None = None
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class LoadedFileReference(BaseModel):
    kind: Literal["template", "enhancement_document", "good_example", "bad_example"]
    file_name: str
    download_path: str


class IngestResponse(BaseModel):
    session_id: str
    template: TemplateStructure
    draft_state: DocumentDraftState
    preview_markdown: str = ""
    loaded_files: list[LoadedFileReference] = Field(default_factory=list)
    output_file_name: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ChatRequest(BaseModel):
    session_id: str
    message: str
    mcp_servers: list[str] | None = None
    persist_prompt: bool = True


class ChatSectionUpdate(BaseModel):
    section_id: str | None = None
    title: str | None = None
    content: str = ""
    status: Literal["missing", "in_progress", "complete"] = "in_progress"


class ChatSectionOperation(BaseModel):
    action: Literal["add", "move", "delete"]
    section_id: str | None = None
    title: str | None = None
    content: str = ""
    status: Literal["missing", "in_progress", "complete"] = "in_progress"
    position: Literal["top", "end", "before", "after"] | None = None
    relative_section_id: str | None = None
    relative_title: str | None = None


class ChatResult(BaseModel):
    assistant_message: str
    summary: str | None = None
    prompt_summary: str | None = None
    section_updates: list[ChatSectionUpdate] = Field(default_factory=list)
    section_operations: list[ChatSectionOperation] = Field(default_factory=list)


class ChatResponse(BaseModel):
    session_id: str
    assistant_message: str
    draft_state: DocumentDraftState
    preview_markdown: str
    prompt: str | None = None
    prompt_sequence: list[str] = Field(default_factory=list)
    next_required_sections: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    llm_available: bool = True


class ExportRequest(BaseModel):
    session_id: str
    target_languages: list[str]
    output_file_name: str | None = None
    export_format: Literal["docx", "pdf"] = "docx"
    mcp_servers: list[str] | None = None


class GeneratedExportFile(BaseModel):
    language: str
    format: Literal["docx", "pdf"] = "docx"
    file_name: str
    download_path: str


class ExportResponse(BaseModel):
    session_id: str
    archive_path: str
    generated_files: list[str]
    generated_documents: list[GeneratedExportFile] = Field(default_factory=list)
    export_format: Literal["docx", "pdf"] = "docx"
    output_file_name: str | None = None
    warnings: list[str] = Field(default_factory=list)


TranslationProviderId = Literal["llm", "azure", "google"]


class TranslationProviderOption(BaseModel):
    id: TranslationProviderId
    label: str
    description: str
    configured: bool
    required_env: list[str] = Field(default_factory=list)


class CustomCssConfiguration(BaseModel):
    enabled: bool = False
    file_name: str | None = None
    updated_at: datetime | None = None


class TranslationConfigurationResponse(BaseModel):
    active_provider: TranslationProviderId
    options: list[TranslationProviderOption] = Field(default_factory=list)
    custom_css: CustomCssConfiguration = Field(default_factory=CustomCssConfiguration)
    source: str = ".env"
    restart_required: bool = True


class CustomCssResponse(CustomCssConfiguration):
    css_text: str | None = None


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
    prompt_sequence: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)
    target_languages: list[str] = Field(default_factory=list)
    output_file_name: str | None = None
    updated_at: datetime


class SaveScenarioRequest(BaseModel):
    session_id: str
    scenario_id: str
    prompt: str | None = None
    prompt_sequence: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)
    target_languages: list[str] = Field(default_factory=list)
    output_file_name: str | None = None


class SaveScenarioResponse(BaseModel):
    scenario_id: str
    session_id: str
    prompt: str | None = None
    prompt_sequence: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)
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
    prompt_sequence: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)
    target_languages: list[str] = Field(default_factory=list)
    loaded_files: list[LoadedFileReference] = Field(default_factory=list)
    output_file_name: str | None = None


class McpServerSummary(BaseModel):
    name: str
    description: str | None = None
    oauth: str | None = None
    secrets: str | None = None
    config: str | None = None


class McpServerCatalogResponse(BaseModel):
    available: bool = False
    source: str = "docker-mcp-cli"
    detail: str | None = None
    servers: list[McpServerSummary] = Field(default_factory=list)