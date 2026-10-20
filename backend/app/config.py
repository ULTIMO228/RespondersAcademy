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
    # Без значения по умолчанию: только модель с открытыми весами, выбранная явно (решение организаторов 19.10).
    polza_model: str | None = Field(default=None, alias="POLZA_MODEL")
    polza_timeout_sec: float = Field(default=60.0, alias="POLZA_TIMEOUT_SEC")
    polza_rpm: int = Field(default=20, ge=1, alias="POLZA_RPM")  # запросов в минуту
    polza_daily_limit: int = Field(default=500, ge=1, alias="POLZA_DAILY_LIMIT")  # запросов в сутки
    api_prefixes: list[str] = Field(default=["/api/mock", "/api/v1"], alias="API_PREFIXES")
    two_factor_stub: bool = Field(default=True, alias="TWO_FACTOR_STUB")
    ml_warmup: bool = Field(default=True, alias="ML_WARMUP")  # прогрев моделей при старте (в тестах выключен)
    tts_enabled: bool = Field(default=True, alias="TTS_ENABLED")  # синтез аудио билетов (Silero); 0 — только расшифровка
    app_env: str = Field(default="dev", alias="APP_ENV")
    live_calls_enabled: bool = Field(default=False, alias="LIVE_CALLS_ENABLED")
    live_call_realtime_transport: Literal["polza", "omni", "cascade", "speechkit"] = Field(default="polza", alias="LIVE_CALL_REALTIME_TRANSPORT")
    # Живой заявитель через Polza.ai: ключ и адрес — POLZA_API_KEY/POLZA_BASE_URL, модели только из окружения
    # (условие организаторов: модели с открытыми весами, разворачиваемые позже локально; без хардкода).
    live_call_polza_chat_model: str | None = Field(default=None, alias="LIVE_CALL_POLZA_CHAT_MODEL")
    live_call_polza_stt_model: str | None = Field(default=None, alias="LIVE_CALL_POLZA_STT_MODEL")
    live_call_polza_tts_model: str | None = Field(default=None, alias="LIVE_CALL_POLZA_TTS_MODEL")
    live_call_polza_tts_voice: str | None = Field(default=None, alias="LIVE_CALL_POLZA_TTS_VOICE")
    # Движок голоса заявителя: polza (облако) или silero (локально на CPU, без сети; модель — MODELS_DIR/silero/<файл>).
    live_call_tts_engine: Literal["polza", "silero"] = Field(default="polza", alias="LIVE_CALL_TTS_ENGINE")
    live_call_silero_model: str | None = Field(default=None, alias="LIVE_CALL_SILERO_MODEL")
    live_call_silero_speaker: str | None = Field(default=None, alias="LIVE_CALL_SILERO_SPEAKER")
    # Уровень размышления разговорной модели (reasoning_effort). У GLM-5.3 размышление обязательно,
    # по умолчанию max → лишние секунды до первого слова; low — для телефонного темпа. Пусто — не передаём.
    live_call_polza_reasoning_effort: str | None = Field(default=None, alias="LIVE_CALL_POLZA_REASONING_EFFORT")
    # Потолок токенов размышления (reasoning.max_tokens) — стабильнее effort: у GLM-5.3 effort=low после
    # перебивания уходил в сотни токенов «мыслей». Задан — effort не отправляется (вместе — пустой ответ).
    live_call_polza_reasoning_max_tokens: int | None = Field(default=None, ge=1, alias="LIVE_CALL_POLZA_REASONING_MAX_TOKENS")
    live_call_polza_tts_format: Literal["wav", "pcm"] = Field(default="wav", alias="LIVE_CALL_POLZA_TTS_FORMAT")
    live_call_polza_tts_instructions: bool = Field(default=True, alias="LIVE_CALL_POLZA_TTS_INSTRUCTIONS")
    live_call_end_silence_ms: int = Field(default=700, ge=300, le=2000, alias="LIVE_CALL_END_SILENCE_MS")
    live_call_sounds_dir: Path | None = Field(default=None, alias="LIVE_CALL_SOUNDS_DIR")
    speechkit_api_key: SecretStr | None = Field(default=None, alias="SPEECHKIT_API_KEY", repr=False)
    speechkit_folder_id: str | None = Field(default=None, alias="SPEECHKIT_FOLDER_ID")
    speechkit_tts_model: Literal["general", "livetts"] = Field(default="livetts", alias="SPEECHKIT_TTS_MODEL")
    speechkit_voice: str = Field(default="denis", min_length=1, max_length=80, alias="SPEECHKIT_VOICE")
    speechkit_role: str = Field(default="casual", min_length=1, max_length=80, alias="SPEECHKIT_ROLE")
    live_call_realtime_url: str | None = Field(default=None, alias="LIVE_CALL_REALTIME_URL")
    live_call_realtime_key: SecretStr | None = Field(default=None, alias="LIVE_CALL_REALTIME_KEY", repr=False)
    live_call_public_ws_url: str | None = Field(default=None, alias="LIVE_CALL_PUBLIC_WS_URL")
    live_call_llm_url: str | None = Field(default=None, alias="LIVE_CALL_LLM_URL")
    live_call_llm_model: str = Field(default="caller", alias="LIVE_CALL_LLM_MODEL")
    live_call_llm_ollama: bool = Field(default=False, alias="LIVE_CALL_LLM_OLLAMA")
    live_call_llm_transport: Literal["local", "api"] = Field(default="local", alias="LIVE_CALL_LLM_TRANSPORT")
    live_call_llm_api_key: SecretStr | None = Field(default=None, alias="LIVE_CALL_LLM_API_KEY", repr=False)
    live_call_reply_mode: Literal["auto", "facts", "dialogue"] = Field(default="auto", alias="LIVE_CALL_REPLY_MODE")
    live_call_max_sec: int = Field(default=180, ge=30, le=600, alias="LIVE_CALL_MAX_SEC")

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
        if self.ai_provider == "polza" and not (self.polza_model or "").strip():
            raise ValueError("AI_PROVIDER=polza требует POLZA_MODEL (модель с открытыми весами)")
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
