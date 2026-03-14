from __future__ import annotations

import json
import shlex
import subprocess

from app.core.config import get_settings
from app.models.document_state import McpServerCatalogResponse, McpServerSummary


class DockerMcpService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def list_servers(self) -> McpServerCatalogResponse:
        command = [*shlex.split(self.settings.docker_mcp_command), "server", "ls", "--json"]
        try:
            result = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=self.settings.docker_mcp_timeout_seconds,
            )
        except FileNotFoundError:
            return McpServerCatalogResponse(available=False, detail="Docker MCP CLI is not installed or not visible to the backend.")
        except subprocess.TimeoutExpired:
            return McpServerCatalogResponse(available=False, detail="Docker MCP discovery timed out.")

        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip() or "Docker MCP discovery failed."
            return McpServerCatalogResponse(available=False, detail=detail)

        try:
            payload = json.loads(result.stdout or "[]")
        except json.JSONDecodeError:
            return McpServerCatalogResponse(available=False, detail="Docker MCP discovery returned invalid JSON.")

        servers = [
            McpServerSummary(
                name=item.get("name", ""),
                description=item.get("description"),
                oauth=item.get("oauth"),
                secrets=item.get("secrets"),
                config=item.get("config"),
            )
            for item in payload
            if item.get("name")
        ]
        return McpServerCatalogResponse(available=True, servers=servers)


docker_mcp_service = DockerMcpService()
