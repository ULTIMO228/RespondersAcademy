"""T071: контракт строк 44–60 (docs/mock-api.md) — /admin/users, /admin/system/*, /admin/audit; шаги scripts/e2e-admin.sh.

Матрица доступа (SC-013): student/teacher на `/admin/*` → 403; без cookie — как мок (adminId в теле).
"""

from __future__ import annotations

import datetime as dt

import pytest
from httpx import AsyncClient

from tests.conftest import DEMO_USERS, login_as

ADMIN_ID = "u-001"
NEW_LOGIN = "e2e.tester"


def _now() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=3))).isoformat(timespec="seconds")


@pytest.mark.parametrize("role", ["student", "teacher"])
@pytest.mark.parametrize("path", ["/admin/users", "/admin/system/services", "/admin/system/settings", "/admin/audit", "/admin/system/logs", "/admin/system/monitoring", "/admin/system/usage-stats"])
async def test_access_matrix_non_admin_forbidden(client: AsyncClient, role: str, path: str):
    await login_as(client, role)
    response = await client.get(path)
    assert response.status_code == 403 and response.json()["error"]["code"] == "forbidden", response.text


async def test_admin_users_journey(client: AsyncClient):
    await login_as(client, "admin")
    listed = await client.get("/admin/users")
    assert listed.status_code == 200 and listed.json() and all("password" not in u for u in listed.json())
    assert all(u["role"] == "student" for u in (await client.get("/admin/users", params={"role": "student"})).json())
    blocked = (await client.get("/admin/users", params={"state": "blocked"})).json()
    assert blocked and all(not u["isActive"] for u in blocked) and any(u["login"] == DEMO_USERS["blocked"]["login"] for u in blocked)
    found = (await client.get("/admin/users", params={"q": "MOROZ"})).json()
    assert [u["login"] for u in found] == ["morozova"]
    assert (await client.get("/admin/users", params={"role": "architect"})).status_code == 400
    assert (await client.get("/admin/users", params={"state": "sleeping"})).status_code == 400

    body = {"adminId": ADMIN_ID, "fullName": "Тестовый Тест Тестович", "login": NEW_LOGIN, "password": "Temp-1234", "role": "student", "armNumber": 33, "group": "ДДС-01", "service": "ДДС района Чертаново Южное", "assignedGroups": ["ДДС-02"]}
    created = await client.post("/admin/users", json=body)
    assert created.status_code == 201, created.text
    user = created.json()
    assert user["login"] == NEW_LOGIN and user["id"].startswith("u-") and user["group"] == "ДДС-01" and "assignedGroups" not in user and "password" not in user
    user_id = user["id"]
    assert (await client.post("/admin/users", json=body)).status_code == 409
    assert (await client.post("/admin/users", json={**body, "login": "тестовый"})).status_code == 400
    assert (await client.post("/admin/users", json={**body, "login": "other.login", "armNumber": 0})).status_code == 400
    assert (await client.post("/admin/users", json={**body, "login": "other.login", "role": "root"})).status_code == 400

    role_changed = await client.patch(f"/admin/users/{user_id}", json={"adminId": ADMIN_ID, "role": "teacher", "assignedGroups": ["ДДС-01"]})
    assert role_changed.status_code == 200 and role_changed.json()["role"] == "teacher"
    assert role_changed.json()["assignedGroups"] == ["ДДС-01"] and "group" not in role_changed.json()
    renamed = await client.patch(f"/admin/users/{user_id}", json={"adminId": ADMIN_ID, "fullName": "Тестовый Тест Петрович"})
    assert renamed.status_code == 200 and renamed.json()["fullName"].endswith("Петрович")
    assert (await client.patch(f"/admin/users/{user_id}", json={"adminId": ADMIN_ID, "login": "morozova"})).status_code == 409
    assert (await client.patch("/admin/users/u-999", json={"adminId": ADMIN_ID, "fullName": "x"})).status_code == 404

    blocked_user = await client.post(f"/admin/users/{user_id}/block", json={"adminId": ADMIN_ID})
    assert blocked_user.status_code == 200 and blocked_user.json()["isActive"] is False
    self_block = await client.post(f"/admin/users/{ADMIN_ID}/block", json={"adminId": ADMIN_ID})
    assert self_block.status_code == 409 and self_block.json()["error"]["code"] == "conflict"
    unblocked = await client.post(f"/admin/users/{user_id}/unblock", json={"adminId": ADMIN_ID})
    assert unblocked.status_code == 200 and unblocked.json()["isActive"] is True
    toggled = await client.post(f"/admin/users/{user_id}/toggle-active", json={"adminId": ADMIN_ID})
    assert toggled.status_code == 200 and toggled.json()["isActive"] is False
    assert (await client.post(f"/admin/users/{user_id}/toggle-active", json={"adminId": ADMIN_ID})).json()["isActive"] is True

    reset = await client.post(f"/admin/users/{user_id}/reset-password", json={"adminId": ADMIN_ID})
    assert reset.status_code == 200 and reset.json()["user"]["id"] == user_id and reset.json()["temporaryPassword"]
    temporary = reset.json()["temporaryPassword"]

    audit = await client.get("/admin/audit", params={"type": "users", "perPage": 100})
    actions = {e["action"] for e in audit.json()["items"] if user_id in e["details"]}
    assert {"user.create", "user.roleChange", "user.update", "user.block", "user.unblock", "user.passwordReset"} <= actions
    assert all(e["userId"] == ADMIN_ID for e in audit.json()["items"] if user_id in e["details"])

    # Вход созданным пользователем: старый пароль после сброса не работает, временный — работает.
    client.cookies.clear()
    old = await client.post("/auth/login", json={"login": NEW_LOGIN, "password": "Temp-1234", "armNumber": 33, "twoFactorCode": "123456"})
    assert old.status_code == 401
    fresh = await client.post("/auth/login", json={"login": NEW_LOGIN, "password": temporary, "armNumber": 33, "twoFactorCode": "123456"})
    assert fresh.status_code == 200 and fresh.json()["role"] == "teacher", fresh.text


async def test_admin_users_requires_admin_actor(client: AsyncClient):
    client.cookies.clear()
    payload = {"fullName": "Без админа", "login": "no.admin", "password": "x", "role": "student", "armNumber": 5}
    assert (await client.post("/admin/users", json=payload)).status_code == 400
    assert (await client.post("/admin/users", json={**payload, "adminId": "u-002"})).status_code == 403
    await login_as(client, "teacher")
    assert (await client.post("/admin/users", json={**payload, "adminId": ADMIN_ID})).status_code == 403


async def test_system_services_and_session_lock(client: AsyncClient):
    await login_as(client, "admin")
    response = await client.get("/admin/system/services")
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["services"]) == 4 and body["integrity"]["ok"] is True and body["integrity"]["details"]
    by_id = {s["id"]: s for s in body["services"]}
    assert by_id["svc-sip"]["state"] == "degraded" and by_id["svc-sip"]["uptimeSec"] == 7320
    assert (await client.get("/admin/services")).json() == body["services"]

    restarted = await client.post("/admin/system/services/svc-sip/action", json={"action": "restart", "adminId": ADMIN_ID})
    sip = {s["id"]: s for s in restarted.json()["services"]}["svc-sip"]
    assert restarted.status_code == 200 and (sip["state"], sip["uptimeSec"]) == ("running", 0)
    started = await client.post("/admin/system/services/svc-ai/action", json={"action": "start", "adminId": ADMIN_ID})
    assert {s["id"]: s for s in started.json()["services"]}["svc-ai"]["state"] == "running"
    stopped = await client.post("/admin/system/services/svc-ai/action", json={"action": "stop", "adminId": ADMIN_ID})
    assert {s["id"]: s for s in stopped.json()["services"]}["svc-ai"]["state"] == "stopped"
    assert (await client.post("/admin/system/services/svc-ai/action", json={"action": "reboot"})).status_code == 400
    assert (await client.post("/admin/system/services/svc-none/action", json={"action": "start"})).status_code == 404

    running = await client.get("/sessions", params={"state": "running"})
    assert running.status_code == 200 and running.json(), "в сидах ожидается идущее занятие"
    locked = await client.post("/admin/system/services/svc-db/action", json={"action": "stop", "adminId": ADMIN_ID})
    assert locked.status_code == 409 and "активного занятия" in locked.json()["error"]["message"]
    assert {s["id"]: s for s in (await client.get("/admin/system/services")).json()["services"]}["svc-db"]["state"] == "running"
    assert (await client.post("/admin/system/services/svc-sip/action", json={"action": "stop", "adminId": ADMIN_ID})).status_code == 200

    audit = await client.get("/admin/audit", params={"type": "settings", "perPage": 100})
    assert any(e["action"] == "service.action" and e["userId"] == ADMIN_ID for e in audit.json()["items"])
    logs = await client.get("/admin/system/logs")
    assert logs.status_code == 200 and any(entry["source"] == "svc-ai" for entry in logs.json())
    assert logs.json()[0]["at"] >= logs.json()[-1]["at"]
    assert all(entry["level"] == "ERROR" for entry in (await client.get("/admin/system/logs", params={"level": "ERROR"})).json())
    assert (await client.get("/admin/system/logs", params={"level": "TRACE"})).status_code == 400


async def test_system_settings_norms_and_backup(client: AsyncClient):
    await login_as(client, "admin")
    current = await client.get("/admin/system/settings")
    assert current.status_code == 200 and set(current.json()) >= {"telephony", "database", "backup", "logging", "security", "performance", "autoRecovery"}
    assert (await client.get("/admin/settings")).json() == current.json()
    db_host = current.json()["database"]["host"]

    off = await client.patch("/admin/system/settings", json={"security": {"require2fa": False}, "adminId": ADMIN_ID})
    assert off.status_code == 200 and off.json()["security"]["require2fa"] is False
    assert (await client.get("/auth/policy")).json()["twoFactorRequired"] is False
    on = await client.patch("/admin/system/settings", json={"security": {"require2fa": True}, "adminId": ADMIN_ID})
    assert on.json()["security"]["require2fa"] is True

    for patch, needle in (
        ({"backup": {"periodHours": 48}}, "не реже 1 раза в сутки"),
        ({"logging": {"retentionMonths": 3}}, "не менее 6 месяцев"),
        ({"performance": {"sessionLimit": 10}}, "Не менее 20"),
        ({"security": {"minPasswordLength": 3}}, "длина пароля"),
        ({"security": {"lockAfterAttempts": 0}}, "Блокировка после"),
        ({"logging": {"level": "TRACE"}}, "Уровень логов"),
        ({"telephony": {"sipServer": "not a host!"}}, "SIP-сервер"),
    ):
        response = await client.patch("/admin/system/settings", json={**patch, "adminId": ADMIN_ID})
        assert response.status_code == 422 and needle in response.json()["error"]["message"], (patch, response.text)
    combined = await client.patch("/admin/system/settings", json={"backup": {"periodHours": 48}, "performance": {"sessionLimit": 5}, "adminId": ADMIN_ID})
    assert combined.status_code == 422 and "backup" not in combined.json()["error"]["message"] and combined.json()["error"]["message"].count("ТЗ") == 2

    saved = await client.patch("/admin/system/settings", json={"backup": {"periodHours": 12}, "logging": {"retentionMonths": 6}, "performance": {"sessionLimit": 20}, "telephony": {"realm": "e2e.arm112.local"}, "database": {"host": "hacked"}, "adminId": ADMIN_ID})
    assert saved.status_code == 200, saved.text
    assert saved.json()["backup"]["periodHours"] == 12 and saved.json()["logging"]["retentionMonths"] == 6
    assert saved.json()["performance"]["sessionLimit"] == 20 and saved.json()["telephony"]["realm"] == "e2e.arm112.local"
    assert saved.json()["database"]["host"] == db_host
    assert (await client.get("/admin/system/settings")).json()["backup"]["periodHours"] == 12

    backup_at = _now()
    ran = await client.patch("/admin/system/settings", json={"backup": {"lastAt": backup_at}, "adminId": ADMIN_ID})
    assert ran.status_code == 200 and ran.json()["backup"]["lastAt"] == backup_at
    assert (await client.get("/admin/system/settings")).json()["backup"]["lastAt"] == backup_at
    audit = await client.get("/admin/audit", params={"type": "backup", "perPage": 100})
    assert any(e["action"] == "backup.run" for e in audit.json()["items"])
    audit = await client.get("/admin/audit", params={"type": "settings", "perPage": 100})
    assert any(e["action"] == "settings.update" and "telephony: realm" in e["details"] for e in audit.json()["items"])
    logs = await client.get("/admin/system/logs")
    assert any(entry["source"] == "svc-backup" for entry in logs.json())


async def test_monitoring_and_usage_stats(client: AsyncClient):
    await login_as(client, "admin")
    monitoring = await client.get("/admin/system/monitoring")
    assert monitoring.status_code == 200 and monitoring.json()["windowHours"] == 24
    assert monitoring.json()["norms"] == {"sessionLimit": 20, "responseSec": 2}
    assert set(monitoring.json()["series"]) == {"cpuPercent", "memoryPercent", "networkMbit", "activeSessions", "responseSec"}
    stats = await client.get("/admin/system/usage-stats")
    assert stats.status_code == 200 and [p["id"] for p in stats.json()["periods"]] == ["week", "month"]
    week = await client.get("/admin/system/usage-stats", params={"period": "week"})
    assert [p["id"] for p in week.json()["periods"]] == ["week"] and set(week.json()["periods"][0]["cards"]) == {"labels", "created", "worked"}
    assert (await client.get("/admin/system/usage-stats", params={"period": "year"})).status_code == 400


async def test_audit_filters_and_pagination(client: AsyncClient):
    await login_as(client, "admin")
    first = await client.get("/admin/audit", params={"perPage": 5, "page": 1})
    assert first.status_code == 200 and set(first.json()) == {"items", "total", "page", "perPage"}
    assert first.json()["perPage"] == 5 and len(first.json()["items"]) == 5 and first.json()["total"] > 5
    second = await client.get("/admin/audit", params={"perPage": 5, "page": 2})
    assert not {e["id"] for e in first.json()["items"]} & {e["id"] for e in second.json()["items"]}
    ats = [e["at"] for e in first.json()["items"]]
    assert ats == sorted(ats, reverse=True)
    everything = (await client.get("/admin/audit", params={"perPage": 100})).json()["items"]
    assert any(e["id"].startswith("audit-") for e in everything)

    users_only = (await client.get("/admin/audit", params={"type": "users", "perPage": 100})).json()["items"]
    assert users_only and all(e["action"].startswith("user.") for e in users_only)
    by_operator = (await client.get("/admin/audit", params={"operator": "admin", "perPage": 100})).json()["items"]
    assert by_operator and all(e["userId"] == ADMIN_ID for e in by_operator)
    with_card = next((e for e in everything if e.get("cardId")), None)
    if with_card:
        by_card = (await client.get("/admin/audit", params={"card": with_card["cardId"]})).json()["items"]
        assert by_card and all(e["cardId"] == with_card["cardId"] for e in by_card)
    by_text = (await client.get("/admin/audit", params={"q": "Смена роли", "perPage": 100})).json()["items"]
    assert by_text and all(e["action"] == "user.roleChange" for e in by_text)
    day = everything[0]["at"][:10]
    in_range = (await client.get("/admin/audit", params={"from": day, "to": day, "perPage": 100})).json()["items"]
    assert in_range and all(e["at"].startswith(day) for e in in_range)
    assert (await client.get("/admin/audit", params={"type": "nope"})).status_code == 400
    assert (await client.get("/admin/audit", params={"from": "not-a-date"})).status_code == 400
    assert (await client.get("/admin/audit", params={"page": "x"})).status_code == 400
