from __future__ import annotations

from pathlib import Path

import pytest
from docx import Document


@pytest.fixture
def fixtures_dir() -> Path:
    return Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def sample_prompt(fixtures_dir: Path) -> str:
    return (fixtures_dir / "chat_prompt.txt").read_text(encoding="utf-8").strip()


@pytest.fixture
def docx_prompt(fixtures_dir: Path) -> str:
    return (fixtures_dir / "docx_prompt_example.txt").read_text(encoding="utf-8").strip()


@pytest.fixture
def docx_fixtures_dir(fixtures_dir: Path) -> Path:
    return fixtures_dir / "docx"


@pytest.fixture
def sample_docx_template_path(docx_fixtures_dir: Path) -> Path:
    return docx_fixtures_dir / "sample_template.docx"


@pytest.fixture
def sample_docx_good_example_path(docx_fixtures_dir: Path) -> Path:
    return docx_fixtures_dir / "sample_good_example.docx"


@pytest.fixture
def sample_docx_bad_example_path(docx_fixtures_dir: Path) -> Path:
    return docx_fixtures_dir / "sample_bad_example.docx"


@pytest.fixture
def expected_docx_output_path(docx_fixtures_dir: Path) -> Path:
    return docx_fixtures_dir / "expected_final_output.docx"


@pytest.fixture
def sample_template_path(tmp_path: Path) -> Path:
    path = tmp_path / "template.docx"
    document = Document()
    document.add_heading("Project Overview", level=1)
    document.add_paragraph("Describe the high-level objective.")
    document.add_heading("Functional Requirements", level=1)
    document.add_paragraph("List required business capabilities.")
    document.save(str(path))
    return path