from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.core.errors import ExportError, LLMProviderError, SessionNotFoundError, UnsupportedTemplateError
from app.models.document_state import ChatRequest, ChatResponse, ChatResult, ExportRequest, ExportResponse, IngestResponse
from app.services.ingestion_service import ingestion_service
from app.services.llm_provider import llm_provider
from app.services.rag_service import rag_service
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

    updated_sections = {section.section_id: section for section in session.draft_state.sections}
    for incoming in result.section_updates:
        existing = updated_sections.get(incoming.section_id)
        if existing is None:
            continue
        existing.content = incoming.content
        existing.status = incoming.status
        existing.last_updated_at = datetime.now(UTC)

    session.draft_state.summary = result.summary or session.draft_state.summary
    session.draft_state.updated_at = datetime.now(UTC)
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


def build_chat_system_prompt(session) -> str:
    outline = "\n".join(f"- {section.title}" for section in session.template_structure.sections)
    return (
        "You are an interviewing analyst helping complete a structured specification document. "
        "Ask concise follow-up questions only when information is missing, and update the draft with any user-provided facts. "
        "Return JSON with assistant_message, summary, and section_updates.\n"
        f"Template outline:\n{outline}"
    )


def build_chat_user_prompt(session, message: str, good_examples, negative_constraints: list[str]) -> str:
    draft_snapshot = "\n".join(
        f"- {section.title}: {section.content or '[missing]'}"
        for section in session.draft_state.sections
    )
    positive_context = "\n\n".join(snippet.content[:900] for snippet in good_examples) or "No good examples were uploaded."
    negative_context = "\n".join(f"- {constraint}" for constraint in negative_constraints) or "- No bad examples were uploaded."
    return (
        f"User message:\n{message}\n\n"
        f"Current draft:\n{draft_snapshot}\n\n"
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
        f"Translate the following document content into {language}.\n\n"
        f"Tone guidance from approved examples:\n{examples}\n\n"
        f"Source sections:\n{source_sections}\n\n"
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