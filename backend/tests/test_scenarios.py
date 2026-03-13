from __future__ import annotations

import sqlite3
import shutil
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.main import app
from app.services.llm_provider import llm_provider
from app.services.rag_service import rag_service
from scripts.run_batch_workflow import run_batch_workflow


def test_save_and_load_scenario_persists_prompt_languages_and_draft(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    docx_prompt: str,
    sample_docx_template_path: Path,
    sample_docx_good_example_path: Path,
    sample_docx_bad_example_path: Path,
    isolated_storage: Path,
) -> None:
    working_template_path = tmp_path / sample_docx_template_path.name
    shutil.copyfile(sample_docx_template_path, working_template_path)
    db_path = (isolated_storage / "scenarios" / "scenarios.db")

    monkeypatch.setattr(rag_service, "index_examples", lambda *args, **kwargs: [])

    async def fake_generate_json(*, system_prompt: str, user_prompt: str, temperature: float = 0.2):
        if '"assistant_message"' in user_prompt:
            return {
                "assistant_message": "Draft updated.",
                "summary": "Scenario draft summary.",
                "section_updates": [
                    {
                        "section_id": "section-1",
                        "title": "Project Overview",
                        "content": "Saved scenario overview.",
                        "status": "complete",
                    }
                ],
            }
        if "Target language: Spanish." in system_prompt:
            return {"sections": [{"section_id": "section-1", "title": "Resumen del proyecto", "content": "Resumen guardado."}]}
        raise AssertionError(f"Unexpected LLM prompt: {system_prompt}")

    monkeypatch.setattr(llm_provider, "generate_json", fake_generate_json)

    with TestClient(app) as client:
        result = run_batch_workflow(
            base_url="http://testserver",
            template_path=working_template_path,
            good_example_paths=[sample_docx_good_example_path],
            bad_example_paths=[sample_docx_bad_example_path],
            message=docx_prompt,
            languages=["Spanish"],
            output_file_name="customer-onboarding-spec",
            client=client,
        )

        session_id = result["ingest"]["session_id"]
        save_response = client.post(
            "/scenarios/save",
            json={
                "session_id": session_id,
                "scenario_id": "Nuno Scenario 01",
                "prompt": docx_prompt,
                "target_languages": ["Spanish", "French"],
                "output_file_name": "customer-onboarding-spec",
            },
        )
        save_response.raise_for_status()

        list_response = client.get("/scenarios")
        list_response.raise_for_status()
        load_response = client.post("/scenarios/load", json={"scenario_id": "nuno-scenario-01"})
        load_response.raise_for_status()

    saved_payload = save_response.json()
    scenarios = list_response.json()
    loaded_payload = load_response.json()
    with sqlite3.connect(db_path) as connection:
        row = connection.execute(
            "SELECT output_file_name, target_languages_json FROM scenarios WHERE scenario_id = ?",
            ("nuno-scenario-01",),
        ).fetchone()

    assert saved_payload["scenario_id"] == "nuno-scenario-01"
    assert saved_payload["output_file_name"] == "customer-onboarding-spec"
    assert any(scenario["scenario_id"] == "nuno-scenario-01" for scenario in scenarios)
    assert loaded_payload["scenario_id"] == "nuno-scenario-01"
    assert loaded_payload["prompt"] == docx_prompt
    assert loaded_payload["target_languages"] == ["Spanish", "French"]
    assert loaded_payload["output_file_name"] == "customer-onboarding-spec"
    assert loaded_payload["draft_state"]["sections"][0]["content"] == "Saved scenario overview."
    assert "Saved scenario overview." in loaded_payload["preview_markdown"]
    assert len(loaded_payload["loaded_files"]) == 3
    assert {item["kind"] for item in loaded_payload["loaded_files"]} == {"template", "good_example", "bad_example"}
    assert loaded_payload["loaded_files"][0]["download_path"].startswith(f"/sessions/{loaded_payload['session_id']}/files/")
    assert db_path.exists()
    assert row is not None
    assert row[0] == "customer-onboarding-spec"
    assert "Spanish" in row[1]