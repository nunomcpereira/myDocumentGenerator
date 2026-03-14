from __future__ import annotations

import sys
import zipfile
from pathlib import Path

from docx import Document
from fastapi.testclient import TestClient
import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.main import app
from app.services.llm_provider import llm_provider
from app.services.rag_service import rag_service
from app.services.session_store import session_store
from app.services.translation_service import translation_service
from scripts.run_batch_workflow import run_batch_workflow


def test_batch_workflow_generates_localized_archive(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    sample_template_path: Path,
    sample_prompt: str,
    isolated_storage: Path,
):
    template_path = sample_template_path
    good_example_path = ROOT_DIR / "tests" / "fixtures" / "good_example.txt"
    bad_example_path = ROOT_DIR / "tests" / "fixtures" / "bad_example.txt"

    monkeypatch.setattr(rag_service, "index_examples", lambda *args, **kwargs: [])

    async def fake_generate_json(*, system_prompt: str, user_prompt: str, temperature: float = 0.2):
        if "assistant_message" in user_prompt:
            return {
                "assistant_message": "Captured the core scope. Please confirm any audit retention rules.",
                "summary": "Compliance onboarding workflow for enterprise customers.",
                "section_updates": [
                    {
                        "section_id": "section-1",
                        "title": "Project Overview",
                        "content": "Build a compliance onboarding workflow for enterprise customers.",
                        "status": "complete",
                    },
                    {
                        "section_id": "section-2",
                        "title": "Functional Requirements",
                        "content": "Include identity verification, document review, approval audit trail, and reviewer notifications.",
                        "status": "complete",
                    },
                ],
            }

        if "Target language: Spanish." in system_prompt:
            return {
                "sections": [
                    {
                        "section_id": "section-1",
                        "content": "Crear un flujo de incorporacion de cumplimiento para clientes empresariales.",
                    },
                    {
                        "section_id": "section-2",
                        "content": "Incluir verificacion de identidad, revision documental, trazabilidad de aprobacion y notificaciones.",
                    },
                ]
            }

        if "Target language: French." in system_prompt:
            return {
                "sections": [
                    {
                        "section_id": "section-1",
                        "content": "Creer un flux d'integration de conformite pour les clients entreprise.",
                    },
                    {
                        "section_id": "section-2",
                        "content": "Inclure la verification d'identite, la revue documentaire, la piste d'audit et les notifications.",
                    },
                ]
            }

        raise AssertionError(f"Unexpected LLM prompt: {system_prompt}")

    monkeypatch.setattr(llm_provider, "generate_json", fake_generate_json)

    with TestClient(app) as client:
        result = run_batch_workflow(
            base_url="http://testserver",
            template_path=template_path,
            good_example_paths=[good_example_path],
            bad_example_paths=[bad_example_path],
            message=sample_prompt,
            languages=["Spanish", "French"],
            client=client,
        )

    ingest_payload = result["ingest"]
    chat_payload = result["chat"]
    export_payload = result["export"]

    assert ingest_payload["template"]["file_type"] == "docx"
    assert len(ingest_payload["template"]["sections"]) == 2
    assert chat_payload["llm_available"] is True
    assert "Compliance onboarding workflow" in chat_payload["preview_markdown"]

    archive_path = Path(export_payload["archive_path"])
    assert archive_path.exists()
    assert len(export_payload["generated_files"]) == 2

    with zipfile.ZipFile(archive_path) as archive:
        archive_names = set(archive.namelist())
        assert "template.spanish.docx" in archive_names
        assert "template.french.docx" in archive_names

    spanish_document = Document(str(archive_path.parent / "template.spanish.docx"))
    spanish_text = "\n".join(paragraph.text for paragraph in spanish_document.paragraphs)
    assert "Crear un flujo de incorporacion de cumplimiento" in spanish_text

    session_id = ingest_payload["session_id"]
    assert session_store.get(session_id).draft_state.sections[0].status == "complete"


def test_chat_updates_section_when_llm_returns_title_instead_of_section_id(
    monkeypatch: pytest.MonkeyPatch,
    sample_template_path: Path,
    isolated_storage: Path,
) -> None:
    monkeypatch.setattr(rag_service, "index_examples", lambda *args, **kwargs: [])

    async def fake_generate_json(*, system_prompt: str, user_prompt: str, temperature: float = 0.2):
        if '"assistant_message"' in user_prompt:
            return {
                "assistant_message": "Updated the requested field.",
                "summary": "One field updated.",
                "section_updates": [
                    {
                        "section_id": "project overview",
                        "title": "Project Overview",
                        "content": "Nuno Pereira",
                        "status": "complete",
                    }
                ],
            }
        raise AssertionError(f"Unexpected prompt: {system_prompt}")

    monkeypatch.setattr(llm_provider, "generate_json", fake_generate_json)

    with TestClient(app) as client:
        with sample_template_path.open("rb") as template_handle:
            ingest_response = client.post(
                "/ingest",
                files={
                    "template": (
                        sample_template_path.name,
                        template_handle.read(),
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )
                },
            )
        ingest_response.raise_for_status()
        session_id = ingest_response.json()["session_id"]

        chat_response = client.post(
            "/chat",
            json={"session_id": session_id, "message": "Set Project Overview to Nuno Pereira."},
        )
        chat_response.raise_for_status()

    payload = chat_response.json()
    assert "Nuno Pereira" in payload["preview_markdown"]
    assert payload["draft_state"]["sections"][0]["content"] == "Nuno Pereira"


def test_chat_falls_back_to_user_assignment_when_llm_returns_no_section_updates(
    monkeypatch: pytest.MonkeyPatch,
    sample_docx_template_path: Path,
    sample_docx_good_example_path: Path,
    sample_docx_bad_example_path: Path,
    isolated_storage: Path,
) -> None:
    monkeypatch.setattr(rag_service, "index_examples", lambda *args, **kwargs: [])

    async def fake_generate_json(*, system_prompt: str, user_prompt: str, temperature: float = 0.2):
        if '"assistant_message"' in user_prompt:
            return {
                "assistant_message": "Updating the Project Overview field with the provided name.",
                "summary": "Project Overview section has been updated with 'Nuno Pereira'.",
                "section_updates": [],
            }
        raise AssertionError(f"Unexpected prompt: {system_prompt}")

    monkeypatch.setattr(llm_provider, "generate_json", fake_generate_json)

    with TestClient(app) as client:
        with sample_docx_template_path.open("rb") as template_handle, sample_docx_good_example_path.open("rb") as good_handle, sample_docx_bad_example_path.open("rb") as bad_handle:
            ingest_response = client.post(
                "/ingest",
                files=[
                    (
                        "template",
                        (
                            sample_docx_template_path.name,
                            template_handle.read(),
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        ),
                    ),
                    (
                        "good_examples",
                        (
                            sample_docx_good_example_path.name,
                            good_handle.read(),
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        ),
                    ),
                    (
                        "bad_examples",
                        (
                            sample_docx_bad_example_path.name,
                            bad_handle.read(),
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        ),
                    ),
                ],
            )
        ingest_response.raise_for_status()
        session_id = ingest_response.json()["session_id"]

        chat_response = client.post(
            "/chat",
            json={"session_id": session_id, "message": 'fill "Nuno Pereira" on "Project Overview" field'},
        )
        chat_response.raise_for_status()

    payload = chat_response.json()
    assert payload["draft_state"]["sections"][0]["content"] == "Nuno Pereira"
    assert "Nuno Pereira" in payload["preview_markdown"]


def test_translation_configuration_endpoint_reports_active_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(translation_service.settings, "translation_provider", "google")
    monkeypatch.setattr(translation_service.settings, "google_translate_api_key", "fake-key")
    monkeypatch.setattr(translation_service.settings, "azure_translator_key", None)
    monkeypatch.setattr(translation_service.settings, "azure_translator_region", None)

    with TestClient(app) as client:
        response = client.get("/config/translation")

    response.raise_for_status()
    payload = response.json()
    assert payload["active_provider"] == "google"
    options = {option["id"]: option for option in payload["options"]}
    assert options["google"]["configured"] is True
    assert options["azure"]["configured"] is False


def test_export_uses_azure_translation_provider(
    monkeypatch: pytest.MonkeyPatch,
    sample_template_path: Path,
    sample_prompt: str,
    isolated_storage: Path,
) -> None:
    good_example_path = ROOT_DIR / "tests" / "fixtures" / "good_example.txt"
    bad_example_path = ROOT_DIR / "tests" / "fixtures" / "bad_example.txt"

    monkeypatch.setattr(rag_service, "index_examples", lambda *args, **kwargs: [])
    monkeypatch.setattr(translation_service.settings, "translation_provider", "azure")

    async def fake_generate_json(*, system_prompt: str, user_prompt: str, temperature: float = 0.2):
        if "assistant_message" in user_prompt:
            return {
                "assistant_message": "Captured the core scope.",
                "summary": "Compliance onboarding workflow for enterprise customers.",
                "section_updates": [
                    {
                        "section_id": "section-1",
                        "title": "Project Overview",
                        "content": "Build a compliance onboarding workflow for enterprise customers.",
                        "status": "complete",
                    },
                    {
                        "section_id": "section-2",
                        "title": "Functional Requirements",
                        "content": "Include identity verification, document review, approval audit trail, and reviewer notifications.",
                        "status": "complete",
                    },
                ],
            }
        raise AssertionError("The LLM provider should not be used for translation when Azure is active.")

    async def fake_translate_with_azure(*, session, language: str):
        assert language == "Spanish"
        return {
            "section-1::title": "Resumen del proyecto",
            "section-1": "Crear un flujo de incorporacion de cumplimiento para clientes empresariales.",
            "section-1::content": "Crear un flujo de incorporacion de cumplimiento para clientes empresariales.",
            "section-2::title": "Requisitos funcionales",
            "section-2": "Incluir verificacion de identidad, revision documental, trazabilidad de aprobacion y notificaciones.",
            "section-2::content": "Incluir verificacion de identidad, revision documental, trazabilidad de aprobacion y notificaciones.",
        }

    monkeypatch.setattr(llm_provider, "generate_json", fake_generate_json)
    monkeypatch.setattr(translation_service, "_translate_with_azure", fake_translate_with_azure)

    with TestClient(app) as client:
        result = run_batch_workflow(
            base_url="http://testserver",
            template_path=sample_template_path,
            good_example_paths=[good_example_path],
            bad_example_paths=[bad_example_path],
            message=sample_prompt,
            languages=["Spanish"],
            client=client,
        )

    export_payload = result["export"]
    archive_path = Path(export_payload["archive_path"])
    assert archive_path.exists()
    generated_document = Document(str(archive_path.parent / "template.spanish.docx"))
    generated_text = "\n".join(paragraph.text for paragraph in generated_document.paragraphs)
    assert "Resumen del proyecto" in generated_text
    assert "Crear un flujo de incorporacion de cumplimiento" in generated_text