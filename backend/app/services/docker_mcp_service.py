from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
import json
import os
import shlex
import subprocess
from pathlib import Path
from typing import Any, AsyncIterator
from urllib.parse import urlsplit, urlunsplit

from app.core.config import get_settings
from app.models.document_state import McpServerCatalogResponse, McpServerSummary


@dataclass(slots=True)
class DockerMcpToolSpec:
    name: str
    description: str | None
    input_schema: dict[str, Any]


@dataclass(slots=True)
class DockerMcpToolCallResult:
    text: str
    structured_content: Any | None = None
    is_error: bool = False


class DockerMcpGatewayClient:
    def __init__(self, session: Any) -> None:
        self._session = session

    async def list_tools(self) -> list[DockerMcpToolSpec]:
        response = await self._session.list_tools()
        tool_specs: list[DockerMcpToolSpec] = []
        for tool in getattr(response, "tools", []) or []:
            tool_specs.append(
                DockerMcpToolSpec(
                    name=getattr(tool, "name", ""),
                    description=getattr(tool, "description", None),
                    input_schema=self._normalize_schema(getattr(tool, "inputSchema", None) or getattr(tool, "input_schema", None)),
                )
            )
        return [tool for tool in tool_specs if tool.name]

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> DockerMcpToolCallResult:
        response = await self._session.call_tool(tool_name, arguments=arguments)
        structured_content = getattr(response, "structuredContent", None)
        if structured_content is None:
            structured_content = getattr(response, "structured_content", None)
        is_error = bool(getattr(response, "isError", False) or getattr(response, "is_error", False))
        return DockerMcpToolCallResult(
            text=self._render_tool_response(response, structured_content),
            structured_content=structured_content,
            is_error=is_error,
        )

    @staticmethod
    def _normalize_schema(schema: Any) -> dict[str, Any]:
        if isinstance(schema, dict):
            return schema
        if hasattr(schema, "model_dump"):
            dumped = schema.model_dump(by_alias=True)
            if isinstance(dumped, dict):
                return dumped
        return {"type": "object", "properties": {}}

    @classmethod
    def _render_tool_response(cls, response: Any, structured_content: Any | None) -> str:
        parts: list[str] = []
        if structured_content is not None:
            try:
                parts.append(json.dumps(structured_content, ensure_ascii=True))
            except TypeError:
                parts.append(str(structured_content))

        for item in getattr(response, "content", []) or []:
            item_type = getattr(item, "type", None)
            if item_type is None and isinstance(item, dict):
                item_type = item.get("type")

            if item_type == "text":
                text = getattr(item, "text", None)
                if text is None and isinstance(item, dict):
                    text = item.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text)
                continue

            if hasattr(item, "model_dump"):
                dumped = item.model_dump(by_alias=True)
                if dumped:
                    parts.append(json.dumps(dumped, ensure_ascii=True))
                continue

            if isinstance(item, dict) and item:
                parts.append(json.dumps(item, ensure_ascii=True))

        return "\n\n".join(part for part in parts if part.strip()) or "Tool completed with no text output."


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
                env=self._build_subprocess_env(),
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

    @asynccontextmanager
    async def tool_client(self, server_names: list[str]) -> AsyncIterator[DockerMcpGatewayClient]:
        normalized_names = self._normalize_server_names(server_names)
        if not normalized_names:
            raise ValueError("At least one Docker MCP server must be selected.")

        try:
            from mcp import ClientSession, StdioServerParameters
            from mcp.client.sse import sse_client
            from mcp.client.stdio import stdio_client
            from mcp.client.streamable_http import streamable_http_client
            import httpx
        except ImportError as exc:
            raise RuntimeError("Python MCP SDK is not installed in the backend environment.") from exc

        if self.settings.docker_mcp_gateway_url:
            headers = self._build_gateway_headers()
            gateway_attempts = self._build_gateway_attempts(self.settings.docker_mcp_gateway_url)
            last_error: Exception | None = None
            for transport_name, gateway_url in gateway_attempts:
                try:
                    if transport_name == "sse":
                        async with sse_client(
                            url=gateway_url,
                            headers=headers or None,
                            timeout=self.settings.request_timeout_seconds,
                            sse_read_timeout=self.settings.request_timeout_seconds,
                        ) as (read_stream, write_stream):
                            async with ClientSession(read_stream, write_stream) as session:
                                await session.initialize()
                                yield DockerMcpGatewayClient(session)
                        return

                    async with httpx.AsyncClient(headers=headers or None, timeout=self.settings.request_timeout_seconds) as http_client:
                        async with streamable_http_client(gateway_url, http_client=http_client) as (read_stream, write_stream, _):
                            async with ClientSession(read_stream, write_stream) as session:
                                await session.initialize()
                                yield DockerMcpGatewayClient(session)
                    return
                except Exception as exc:
                    last_error = exc

            raise RuntimeError(
                f"Unable to connect to Docker MCP gateway at {self.settings.docker_mcp_gateway_url}: {last_error}"
            ) from last_error

        command_parts = shlex.split(self.settings.docker_mcp_command)
        if not command_parts:
            raise RuntimeError("DOCKER_MCP_COMMAND is empty.")

        args = [*command_parts[1:], "gateway", "run"]
        for server_name in normalized_names:
            args.extend(["--servers", server_name])

        env = self._build_client_env()

        server_params = StdioServerParameters(
            command=command_parts[0],
            args=args,
            env=env,
            cwd=str(self.settings.project_root),
        )

        try:
            async with stdio_client(server_params) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    yield DockerMcpGatewayClient(session)
        except OSError as exc:
            raise RuntimeError(f"Unable to start Docker MCP gateway process: {exc}") from exc

    @staticmethod
    def _build_subprocess_env() -> dict[str, str]:
        env = os.environ.copy()
        if env.get("DOCKER_HOST"):
            env["DOCKER_HOST"] = env["DOCKER_HOST"]
        return env

    @staticmethod
    def _build_client_env() -> dict[str, str] | None:
        env: dict[str, str] = {}
        for key in ("DOCKER_CONFIG", "DOCKER_HOST", "DOCKER_CONTEXT"):
            value = os.environ.get(key)
            if value:
                env[key] = value
        return env or None

    def _build_gateway_headers(self) -> dict[str, str]:
        if not self.settings.docker_mcp_gateway_auth_token:
            return {}
        return {"Authorization": f"Bearer {self.settings.docker_mcp_gateway_auth_token}"}

    @staticmethod
    def _build_gateway_attempts(gateway_url: str) -> list[tuple[str, str]]:
        attempts: list[tuple[str, str]] = [("streaming", gateway_url)]
        parsed = urlsplit(gateway_url)
        if parsed.path.endswith("/mcp"):
            sse_path = parsed.path[:-4] + "/sse"
            attempts.append(("sse", urlunsplit((parsed.scheme, parsed.netloc, sse_path, parsed.query, parsed.fragment))))
        elif parsed.path.endswith("/sse"):
            attempts = [("sse", gateway_url)]
        return attempts

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

    @staticmethod
    def _normalize_server_names(server_names: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for server_name in server_names:
            cleaned = server_name.strip()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            normalized.append(cleaned)
        return normalized


docker_mcp_service = DockerMcpService()
