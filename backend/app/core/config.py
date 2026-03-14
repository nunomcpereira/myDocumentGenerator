from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    base_dir: Path = Path(__file__).resolve().parents[2]
    project_root: Path = Path(__file__).resolve().parents[3]
    app_name: str = "Documentation Generation & Localization Engine"
    environment: str = "development"
    api_prefix: str = "/v1"
    llm_base_url: str = Field(default="http://localhost:8050/v1", alias="LLM_BASE_URL")
    llm_api_key: str = Field(default="local-llm", alias="LLM_API_KEY")
    llm_model: str = Field(default="llama.cpp", alias="LLM_MODEL")
    translation_provider: str = Field(default="llm", alias="TRANSLATION_PROVIDER")
    translation_source_language: str | None = Field(default=None, alias="TRANSLATION_SOURCE_LANGUAGE")
    azure_translator_endpoint: str = Field(default="https://api.cognitive.microsofttranslator.com", alias="AZURE_TRANSLATOR_ENDPOINT")
    azure_translator_key: str | None = Field(default=None, alias="AZURE_TRANSLATOR_KEY")
    azure_translator_region: str | None = Field(default=None, alias="AZURE_TRANSLATOR_REGION")
    google_translate_api_key: str | None = Field(default=None, alias="GOOGLE_TRANSLATE_API_KEY")
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    storage_root: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[2] / "data")
    vector_store_root: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[2] / "data" / "vectorstores")
    upload_root: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[2] / "data" / "uploads")
    generated_root: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[2] / "data" / "generated")
    scenarios_root: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[3] / "scenarios")
    scenarios_db_path: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[3] / "scenarios" / "scenarios.db")
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    request_timeout_seconds: float = 45.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    settings.vector_store_root.mkdir(parents=True, exist_ok=True)
    settings.upload_root.mkdir(parents=True, exist_ok=True)
    settings.generated_root.mkdir(parents=True, exist_ok=True)
    settings.scenarios_root.mkdir(parents=True, exist_ok=True)
    settings.scenarios_db_path.parent.mkdir(parents=True, exist_ok=True)
    return settings