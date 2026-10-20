"""Настройки языковой модели (фича 006, plan.md Design п.1–3a): эффективный источник, сохранение, удаление ключа.

- Эффективный источник: строка `ai_settings` (id=1), если есть; иначе окружение фичи 004 (`AI_PROVIDER`, `POLZA_API_KEY`).
- Кэш процесса: сбрасывается при сохранении и живёт не дольше `CACHE_TTL_SEC` (несколько воркеров видят чужую запись).
- Ключ облака хранится в БД как Fernet-шифртекст (`ai_secrets`); в кэше и в `EffectiveAiSettings` — только шифртекст
  и последние 4 символа. Открытый ключ получает лишь внутренний код вызова модели через явный `cloud_key()`.
- Стопор облака: `CLOUD_ROUTE_VERIFIED` — единственный источник флага (T003 снимает его, T010 импортирует отсюда).
  Пока он ложен, `save(source="cloud")` отклоняется (400). Путь окружения `AI_PROVIDER=polza` (фича 004) стопор здесь
  не понижает: `effective()` честно отдаёт настроенное, а отказ от облака при ложном флаге — задача `complete_json` (T009/T010).
- Коммит — на вызывающей стороне (роут вместе с аудитом), как в `error_map_settings`; кэш сбрасывается в `save()`/`clear_key()`.
"""

from __future__ import annotations

import datetime as dt
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import validation_failed
from app.config import Settings, get_settings
from app.models.ai_settings import AI_SOURCES, AiSettings
from app.services.ai_secrets import SecretBox, last4

# Стопор облака: маршрут `cerebras/fp16` подтверждён по документации и живому вызову 2026-10-20 (T003, research R1),
# флаг снят. Сквозную проверку через интерфейс повторяет T041; вернуть False, если закрепление маршрута перестанет действовать.
CLOUD_ROUTE_VERIFIED: bool = True
CACHE_TTL_SEC = 5.0
SETTINGS_ROW_ID = 1

AiSource = Literal["local", "cloud"]

CLOUD_BLOCKED_MESSAGE = "Облачная модель пока недоступна: маршрут провайдера не подтверждён. Доступна локальная модель"
CLOUD_NEEDS_KEY_MESSAGE = "Для облачной модели нужен ключ доступа"
UNKNOWN_SOURCE_MESSAGE = "Источник модели — «local» или «cloud»"


def cloud_allowed() -> bool:
    """Можно ли обращаться к облаку (флаг читается в момент вызова, чтобы тесты могли его подменять)."""
    return CLOUD_ROUTE_VERIFIED


@dataclass(frozen=True, slots=True)
class EffectiveAiSettings:
    """Действующие настройки; секреты (`_cipher`, `_env_key`) скрыты из `repr` и сравнения."""

    source: AiSource
    origin: Literal["db", "env"]
    key_set: bool
    key_last4: str | None
    updated_by: str | None = None
    updated_at: dt.datetime | None = None
    _cipher: str | None = field(default=None, repr=False, compare=False)
    _env_key: SecretStr | None = field(default=None, repr=False, compare=False)


@dataclass(frozen=True, slots=True)
class SaveResult:
    source: AiSource
    key_changed: bool
    switched_to_local: bool = False


class AiSettingsService:
    def __init__(self, settings: Settings | None = None, clock: Callable[[], float] = time.monotonic) -> None:
        self._settings = settings
        self._clock = clock
        self._cached: EffectiveAiSettings | None = None
        self._cached_at = 0.0

    @property
    def settings(self) -> Settings:
        return self._settings or get_settings()

    def invalidate(self) -> None:
        self._cached = None

    async def effective(self, db: AsyncSession) -> EffectiveAiSettings:
        if self._cached is not None and self._clock() - self._cached_at < CACHE_TTL_SEC:
            return self._cached
        row = await db.get(AiSettings, SETTINGS_ROW_ID, populate_existing=True)
        value = self._from_row(row) if row is not None else self._from_env()
        self._cached, self._cached_at = value, self._clock()
        return value

    def cloud_key(self, effective: EffectiveAiSettings) -> str | None:
        """Открытый ключ облака — только для внутреннего вызова модели; не логировать и не отдавать в API."""
        if effective._cipher:
            return SecretBox.from_settings(self.settings).decrypt(effective._cipher)
        if effective._env_key is not None:
            return effective._env_key.get_secret_value().strip() or None
        return None

    async def save(self, db: AsyncSession, *, source: str, key: str | None, user_id: str | None) -> SaveResult:
        """Сохраняет источник и (если передан непустой) новый ключ; `None`/пустой ключ — оставить прежний."""
        if source not in AI_SOURCES:
            raise validation_failed(UNKNOWN_SOURCE_MESSAGE)
        if source == "cloud" and not cloud_allowed():
            raise validation_failed(CLOUD_BLOCKED_MESSAGE)
        new_key = (key or "").strip() or None
        row = await db.get(AiSettings, SETTINGS_ROW_ID)
        if source == "cloud" and new_key is None and not (row is not None and row.cloud_key_cipher):
            raise validation_failed(CLOUD_NEEDS_KEY_MESSAGE)
        if row is None:
            row = AiSettings(id=SETTINGS_ROW_ID)
            db.add(row)
        row.source = source
        if new_key is not None:
            row.cloud_key_cipher = SecretBox.from_settings(self.settings).encrypt(new_key)  # прежний шифртекст затирается
            row.cloud_key_last4 = last4(new_key)
        self._touch(row, user_id)
        await db.flush()
        self.invalidate()
        return SaveResult(source=source, key_changed=new_key is not None)  # type: ignore[arg-type]

    async def clear_key(self, db: AsyncSession, *, user_id: str | None) -> SaveResult:
        """Удаляет ключ; при выбранном облаке атомарно переключает на локальную модель (data-model.md, инвариант)."""
        row = await db.get(AiSettings, SETTINGS_ROW_ID)
        if row is None:  # строки нет — облако могло быть выбрано окружением (AI_PROVIDER=polza)
            switched = self._from_env().source == "cloud"
            row = AiSettings(id=SETTINGS_ROW_ID, source="local")
            db.add(row)
        else:
            switched = row.source == "cloud"
        row.source = "local"
        row.cloud_key_cipher = None
        row.cloud_key_last4 = None
        self._touch(row, user_id)
        await db.flush()
        self.invalidate()
        return SaveResult(source="local", key_changed=True, switched_to_local=switched)

    @staticmethod
    def _touch(row: AiSettings, user_id: str | None) -> None:
        row.updated_by = user_id
        row.updated_at = dt.datetime.now(dt.UTC)

    @staticmethod
    def _from_row(row: AiSettings) -> EffectiveAiSettings:
        return EffectiveAiSettings(
            source=row.source,  # type: ignore[arg-type]
            origin="db",
            key_set=bool(row.cloud_key_cipher),
            key_last4=row.cloud_key_last4 if row.cloud_key_cipher else None,
            updated_by=row.updated_by,
            updated_at=row.updated_at,
            _cipher=row.cloud_key_cipher or None,
        )

    def _from_env(self) -> EffectiveAiSettings:
        settings = self.settings
        env_key = settings.polza_api_key
        plain = env_key.get_secret_value().strip() if env_key is not None else ""
        return EffectiveAiSettings(
            source="cloud" if settings.ai_provider == "polza" else "local",
            origin="env",
            key_set=bool(plain),
            key_last4=last4(plain) if plain else None,
            _env_key=env_key if plain else None,
        )


# Экземпляр процесса: его кэш общий для всех запросов воркера.
_default = AiSettingsService()


def default_service() -> AiSettingsService:
    return _default


async def effective(db: AsyncSession) -> EffectiveAiSettings:
    return await _default.effective(db)


async def save(db: AsyncSession, *, source: str, key: str | None, user_id: str | None) -> SaveResult:
    return await _default.save(db, source=source, key=key, user_id=user_id)


async def clear_key(db: AsyncSession, *, user_id: str | None) -> SaveResult:
    return await _default.clear_key(db, user_id=user_id)


def invalidate_cache() -> None:
    _default.invalidate()
