from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import httpx


def run_batch_workflow(
    *,
    base_url: str,
    template_path: Path,
    good_example_paths: list[Path],
    bad_example_paths: list[Path],
    message: str,
    languages: list[str],
    client: Any | None = None,
) -> dict[str, Any]:
    owns_client = client is None
    client = client or httpx.Client(base_url=base_url, timeout=120.0)

    try:
        ingest_response = client.post(
            f"{base_url.rstrip('/')}/ingest",
            files=build_ingest_files(template_path, good_example_paths, bad_example_paths),
        )
        ingest_response.raise_for_status()
        ingest_payload = ingest_response.json()
        session_id = ingest_payload["session_id"]

        chat_response = client.post(
            f"{base_url.rstrip('/')}/chat",
            json={"session_id": session_id, "message": message},
        )
        chat_response.raise_for_status()
        chat_payload = chat_response.json()

        export_response = client.post(
            f"{base_url.rstrip('/')}/export",
            json={"session_id": session_id, "target_languages": languages},
        )
        export_response.raise_for_status()
        export_payload = export_response.json()
    finally:
        if owns_client:
            client.close()

    return {
        "ingest": ingest_payload,
        "chat": chat_payload,
        "export": export_payload,
    }


def build_ingest_files(
    template_path: Path,
    good_example_paths: list[Path],
    bad_example_paths: list[Path],
) -> list[tuple[str, tuple[str, bytes, str]]]:
    files: list[tuple[str, tuple[str, bytes, str]]] = [
        (
            "template",
            (
                template_path.name,
                template_path.read_bytes(),
                content_type_for_path(template_path),
            ),
        )
    ]
    for example_path in good_example_paths:
        files.append(
            (
                "good_examples",
                (
                    example_path.name,
                    example_path.read_bytes(),
                    content_type_for_path(example_path),
                ),
            )
        )
    for example_path in bad_example_paths:
        files.append(
            (
                "bad_examples",
                (
                    example_path.name,
                    example_path.read_bytes(),
                    content_type_for_path(example_path),
                ),
            )
        )
    return files


def content_type_for_path(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if suffix == ".pdf":
        return "application/pdf"
    return "text/plain"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Submit a documentation workflow entirely over the REST API.")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--good-example", type=Path, action="append", default=[])
    parser.add_argument("--bad-example", type=Path, action="append", default=[])
    parser.add_argument("--message", required=True)
    parser.add_argument("--language", action="append", default=["Spanish", "French"])
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = run_batch_workflow(
        base_url=args.base_url,
        template_path=args.template,
        good_example_paths=args.good_example,
        bad_example_paths=args.bad_example,
        message=args.message,
        languages=args.language,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()