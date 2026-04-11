from __future__ import annotations

import shutil
import sys
import zipfile
from pathlib import Path

import pytest
from docx import Document
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.main import app
from app.main import render_preview_markdown
from app.models.document_state import DocumentDraftState, DraftSectionState, SessionContext, TemplateSection, TemplateStructure
from app.services.session_store import session_store
from app.services.llm_provider import llm_provider
from app.services.rag_service import rag_service
from scripts.run_batch_workflow import run_batch_workflow


def test_checked_in_docx_fixtures_generate_expected_output(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    docx_prompt: str,
    sample_docx_template_path: Path,
    sample_docx_good_example_path: Path,
    sample_docx_bad_example_path: Path,
    expected_docx_output_path: Path,
) -> None:
    working_template_path = tmp_path / sample_docx_template_path.name
    shutil.copyfile(sample_docx_template_path, working_template_path)

    monkeypatch.setattr(rag_service, "index_examples", lambda *args, **kwargs: [])

    async def fake_generate_json(*, system_prompt: str, user_prompt: str, temperature: float = 0.2, mcp_servers=None):
        if '"assistant_message"' in user_prompt:
            return {
                "assistant_message": "Captured the compliance onboarding specification and filled all required sections.",
                "summary": "Compliance onboarding workflow for regulated enterprise customers.",
                "section_updates": [
                    {
                        "section_id": "section-1",
                        "title": "Project Overview",
                        "content": "Build a compliance onboarding workflow for regulated enterprise customers across KYC and document review stages.",
                        "status": "complete",
                    },
                    {
                        "section_id": "section-2",
                        "title": "Functional Requirements",
                        "content": "Capture identity verification, document review, dual approval, reviewer notifications, and a complete audit trail for every submission.",
                        "status": "complete",
                    },
                    {
                        "section_id": "section-3",
                        "title": "Non-Functional Requirements",
                        "content": "Enforce role-based access control, retain approval records for seven years, and prepare all user-facing content for localization.",
                        "status": "complete",
                    },
                ],
            }

        if "Target language: English." in system_prompt:
            return {
                "sections": [
                    {
                        "section_id": "section-1",
                        "title": "Project Overview",
                        "content": "Build a compliance onboarding workflow for regulated enterprise customers across KYC and document review stages.",
                    },
                    {
                        "section_id": "section-2",
                        "title": "Functional Requirements",
                        "content": "Capture identity verification, document review, dual approval, reviewer notifications, and a complete audit trail for every submission.",
                    },
                    {
                        "section_id": "section-3",
                        "title": "Non-Functional Requirements",
                        "content": "Enforce role-based access control, retain approval records for seven years, and prepare all user-facing content for localization.",
                    },
                ]
            }

        if "Target language: Spanish." in system_prompt:
            return {
                "sections": [
                    {
                        "section_id": "section-1",
                        "title": "Resumen del proyecto",
                        "content": "Crear un flujo de incorporacion de cumplimiento para clientes empresariales regulados en las etapas de KYC y revision documental.",
                    },
                    {
                        "section_id": "section-2",
                        "title": "Requisitos funcionales",
                        "content": "Capturar la verificacion de identidad, la revision documental, la aprobacion dual, las notificaciones a revisores y una pista de auditoria completa para cada envio.",
                    },
                    {
                        "section_id": "section-3",
                        "title": "Requisitos no funcionales",
                        "content": "Aplicar control de acceso basado en roles, conservar los registros de aprobacion durante siete anos y preparar todo el contenido visible para localizacion.",
                    },
                ]
            }

        raise AssertionError(f"Unexpected prompt in fixture workflow test: {system_prompt}")

    monkeypatch.setattr(llm_provider, "generate_json", fake_generate_json)

    with TestClient(app) as client:
        result = run_batch_workflow(
            base_url="http://testserver",
            template_path=working_template_path,
            good_example_paths=[sample_docx_good_example_path],
            bad_example_paths=[sample_docx_bad_example_path],
            message=docx_prompt,
            languages=["English", "Spanish"],
            output_file_name="localized-onboarding-spec",
            client=client,
        )

    export_payload = result["export"]
    archive_path = Path(export_payload["archive_path"])
    generated_document_paths = [Path(path) for path in export_payload["generated_files"]]
    english_document_path = next(path for path in generated_document_paths if path.name.endswith(".english.docx"))
    spanish_document_path = next(path for path in generated_document_paths if path.name.endswith(".spanish.docx"))

    assert archive_path.exists()
    assert archive_path.name == "localized-onboarding-spec.zip"
    assert len(generated_document_paths) == 2
    assert all(path.exists() for path in generated_document_paths)

    with zipfile.ZipFile(archive_path) as archive:
        names = set(archive.namelist())
        assert "localized-onboarding-spec.english.docx" in names
        assert "localized-onboarding-spec.spanish.docx" in names

    assert docx_text(english_document_path) == docx_text(expected_docx_output_path)
    spanish_lines = docx_text(spanish_document_path)
    assert spanish_lines[0] == "Resumen del proyecto"
    assert spanish_lines[1].startswith("Crear un flujo de incorporacion de cumplimiento")
    assert spanish_lines != docx_text(expected_docx_output_path)


def docx_text(path: Path) -> list[str]:
    document = Document(str(path))
    return [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]


def test_existing_docx_images_are_reflected_in_preview(
    isolated_storage: Path,
    sample_docx_template_path: Path,
    sample_docx_enhancement_with_image_path: Path,
) -> None:
    with TestClient(app) as client:
        with sample_docx_template_path.open("rb") as template_file, sample_docx_enhancement_with_image_path.open("rb") as enhancement_file:
            response = client.post(
                "/ingest",
                files={
                    "template": (
                        sample_docx_template_path.name,
                        template_file,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ),
                    "existing_document": (
                        sample_docx_enhancement_with_image_path.name,
                        enhancement_file,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ),
                },
            )

    assert response.status_code == 200
    payload = response.json()
    assert "/files/enhancement_image/" in payload["preview_markdown"]

    session = session_store.get(payload["session_id"])
    rendered_preview = render_preview_markdown(session)
    assert "/files/enhancement_image/" in rendered_preview


def test_template_docx_images_are_reflected_in_preview_when_no_existing_document_is_uploaded(
    isolated_storage: Path,
    sample_docx_enhancement_with_image_path: Path,
) -> None:
    with TestClient(app) as client:
        with sample_docx_enhancement_with_image_path.open("rb") as template_file:
            response = client.post(
                "/ingest",
                files={
                    "template": (
                        sample_docx_enhancement_with_image_path.name,
                        template_file,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ),
                },
            )

    assert response.status_code == 200
    payload = response.json()
    assert "/files/enhancement_image/" in payload["preview_markdown"]

    session = session_store.get(payload["session_id"])
    rendered_preview = render_preview_markdown(session)
    assert "/files/enhancement_image/" in rendered_preview


def test_render_preview_preserves_source_markdown_when_only_images_are_mapped() -> None:
    image_path = Path("/tmp/imported-preview-image.png")
    session = SessionContext(
        session_id="preview-session",
        template_path=Path("/tmp/template.pdf"),
        template_structure=TemplateStructure(
            file_name="template.pdf",
            file_type="pdf",
            sections=[TemplateSection(id="section-1", title="Imported content")],
        ),
        source_preview_markdown="# Imported PDF\n\nThis paragraph came from the uploaded PDF.",
        draft_state=DocumentDraftState(
            session_id="preview-session",
            sections=[DraftSectionState(section_id="section-1", title="Imported content")],
        ),
        enhancement_image_paths=[image_path],
        enhancement_section_image_paths={"section-1": [image_path]},
    )

    rendered_preview = render_preview_markdown(session)

    assert "This paragraph came from the uploaded PDF." in rendered_preview
    assert "/files/enhancement_image/imported-preview-image.png" in rendered_preview
