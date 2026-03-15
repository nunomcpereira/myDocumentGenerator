from __future__ import annotations

import json
from threading import Lock

from app.core.config import get_settings
from app.core.errors import SessionNotFoundError
from app.models.document_state import SessionContext


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionContext] = {}
        self._lock = Lock()
        self._settings = get_settings()

    def _sessions_dir(self):
        path = self._settings.storage_root / "sessions"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _session_file(self, session_id: str):
        return self._sessions_dir() / f"{session_id}.json"

    def _persist_session(self, session: SessionContext) -> None:
        self._session_file(session.session_id).write_text(session.model_dump_json(indent=2), encoding="utf-8")

    def _load_persisted_session(self, session_id: str) -> SessionContext | None:
        session_file = self._session_file(session_id)
        if not session_file.exists():
            return None
        payload = json.loads(session_file.read_text(encoding="utf-8"))
        return SessionContext.model_validate(payload)

    def save(self, session: SessionContext) -> SessionContext:
        with self._lock:
            self._sessions[session.session_id] = session
            self._persist_session(session)
        return session

    def get(self, session_id: str) -> SessionContext:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is not None:
                return session

            persisted_session = self._load_persisted_session(session_id)
            if persisted_session is None:
                raise SessionNotFoundError(f"Unknown session: {session_id}")

            self._sessions[session_id] = persisted_session
            return persisted_session

    def update(self, session_id: str, session: SessionContext) -> SessionContext:
        with self._lock:
            if session_id not in self._sessions and self._load_persisted_session(session_id) is None:
                raise SessionNotFoundError(f"Unknown session: {session_id}")
            self._sessions[session_id] = session
            self._persist_session(session)
        return session


session_store = SessionStore()