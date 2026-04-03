from __future__ import annotations

from contextlib import AsyncExitStack
import json
import logging
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import LLMOfflineError, LLMProviderError
from app.services.docker_mcp_service import DockerMcpGatewayClient, DockerMcpToolSpec, docker_mcp_service


logger = logging.getLogger(__name__)


class LLMProvider:
    def __init__(self) -> None:
        self.settings = get_settings()

    def with_scenario_mcp_context(self, system_prompt: str, mcp_servers: list[str] | None = None) -> str:
        selected_servers = [server_name.strip() for server_name in (mcp_servers or []) if server_name.strip()]
        if not selected_servers:
            return system_prompt

        catalog = docker_mcp_service.list_servers()
        descriptions = {server.name: server.description for server in catalog.servers}
        available_servers = [server.name for server in catalog.servers]
        logger.info(
            "LLM MCP context prepared: selected_servers=%s available_servers=%s discovery_available=%s discovery_detail=%s",
            selected_servers,
            available_servers,
            catalog.available,
            catalog.detail,
        )
        lines = []
        for server_name in selected_servers:
            description = descriptions.get(server_name)
            lines.append(f"- {server_name}: {description}" if description else f"- {server_name}")

        context = (
            "\n\nScenario MCP server context:\n"
            "The user selected these Docker MCP servers for this scenario. When tools are exposed in the request, use them instead of guessing. "
            "Only report tool-derived facts after the relevant tool call succeeds.\n"
            f"{'\n'.join(lines)}"
        )
        if not catalog.available and catalog.detail:
            context += f"\nMetadata lookup note: {catalog.detail}"
        return f"{system_prompt}{context}"

    async def chat_completion(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        response_format: dict[str, Any] | None = None,
        mcp_servers: list[str] | None = None,
    ) -> str:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        seen_tool_signatures: set[str] = set()
        force_finalize_without_tools = False
        tool_rounds = 0

        async with AsyncExitStack() as exit_stack:
            mcp_tools: list[dict[str, Any]] = []
            gateway_client: DockerMcpGatewayClient | None = None

            selected_servers = [server_name.strip() for server_name in (mcp_servers or []) if server_name.strip()]
            if selected_servers:
                try:
                    gateway_client = await exit_stack.enter_async_context(docker_mcp_service.tool_client(selected_servers))
                    tool_specs = await gateway_client.list_tools()
                    mcp_tools = [self._build_openai_tool_spec(tool_spec) for tool_spec in tool_specs]
                    logger.info(
                        "LLM MCP tool bridge ready: selected_servers=%s tool_count=%s tool_names=%s",
                        selected_servers,
                        len(mcp_tools),
                        [tool_spec["function"]["name"] for tool_spec in mcp_tools],
                    )
                except Exception as exc:
                    logger.warning("LLM MCP tool bridge unavailable for selected_servers=%s: %s", selected_servers, exc)

            for attempt in range(6):
                payload: dict[str, Any] = {
                    "model": self.settings.llm_model,
                    "temperature": temperature,
                    "messages": messages,
                }
                if response_format is not None:
                    payload["response_format"] = response_format
                if mcp_tools:
                    payload["tools"] = mcp_tools
                    payload["tool_choice"] = "none" if force_finalize_without_tools else "auto"

                logger.info(
                    "Dispatching chat completion: provider=%s model=%s endpoint=%s response_format=%s tools_in_payload=%s attempt=%s",
                    self.settings.llm_provider,
                    self.settings.llm_model,
                    f"{self.settings.llm_base_url.rstrip('/')}/chat/completions",
                    response_format["type"] if response_format and "type" in response_format else None,
                    bool(mcp_tools),
                    attempt + 1,
                )

                data = await self._post_chat_completion(payload)
                choices = data.get("choices") or []
                if not choices:
                    raise LLMProviderError("LLM response did not include any choices.")

                message = choices[0].get("message") or {}
                content = self._normalize_message_content(message.get("content"))
                tool_calls = message.get("tool_calls") or []
                if not tool_calls and gateway_client is not None and not force_finalize_without_tools and self.settings.llm_provider == "local":
                    tool_calls = self._extract_inline_tool_calls(content)
                if tool_calls and gateway_client is not None:
                    if force_finalize_without_tools:
                        logger.warning("LLM requested additional tool calls after tool usage was disabled; ignoring tool calls and forcing a final answer.")
                        stripped_content = self._strip_inline_tool_calls(content)
                        if stripped_content:
                            messages.append({"role": "assistant", "content": stripped_content})
                        messages.append(
                            {
                                "role": "system",
                                "content": (
                                    "Tool calls are no longer allowed for this response. "
                                    "Use the existing tool outputs and provide the final answer now without calling any tool."
                                ),
                            }
                        )
                        continue

                    parsed_tool_calls: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
                    repeated_tool_calls = True
                    for tool_call in tool_calls:
                        function_payload = tool_call.get("function") or {}
                        tool_name = function_payload.get("name")
                        arguments = self._parse_tool_call_arguments(function_payload.get("arguments"))
                        signature = self._build_tool_call_signature(tool_name, arguments)
                        if signature not in seen_tool_signatures:
                            repeated_tool_calls = False
                        parsed_tool_calls.append((signature, arguments, tool_call))

                    if repeated_tool_calls:
                        logger.warning("LLM repeated identical tool calls; forcing final answer without more tool execution.")
                        force_finalize_without_tools = True
                        messages.append(
                            {
                                "role": "system",
                                "content": (
                                    "You already have the results for the requested tool calls. "
                                    "Do not call the same tools again. Produce the final answer now using the existing tool outputs."
                                ),
                            }
                        )
                        continue

                    assistant_message: dict[str, Any] = {
                        "role": "assistant",
                        "content": self._strip_inline_tool_calls(content),
                        "tool_calls": tool_calls,
                    }
                    messages.append(assistant_message)

                    for signature, arguments, tool_call in parsed_tool_calls:
                        tool_call_id = tool_call.get("id") or f"tool-call-{attempt}"
                        function_payload = tool_call.get("function") or {}
                        tool_name = function_payload.get("name")
                        if not isinstance(tool_name, str) or not tool_name.strip():
                            tool_output = "Tool call was missing a valid function name."
                        else:
                            try:
                                tool_result = await gateway_client.call_tool(tool_name, arguments)
                                tool_output = tool_result.text
                                seen_tool_signatures.add(signature)
                                logger.info(
                                    "LLM MCP tool executed: tool=%s is_error=%s arguments=%s",
                                    tool_name,
                                    tool_result.is_error,
                                    arguments,
                                )
                            except Exception as exc:
                                tool_output = f"Tool execution failed for {tool_name}: {exc}"
                                logger.warning(tool_output)

                        messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tool_call_id,
                                "content": tool_output,
                            }
                        )

                    tool_rounds += 1
                    messages.append(
                        {
                            "role": "system",
                            "content": (
                                "If the tool results above are sufficient, produce the final answer now. "
                                "Only call another tool if you need different information than what was already retrieved."
                            ),
                        }
                    )
                    if tool_rounds >= 3:
                        force_finalize_without_tools = True
                        messages.append(
                            {
                                "role": "system",
                                "content": "No further tool calls are available. Produce the final answer now using the existing tool results.",
                            }
                        )
                    continue

                if content.strip():
                    return content
                raise LLMProviderError("LLM response did not include a text message.")

        raise LLMProviderError("LLM exceeded the maximum number of tool-calling rounds.")

    async def generate_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        mcp_servers: list[str] | None = None,
    ) -> dict[str, Any]:
        content = await self.chat_completion(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            response_format={"type": "json_object"},
            mcp_servers=mcp_servers,
        )
        normalized = content.strip()
        if normalized.startswith("```"):
            normalized = normalized.strip("`")
            normalized = normalized.replace("json", "", 1).strip()
        try:
            return json.loads(normalized)
        except json.JSONDecodeError as exc:
            extracted = self._extract_json_object(normalized)
            if extracted is not None:
                return extracted
            raise LLMProviderError(f"Failed to parse JSON from LLM response: {normalized}") from exc

    async def _post_chat_completion(self, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self.settings.llm_api_key}",
            "Content-Type": "application/json",
        }
        timeout = httpx.Timeout(
            timeout=self.settings.llm_request_timeout_seconds,
            connect=min(self.settings.llm_connect_timeout_seconds, self.settings.llm_request_timeout_seconds),
        )

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    f"{self.settings.llm_base_url.rstrip('/')}/chat/completions",
                    json=payload,
                    headers=headers,
                )
            response.raise_for_status()
        except httpx.ConnectError as exc:
            raise LLMOfflineError(
                f"Unable to reach the LLM endpoint at {self.settings.llm_base_url}. "
                "Check that LLM_BASE_URL is correct and the service is running."
            ) from exc
        except httpx.TimeoutException as exc:
            raise LLMOfflineError(
                f"The LLM endpoint timed out after {self.settings.llm_request_timeout_seconds:.0f}s. "
                "Check that the service is responsive or increase LLM_REQUEST_TIMEOUT_SECONDS."
            ) from exc
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip() or str(exc)
            raise LLMProviderError(f"LLM request failed: {detail}") from exc
        return response.json()

    @staticmethod
    def _build_openai_tool_spec(tool_spec: DockerMcpToolSpec) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": tool_spec.name,
                "description": tool_spec.description or f"Docker MCP tool: {tool_spec.name}",
                "parameters": tool_spec.input_schema or {"type": "object", "properties": {}},
            },
        }

    @staticmethod
    def _normalize_message_content(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
                    parts.append(item["text"])
            return "\n".join(part for part in parts if part)
        return ""

    @staticmethod
    def _parse_tool_call_arguments(arguments_payload: Any) -> dict[str, Any]:
        if arguments_payload is None:
            return {}
        if isinstance(arguments_payload, dict):
            return arguments_payload
        if isinstance(arguments_payload, str):
            parsed = json.loads(arguments_payload) if arguments_payload.strip() else {}
            if isinstance(parsed, dict):
                return parsed
        raise LLMProviderError("Tool call arguments must decode to a JSON object.")

    @staticmethod
    def _extract_json_object(content: str) -> dict[str, Any] | None:
        decoder = json.JSONDecoder()
        for index, character in enumerate(content):
            if character != "{":
                continue
            try:
                parsed, _ = decoder.raw_decode(content[index:])
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
        return None

    @staticmethod
    def _build_tool_call_signature(tool_name: Any, arguments: dict[str, Any]) -> str:
        normalized_tool_name = tool_name if isinstance(tool_name, str) else ""
        return f"{normalized_tool_name}:{json.dumps(arguments, sort_keys=True, ensure_ascii=True)}"

    @staticmethod
    def _extract_inline_tool_calls(content: str) -> list[dict[str, Any]]:
        tool_calls: list[dict[str, Any]] = []
        function_pattern = re.compile(r"<function=([^>]+)>(.*?)</function>", re.IGNORECASE | re.DOTALL)
        parameter_pattern = re.compile(r"<parameter=([^>]+)>(.*?)</parameter>", re.IGNORECASE | re.DOTALL)

        for index, match in enumerate(function_pattern.finditer(content), start=1):
            tool_name = match.group(1).strip()
            raw_body = match.group(2)
            arguments: dict[str, str] = {}
            for parameter_match in parameter_pattern.finditer(raw_body):
                parameter_name = parameter_match.group(1).strip()
                parameter_value = parameter_match.group(2).strip()
                if parameter_name:
                    arguments[parameter_name] = parameter_value
            if tool_name:
                tool_calls.append(
                    {
                        "id": f"inline-tool-call-{index}",
                        "type": "function",
                        "function": {"name": tool_name, "arguments": json.dumps(arguments, ensure_ascii=True)},
                    }
                )
        return tool_calls

    @staticmethod
    def _strip_inline_tool_calls(content: str) -> str:
        return re.sub(r"<function=[^>]+>.*?</function>", "", content, flags=re.IGNORECASE | re.DOTALL).strip()


llm_provider = LLMProvider()