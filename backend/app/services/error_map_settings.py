"""Настройки карты ошибок — раздел `errorMap` в `SystemSettings.settings` (spec/003-error-map, data-model.md §2).

Чтение: отсутствующая строка настроек, раздел, ключ или `null` заменяются умолчаниями; прочие разделы «Системы» не трогаются.
Запись: частичный патч поверх текущих значений, итоговый набор проверяется целиком (пороги связаны между собой).
Ошибки — `validation_failed` (400) с текстом на русском; при ошибке ничего не записывается.
Коммит — на вызывающей стороне (роут), как в `app/api/compat/admin_system.py`.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import not_found, validation_failed
from app.models.reference import SystemSettings

SECTION = "errorMap"
SETTINGS_ROW_ID = 1
SAME_BAND_MAX_POINTS = 50


@dataclass(frozen=True, slots=True)
class ErrorMapSettings:
    sometimes_from: float = 0.10
    often_from: float = 0.30
    min_attempts_group: int = 5
    min_attempts_student: int = 3
    same_band_points: int = 10


# Ключ раздела `errorMap` → поле датакласса.
FIELD_BY_KEY: dict[str, str] = {
    "sometimesFrom": "sometimes_from",
    "oftenFrom": "often_from",
    "minAttemptsGroup": "min_attempts_group",
    "minAttemptsStudent": "min_attempts_student",
    "sameBandPoints": "same_band_points",
}

MESSAGES: dict[str, str] = {
    "sometimesFrom": "Порог «иногда» — доля от 0 до 1, например 0,1",
    "oftenFrom": "Порог «часто» — доля от 0 до 1, например 0,3",
    "minAttemptsGroup": "Минимум попыток для группы — целое число не меньше 1",
    "minAttemptsStudent": "Минимум попыток для обучающегося — целое число не меньше 1",
    "sameBandPoints": f"Зона «как у группы» — целое число от 0 до {SAME_BAND_MAX_POINTS} процентных пунктов",
}
ORDER_MESSAGE = "Пороги долей должны идти по возрастанию: 0 < «иногда» < «часто» < 1"


def settings_payload(settings: ErrorMapSettings) -> dict[str, Any]:
    """Датакласс → раздел `errorMap` в camelCase (форма, которая хранится в JSON)."""
    return {key: getattr(settings, field) for key, field in FIELD_BY_KEY.items()}


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


def _is_whole(value: Any) -> bool:
    return _is_number(value) and float(value).is_integer()


def _valid_value(key: str, value: Any) -> bool:
    if key in ("sometimesFrom", "oftenFrom"):
        return _is_number(value)
    if key == "sameBandPoints":
        return _is_whole(value) and 0 <= value <= SAME_BAND_MAX_POINTS
    return _is_whole(value) and value >= 1  # минимумы попыток


def validate_error_map_settings(values: Mapping[str, Any]) -> ErrorMapSettings:
    """Полный набор ключей раздела → датакласс; все нарушения — одним ответом 400."""
    errors = [MESSAGES[key] for key in FIELD_BY_KEY if not _valid_value(key, values[key])]
    sometimes, often = values["sometimesFrom"], values["oftenFrom"]
    if _is_number(sometimes) and _is_number(often) and not 0 < sometimes < often < 1:
        errors.append(ORDER_MESSAGE)
    if errors:
        raise validation_failed("Настройки карты ошибок не сохранены. " + "; ".join(errors))
    return ErrorMapSettings(
        sometimes_from=float(sometimes),
        often_from=float(often),
        min_attempts_group=int(values["minAttemptsGroup"]),
        min_attempts_student=int(values["minAttemptsStudent"]),
        same_band_points=int(values["sameBandPoints"]),
    )


def _stored_section(settings: Mapping[str, Any] | None) -> dict[str, Any]:
    section = settings.get(SECTION) if settings else None
    return dict(section) if isinstance(section, dict) else {}


def _with_defaults(section: Mapping[str, Any]) -> dict[str, Any]:
    defaults = settings_payload(ErrorMapSettings())
    return {
        key: section[key] if section.get(key) is not None else default for key, default in defaults.items()
    }


async def read_error_map_settings(db: AsyncSession) -> ErrorMapSettings:
    row = await db.get(SystemSettings, SETTINGS_ROW_ID)
    values = _with_defaults(_stored_section(row.settings if row is not None else None))
    return ErrorMapSettings(**{FIELD_BY_KEY[key]: value for key, value in values.items()})


async def save_error_map_settings(db: AsyncSession, patch: Mapping[str, Any]) -> ErrorMapSettings:
    """Ключи патча (кроме `None`) заменяют текущие значения; остальные разделы и неизвестные ключи раздела сохраняются."""
    unknown = [key for key in patch if key not in FIELD_BY_KEY]
    if unknown:
        raise validation_failed(
            "Неизвестные параметры карты ошибок: " + ", ".join(f"«{key}»" for key in unknown)
        )
    row = await db.get(SystemSettings, SETTINGS_ROW_ID)
    if row is None:
        raise not_found("Настройки системы не загружены — выполните загрузку сидов")
    section = _stored_section(row.settings)
    merged = _with_defaults(section) | {key: value for key, value in patch.items() if value is not None}
    settings = validate_error_map_settings(merged)
    row.settings = {**row.settings, SECTION: {**section, **settings_payload(settings)}}
    await db.flush()
    return settings
