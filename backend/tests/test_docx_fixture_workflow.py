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

    async def fake_generate_json(*, system_prompt: str, user_prompt: str, temperature: float = 0.2):
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
                        "content": "Build a compliance onboarding workflow for regulated enterprise customers across KYC and document review stages.",
                    },
                    {
                        "section_id": "section-2",
                        "content": "Capture identity verification, document review, dual approval, reviewer notifications, and a complete audit trail for every submission.",
                    },
                    {
                        "section_id": "section-3",
                        "content": "Enforce role-based access control, retain approval records for seven years, and prepare all user-facing content for localization.",
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
            languages=["English"],
            client=client,
        )

    export_payload = result["export"]
    archive_path = Path(export_payload["archive_path"])
    generated_document_path = Path(export_payload["generated_files"][0])

    assert archive_path.exists()
    assert generated_document_path.exists()

    with zipfile.ZipFile(archive_path) as archive:
        assert generated_document_path.name in set(archive.namelist())

    assert docx_text(generated_document_path) == docx_text(expected_docx_output_path)


def docx_text(path: Path) -> list[str]:
    document = Document(str(path))
    return [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]