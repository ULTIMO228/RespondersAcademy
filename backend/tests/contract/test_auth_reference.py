"""Контракт: auth, policy, reference, classifier, users (строки 1–4, 38 compat-endpoints.md)."""

from __future__ import annotations

from urllib.parse import unquote

from tests.conftest import DEMO_USERS, login_as


async def test_seed_summary(seeded_db):
    assert seeded_db["users"] == 24
    assert seeded_db["classifier"] == 1283
    assert seeded_db["incidentCards"] == 96
    assert seeded_db["armCardFixtures"] == 12
    assert seeded_db["scenarios"] == 36
    assert seeded_db["sessions"] == 2


async def test_login_ok_and_shape(client):
    response = await client.post("/auth/login", json=DEMO_USERS["student"])
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"userId", "role", "token", "twoFactorUsed", "issuedAt"}
    assert body["role"] == "student" and body["twoFactorUsed"] is False
    assert body["issuedAt"].endswith("+03:00")


async def test_login_errors(client):
    wrong = await client.post("/auth/login", json={**DEMO_USERS["student"], "password": "nope"})
    assert wrong.status_code == 401 and wrong.json()["error"]["code"] == "unauthorized"
    wrong_arm = await client.post("/auth/login", json={**DEMO_USERS["student"], "armNumber": 99})
    assert wrong_arm.status_code == 401
    blocked = await client.post("/auth/login", json=DEMO_USERS["blocked"])
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "accountBlocked"
    missing = await client.post("/auth/login", json={"login": "ivanov"})
    assert missing.status_code == 400 and missing.json()["error"]["code"] == "validationFailed"
    bad_json = await client.post("/auth/login", content=b"{", headers={"content-type": "application/json"})
    assert bad_json.status_code == 400 and bad_json.json()["error"]["code"] == "badRequest"
    bad_code = await client.post("/auth/login", json={**DEMO_USERS["student"], "twoFactorCode": "12"})
    assert bad_code.status_code == 400


async def test_auth_policy(client):
    response = await client.get("/auth/policy")
    assert response.status_code == 200
    assert set(response.json()) == {"twoFactorRequired", "minPasswordLength", "lockAfterAttempts"}


async def test_reference_keys(client):
    response = await client.get("/reference")
    assert response.status_code == 200
    body = response.json()
    for key in ("ddsStatuses", "serviceStatuses", "callerStatuses", "channels", "services", "incidentGroups", "cardStatuses", "districts", "sources", "internalNumbers", "classifierRows"):
        assert key in body
    assert len(body["ddsStatuses"]) == 7
    assert len(body["incidentGroups"]) == 105


async def test_classifier(client):
    all_rows = await client.get("/classifier")
    assert all_rows.status_code == 200 and len(all_rows.json()) == 1283
    assert "x-classifier-version" in all_rows.headers
    assert unquote(all_rows.headers["x-classifier-version"]).startswith("v")
    group = await client.get("/classifier", params={"group": "пожар на улице"})
    rows = group.json()
    assert rows and all(row["group"] == "пожар на улице" for row in rows)
    assert {"code", "group", "sign1", "finalType", "mainService", "notifications"} <= set(rows[0])
    by_code = await client.get("/classifier", params={"code": rows[0]["code"]})
    assert by_code.json() == rows
    unknown = await client.get("/classifier", params={"group": "нет такой группы"})
    assert unknown.status_code == 200 and unknown.json() == []


async def test_users_roles(client):
    anonymous = await client.get("/users", params={"role": "student"})
    assert anonymous.status_code == 200
    assert all("password" not in user for user in anonymous.json())
    bad_role = await client.get("/users", params={"role": "boss"})
    assert bad_role.status_code == 400
    await login_as(client, "student")
    forbidden = await client.get("/users")
    assert forbidden.status_code == 403 and forbidden.json()["error"]["code"] == "forbidden"
    client.cookies.clear()
    await login_as(client, "teacher")
    ok = await client.get("/users", params={"group": "ДДС-01"})
    assert ok.status_code == 200 and ok.json() and all(u["group"] == "ДДС-01" for u in ok.json())
    client.cookies.clear()
