from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
import re

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.core.errors import ExportError, LLMProviderError, SessionNotFoundError, UnsupportedTemplateError
from app.models.document_state import (
    ChatRequest,
    ChatResponse,
    ChatResult,
    DraftSectionState,
    ExportRequest,
    ExportResponse,
    IngestResponse,
    LoadScenarioRequest,
    SaveScenarioRequest,
    SaveScenarioResponse,
    ScenarioSummary,
)
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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "timestamp": datetime.now(UTC).isoformat()}


@app.post("/ingest", response_model=IngestResponse)
async def ingest(
    template: UploadFile = File(...),
    good_examples: list[UploadFile] = File(default=[]),
    bad_examples: list[UploadFile] = File(default=[]),
) -> IngestResponse:
    try:
        session = await ingestion_service.initialize_session(
            template_file=template,
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
        warnings=session.warnings,
    )


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    try:
        session = session_store.get(request.session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

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
    for incoming in result.section_updates:
        existing = resolve_draft_section(session.draft_state.sections, incoming.section_id, incoming.title)
        if existing is None:
            continue
        existing.content = incoming.content
        existing.status = incoming.status
        existing.last_updated_at = datetime.now(UTC)
        applied_updates += 1

    if applied_updates == 0:
        fallback_update = infer_section_assignment_from_message(request.message, session.draft_state.sections)
        if fallback_update is not None:
            fallback_section, fallback_value = fallback_update
            fallback_section.content = fallback_value
            fallback_section.status = "complete"
            fallback_section.last_updated_at = datetime.now(UTC)
            applied_updates += 1

    session.draft_state.summary = result.summary or session.draft_state.summary
    session.draft_state.updated_at = datetime.now(UTC)
    session.prompt = request.message
    session_store.update(session.session_id, session)

    preview_markdown = render_preview_markdown(session)
    next_sections = [section.title for section in session.draft_state.sections if section.status != "complete"]
    return ChatResponse(
        session_id=session.session_id,
        assistant_message=result.assistant_message,
        draft_state=session.draft_state,
        preview_markdown=preview_markdown,
        next_required_sections=next_sections,
        warnings=warnings,
        llm_available=llm_available,
    )


@app.post("/export", response_model=ExportResponse)
async def export(request: ExportRequest) -> ExportResponse:
    try:
        session = session_store.get(request.session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if session.template_structure.file_type != "docx":
        raise HTTPException(
            status_code=400,
            detail="Export requires the source template to be .docx so styling and layout can be preserved.",
        )

    translation_payload: dict[str, dict[str, str]] = {}
    warnings = list(session.warnings)
    session.export_languages = request.target_languages
    session_store.update(session.session_id, session)

    for language in request.target_languages:
        style_context = rag_service.retrieve(session.session_id, f"tone and style guidance for {language}", limit=2)
        try:
            payload = await llm_provider.generate_json(
                system_prompt=build_translation_system_prompt(session, language),
                user_prompt=build_translation_user_prompt(session, language, style_context.good_examples),
                temperature=0.1,
            )
            sections = payload.get("sections") or []
            translation_payload[language] = {
                section["section_id"]: section["content"]
                for section in sections
                if isinstance(section, dict) and section.get("section_id") and section.get("content")
            }
        except LLMProviderError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    output_directory = settings.generated_root / request.session_id
    try:
        archive_path, generated_files, export_warnings = translation_service.inject_translations(
            session=session,
            translations=translation_payload,
            output_directory=output_directory,
        )
    except ExportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    warnings.extend(export_warnings)
    return ExportResponse(
        session_id=request.session_id,
        archive_path=str(archive_path),
        generated_files=[str(file_path) for file_path in generated_files],
        warnings=warnings,
    )


@app.get("/export/{session_id}/download")
async def download_export(session_id: str) -> FileResponse:
    archive_path = settings.generated_root / session_id / f"{session_id}.zip"
    if not archive_path.exists():
        raise HTTPException(status_code=404, detail="Export archive not found.")
    return FileResponse(path=archive_path, filename=archive_path.name, media_type="application/zip")


@app.get("/scenarios", response_model=list[ScenarioSummary])
async def list_scenarios() -> list[ScenarioSummary]:
    return scenario_service.list_scenarios()


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
            target_languages=request.target_languages,
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
    return scenario_service.build_load_response(session, render_preview_markdown(session))


def build_chat_system_prompt(session) -> str:
    outline = "\n".join(f"- {section.id}: {section.title}" for section in session.template_structure.sections)
    return (
        "You are an interviewing analyst helping complete a structured specification document. "
        "Ask concise follow-up questions only when information is missing, and update the draft with any user-provided facts. "
        "When the user asks to set or replace a value in a named section, you must return a section_updates entry for that section. "
        "Always use the exact section_id values provided below whenever possible. Return JSON with assistant_message, summary, and section_updates.\n"
        f"Template outline:\n{outline}"
    )


def build_chat_user_prompt(session, message: str, good_examples, negative_constraints: list[str]) -> str:
    draft_snapshot = "\n".join(
        f"- {section.section_id} | {section.title} | status={section.status} | current={section.content or '[missing]'}"
        for section in session.draft_state.sections
    )
    pending_sections = ", ".join(section.title for section in session.draft_state.sections if section.status != "complete") or "none"
    positive_context = "\n\n".join(snippet.content[:900] for snippet in good_examples) or "No good examples were uploaded."
    negative_context = "\n".join(f"- {constraint}" for constraint in negative_constraints) or "- No bad examples were uploaded."
    return (
        f"User message:\n{message}\n\n"
        f"Current draft:\n{draft_snapshot}\n\n"
        f"Pending sections: {pending_sections}\n\n"
        f"Good examples for tone and structure:\n{positive_context}\n\n"
        f"Negative constraints derived from bad examples:\n{negative_context}\n\n"
        "Return JSON in this shape: "
        '{"assistant_message": string, "summary": string, "section_updates": [{"section_id": string, "title": string, "content": string, "status": "missing|in_progress|complete"}]}'
    )


def build_translation_system_prompt(session, language: str) -> str:
    return (
        "You translate structured business and technical documentation. "
        "Preserve meaning, formatting intent, headings, and professional tone. "
        "Return only JSON with a sections array, each containing section_id and content. "
        f"Target language: {language}."
    )


def build_translation_user_prompt(session, language: str, good_examples) -> str:
    examples = "\n\n".join(snippet.content[:700] for snippet in good_examples) or "No good examples uploaded."
    source_sections = "\n\n".join(
        f"Section ID: {section.section_id}\nTitle: {section.title}\nContent:\n{section.content}"
        for section in session.draft_state.sections
        if section.content.strip()
    )
    return (
        f"Translate the drafted document content below into {language}. Do not translate template placeholder text that is not present in the drafted content.\n\n"
        f"Tone guidance from approved examples:\n{examples}\n\n"
        f"Drafted source sections to translate:\n{source_sections}\n\n"
        'Return JSON in this shape: {"sections": [{"section_id": string, "content": string}]}'
    )


def render_preview_markdown(session) -> str:
    parts = [f"# {Path(session.template_path).stem}"]
    if session.draft_state.summary:
        parts.append(session.draft_state.summary)
    for section in session.draft_state.sections:
        parts.append(f"## {section.title}")
        parts.append(section.content or "_Pending input_")
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


def normalize_key(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.lower().replace("_", " ").replace("-", " ").split())


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