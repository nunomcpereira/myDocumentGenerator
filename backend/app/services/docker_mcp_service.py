from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path

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
            return self._list_servers_from_config("Docker MCP CLI is not installed or not visible to the backend.")
        except subprocess.TimeoutExpired:
            return self._list_servers_from_config("Docker MCP discovery timed out.")

        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip() or "Docker MCP discovery failed."
            return self._list_servers_from_config(detail)

        try:
            payload = json.loads(result.stdout or "[]")
        except json.JSONDecodeError:
            return self._list_servers_from_config("Docker MCP discovery returned invalid JSON.")

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

    def _list_servers_from_config(self, failure_detail: str) -> McpServerCatalogResponse:
        config_root = Path(os.environ.get("DOCKER_CONFIG") or Path.home() / ".docker") / "mcp"
        registry_path = config_root / "registry.yaml"
        if not registry_path.exists():
            return McpServerCatalogResponse(available=False, detail=failure_detail)

        enabled_names = self._parse_registry_names(registry_path)
        if not enabled_names:
            return McpServerCatalogResponse(
                available=False,
                detail=f"{failure_detail} Docker MCP config was found, but no enabled servers were parsed.",
            )

        descriptions = self._parse_catalog_descriptions(config_root / "catalogs" / "docker-mcp.yaml")
        servers = [
            McpServerSummary(name=name, description=descriptions.get(name))
            for name in enabled_names
        ]
        return McpServerCatalogResponse(
            available=True,
            detail="Discovered from mounted Docker MCP config.",
            servers=servers,
        )

    @staticmethod
    def _parse_registry_names(registry_path: Path) -> list[str]:
        names: list[str] = []
        inside_registry = False
        for raw_line in registry_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.rstrip()
            if line == "registry:":
                inside_registry = True
                continue
            if not inside_registry or not line:
                continue
            if not raw_line.startswith("  "):
                break
            if raw_line.startswith("    "):
                continue
            key = line.strip()
            if key.endswith(":"):
                names.append(key[:-1])
        return names

    @staticmethod
    def _parse_catalog_descriptions(catalog_path: Path) -> dict[str, str]:
        if not catalog_path.exists():
            return {}

        descriptions: dict[str, str] = {}
        inside_registry = False
        current_name: str | None = None
        for raw_line in catalog_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.rstrip()
            if line == "registry:":
                inside_registry = True
                continue
            if not inside_registry or not line:
                continue
            if not raw_line.startswith("  "):
                break
            if raw_line.startswith("  ") and not raw_line.startswith("    ") and line.strip().endswith(":"):
                current_name = line.strip()[:-1]
                continue
            if current_name and raw_line.startswith("    description:"):
                descriptions[current_name] = raw_line.split(":", 1)[1].strip()
        return descriptions


docker_mcp_service = DockerMcpService()
