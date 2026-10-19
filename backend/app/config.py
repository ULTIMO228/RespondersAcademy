"""Настройки бэкенда (pydantic-settings). Единственная точка чтения окружения."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(default="sqlite+aiosqlite:///./var/dev.db", alias="DATABASE_URL")
    jwt_secret: SecretStr = Field(alias="JWT_SECRET")
    jwt_ttl_hours: int = Field(default=24, alias="JWT_TTL_HOURS")
    tz_offset: str = Field(default="+03:00", alias="TZ_OFFSET")
    models_dir: Path = Field(default=BACKEND_DIR / "models", alias="MODELS_DIR")
    seed_dir: Path = Field(default=REPO_ROOT, alias="SEED_DIR")
    var_dir: Path = Field(default=BACKEND_DIR / "var", alias="VAR_DIR")
    demo_audio_dir: Path = Field(default=BACKEND_DIR / "data" / "demo_audio", alias="DEMO_AUDIO_DIR")  # студийные записи заявителей (ElevenLabs)
    ollama_url: str | None = Field(default=None, alias="OLLAMA_URL")
    ollama_model: str = Field(default="qwen2.5:7b-instruct", alias="OLLAMA_MODEL")
    llama_url: str | None = Field(default=None, alias="LLAMA_URL")  # OpenAI-совместимый llama-server (docs/model-report/QUICKSTART.md)
    llama_model: str = Field(default="semantic-review", alias="LLAMA_MODEL")
    ollama_timeout_sec: float = Field(default=120.0, alias="OLLAMA_TIMEOUT_SEC")
    # Внешний провайдер моделей (спека 004): по умолчанию выключен; ключ нигде не логируется и не отдаётся в API.
    ai_provider: Literal["local", "polza"] = Field(default="local", alias="AI_PROVIDER")
    polza_api_key: SecretStr | None = Field(default=None, alias="POLZA_API_KEY")
    polza_base_url: str = Field(default="https://polza.ai/api/v1", alias="POLZA_BASE_URL")
    polza_model: str = Field(default="openai/gpt-4o-mini", alias="POLZA_MODEL")
    polza_timeout_sec: float = Field(default=60.0, alias="POLZA_TIMEOUT_SEC")
    polza_rpm: int = Field(default=20, ge=1, alias="POLZA_RPM")  # запросов в минуту
    polza_daily_limit: int = Field(default=500, ge=1, alias="POLZA_DAILY_LIMIT")  # запросов в сутки
    api_prefixes: list[str] = Field(default=["/api/mock", "/api/v1"], alias="API_PREFIXES")
    two_factor_stub: bool = Field(default=True, alias="TWO_FACTOR_STUB")
    ml_warmup: bool = Field(default=True, alias="ML_WARMUP")  # прогрев моделей при старте (в тестах выключен)
    tts_enabled: bool = Field(default=True, alias="TTS_ENABLED")  # синтез аудио билетов (Silero); 0 — только расшифровка
    app_env: str = Field(default="dev", alias="APP_ENV")

    @field_validator("jwt_secret")
    @classmethod
    def _strong_jwt_secret(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if len(secret.encode("utf-8")) < 32 or secret in {"dev-secret-change-me", "change-me-in-production"}:
            raise ValueError("JWT_SECRET должен содержать не менее 32 байт случайного секрета")
        return value

    @model_validator(mode="after")
    def _polza_needs_key(self) -> Settings:
        if self.ai_provider == "polza" and not (self.polza_api_key and self.polza_api_key.get_secret_value().strip()):
            raise ValueError("AI_PROVIDER=polza требует POLZA_API_KEY")
        return self

    @property
    def sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def resolved_database_url(self) -> str:
        """Относительный путь SQLite считается от backend/ независимо от cwd процесса."""
        if self.sqlite and ":///./" in self.database_url:
            relative = self.database_url.split(":///./", 1)[1]
            return f"sqlite+aiosqlite:///{(BACKEND_DIR / relative).as_posix()}"
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()
