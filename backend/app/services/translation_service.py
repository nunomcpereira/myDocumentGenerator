from __future__ import annotations

from html import unescape
import re
import zipfile
from pathlib import Path
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import ExportError
from app.core.errors import TranslationProviderConfigurationError, TranslationProviderError
from app.models.document_state import CustomCssConfiguration, ExampleSnippet, SessionContext, TemplateSection, TranslationConfigurationResponse, TranslationProviderId, TranslationProviderOption
from app.services.llm_provider import llm_provider
from app.services.scenario_service import scenario_service

try:
    from docx import Document as DocxDocument
except ImportError:  # pragma: no cover - optional dependency path
    DocxDocument = None


LANGUAGE_CODES = {
    "arabic": "ar",
    "chinese": "zh-Hans",
    "dutch": "nl",
    "english": "en",
    "french": "fr",
    "german": "de",
    "italian": "it",
    "japanese": "ja",
    "korean": "ko",
    "portuguese": "pt",
    "spanish": "es",
}

PROVIDER_METADATA: dict[TranslationProviderId, dict[str, Any]] = {
    "llm": {
        "label": "Current LLM",
        "description": "Uses the existing JSON-based translation prompt against the configured chat model.",
        "required_env": ["TRANSLATION_PROVIDER", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"],
    },
    "azure": {
        "label": "Azure Translator",
        "description": "Calls the Azure AI Translator Text API directly for section title and body translation.",
        "required_env": ["TRANSLATION_PROVIDER", "AZURE_TRANSLATOR_ENDPOINT", "AZURE_TRANSLATOR_KEY", "AZURE_TRANSLATOR_REGION"],
    },
    "google": {
        "label": "Google Translate",
        "description": "Calls the Google Cloud Translation REST API directly for section title and body translation.",
        "required_env": ["TRANSLATION_PROVIDER", "GOOGLE_TRANSLATE_API_KEY"],
    },
}


class TranslationService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def describe_configuration(self) -> TranslationConfigurationResponse:
        active_provider = self.get_active_provider()
        _, css_file_name, css_updated_at = scenario_service.get_custom_css()
        return TranslationConfigurationResponse(
            active_provider=active_provider,
            options=[
                TranslationProviderOption(
                    id=provider_id,
                    label=metadata["label"],
                    description=metadata["description"],
                    configured=self._is_provider_configured(provider_id),
                    required_env=metadata["required_env"],
                )
                for provider_id, metadata in PROVIDER_METADATA.items()
            ],
            custom_css=CustomCssConfiguration(enabled=bool(css_file_name), file_name=css_file_name, updated_at=css_updated_at),
        )

    def get_active_provider(self) -> TranslationProviderId:
        raw_provider = (self.settings.translation_provider or "llm").strip().lower()
        if raw_provider in PROVIDER_METADATA:
            return raw_provider  # type: ignore[return-value]
        raise TranslationProviderConfigurationError(
            "Unsupported translation provider configured. Use TRANSLATION_PROVIDER=llm, azure, or google."
        )

    async def translate_sections(
        self,
        *,
        session: SessionContext,
        language: str,
        good_examples: list[ExampleSnippet],
    ) -> dict[str, str]:
        provider = self.get_active_provider()
        if provider == "llm":
            return await self._translate_with_llm(session=session, language=language, good_examples=good_examples)
        if provider == "azure":
            return await self._translate_with_azure(session=session, language=language)
        return await self._translate_with_google(session=session, language=language)

    def inject_translations(
        self,
        *,
        session: SessionContext,
        translations: dict[str, dict[str, str]],
        output_directory: Path,
        output_file_name: str | None = None,
    ) -> tuple[Path, list[Path], list[str]]:
        if session.template_structure.file_type != "docx":
            raise ExportError("Export currently requires an original .docx template so layout and styling can be preserved.")
        if DocxDocument is None:
            raise ExportError("python-docx is not installed, so .docx export is unavailable.")

        output_directory.mkdir(parents=True, exist_ok=True)
        generated_files: list[Path] = []
        warnings: list[str] = []
        base_name = (output_file_name or session.output_file_name or session.template_path.stem).strip() or session.template_path.stem

        for language, translated_sections in translations.items():
            target_path = output_directory / f"{base_name}.{language.lower()}.docx"
            document = DocxDocument(str(session.template_path))
            for section in session.template_structure.sections:
                translated_text = translated_sections.get(f"{section.id}::content") or translated_sections.get(section.id)
                translated_title = translated_sections.get(f"{section.id}::title")
                if not translated_text and not translated_title:
                    continue
                warning = self._apply_section_translation(document, section, translated_text, translated_title)
                if warning:
                    warnings.append(f"{language}: {warning}")
            document.save(str(target_path))
            generated_files.append(target_path)

        archive_path = output_directory / f"{base_name}.zip"
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file_path in generated_files:
                archive.write(file_path, arcname=file_path.name)
        return archive_path, generated_files, warnings

    async def _translate_with_llm(
        self,
        *,
        session: SessionContext,
        language: str,
        good_examples: list[ExampleSnippet],
    ) -> dict[str, str]:
        payload = await llm_provider.generate_json(
            system_prompt=llm_provider.with_scenario_mcp_context(
                self._build_llm_translation_system_prompt(language),
                session.mcp_servers,
            ),
            user_prompt=self._build_llm_translation_user_prompt(session, language, good_examples),
            temperature=0.1,
            mcp_servers=session.mcp_servers,
        )
        translated_sections: dict[str, str] = {}
        for section in payload.get("sections") or []:
            if not isinstance(section, dict):
                continue
            section_id = section.get("section_id")
            if not isinstance(section_id, str) or not section_id.strip():
                continue
            title = section.get("title")
            content = section.get("content")
            if isinstance(title, str) and title.strip():
                translated_sections[f"{section_id}::title"] = title
            if isinstance(content, str) and content.strip():
                translated_sections[section_id] = content
                translated_sections[f"{section_id}::content"] = content
        return translated_sections

    async def _translate_with_azure(self, *, session: SessionContext, language: str) -> dict[str, str]:
        if not self.settings.azure_translator_key or not self.settings.azure_translator_region:
            raise TranslationProviderConfigurationError(
                "Azure Translator requires AZURE_TRANSLATOR_KEY and AZURE_TRANSLATOR_REGION in backend/.env."
            )

        items = self._collect_translatable_items(session)
        if not items:
            return {}

        headers = {
            "Ocp-Apim-Subscription-Key": self.settings.azure_translator_key,
            "Ocp-Apim-Subscription-Region": self.settings.azure_translator_region,
            "Content-Type": "application/json",
        }
        params: dict[str, str] = {
            "api-version": "3.0",
            "to": self._resolve_language_code(language),
        }
        if self.settings.translation_source_language:
            params["from"] = self.settings.translation_source_language

        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                response = await client.post(
                    f"{self.settings.azure_translator_endpoint.rstrip('/')}/translate",
                    params=params,
                    headers=headers,
                    json=[{"text": item["text"]} for item in items],
                )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip() or str(exc)
            raise TranslationProviderError(f"Azure Translator request failed: {detail}") from exc
        except httpx.HTTPError as exc:
            raise TranslationProviderError("Azure Translator could not be reached with the current configuration.") from exc

        data = response.json()
        if not isinstance(data, list) or len(data) != len(items):
            raise TranslationProviderError("Azure Translator response format was not recognized.")

        return self._build_translation_mapping(items, data, provider_name="Azure Translator")

    async def _translate_with_google(self, *, session: SessionContext, language: str) -> dict[str, str]:
        if not self.settings.google_translate_api_key:
            raise TranslationProviderConfigurationError(
                "Google Translate requires GOOGLE_TRANSLATE_API_KEY in backend/.env."
            )

        items = self._collect_translatable_items(session)
        if not items:
            return {}

        payload: dict[str, Any] = {
            "q": [item["text"] for item in items],
            "target": self._resolve_language_code(language),
            "format": "text",
        }
        if self.settings.translation_source_language:
            payload["source"] = self.settings.translation_source_language

        try:
            async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                response = await client.post(
                    "https://translation.googleapis.com/language/translate/v2",
                    params={"key": self.settings.google_translate_api_key},
                    json=payload,
                )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip() or str(exc)
            raise TranslationProviderError(f"Google Translate request failed: {detail}") from exc
        except httpx.HTTPError as exc:
            raise TranslationProviderError("Google Translate could not be reached with the current configuration.") from exc

        data = response.json()
        translations = (((data.get("data") or {}).get("translations")) or []) if isinstance(data, dict) else []
        if not isinstance(translations, list) or len(translations) != len(items):
            raise TranslationProviderError("Google Translate response format was not recognized.")

        normalized_payload = [{"translations": [entry]} for entry in translations]
        return self._build_translation_mapping(items, normalized_payload, provider_name="Google Translate")

    def _is_provider_configured(self, provider: TranslationProviderId) -> bool:
        if provider == "llm":
            return bool(self.settings.llm_base_url and self.settings.llm_model)
        if provider == "azure":
            return bool(self.settings.azure_translator_endpoint and self.settings.azure_translator_key and self.settings.azure_translator_region)
        return bool(self.settings.google_translate_api_key)

    def _collect_translatable_items(self, session: SessionContext) -> list[dict[str, str]]:
        items: list[dict[str, str]] = []
        for section in session.draft_state.sections:
            if not section.content.strip():
                continue
            items.append({"section_id": section.section_id, "kind": "title", "text": section.title})
            items.append({"section_id": section.section_id, "kind": "content", "text": section.content})
        return items

    def _build_translation_mapping(self, items: list[dict[str, str]], payload: list[dict[str, Any]], *, provider_name: str) -> dict[str, str]:
        translated_sections: dict[str, str] = {}
        for item, result in zip(items, payload, strict=False):
            translations = result.get("translations") if isinstance(result, dict) else None
            if not isinstance(translations, list) or not translations:
                raise TranslationProviderError(f"{provider_name} did not return a translated text value.")
            translated_text = translations[0].get("text") if isinstance(translations[0], dict) else None
            if not isinstance(translated_text, str):
                raise TranslationProviderError(f"{provider_name} did not return a translated text value.")
            normalized_text = unescape(translated_text)
            section_id = item["section_id"]
            if item["kind"] == "title":
                translated_sections[f"{section_id}::title"] = normalized_text
            else:
                translated_sections[section_id] = normalized_text
                translated_sections[f"{section_id}::content"] = normalized_text
        return translated_sections

    def _build_llm_translation_system_prompt(self, language: str) -> str:
        return (
            "You translate structured business and technical documentation. "
            "Preserve meaning, formatting intent, headings, and professional tone. "
            "Translate both the section titles and the drafted section content into the requested target language. "
            "Return only JSON with a sections array, each containing section_id, title, and content. "
            f"Target language: {language}."
        )

    def _build_llm_translation_user_prompt(
        self,
        session: SessionContext,
        language: str,
        good_examples: list[ExampleSnippet],
    ) -> str:
        examples = "\n\n".join(snippet.content[:700] for snippet in good_examples) or "No good examples uploaded."
        source_sections = "\n\n".join(
            f"Section ID: {section.section_id}\nTitle: {section.title}\nContent:\n{section.content}"
            for section in session.draft_state.sections
            if section.content.strip()
        )
        return (
            f"Translate the drafted document content below into {language}. Do not translate template placeholder text that is not present in the drafted content.\n\n"
            f"Tone guidance from approved examples:\n{examples}\n\n"
            f"Drafted source sections to translate:\n{source_sections}\n\n"
            'Return JSON in this shape: {"sections": [{"section_id": string, "title": string, "content": string}]}'
        )

    def _resolve_language_code(self, language: str) -> str:
        normalized = language.strip()
        if not normalized:
            raise TranslationProviderConfigurationError("A target language is required for translation.")
        language_code = LANGUAGE_CODES.get(normalized.lower())
        if language_code:
            return language_code
        if re.fullmatch(r"[A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?", normalized):
            return normalized
        raise TranslationProviderConfigurationError(
            f"Unsupported target language '{language}'. Use a known language name or ISO language code."
        )

    def _apply_section_translation(
        self,
        document: DocxDocument,
        section: TemplateSection,
        translated_text: str | None,
        translated_title: str | None,
    ) -> str | None:
        if translated_title and section.heading_paragraph_index is not None and section.heading_paragraph_index < len(document.paragraphs):
            document.paragraphs[section.heading_paragraph_index].text = translated_title

        if not translated_text:
            return None

        if not section.content_paragraph_indices:
            return f"Section '{section.title}' has no writable body paragraphs in the template."

        first_index = section.content_paragraph_indices[0]
        if first_index >= len(document.paragraphs):
            return f"Section '{section.title}' points to an invalid paragraph index."

        first_paragraph = document.paragraphs[first_index]
        first_paragraph.text = translated_text

        for redundant_index in section.content_paragraph_indices[1:]:
            if redundant_index < len(document.paragraphs):
                document.paragraphs[redundant_index].text = ""
        return None


translation_service = TranslationService()