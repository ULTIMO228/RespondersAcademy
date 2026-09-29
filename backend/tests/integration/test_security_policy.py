"""Политика безопасности из «Безопасность» админки применяется к следующему входу и смене пароля (спека 002, T053).

БД тестов общая на сессию: политика возвращается к значениям по умолчанию, а проверки идут на одноразовых учётных
записях, чтобы не блокировать и не менять демо-пользователей других тестов.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import AsyncClient

from tests.conftest import login_as

ADMIN_ID = "u-001"
DEFAULT_POLICY = {"minPasswordLength": 8, "lockAfterAttempts": 5}
PASSWORD = "Start-pass-1"


async def _patch_policy(client: AsyncClient, **security: int) -> None:
    response = await client.patch("/admin/system/settings", json={"security": security, "adminId": ADMIN_ID})
    assert response.status_code == 200, response.text


async def _create_student(client: AsyncClient, login: str) -> dict:
    body = {"adminId": ADMIN_ID, "fullName": "Тестовый Политика Тестович", "login": login, "password": PASSWORD, "role": "student", "armNumber": 41, "group": "ДДС-01", "service": "ДДС района Чертаново Южное"}
    response = await client.post("/admin/users", json=body)
    assert response.status_code == 201, response.text
    return {"login": login, "password": PASSWORD}


@pytest_asyncio.fixture
async def admin(client: AsyncClient) -> AsyncIterator[AsyncClient]:
    await login_as(client, "admin")
    yield client
    await login_as(client, "admin")
    await _patch_policy(client, **DEFAULT_POLICY)
    await client.post("/auth/logout")


async def test_min_password_length_applies_to_next_password_change(admin: AsyncClient):
    creds = await _create_student(admin, "policy-len")
    await _patch_policy(admin, minPasswordLength=12)
    assert (await admin.get("/auth/policy")).json()["minPasswordLength"] == 12
    await admin.post("/auth/logout")
    assert (await admin.post("/auth/login", json=creds)).status_code == 200
    short = await admin.post("/auth/password", json={"currentPassword": PASSWORD, "newPassword": "abc1234567"})
    assert short.status_code == 400
    assert short.json()["error"]["message"] == "Пароль должен содержать не менее 12 символов"
    accepted = await admin.post("/auth/password", json={"currentPassword": PASSWORD, "newPassword": "abcdefgh1234"})
    assert accepted.status_code == 204


async def test_lock_after_attempts_applies_to_next_login(admin: AsyncClient):
    creds = await _create_student(admin, "policy-lock")
    await _patch_policy(admin, lockAfterAttempts=2)
    assert (await admin.get("/auth/policy")).json()["lockAfterAttempts"] == 2
    await admin.post("/auth/logout")
    for _ in range(2):
        wrong = await admin.post("/auth/login", json={**creds, "password": "неверный-пароль"})
        assert wrong.status_code == 401
    # Порог из настроек достигнут: даже верный пароль теперь отклоняется блокировкой
    assert (await admin.post("/auth/login", json=creds)).status_code == 429


async def test_out_of_range_security_values_are_rejected(admin: AsyncClient):
    for security in ({"minPasswordLength": 5}, {"minPasswordLength": 65}, {"lockAfterAttempts": 0}, {"lockAfterAttempts": 11}):
        response = await admin.patch("/admin/system/settings", json={"security": security, "adminId": ADMIN_ID})
        assert response.status_code == 422, (security, response.text)
    require_2fa = await admin.patch("/admin/system/settings", json={"security": {"require2fa": True}, "adminId": ADMIN_ID})
    assert require_2fa.status_code in (400, 422)
    assert "require2fa" not in (await admin.get("/admin/system/settings")).json()["security"]


async def test_new_events_are_visible_in_admin_audit_by_type(admin: AsyncClient):
    creds = await _create_student(admin, "policy-audit")
    await admin.post("/auth/logout")
    await admin.post("/auth/login", json=creds)
    assert (await admin.post("/auth/password", json={"currentPassword": PASSWORD, "newPassword": "Новый-пароль-1"})).status_code == 204
    assert (await admin.post("/auth/logout-all")).status_code == 204
    await login_as(admin, "admin")
    events = (await admin.get("/admin/audit", params={"type": "login", "perPage": 100})).json()["items"]
    actions = {item["action"] for item in events}
    assert {"auth.login", "auth.passwordChange", "auth.logoutAll"} <= actions
    assert all(item["action"].startswith("auth.") for item in events)
