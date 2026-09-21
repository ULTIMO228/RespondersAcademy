"""Настройки бэкенда (pydantic-settings). Единственная точка чтения окружения."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(default="sqlite+aiosqlite:///./var/dev.db", alias="DATABASE_URL")
    jwt_secret: str = Field(default="dev-secret-change-me", alias="JWT_SECRET")
    jwt_ttl_hours: int = Field(default=24, alias="JWT_TTL_HOURS")
    tz_offset: str = Field(default="+03:00", alias="TZ_OFFSET")
    models_dir: Path = Field(default=BACKEND_DIR / "models", alias="MODELS_DIR")
    seed_dir: Path = Field(default=REPO_ROOT, alias="SEED_DIR")
    var_dir: Path = Field(default=BACKEND_DIR / "var", alias="VAR_DIR")
    ollama_url: str | None = Field(default=None, alias="OLLAMA_URL")
    ollama_model: str = Field(default="qwen2.5:7b-instruct", alias="OLLAMA_MODEL")
    ollama_timeout_sec: float = Field(default=120.0, alias="OLLAMA_TIMEOUT_SEC")
    api_prefixes: list[str] = Field(default=["/api/mock", "/api/v1"], alias="API_PREFIXES")
    two_factor_stub: bool = Field(default=True, alias="TWO_FACTOR_STUB")
    app_env: str = Field(default="dev", alias="APP_ENV")

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
