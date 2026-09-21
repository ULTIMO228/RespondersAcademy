"""Чтение справочников reference.json из БД (с кэшем на процесс — данные меняются только сидом)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reference import ReferenceEntry, SystemSettings
from app.seed.load import REFERENCE_KEYS

_cache: dict[str, Any] = {}


def reset_cache() -> None:
    _cache.clear()


async def read_reference(db: AsyncSession) -> dict[str, Any]:
    if "reference" not in _cache:
        rows = (await db.execute(select(ReferenceEntry))).scalars().all()
        by_key = {row.key: row.value for row in rows}
        reference: dict[str, Any] = {key: by_key.get(key, []) for key in REFERENCE_KEYS}
        reference["classifierRows"] = by_key.get("classifierRows") or {"$ref": "mocks/classifier.json"}
        _cache["reference"] = reference
        _cache["classifierMeta"] = by_key.get("classifierMeta") or {}
    return _cache["reference"]


async def read_classifier_meta(db: AsyncSession) -> dict[str, Any]:
    await read_reference(db)
    return _cache["classifierMeta"]


async def read_system_settings(db: AsyncSession) -> dict[str, Any]:
    row = await db.get(SystemSettings, 1)
    if row is None:
        return {}
    return dict(row.settings)


DEFAULT_SECURITY = {"require2fa": True, "minPasswordLength": 8, "lockAfterAttempts": 5}


async def read_security_policy(db: AsyncSession) -> dict[str, Any]:
    settings = await read_system_settings(db)
    security = {**DEFAULT_SECURITY, **(settings.get("security") or {})}
    return security
