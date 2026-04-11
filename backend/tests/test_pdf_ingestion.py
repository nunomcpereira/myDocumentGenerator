from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import app.services.ingestion_service as ingestion_module
from app.services.ingestion_service import ingestion_service


class FakePdfPage:
    def __init__(self, text: str) -> None:
        self._text = text

    def extract_text(self) -> str:
        return self._text


class FakePdfReader:
    def __init__(self, page_texts: list[str]) -> None:
        self.pages = [FakePdfPage(text) for text in page_texts]


def test_split_pdf_text_into_sections_uses_numbered_headings() -> None:
    sections = ingestion_service._split_pdf_text_into_sections(
        [
            "Controlled document\n13 References\nRef Document ID/name Version\n[1] Validation Plan\n14 Change Log\nChange Log details",
            "15 Approval\nApproved on 11 Aug 2022",
        ]
    )

    assert [section.title for section in sections] == ["13 References", "14 Change Log", "15 Approval"]
    assert sections[0].content == "Controlled document  \nRef Document ID/name Version  \n[1] Validation Plan"
    assert sections[1].content == "Change Log details"
    assert sections[2].content == "Approved on 11 Aug 2022"


def test_parse_pdf_template_prefers_heading_sections_over_page_sections(monkeypatch, tmp_path: Path) -> None:
    template_path = tmp_path / "template.pdf"
    template_path.write_bytes(b"%PDF-1.4\n")

    monkeypatch.setattr(
        ingestion_module,
        "PdfReader",
        lambda _: FakePdfReader([
            "1 Overview\nSystem purpose\n2 Interfaces\nInterface details",
            "3 Constraints\nConstraint details",
        ]),
    )

    structure = ingestion_service._parse_pdf_template(template_path)

    assert structure.file_type == "pdf"
    assert [section.title for section in structure.sections] == ["1 Overview", "2 Interfaces", "3 Constraints"]
    assert [section.level for section in structure.sections] == [1, 1, 1]
    assert structure.extracted_outline == ["1 Overview", "2 Interfaces", "3 Constraints"]


def test_pdf_enhancement_document_aligns_content_by_heading(monkeypatch, tmp_path: Path) -> None:
    template_path = tmp_path / "template.pdf"
    enhancement_path = tmp_path / "enhancement.pdf"
    template_path.write_bytes(b"%PDF-1.4\n")
    enhancement_path.write_bytes(b"%PDF-1.4\n")

    pdf_payloads = {
        str(template_path): [
            "13 References\nPending input\n14 Change Log\nPending input\n15 Approval\nPending input",
        ],
        str(enhancement_path): [
            "13 References\nRef Document ID/name Version\n[1] Validation Plan\n14 Change Log\nAll document changes are logged\n15 Approval\nApproved by QA",
        ],
    }

    monkeypatch.setattr(ingestion_module, "PdfReader", lambda path: FakePdfReader(pdf_payloads[str(path)]))

    template_structure = ingestion_service._parse_pdf_template(template_path)
    draft_state, warnings = ingestion_service._build_initial_draft_state(
        session_id="session-1",
        template_structure=template_structure,
        enhancement_document_path=enhancement_path,
    )

    assert warnings == []
    assert [section.title for section in draft_state.sections] == ["13 References", "14 Change Log", "15 Approval"]
    assert draft_state.sections[0].content == "Ref Document ID/name Version  \n[1] Validation Plan"
    assert draft_state.sections[1].content == "All document changes are logged"
    assert draft_state.sections[2].content == "Approved by QA"


def test_clean_pdf_preview_markdown_removes_rotated_margin_artifacts() -> None:
    markdown = (
        "Documento emitido a: 11 de dezembro 2024\n"
        "A B C D\n"
        "a o b s i L 0 0 3\n"
        "9 4 2 1 2 1 º . n\n"
        "\n"
        "a\n"
        "o\n"
        "b\n"
        "s\n"
        "i\n"
        "L\n"
        "0\n"
        "0\n"
        "3\n"
        "\n"
        "Quanto tenho a pagar? 39,01 €\n"
    )

    cleaned = ingestion_service._clean_pdf_preview_markdown(markdown)

    assert "Documento emitido a: 11 de dezembro 2024" in cleaned
    assert "A B C D" in cleaned
    assert "Quanto tenho a pagar? 39,01 €" in cleaned
    assert "a o b s i L 0 0 3" not in cleaned
    assert "9 4 2 1 2 1 º . n" not in cleaned


def test_attached_ferring_pdf_extracts_expected_sections_and_text() -> None:
    pdf_path = Path("/Users/nuno/Downloads/ferringdocsample/techdocs/I-44722 - M2C - Price Catalog Interface Requirements and Specifications.pdf")
    if not pdf_path.exists():
        pytest.skip("Attached Ferring PDF is not available on this machine.")

    sections = ingestion_service._extract_pdf_sections(pdf_path)
    section_map = {section.title: section.content for section in sections}

    expected_titles = [
        "Objective",
        "1 Scope",
        "2 Responsibility",
        "3 Definitions",
        "4 Abbreviations",
        "5 Identification",
        "6 Business Need",
        "7 Process Information",
        "8 Functional Requirements",
        "9 Error handling Requirements",
        "10 Security Requirements",
        "11 Technical Requirements",
        "11.1 Business Rules & Filters",
        "11.2 Orchestration steps",
        "11.3 Fields Mapping Source to Common",
        "11.4 Fields Mapping Common to Target",
        "12 Testing Requirements",
        "12.1 Key Business Test Conditions",
        "12.2 Technical Test Conditions",
        "12.3 Risk and Controls Test Conditions",
        "12.4 Testing Considerations and Dependencies",
        "13 References",
        "14 Change Log",
    ]

    assert [section.title for section in sections] == expected_titles
    assert "The objective of this document is to describe the context" in section_map["Objective"]
    assert "The information in this document are bounded to one specific interface." in section_map["1 Scope"]
    assert "The system responsible must ensure this document is created and maintained." in section_map["2 Responsibility"]
    assert "Interface Name Price Catalog" in section_map["5 Identification"]
    assert "Provide the list of all functionality of the interface" in section_map["8 Functional Requirements"]
    assert "Source System(s) SAP S4" in section_map["11 Technical Requirements"]
    assert "List and describe all the business rules and filters" in section_map["11.1 Business Rules & Filters"]
    assert "describe the processing steps of the" in section_map["11.2 Orchestration steps"]
    assert "interface" in section_map["11.2 Orchestration steps"]
    assert "Source Column Data Type Target" in section_map["11.3 Fields Mapping Source to Common"]
    assert "Target column Data Type Comment" in section_map["11.4 Fields Mapping Common to Target"]
    assert section_map["12 Testing Requirements"] == ""
    assert "test planning" in section_map["12.4 Testing Considerations and Dependencies"]
    assert "[1] Validation Plan 1" in section_map["13 References"]
    assert "1.0 All Document Created" in section_map["14 Change Log"]


def test_attached_template_and_enhancement_pdfs_align_across_numbering_drift() -> None:
    template_pdf_path = Path("/Users/nuno/Downloads/ferringdocsample/techdocs/FICSA - Interface Technical Documentation Template.pdf")
    enhancement_pdf_path = Path("/Users/nuno/Downloads/ferringdocsample/techdocs/I-44722 - M2C - Price Catalog Interface Requirements and Specifications.pdf")
    if not template_pdf_path.exists() or not enhancement_pdf_path.exists():
        pytest.skip("Attached Ferring template or enhancement PDF is not available on this machine.")

    template_structure = ingestion_service._parse_pdf_template(template_pdf_path)
    draft_state, warnings = ingestion_service._build_initial_draft_state(
        session_id="attached-ferring-session",
        template_structure=template_structure,
        enhancement_document_path=enhancement_pdf_path,
    )

    populated_sections = {section.title: section.content for section in draft_state.sections if section.content.strip()}
    template_titles = [section.title for section in template_structure.sections]

    assert warnings == []
    assert len(populated_sections) >= 20
    assert "14 References" in template_titles
    assert "15 Change Log" in template_titles
    assert "The objective of this document is to describe the context" in populated_sections["Objective"]
    assert "The information in this document are bounded to one specific interface." in populated_sections["1 Scope"]
    assert "Describe how the error handling should be performed" in populated_sections["9 Error handling Requirements"]
    assert "Source System(s) SAP S4" in populated_sections["11 Technical Requirements"]
    assert "[1] Validation Plan 1" in populated_sections["13 References"]
    assert "1.0 All Document Created" in populated_sections["14 Change Log"]
