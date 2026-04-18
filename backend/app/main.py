from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
import re

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.core.errors import ExportError, LLMProviderError, SessionNotFoundError, TranslationProviderConfigurationError, TranslationProviderError, UnsupportedTemplateError
from app.models.document_state import (
    ChatRequest,
    ChatResponse,
    ChatResult,
    ChatSectionOperation,
    CustomCssResponse,
    DraftSectionState,
    ExportRequest,
    ExportResponse,
    GeneratedExportFile,
    IngestResponse,
    LoadedFileReference,
    McpServerCatalogResponse,
    LoadScenarioRequest,
    SaveScenarioRequest,
    SaveScenarioResponse,
    ScenarioSummary,
    TemplateSection,
    TranslationConfigurationResponse,
)
from app.services.docker_mcp_service import docker_mcp_service
from app.services.ingestion_service import ingestion_service
from app.services.llm_provider import llm_provider
from app.services.rag_service import rag_service
from app.services.scenario_service import scenario_service
from app.services.session_store import session_store
from app.services.translation_service import translation_service


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def normalize_mcp_servers(mcp_servers: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in mcp_servers:
        candidate = item.strip()
        if not candidate or candidate in seen:
            continue
        normalized.append(candidate)
        seen.add(candidate)
    return normalized


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "timestamp": datetime.now(UTC).isoformat()}


@app.get("/config/translation", response_model=TranslationConfigurationResponse)
async def translation_configuration() -> TranslationConfigurationResponse:
    return translation_service.describe_configuration()


@app.get("/config/custom-css", response_model=CustomCssResponse)
async def get_custom_css() -> CustomCssResponse:
    css_text, file_name, updated_at = scenario_service.get_custom_css()
    return CustomCssResponse(enabled=bool(css_text), file_name=file_name, updated_at=updated_at, css_text=css_text)


@app.post("/config/custom-css", response_model=TranslationConfigurationResponse)
async def upload_custom_css(custom_css: UploadFile = File(...)) -> TranslationConfigurationResponse:
    if not custom_css.filename:
        raise HTTPException(status_code=400, detail="Provide a CSS file to upload.")
    if not custom_css.filename.lower().endswith(".css"):
        raise HTTPException(status_code=400, detail="Only .css files are supported for UI customization.")

    css_bytes = await custom_css.read()
    await custom_css.close()
    try:
        css_text = css_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="Custom CSS must be UTF-8 encoded text.") from exc

    scenario_service.set_custom_css(file_name=custom_css.filename, css_text=css_text)
    return translation_service.describe_configuration()


@app.delete("/config/custom-css", response_model=TranslationConfigurationResponse)
async def clear_custom_css() -> TranslationConfigurationResponse:
    scenario_service.clear_custom_css()
    return translation_service.describe_configuration()


@app.post("/ingest", response_model=IngestResponse)
async def ingest(
    template: UploadFile = File(...),
    existing_document: UploadFile | None = File(default=None),
    good_examples: list[UploadFile] = File(default=[]),
    bad_examples: list[UploadFile] = File(default=[]),
) -> IngestResponse:
    try:
        session = await ingestion_service.initialize_session(
            template_file=template,
            enhancement_document_file=existing_document,
            good_examples=good_examples,
            bad_examples=bad_examples,
        )
    except UnsupportedTemplateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    session_store.save(session)
    return IngestResponse(
        session_id=session.session_id,
        template=session.template_structure,
        draft_state=session.draft_state,
        preview_markdown=render_preview_markdown(session),
        loaded_files=build_loaded_files(session),
        output_file_name=session.output_file_name,
        warnings=session.warnings,
    )


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    try:
        session = session_store.get(request.session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if request.mcp_servers is not None:
        session.mcp_servers = normalize_mcp_servers(request.mcp_servers)
    if not session.prompt_sequence and session.prompt:
        session.prompt_sequence = [session.prompt.strip()] if session.prompt.strip() else []

    retrieval_context = rag_service.retrieve(request.session_id, request.message)
    negative_constraints = rag_service.build_negative_constraints(retrieval_context.bad_examples)
    system_prompt = build_chat_system_prompt(session)
    user_prompt = build_chat_user_prompt(session, request.message, retrieval_context.good_examples, negative_constraints)

    warnings = list(session.warnings) + retrieval_context.warnings

    try:
        payload = await llm_provider.generate_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.15,
            mcp_servers=session.mcp_servers,
        )
        result = ChatResult.model_validate(payload)
        llm_available = True
    except LLMProviderError as exc:
        result = ChatResult(
            assistant_message=(
                "The interviewing analyst is unavailable because the local LLM endpoint could not be reached. "
                "Review the current draft and retry after restoring the LLM service."
            ),
            summary=session.draft_state.summary,
            section_updates=[],
        )
        warnings.append(str(exc))
        llm_available = False
    except Exception as exc:
        result = ChatResult(
            assistant_message="The analyst returned a malformed response. Retry with a more explicit instruction for the target section.",
            summary=session.draft_state.summary,
            section_updates=[],
        )
        warnings.append(f"Malformed LLM response: {exc}")
        llm_available = False

    updated_sections = {section.section_id: section for section in session.draft_state.sections}
    applied_updates = 0
    applied_structure_operations = 0
    for operation in result.section_operations:
        if apply_section_operation(session, operation):
            applied_structure_operations += 1

    for incoming in result.section_updates:
        if apply_section_update(session, incoming.section_id, incoming.title, incoming.content, incoming.status):
            applied_updates += 1

    if applied_updates == 0 and applied_structure_operations == 0:
        fallback_operation = infer_structure_operation(request.message, session.draft_state.sections)
        if fallback_operation is not None and apply_section_operation(session, fallback_operation):
            applied_structure_operations += 1
        else:
            fallback_update = infer_section_assignment_from_message(request.message, session.draft_state.sections)
            if fallback_update is not None:
                fallback_section, fallback_value = fallback_update
                fallback_section.content = fallback_value
                fallback_section.status = "complete"
                fallback_section.last_updated_at = datetime.now(UTC)
                applied_updates += 1

    session.draft_state.summary = result.summary or session.draft_state.summary
    session.draft_state.updated_at = datetime.now(UTC)
    if request.persist_prompt:
        session.prompt_sequence = append_prompt_sequence(session.prompt_sequence, request.message)
        session.prompt = format_prompt_sequence(session.prompt_sequence)
    session_store.update(session.session_id, session)

    preview_markdown = render_preview_markdown(session)
    next_sections = [section.title for section in session.draft_state.sections if section.status != "complete"]
    return ChatResponse(
        session_id=session.session_id,
        assistant_message=result.assistant_message,
        draft_state=session.draft_state,
        preview_markdown=preview_markdown,
        prompt=session.prompt,
        prompt_sequence=session.prompt_sequence,
        next_required_sections=next_sections,
        warnings=warnings,
        llm_available=llm_available,
    )


def apply_section_update(session, section_id: str | None, title: str | None, content: str, status: str) -> bool:
    section_index = find_section_index(session.draft_state.sections, section_id, title)
    if section_index is None:
        if title and content.strip():
            insert_dynamic_section(session, title=title, content=content, status=status)
            return True
        return False

    draft_section = session.draft_state.sections[section_index]
    template_section = session.template_structure.sections[section_index]
    if title and normalize_key(title) != normalize_key(draft_section.title):
        draft_section.title = title.strip()
        template_section.title = title.strip()
        refresh_outline(session)
    draft_section.content = content
    draft_section.status = status if status in {"missing", "in_progress", "complete"} else "in_progress"
    draft_section.last_updated_at = datetime.now(UTC)
    return True


def apply_section_operation(session, operation: ChatSectionOperation) -> bool:
    if operation.action == "add":
        if not operation.title:
            return False
        insert_dynamic_section(
            session,
            title=operation.title,
            content=operation.content,
            status=operation.status,
            position=operation.position,
            relative_section_id=operation.relative_section_id,
            relative_title=operation.relative_title,
        )
        return True

    section_index = find_section_index(session.draft_state.sections, operation.section_id, operation.title)
    if section_index is None:
        return False

    if operation.action == "delete":
        delete_section(session, section_index)
        return True

    if operation.action == "move":
        move_section(
            session,
            section_index,
            position=operation.position,
            relative_section_id=operation.relative_section_id,
            relative_title=operation.relative_title,
        )
        return True

    return False


@app.post("/export", response_model=ExportResponse)
async def export(request: ExportRequest) -> ExportResponse:
    try:
        session = session_store.get(request.session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        translation_service.validate_export_request(request.export_format)
    except ExportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    translation_payload: dict[str, dict[str, str]] = {}
    warnings = list(session.warnings)
    if request.mcp_servers is not None:
        session.mcp_servers = normalize_mcp_servers(request.mcp_servers)
    session.export_languages = request.target_languages
    session.output_file_name = request.output_file_name or session.output_file_name or session.template_path.stem
    session_store.update(session.session_id, session)

    for language in request.target_languages:
        style_context = rag_service.retrieve(session.session_id, f"tone and style guidance for {language}", limit=2)
        try:
            translation_payload[language] = await translation_service.translate_sections(
                session=session,
                language=language,
                good_examples=style_context.good_examples,
            )
        except TranslationProviderConfigurationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except (TranslationProviderError, LLMProviderError) as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    output_directory = settings.generated_root / request.session_id
    try:
        archive_path, generated_files, export_warnings = translation_service.inject_translations(
            session=session,
            translations=translation_payload,
            output_directory=output_directory,
            output_file_name=session.output_file_name,
            export_format=request.export_format,
        )
    except ExportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    warnings.extend(export_warnings)
    generated_documents = build_generated_export_files(request.session_id, request.target_languages, generated_files)
    return ExportResponse(
        session_id=request.session_id,
        archive_path=str(archive_path),
        generated_files=[str(file_path) for file_path in generated_files],
        generated_documents=generated_documents,
        export_format=request.export_format,
        output_file_name=session.output_file_name,
        warnings=warnings,
    )


@app.get("/export/{session_id}/download")
async def download_export(session_id: str) -> FileResponse:
    try:
        session = session_store.get(session_id)
        archive_name = f"{(session.output_file_name or session.template_path.stem)}.zip"
    except SessionNotFoundError:
        archive_name = f"{session_id}.zip"
    archive_path = settings.generated_root / session_id / archive_name
    if not archive_path.exists():
        raise HTTPException(status_code=404, detail="Export archive not found.")
    return FileResponse(path=archive_path, filename=archive_path.name, media_type="application/zip")


@app.get("/export/{session_id}/files", response_model=list[GeneratedExportFile])
async def list_export_files(session_id: str) -> list[GeneratedExportFile]:
    session_dir = settings.generated_root / session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="No exported documents found for this session.")
    generated_files = sorted(
        [
            path
            for path in session_dir.iterdir()
            if path.is_file() and path.suffix.lower() in {".docx", ".pdf"}
        ],
        key=lambda path: path.name,
    )
    if not generated_files:
        raise HTTPException(status_code=404, detail="No exported documents found for this session.")
    return build_generated_export_files(session_id, infer_languages_from_paths(generated_files), generated_files)


@app.get("/export/{session_id}/files/{file_name}")
async def download_export_file(session_id: str, file_name: str) -> FileResponse:
    if "/" in file_name or file_name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid export file name.")
    file_path = settings.generated_root / session_id / file_name
    if file_path.suffix.lower() not in {".docx", ".pdf"} or not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Export document not found.")
    media_type = (
        "application/pdf"
        if file_path.suffix.lower() == ".pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return FileResponse(path=file_path, filename=file_path.name, media_type=media_type)


@app.get("/scenarios", response_model=list[ScenarioSummary])
async def list_scenarios() -> list[ScenarioSummary]:
    return scenario_service.list_scenarios()


@app.get("/mcp/servers", response_model=McpServerCatalogResponse)
async def list_mcp_servers() -> McpServerCatalogResponse:
    return docker_mcp_service.list_servers()


@app.post("/scenarios/save", response_model=SaveScenarioResponse)
async def save_scenario(request: SaveScenarioRequest) -> SaveScenarioResponse:
    try:
        session = session_store.get(request.session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        response = scenario_service.save_scenario(
            session,
            request.scenario_id,
            prompt=request.prompt,
            prompt_sequence=request.prompt_sequence,
            mcp_servers=request.mcp_servers,
            target_languages=request.target_languages,
            output_file_name=request.output_file_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    session_store.update(session.session_id, session)
    return response


@app.post("/scenarios/load")
async def load_scenario(request: LoadScenarioRequest):
    try:
        session = scenario_service.load_scenario(request.scenario_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    session_store.save(session)
    return scenario_service.build_load_response(session, render_preview_markdown(session), build_loaded_files(session))


@app.get("/sessions/{session_id}/files/{kind}/{file_name}")
async def download_session_file(session_id: str, kind: str, file_name: str) -> FileResponse:
    try:
        session = session_store.get(session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    file_path = resolve_session_file(session, kind, file_name)
    if file_path is None or not file_path.exists():
        raise HTTPException(status_code=404, detail="Requested session file not found.")
    return FileResponse(path=file_path, filename=file_path.name)


def build_chat_system_prompt(session) -> str:
    outline = "\n".join(f"- {section.id}: {section.title}" for section in session.template_structure.sections)
    base_prompt = (
        "You are a document editor helping refine a document. "
        "Preserve the original document's structure, format, and layout as closely as possible — do not reorganise it into a specification or impose a new structure unless the user explicitly asks for one. "
        "Ask concise follow-up questions only when information is missing, and update the draft with any user-provided facts. "
        "When the user asks to set or replace a value in a named section, you must return a section_updates entry for that section. "
        "When the user asks to add, move, reorder, or delete sections, return section_operations that describe the structural change. "
        "Use action=add for new sections, action=move for reordering, and action=delete for removals. "
        "For moves and inserts, use position=top, end, before, or after, and include the relative section title or id when needed. "
        "Always use the exact section_id values provided below whenever possible. Return JSON with assistant_message, summary, section_updates, and section_operations.\n"
        f"Document outline:\n{outline}"
    )
    return llm_provider.with_scenario_mcp_context(base_prompt, session.mcp_servers)


def build_chat_user_prompt(session, message: str, good_examples, negative_constraints: list[str]) -> str:
    draft_snapshot = "\n".join(
        f"- {section.section_id} | {section.title} | status={section.status} | current={section.content or '[missing]'}"
        for section in session.draft_state.sections
    )
    pending_sections = ", ".join(section.title for section in session.draft_state.sections if section.status != "complete") or "none"
    existing_prompt_sequence = format_prompt_sequence(session.prompt_sequence) or "No saved user instructions yet."
    positive_context = "\n\n".join(snippet.content[:900] for snippet in good_examples) or "No good examples were uploaded."
    negative_context = "\n".join(f"- {constraint}" for constraint in negative_constraints) or "- No bad examples were uploaded."
    return (
        f"User message:\n{message}\n\n"
        f"Saved user instructions in chronological order:\n{existing_prompt_sequence}\n\n"
        f"Current draft:\n{draft_snapshot}\n\n"
        f"Pending sections: {pending_sections}\n\n"
        f"Good examples for tone and structure:\n{positive_context}\n\n"
        f"Negative constraints derived from bad examples:\n{negative_context}\n\n"
        "Return JSON in this shape: "
        '{"assistant_message": string, "summary": string, "section_updates": [{"section_id": string, "title": string, "content": string, "status": "missing|in_progress|complete"}], "section_operations": [{"action": "add|move|delete", "section_id": string | null, "title": string | null, "content": string, "status": "missing|in_progress|complete", "position": "top|end|before|after" | null, "relative_section_id": string | null, "relative_title": string | null}]}. '
        "Use section_updates for content changes and section_operations for structural changes."
    )


def append_prompt_sequence(existing_prompts: list[str], latest_message: str) -> list[str]:
    next_message = latest_message.strip()
    if not next_message:
        return list(existing_prompts)
    return [*existing_prompts, next_message]


def format_prompt_sequence(prompt_sequence: list[str]) -> str | None:
    normalized = [item.strip() for item in prompt_sequence if item.strip()]
    if not normalized:
        return None
    return "\n\n".join(normalized)


def render_preview_markdown(session) -> str:
    has_draft_content = any(section.content.strip() for section in session.draft_state.sections)

    if session.source_preview_markdown and not has_draft_content:
        parts: list[str] = [session.source_preview_markdown.strip()]
        for section in session.draft_state.sections:
            section_images = session.enhancement_section_image_paths.get(section.section_id, [])
            if not section_images:
                continue
            parts.append(f"## {section.title}")
            for index, image_path in enumerate(section_images, start=1):
                parts.append(f"![{section.title} image {index}](/sessions/{session.session_id}/files/enhancement_image/{image_path.name})")
        return "\n\n".join(part for part in parts if part)

    parts: list[str] = []
    for section in session.draft_state.sections:
        section_images = session.enhancement_section_image_paths.get(section.section_id, [])
        parts.append(f"## {section.title}")
        parts.append(section.content or ("_Imported visual reference_" if section_images else "_Pending input_"))
        for index, image_path in enumerate(section_images, start=1):
            parts.append(f"![{section.title} image {index}](/sessions/{session.session_id}/files/enhancement_image/{image_path.name})")
    return "\n\n".join(parts)


def resolve_draft_section(sections: list[DraftSectionState], section_id: str | None, title: str | None) -> DraftSectionState | None:
    if section_id:
        for section in sections:
            if section.section_id == section_id:
                return section
    normalized_section_id = normalize_key(section_id)
    normalized_title = normalize_key(title)
    for section in sections:
        if normalized_section_id and normalize_key(section.section_id) == normalized_section_id:
            return section
        if normalized_section_id and normalize_key(section.title) == normalized_section_id:
            return section
        if normalized_title and normalize_key(section.title) == normalized_title:
            return section
    return None


def build_generated_export_files(session_id: str, languages: list[str], generated_files: list[Path]) -> list[GeneratedExportFile]:
    documents: list[GeneratedExportFile] = []
    for language, file_path in zip(languages, generated_files, strict=False):
        documents.append(
            GeneratedExportFile(
                language=language,
                format=file_path.suffix.lower().lstrip("."),
                file_name=file_path.name,
                download_path=f"/export/{session_id}/files/{file_path.name}",
            )
        )
    return documents


def infer_languages_from_paths(generated_files: list[Path]) -> list[str]:
    return [infer_language_from_file_name(file_path) for file_path in generated_files]


def infer_language_from_file_name(file_path: Path) -> str:
    match = re.search(r"\.([^.]+)\.(?:docx|pdf)$", file_path.name, flags=re.IGNORECASE)
    if match is None:
        return file_path.stem
    return match.group(1).replace("-", " ").replace("_", " ").title()


def normalize_key(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.lower().replace("_", " ").replace("-", " ").split())


def find_section_index(sections: list[DraftSectionState], section_id: str | None, title: str | None) -> int | None:
    normalized_section_id = normalize_key(section_id)
    normalized_title = normalize_key(title)
    for index, section in enumerate(sections):
        if section_id and section.section_id == section_id:
            return index
        if normalized_section_id and normalize_key(section.section_id) == normalized_section_id:
            return index
        if normalized_section_id and normalize_key(section.title) == normalized_section_id:
            return index
        if normalized_title and normalize_key(section.title) == normalized_title:
            return index
    return None


def refresh_outline(session) -> None:
    session.template_structure.extracted_outline = [section.title for section in session.template_structure.sections]


def resolve_insert_index(
    session,
    *,
    position: str | None,
    relative_section_id: str | None = None,
    relative_title: str | None = None,
) -> int:
    if position == "top":
        return 0
    if position in {None, "end"}:
        return len(session.draft_state.sections)

    reference_index = find_section_index(session.draft_state.sections, relative_section_id, relative_title)
    if reference_index is None:
        return len(session.draft_state.sections)
    if position == "before":
        return reference_index
    if position == "after":
        return reference_index + 1
    return len(session.draft_state.sections)


def insert_dynamic_section(
    session,
    *,
    title: str,
    content: str,
    status: str,
    position: str | None = None,
    relative_section_id: str | None = None,
    relative_title: str | None = None,
) -> DraftSectionState:
    section_id = build_dynamic_section_id(session.draft_state.sections)
    insert_index = resolve_insert_index(
        session,
        position=position,
        relative_section_id=relative_section_id,
        relative_title=relative_title,
    )
    session.template_structure.sections.insert(
        insert_index,
        TemplateSection(
            id=section_id,
            title=title.strip(),
            level=1,
            prompt_hint="Added during refinement",
        ),
    )
    draft_section = DraftSectionState(
        section_id=section_id,
        title=title.strip(),
        content=content,
        status=status if status in {"missing", "in_progress", "complete"} else "complete",
        last_updated_at=datetime.now(UTC),
    )
    session.draft_state.sections.insert(insert_index, draft_section)
    refresh_outline(session)
    return draft_section


def delete_section(session, section_index: int) -> None:
    section_id = session.draft_state.sections[section_index].section_id
    session.draft_state.sections.pop(section_index)
    session.template_structure.sections.pop(section_index)
    session.enhancement_section_image_paths.pop(section_id, None)
    refresh_outline(session)


def move_section(
    session,
    section_index: int,
    *,
    position: str | None,
    relative_section_id: str | None = None,
    relative_title: str | None = None,
) -> None:
    draft_section = session.draft_state.sections.pop(section_index)
    template_section = session.template_structure.sections.pop(section_index)
    destination_index = resolve_insert_index(
        session,
        position=position,
        relative_section_id=relative_section_id,
        relative_title=relative_title,
    )
    session.draft_state.sections.insert(destination_index, draft_section)
    session.template_structure.sections.insert(destination_index, template_section)
    refresh_outline(session)


def infer_section_assignment_from_message(message: str, sections: list[DraftSectionState]) -> tuple[DraftSectionState, str] | None:
    quoted_values = re.findall(r'"([^"]+)"', message)
    quoted_values.extend(match for match in re.findall(r"'([^']+)'", message) if match not in quoted_values)

    normalized_titles = {normalize_key(section.title): section for section in sections}
    mentioned_sections = [section for section in sections if normalize_key(section.title) in normalize_key(message)]

    for quoted in quoted_values:
        normalized_quoted = normalize_key(quoted)
        if normalized_quoted in normalized_titles:
            candidate_values = [value.strip() for value in quoted_values if normalize_key(value) != normalized_quoted and value.strip()]
            if candidate_values:
                return normalized_titles[normalized_quoted], candidate_values[0]

    if len(mentioned_sections) == 1 and quoted_values:
        return mentioned_sections[0], quoted_values[0].strip()

    for section in sections:
        pattern = re.compile(
            rf"(?:set|update|change|fill|replace|make)\s+(?:the\s+)?{re.escape(section.title)}(?:\s+field|\s+section)?(?:\s+to|\s+with|\s+as|\s+become)?\s+(.+?)(?:[.!?]|$)",
            re.IGNORECASE,
        )
        match = pattern.search(message)
        if match:
            value = match.group(1).strip().strip('"').strip("'")
            if value:
                return section, value

    if len(mentioned_sections) == 1:
        assign_match = re.search(r"(?:to|with|as|become)\s+(.+?)(?:[.!?]|$)", message, re.IGNORECASE)
        if assign_match:
            value = assign_match.group(1).strip().strip('"').strip("'")
            if value:
                return mentioned_sections[0], value

    return None


def infer_structure_operation(message: str, sections: list[DraftSectionState]) -> ChatSectionOperation | None:
    normalized_message = " ".join(message.strip().split())
    if not normalized_message:
        return None

    add_match = re.search(
        r"(?:add|create|insert)\s+(?:a\s+)?(?:new\s+)?section\s+(?:named|called|titled)\s+[\"']?(?P<title>.+?)[\"']?(?=(?:\s+(?:with|containing|that contains|to include|including|before|after|at|on)\b|[.!?]|$))(?P<rest>.*)$",
        normalized_message,
        re.IGNORECASE,
    )
    if add_match is not None:
        title = add_match.group("title").strip().strip(" .")
        rest = add_match.group("rest").strip()
        if title:
            position, relative_title = infer_position(rest)
            content = infer_requested_content(rest)
            return ChatSectionOperation(
                action="add",
                title=title.title(),
                content=content or "Section added during refinement.",
                status="complete",
                position=position,
                relative_title=relative_title,
            )

    delete_match = re.search(
        r"(?:delete|remove)\s+(?:the\s+)?(?:section\s+)?[\"']?(?P<title>.+?)[\"']?(?=(?:\s+section)?(?:[.!?]|$))",
        normalized_message,
        re.IGNORECASE,
    )
    if delete_match is not None:
        title = delete_match.group("title").strip().strip(" .")
        if title and find_section_index(sections, None, title) is not None:
            return ChatSectionOperation(action="delete", title=title.title())

    move_match = re.search(
        r"(?:move|put|place)\s+(?:the\s+)?[\"']?(?P<title>.+?)(?:\s+section)?[\"']?\s+(?P<rest>(?:to\s+)?(?:the\s+)?(?:top|beginning|start|end|bottom|before\s+.+|after\s+.+))$",
        normalized_message,
        re.IGNORECASE,
    )
    if move_match is not None:
        title = move_match.group("title").strip().strip(" .")
        rest = move_match.group("rest").strip()
        position, relative_title = infer_position(rest)
        if title and position:
            return ChatSectionOperation(
                action="move",
                title=title.title(),
                position=position,
                relative_title=relative_title,
            )

    return None


def infer_position(message_tail: str) -> tuple[str | None, str | None]:
    lowered = message_tail.lower()
    if "top" in lowered or "beginning" in lowered or "start" in lowered:
        return "top", None
    if re.search(r"\b(?:end|bottom)\b", lowered):
        return "end", None

    before_match = re.search(r"before\s+(?:the\s+)?[\"']?(?P<title>[^\"'.]+)(?:\s+section)?[\"']?(?:[.!?]|$)", message_tail, re.IGNORECASE)
    if before_match is not None:
        return "before", before_match.group("title").strip().strip(" .").title()

    after_match = re.search(r"after\s+(?:the\s+)?[\"']?(?P<title>[^\"'.]+)(?:\s+section)?[\"']?(?:[.!?]|$)", message_tail, re.IGNORECASE)
    if after_match is not None:
        return "after", after_match.group("title").strip().strip(" .").title()

    return None, None


def infer_requested_content(message_tail: str) -> str:
    content_match = re.search(
        r"(?:with|containing|that contains|to include|including|with the)\s+(?P<content>.+?)(?:\s+(?:at|on)\s+(?:the\s+)?(?:top|beginning|start|end|bottom)|\s+(?:before|after)\s+.+)?$",
        message_tail,
        re.IGNORECASE,
    )
    if content_match is None:
        return ""
    return resolve_dynamic_section_content(content_match.group("content").strip().strip(" ."))


def resolve_dynamic_section_content(raw_content: str) -> str:
    if not raw_content:
        return ""

    lowered = raw_content.lower()
    now = datetime.now().astimezone()
    if "date and time of today" in lowered or "current date and time" in lowered or "today's date and time" in lowered:
        return now.strftime("%Y-%m-%d %H:%M:%S %Z").strip()
    if lowered in {"today's date", "todays date", "the date of today", "current date"}:
        return now.strftime("%Y-%m-%d")
    return raw_content


def build_dynamic_section_id(sections: list[DraftSectionState]) -> str:
    existing_ids = {section.section_id for section in sections}
    next_index = 1
    while True:
        candidate = f"dynamic-section-{next_index}"
        if candidate not in existing_ids:
            return candidate
        next_index += 1


def build_loaded_files(session) -> list[LoadedFileReference]:
    loaded_files = [
        LoadedFileReference(
            kind="template",
            file_name=session.template_path.name,
            download_path=f"/sessions/{session.session_id}/files/template/{session.template_path.name}",
        )
    ]
    if session.enhancement_document_path is not None:
        loaded_files.append(
            LoadedFileReference(
                kind="enhancement_document",
                file_name=session.enhancement_document_path.name,
                download_path=f"/sessions/{session.session_id}/files/enhancement_document/{session.enhancement_document_path.name}",
            )
        )
    loaded_files.extend(
        LoadedFileReference(
            kind="good_example",
            file_name=path.name,
            download_path=f"/sessions/{session.session_id}/files/good_example/{path.name}",
        )
        for path in session.good_example_paths
    )
    loaded_files.extend(
        LoadedFileReference(
            kind="bad_example",
            file_name=path.name,
            download_path=f"/sessions/{session.session_id}/files/bad_example/{path.name}",
        )
        for path in session.bad_example_paths
    )
    return loaded_files


def resolve_session_file(session, kind: str, file_name: str) -> Path | None:
    if kind == "template" and session.template_path.name == file_name:
        return session.template_path
    if kind == "enhancement_document" and session.enhancement_document_path and session.enhancement_document_path.name == file_name:
        return session.enhancement_document_path
    if kind == "enhancement_image":
        for path in session.enhancement_image_paths:
            if path.name == file_name:
                return path
    if kind == "good_example":
        for path in session.good_example_paths:
            if path.name == file_name:
                return path
    if kind == "bad_example":
        for path in session.bad_example_paths:
            if path.name == file_name:
                return path
    return None
