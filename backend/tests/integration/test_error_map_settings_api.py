"""Спека 003, T028: GET/PUT /api/v1/error-map/settings — пороги светофора, только администратор.

Раздел `errorMap` лежит в `SystemSettings.settings` общей тестовой базы, поэтому каждый тест снимает снимок строки
и журнала аудита и возвращает их после себя (фикстура `settings_snapshot`).
"""

from __future__ import annotations

import copy
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.audit import AuditLog
from app.models.reference import SystemSettings
from app.services.error_map_settings import SECTION
from tests.conftest import login_as

ROUTE = "/error-map/settings"
ACTION = "error_map.settings"
DEFAULTS = {
    "sometimesFrom": 0.1,
    "oftenFrom": 0.3,
    "minAttemptsGroup": 5,
    "minAttemptsStudent": 3,
    "sameBandPoints": 10,
}
VALID = {
    "sometimesFrom": 0.15,
    "oftenFrom": 0.4,
    "minAttemptsGroup": 6,
    "minAttemptsStudent": 4,
    "sameBandPoints": 12,
}

INVALID_PAYLOADS = [
    pytest.param({"sometimesFrom": 0.4, "oftenFrom": 0.3}, id="порядок-порогов"),
    pytest.param({"oftenFrom": 0.1}, id="часто-равно-иногда"),
    pytest.param({"oftenFrom": 1}, id="часто-не-меньше-1"),
    pytest.param({"sometimesFrom": 0}, id="иногда-ноль"),
    pytest.param({"sometimesFrom": -0.1}, id="иногда-отрицательный"),
    pytest.param({"sometimesFrom": "0.2"}, id="порог-строка"),
    pytest.param({"oftenFrom": True}, id="порог-логическое"),
    pytest.param({"sameBandPoints": 51}, id="допуск-больше-50"),
    pytest.param({"sameBandPoints": -1}, id="допуск-отрицательный"),
    pytest.param({"sameBandPoints": 10.5}, id="допуск-дробный"),
    pytest.param({"minAttemptsGroup": 0}, id="минимум-группы-ноль"),
    pytest.param({"minAttemptsStudent": 2.5}, id="минимум-дробный"),
    pytest.param({"minAttemptsStudent": "3"}, id="минимум-строка"),
    pytest.param({"unknownKey": 1}, id="неизвестный-ключ"),
]


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


async def _stored() -> dict[str, Any] | None:
    async with get_sessionmaker()() as db:
        row = await db.get(SystemSettings, 1)
        return copy.deepcopy(row.settings) if row is not None else None


async def _replace_row(settings: dict[str, Any] | None) -> None:
    """None — строки настроек нет (удаляется); иначе строка получает указанные настройки."""
    async with get_sessionmaker()() as db:
        row = await db.get(SystemSettings, 1)
        if settings is None:
            if row is not None:
                await db.delete(row)
        elif row is None:
            db.add(SystemSettings(id=1, settings=settings))
        else:
            row.settings = settings
        await db.commit()


async def _settings_audit() -> dict[str, dict[str, Any]]:
    async with get_sessionmaker()() as db:
        rows = (await db.execute(select(AuditLog).where(AuditLog.action == ACTION))).scalars().all()
        return {row.id: {"role": row.role, "user_id": row.user_id, "details": row.details} for row in rows}


@pytest_asyncio.fixture
async def settings_snapshot() -> AsyncIterator[None]:
    """Возвращает строку SystemSettings как была; удаляет записи аудита карты, созданные тестом."""
    async with get_sessionmaker()() as db:
        row = await db.get(SystemSettings, 1)
        snapshot = copy.deepcopy(row.settings) if row is not None else None
        known_audit = list(
            (await db.execute(select(AuditLog.id).where(AuditLog.action == ACTION))).scalars().all()
        )
    yield
    await _replace_row(snapshot)
    async with get_sessionmaker()() as db:
        await db.execute(delete(AuditLog).where(AuditLog.action == ACTION, AuditLog.id.not_in(known_audit)))
        await db.commit()


@pytest_asyncio.fixture
async def defaults_settings(settings_snapshot) -> None:
    """Раздел errorMap убран — действуют умолчания (строка возвращается фикстурой settings_snapshot)."""
    stored = await _stored()
    if stored is not None:
        stored.pop(SECTION, None)
        await _replace_row(stored)


async def test_get_requires_session(v1: AsyncClient):
    response = await v1.get(ROUTE)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


async def test_put_requires_session(v1: AsyncClient, defaults_settings):
    response = await v1.put(ROUTE, json=VALID)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    assert SECTION not in (await _stored() or {})


@pytest.mark.parametrize("role", ["teacher", "student"])
async def test_non_admin_is_refused_before_body_is_read(v1: AsyncClient, defaults_settings, role: str):
    await login_as(v1, role)
    for response in (
        await v1.get(ROUTE),
        await v1.put(ROUTE, json=VALID),
        await v1.put(ROUTE, json={"unknownKey": 1}),
    ):
        assert response.status_code == 403, response.text
        assert response.json()["error"]["code"] == "forbidden"
    assert SECTION not in (await _stored() or {})


async def test_get_returns_defaults_without_section(v1: AsyncClient, defaults_settings):
    await login_as(v1, "admin")
    response = await v1.get(ROUTE)
    assert response.status_code == 200, response.text
    assert response.json() == DEFAULTS


async def test_get_without_settings_row_returns_defaults(v1: AsyncClient, settings_snapshot):
    await login_as(v1, "admin")
    await _replace_row(None)
    response = await v1.get(ROUTE)
    assert response.status_code == 200, response.text
    assert response.json() == DEFAULTS


async def test_put_applies_and_get_reads_back(v1: AsyncClient, defaults_settings):
    await login_as(v1, "admin")
    put = await v1.put(ROUTE, json=VALID)
    assert put.status_code == 200, put.text
    assert put.json() == VALID
    assert (await v1.get(ROUTE)).json() == VALID


async def test_put_partial_patch_keeps_other_thresholds(v1: AsyncClient, defaults_settings):
    await login_as(v1, "admin")
    response = await v1.put(ROUTE, json={"oftenFrom": 0.5})
    assert response.status_code == 200, response.text
    assert response.json() == {**DEFAULTS, "oftenFrom": 0.5}


@pytest.mark.parametrize("payload", INVALID_PAYLOADS)
async def test_invalid_values_are_400_and_nothing_is_saved(
    v1: AsyncClient, defaults_settings, payload: dict[str, Any]
):
    await login_as(v1, "admin")
    audit_before = await _settings_audit()
    response = await v1.put(ROUTE, json=payload)
    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "validationFailed"
    assert "карты ошибок" in response.json()["error"]["message"]
    assert (await v1.get(ROUTE)).json() == DEFAULTS
    assert await _settings_audit() == audit_before


@pytest.mark.parametrize("raw", [b"{", b"[1, 2]"], ids=["не-json", "не-объект"])
async def test_malformed_body_is_400_bad_request(v1: AsyncClient, defaults_settings, raw: bytes):
    await login_as(v1, "admin")
    response = await v1.put(ROUTE, content=raw, headers={"Content-Type": "application/json"})
    assert response.status_code == 400, response.text
    assert response.json()["error"]["code"] == "badRequest"
    assert (await v1.get(ROUTE)).json() == DEFAULTS


async def test_put_without_settings_row_is_404_with_error_code(v1: AsyncClient, settings_snapshot):
    await login_as(v1, "admin")
    await _replace_row(None)
    response = await v1.put(ROUTE, json=VALID)
    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "notFound"
    assert response.json()["error"]["message"]


async def test_successful_put_writes_audit_with_old_and_new_thresholds(v1: AsyncClient, defaults_settings):
    session = await login_as(v1, "admin")
    audit_before = await _settings_audit()
    response = await v1.put(ROUTE, json=VALID)
    assert response.status_code == 200, response.text
    created = [entry for key, entry in (await _settings_audit()).items() if key not in audit_before]
    assert len(created) == 1
    entry = created[0]
    assert entry["role"] == "admin"
    assert entry["user_id"] == session["userId"]
    assert (
        "Было: порог «иногда» 0.1; порог «часто» 0.3; минимум попыток группы 5; "
        "минимум попыток обучающегося 3; допуск «как у группы» 10."
    ) in entry["details"]
    assert (
        "Стало: порог «иногда» 0.15; порог «часто» 0.4; минимум попыток группы 6; "
        "минимум попыток обучающегося 4; допуск «как у группы» 12"
    ) in entry["details"]


async def test_put_keeps_other_settings_sections_and_unknown_section_keys(v1: AsyncClient, settings_snapshot):
    await login_as(v1, "admin")
    stored = await _stored()
    assert stored is not None
    stored[SECTION] = {"futureKey": "keep"}
    await _replace_row(stored)
    response = await v1.put(ROUTE, json=VALID)
    assert response.status_code == 200, response.text
    after = await _stored()
    assert after is not None
    assert {key: value for key, value in after.items() if key != SECTION} == {
        key: value for key, value in stored.items() if key != SECTION
    }
    assert after[SECTION] == {"futureKey": "keep", **VALID}
