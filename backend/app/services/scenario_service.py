from __future__ import annotations

import json
import re
import sqlite3
import shutil
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings
from app.core.errors import SessionNotFoundError
from app.models.document_state import (
    DocumentDraftState,
    LoadedFileReference,
    LoadScenarioResponse,
    SaveScenarioResponse,
    ScenarioSummary,
    SessionContext,
    TemplateStructure,
)
from app.services.ingestion_service import ingestion_service


class ScenarioService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._ensure_database()

    def list_scenarios(self) -> list[ScenarioSummary]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT scenario_id, template_file_name, prompt, target_languages_json, output_file_name, updated_at
                FROM scenarios
                ORDER BY updated_at DESC
                """
            ).fetchall()
        return [
            ScenarioSummary(
                scenario_id=row[0],
                template_file_name=row[1],
                prompt=row[2],
                target_languages=json.loads(row[3] or "[]"),
                output_file_name=row[4],
                updated_at=datetime.fromisoformat(row[5]),
            )
            for row in rows
        ]

    def save_scenario(
        self,
        session: SessionContext,
        scenario_id: str,
        *,
        prompt: str | None,
        target_languages: list[str],
        output_file_name: str | None,
    ) -> SaveScenarioResponse:
        normalized_id = self._normalize_scenario_id(scenario_id)
        scenario_dir = self.settings.scenarios_root / normalized_id
        scenario_dir.mkdir(parents=True, exist_ok=True)

        template_dir = scenario_dir / "template"
        enhancement_dir = scenario_dir / "enhancement_document"
        good_dir = scenario_dir / "good_examples"
        bad_dir = scenario_dir / "bad_examples"
        template_dir.mkdir(parents=True, exist_ok=True)
        enhancement_dir.mkdir(parents=True, exist_ok=True)
        good_dir.mkdir(parents=True, exist_ok=True)
        bad_dir.mkdir(parents=True, exist_ok=True)

        template_target = template_dir / session.template_path.name
        shutil.copy2(session.template_path, template_target)
        enhancement_target = self._copy_file(session.enhancement_document_path, enhancement_dir) if session.enhancement_document_path else None
        copied_good = [self._copy_file(path, good_dir) for path in session.good_example_paths]
        copied_bad = [self._copy_file(path, bad_dir) for path in session.bad_example_paths]

        updated_at = datetime.now(UTC)
        session.scenario_id = normalized_id
        session.prompt = prompt or session.prompt
        session.export_languages = target_languages or session.export_languages
        session.output_file_name = output_file_name or session.output_file_name or session.template_path.stem

        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO scenarios (
                    scenario_id,
                    template_file_name,
                    template_relative_path,
                    enhancement_document_relative_path,
                    good_example_relative_paths_json,
                    bad_example_relative_paths_json,
                    template_structure_json,
                    draft_state_json,
                    prompt,
                    target_languages_json,
                    output_file_name,
                    warnings_json,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(scenario_id) DO UPDATE SET
                    template_file_name = excluded.template_file_name,
                    template_relative_path = excluded.template_relative_path,
                    enhancement_document_relative_path = excluded.enhancement_document_relative_path,
                    good_example_relative_paths_json = excluded.good_example_relative_paths_json,
                    bad_example_relative_paths_json = excluded.bad_example_relative_paths_json,
                    template_structure_json = excluded.template_structure_json,
                    draft_state_json = excluded.draft_state_json,
                    prompt = excluded.prompt,
                    target_languages_json = excluded.target_languages_json,
                    output_file_name = excluded.output_file_name,
                    warnings_json = excluded.warnings_json,
                    updated_at = excluded.updated_at
                """,
                (
                    normalized_id,
                    session.template_path.name,
                    str(Path("template") / session.template_path.name),
                    str(Path("enhancement_document") / enhancement_target.name) if enhancement_target else None,
                    json.dumps([str(Path("good_examples") / path.name) for path in copied_good]),
                    json.dumps([str(Path("bad_examples") / path.name) for path in copied_bad]),
                    json.dumps(session.template_structure.model_dump(mode="json")),
                    json.dumps(session.draft_state.model_dump(mode="json")),
                    session.prompt,
                    json.dumps(session.export_languages),
                    session.output_file_name,
                    json.dumps(session.warnings),
                    updated_at.isoformat(),
                ),
            )
            connection.commit()

        return SaveScenarioResponse(
            scenario_id=normalized_id,
            session_id=session.session_id,
            prompt=session.prompt,
            target_languages=session.export_languages,
            output_file_name=session.output_file_name,
            updated_at=updated_at,
        )

    def load_scenario(self, scenario_id: str) -> SessionContext:
        normalized_id = self._normalize_scenario_id(scenario_id)
        scenario_dir = self.settings.scenarios_root / normalized_id
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT template_relative_path,
                      enhancement_document_relative_path,
                       good_example_relative_paths_json,
                       bad_example_relative_paths_json,
                       template_structure_json,
                       draft_state_json,
                       prompt,
                       target_languages_json,
                       output_file_name,
                       warnings_json
                FROM scenarios
                WHERE scenario_id = ?
                """,
                (normalized_id,),
            ).fetchone()
        if row is None:
            raise SessionNotFoundError(f"Unknown scenario: {scenario_id}")

        session_id = str(uuid4())
        session_dir = self.settings.upload_root / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        template_source = scenario_dir / row[0]
        template_target = session_dir / template_source.name
        shutil.copy2(template_source, template_target)

        enhancement_path = self._copy_file(scenario_dir / row[1], session_dir) if row[1] else None
        good_paths = [self._copy_file(scenario_dir / relative_path, session_dir) for relative_path in json.loads(row[2] or "[]")]
        bad_paths = [self._copy_file(scenario_dir / relative_path, session_dir) for relative_path in json.loads(row[3] or "[]")]

        warnings = ingestion_service.index_session_examples(
            session_id,
            good_paths,
            bad_paths,
            enhancement_document_path=enhancement_path,
        )

        draft_state = DocumentDraftState.model_validate(json.loads(row[5]))
        draft_state.session_id = session_id

        return SessionContext(
            session_id=session_id,
            scenario_id=normalized_id,
            template_path=template_target,
            template_structure=TemplateStructure.model_validate(json.loads(row[4])),
            draft_state=draft_state,
            enhancement_document_path=enhancement_path,
            good_example_paths=good_paths,
            bad_example_paths=bad_paths,
            prompt=row[6],
            export_languages=json.loads(row[7] or "[]"),
            output_file_name=row[8],
            warnings=json.loads(row[9] or "[]") + warnings,
        )

    def build_load_response(self, session: SessionContext, preview_markdown: str, loaded_files: list[LoadedFileReference]) -> LoadScenarioResponse:
        return LoadScenarioResponse(
            scenario_id=session.scenario_id or "",
            session_id=session.session_id,
            template=session.template_structure,
            draft_state=session.draft_state,
            preview_markdown=preview_markdown,
            warnings=session.warnings,
            prompt=session.prompt,
            target_languages=session.export_languages,
            loaded_files=loaded_files,
            output_file_name=session.output_file_name,
        )

    def get_custom_css(self) -> tuple[str | None, str | None, datetime | None]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT value_text, file_name, updated_at FROM app_settings WHERE key = ?",
                ("custom_css",),
            ).fetchone()
        if row is None:
            return None, None, None
        return row[0], row[1], datetime.fromisoformat(row[2]) if row[2] else None

    def set_custom_css(self, *, file_name: str, css_text: str) -> datetime:
        updated_at = datetime.now(UTC)
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO app_settings (key, value_text, file_name, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_text = excluded.value_text,
                    file_name = excluded.file_name,
                    updated_at = excluded.updated_at
                """,
                ("custom_css", css_text, file_name, updated_at.isoformat()),
            )
            connection.commit()
        return updated_at

    def clear_custom_css(self) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM app_settings WHERE key = ?", ("custom_css",))
            connection.commit()

    def _ensure_database(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS scenarios (
                    scenario_id TEXT PRIMARY KEY,
                    template_file_name TEXT,
                    template_relative_path TEXT NOT NULL,
                    enhancement_document_relative_path TEXT,
                    good_example_relative_paths_json TEXT NOT NULL,
                    bad_example_relative_paths_json TEXT NOT NULL,
                    template_structure_json TEXT NOT NULL,
                    draft_state_json TEXT NOT NULL,
                    prompt TEXT,
                    target_languages_json TEXT NOT NULL,
                    output_file_name TEXT,
                    warnings_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value_text TEXT,
                    file_name TEXT,
                    updated_at TEXT
                )
                """
            )
            columns = {row[1] for row in connection.execute("PRAGMA table_info(scenarios)").fetchall()}
            if "output_file_name" not in columns:
                connection.execute("ALTER TABLE scenarios ADD COLUMN output_file_name TEXT")
            if "enhancement_document_relative_path" not in columns:
                connection.execute("ALTER TABLE scenarios ADD COLUMN enhancement_document_relative_path TEXT")
            connection.commit()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.settings.scenarios_db_path)

    @staticmethod
    def _normalize_scenario_id(scenario_id: str) -> str:
        normalized = re.sub(r"[^a-zA-Z0-9_-]+", "-", scenario_id.strip()).strip("-").lower()
        if not normalized:
            raise ValueError("Scenario ID must contain at least one alphanumeric character.")
        return normalized

    @staticmethod
    def _copy_file(source: Path, destination_dir: Path) -> Path:
        destination_dir.mkdir(parents=True, exist_ok=True)
        target = destination_dir / source.name
        shutil.copy2(source, target)
        return target


scenario_service = ScenarioService()
