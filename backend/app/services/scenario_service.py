from __future__ import annotations

import json
import re
import shutil
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings
from app.core.errors import SessionNotFoundError
from app.models.document_state import (
    DocumentDraftState,
    LoadScenarioResponse,
    SaveScenarioResponse,
    ScenarioSummary,
    SessionContext,
    TemplateStructure,
)


class ScenarioService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def list_scenarios(self) -> list[ScenarioSummary]:
        summaries: list[ScenarioSummary] = []
        for scenario_dir in sorted(self.settings.scenarios_root.iterdir() if self.settings.scenarios_root.exists() else [], reverse=True):
            metadata_path = scenario_dir / "scenario.json"
            if not scenario_dir.is_dir() or not metadata_path.exists():
                continue
            payload = json.loads(metadata_path.read_text(encoding="utf-8"))
            summaries.append(
                ScenarioSummary(
                    scenario_id=payload["scenario_id"],
                    template_file_name=payload.get("template_file_name"),
                    prompt=payload.get("prompt"),
                    target_languages=payload.get("target_languages", []),
                    updated_at=datetime.fromisoformat(payload["updated_at"]),
                )
            )
        summaries.sort(key=lambda item: item.updated_at, reverse=True)
        return summaries

    def save_scenario(self, session: SessionContext, scenario_id: str, *, prompt: str | None, target_languages: list[str]) -> SaveScenarioResponse:
        normalized_id = self._normalize_scenario_id(scenario_id)
        scenario_dir = self.settings.scenarios_root / normalized_id
        if scenario_dir.exists():
            shutil.rmtree(scenario_dir)
        scenario_dir.mkdir(parents=True, exist_ok=True)

        template_dir = scenario_dir / "template"
        good_dir = scenario_dir / "good_examples"
        bad_dir = scenario_dir / "bad_examples"
        template_dir.mkdir(parents=True, exist_ok=True)
        good_dir.mkdir(parents=True, exist_ok=True)
        bad_dir.mkdir(parents=True, exist_ok=True)

        template_target = template_dir / session.template_path.name
        shutil.copy2(session.template_path, template_target)
        copied_good = [self._copy_file(path, good_dir) for path in session.good_example_paths]
        copied_bad = [self._copy_file(path, bad_dir) for path in session.bad_example_paths]

        updated_at = datetime.now(UTC)
        session.scenario_id = normalized_id
        session.prompt = prompt or session.prompt
        session.export_languages = target_languages or session.export_languages

        metadata = {
            "scenario_id": normalized_id,
            "template_file_name": session.template_path.name,
            "template_relative_path": str(Path("template") / session.template_path.name),
            "good_example_relative_paths": [str(Path("good_examples") / path.name) for path in copied_good],
            "bad_example_relative_paths": [str(Path("bad_examples") / path.name) for path in copied_bad],
            "template_structure": session.template_structure.model_dump(mode="json"),
            "draft_state": session.draft_state.model_dump(mode="json"),
            "prompt": session.prompt,
            "target_languages": session.export_languages,
            "warnings": session.warnings,
            "updated_at": updated_at.isoformat(),
        }
        (scenario_dir / "scenario.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        return SaveScenarioResponse(
            scenario_id=normalized_id,
            session_id=session.session_id,
            prompt=session.prompt,
            target_languages=session.export_languages,
            updated_at=updated_at,
        )

    def load_scenario(self, scenario_id: str) -> SessionContext:
        normalized_id = self._normalize_scenario_id(scenario_id)
        scenario_dir = self.settings.scenarios_root / normalized_id
        metadata_path = scenario_dir / "scenario.json"
        if not metadata_path.exists():
            raise SessionNotFoundError(f"Unknown scenario: {scenario_id}")

        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        session_id = str(uuid4())
        session_dir = self.settings.upload_root / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        template_source = scenario_dir / payload["template_relative_path"]
        template_target = session_dir / template_source.name
        shutil.copy2(template_source, template_target)

        good_paths = [self._copy_file(scenario_dir / relative_path, session_dir) for relative_path in payload.get("good_example_relative_paths", [])]
        bad_paths = [self._copy_file(scenario_dir / relative_path, session_dir) for relative_path in payload.get("bad_example_relative_paths", [])]

        draft_state = DocumentDraftState.model_validate(payload["draft_state"])
        draft_state.session_id = session_id

        return SessionContext(
            session_id=session_id,
            scenario_id=normalized_id,
            template_path=template_target,
            template_structure=TemplateStructure.model_validate(payload["template_structure"]),
            draft_state=draft_state,
            good_example_paths=good_paths,
            bad_example_paths=bad_paths,
            prompt=payload.get("prompt"),
            export_languages=payload.get("target_languages", []),
            warnings=payload.get("warnings", []),
        )

    def build_load_response(self, session: SessionContext, preview_markdown: str) -> LoadScenarioResponse:
        return LoadScenarioResponse(
            scenario_id=session.scenario_id or "",
            session_id=session.session_id,
            template=session.template_structure,
            draft_state=session.draft_state,
            preview_markdown=preview_markdown,
            warnings=session.warnings,
            prompt=session.prompt,
            target_languages=session.export_languages,
        )

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