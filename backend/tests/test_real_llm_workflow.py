from __future__ import annotations

import os
import sys
from pathlib import Path
import zipfile

import httpx
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


pytestmark = pytest.mark.real_llm


def test_real_llm_chat_and_export(
    monkeypatch: pytest.MonkeyPatch,
    sample_template_path: Path,
    sample_prompt: str,
):
    require_real_llm_opt_in()
    assert_llm_endpoint_reachable()

    good_example_path = ROOT_DIR / "tests" / "fixtures" / "good_example.txt"
    bad_example_path = ROOT_DIR / "tests" / "fixtures" / "bad_example.txt"

    monkeypatch.setattr(rag_service, "index_examples", lambda *args, **kwargs: [])

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

    chat_payload = result["chat"]
    export_payload = result["export"]

    assert chat_payload["llm_available"] is True
    assert chat_payload["assistant_message"].strip()
    assert chat_payload["preview_markdown"].strip()
    assert all("status" in section for section in chat_payload["draft_state"]["sections"])
    assert not any("unavailable" in warning.lower() for warning in chat_payload["warnings"])

    archive_path = Path(export_payload["archive_path"])
    assert archive_path.exists()
    assert export_payload["generated_files"]

    with zipfile.ZipFile(archive_path) as archive:
        archive_names = archive.namelist()
        assert any(name.endswith(".docx") for name in archive_names)

    generated_document = Path(export_payload["generated_files"][0])
    assert generated_document.exists()
    translated_document = Document(str(generated_document))
    translated_text = "\n".join(paragraph.text.strip() for paragraph in translated_document.paragraphs if paragraph.text.strip())
    assert translated_text


def test_real_llm_provider_json_smoke() -> None:
    require_real_llm_opt_in()
    assert_llm_endpoint_reachable()

    payload = llm_provider.generate_json
    result = run_async(
        payload(
            system_prompt="Return JSON only.",
            user_prompt=(
                'Return a JSON object with keys "status" and "engine". '
                'Set status to "ok" and engine to "llama".'
            ),
            temperature=0.0,
        )
    )

    assert isinstance(result, dict)
    assert result.get("status") == "ok"
    assert isinstance(result.get("engine"), str)
    assert result["engine"].strip()


def require_real_llm_opt_in() -> None:
    if os.getenv("RUN_REAL_LLM_TESTS") != "1":
        pytest.skip("Set RUN_REAL_LLM_TESTS=1 to execute the real llama.cpp integration test.")


def assert_llm_endpoint_reachable() -> None:
    base_url = llm_provider.settings.llm_base_url.rstrip("/")
    probe_urls = [f"{base_url}/models", base_url]
    for url in probe_urls:
        try:
            response = httpx.get(url, timeout=5.0)
            if response.status_code < 500:
                return
        except httpx.HTTPError:
            continue
    pytest.skip(f"Configured LLM endpoint is unreachable: {llm_provider.settings.llm_base_url}")


def run_async(coro):
    import asyncio

    return asyncio.run(coro)