from pathlib import Path

from docx import Document


FIXTURES_DIR = Path(__file__).resolve().parent


def save_template(path: Path) -> None:
    document = Document()
    document.add_heading("Project Overview", level=1)
    document.add_paragraph("Describe the product objective, target users, and the regulatory context.")
    document.add_heading("Functional Requirements", level=1)
    document.add_paragraph("List the required workflow capabilities, reviewers, and audit controls.")
    document.add_heading("Non-Functional Requirements", level=1)
    document.add_paragraph("Specify security, performance, localization, and retention constraints.")
    document.save(str(path))


def save_good_example(path: Path) -> None:
    document = Document()
    document.add_heading("Approved Example", level=0)
    document.add_paragraph("This specification defines a compliance onboarding workflow for regulated enterprise customers.")
    document.add_paragraph("The process must capture identity evidence, maintain explicit reviewer ownership, and preserve a complete approval audit trail.")
    document.add_paragraph("The tone is direct, measurable, and suitable for architecture review and audit sign-off.")
    document.save(str(path))


def save_bad_example(path: Path) -> None:
    document = Document()
    document.add_heading("Rejected Example", level=0)
    document.add_paragraph("The system should maybe support a few checks if the team has time later.")
    document.add_paragraph("It will probably be fine to keep some notes somewhere for approvals.")
    document.add_paragraph("Avoid vague wording, weak commitments, and missing operational accountability.")
    document.save(str(path))


def save_expected_output(path: Path) -> None:
    document = Document()
    document.add_heading("Project Overview", level=1)
    document.add_paragraph("Build a compliance onboarding workflow for regulated enterprise customers across KYC and document review stages.")
    document.add_heading("Functional Requirements", level=1)
    document.add_paragraph("Capture identity verification, document review, dual approval, reviewer notifications, and a complete audit trail for every submission.")
    document.add_heading("Non-Functional Requirements", level=1)
    document.add_paragraph("Enforce role-based access control, retain approval records for seven years, and prepare all user-facing content for localization.")
    document.save(str(path))


def main() -> None:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    save_template(FIXTURES_DIR / "sample_template.docx")
    save_good_example(FIXTURES_DIR / "sample_good_example.docx")
    save_bad_example(FIXTURES_DIR / "sample_bad_example.docx")
    save_expected_output(FIXTURES_DIR / "expected_final_output.docx")


if __name__ == "__main__":
    main()
