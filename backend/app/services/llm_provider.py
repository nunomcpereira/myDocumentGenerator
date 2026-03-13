from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import LLMOfflineError, LLMProviderError


class LLMProvider:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def chat_completion(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        payload: dict[str, Any] = {
            "model": self.settings.llm_model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if response_format is not None:
            payload["response_format"] = response_format

        headers = {
            "Authorization": f"Bearer {self.settings.llm_api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                response = await client.post(
                    f"{self.settings.llm_base_url.rstrip('/')}/chat/completions",
                    json=payload,
                    headers=headers,
                )
            response.raise_for_status()
        except httpx.ConnectError as exc:
            raise LLMOfflineError(
                "Unable to reach the local LLM endpoint at http://localhost:8050/v1. Start llama.cpp or update LLM_BASE_URL."
            ) from exc
        except httpx.TimeoutException as exc:
            raise LLMOfflineError(
                "The local LLM endpoint timed out. Check whether llama.cpp is responsive and the model is loaded."
            ) from exc
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip() or str(exc)
            raise LLMProviderError(f"LLM request failed: {detail}") from exc

        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            raise LLMProviderError("LLM response did not include any choices.")

        message = choices[0].get("message") or {}
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise LLMProviderError("LLM response did not include a text message.")
        return content

    async def generate_json(self, *, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> dict[str, Any]:
        content = await self.chat_completion(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        normalized = content.strip()
        if normalized.startswith("```"):
            normalized = normalized.strip("`")
            normalized = normalized.replace("json", "", 1).strip()
        try:
            return json.loads(normalized)
        except json.JSONDecodeError as exc:
            raise LLMProviderError(f"Failed to parse JSON from LLM response: {normalized}") from exc


llm_provider = LLMProvider()