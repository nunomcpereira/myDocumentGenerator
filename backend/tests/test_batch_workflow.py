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
from scripts.run_batch_workflow import run_batch_workflow


def test_batch_workflow_generates_localized_archive(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
    sample_template_path: Path,
    sample_prompt: str,
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