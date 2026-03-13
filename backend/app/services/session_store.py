from __future__ import annotations

from threading import Lock

from app.core.errors import SessionNotFoundError
from app.models.document_state import SessionContext


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionContext] = {}
        self._lock = Lock()

    def save(self, session: SessionContext) -> SessionContext:
        with self._lock:
            self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> SessionContext:
        session = self._sessions.get(session_id)
        if session is None:
            raise SessionNotFoundError(f"Unknown session: {session_id}")
        return session

    def update(self, session_id: str, session: SessionContext) -> SessionContext:
        with self._lock:
            if session_id not in self._sessions:
                raise SessionNotFoundError(f"Unknown session: {session_id}")
            self._sessions[session_id] = session
        return session


session_store = SessionStore()