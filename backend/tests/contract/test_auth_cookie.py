"""Контракт серверной cookie сессии (спека 002, T032): выдаёт сервер, HttpOnly, только JWT; JSON и Bearer — совместимость."""

from __future__ import annotations

from http.cookies import SimpleCookie

from httpx import AsyncClient

from tests.conftest import DEMO_USERS, cookie_value

CREDENTIALS = {"login": "ivanov", "password": "student112"}


def _set_cookie(response, name: str = "arm112_session"):
    values = [header for header in response.headers.get_list("set-cookie") if header.startswith(f"{name}=")]
    assert len(values) == 1, response.headers.get_list("set-cookie")
    parsed = SimpleCookie()
    parsed.load(values[0])
    return values[0], parsed[name]


async def test_login_sets_httponly_jwt_cookie(client: AsyncClient):
    response = await client.post("/auth/login", json=DEMO_USERS["student"])
    assert response.status_code == 200
    raw, morsel = _set_cookie(response)
    assert morsel.value == response.json()["token"]  # значение — только JWT, без JSON и данных пользователя
    assert morsel.value.count(".") == 2 and "{" not in morsel.value
    assert "HttpOnly" in raw and morsel["path"] == "/" and morsel["samesite"].lower() == "lax"
    assert morsel["max-age"] == str(24 * 3600)
    assert "Secure" not in raw  # по http Secure не ставится


async def test_login_cookie_is_secure_over_https(client: AsyncClient):
    response = await client.post("/auth/login", json=DEMO_USERS["student"], headers={"x-forwarded-proto": "https"})
    raw, _ = _set_cookie(response)
    assert "Secure" in raw and "HttpOnly" in raw


async def test_login_without_arm_number_passes_and_wrong_number_is_rejected(client: AsyncClient):
    assert (await client.post("/auth/login", json=CREDENTIALS)).status_code == 200
    assert (await client.post("/auth/login", json={**CREDENTIALS, "armNumber": ""})).status_code == 200
    assert (await client.post("/auth/login", json={**CREDENTIALS, "armNumber": 1})).status_code == 200
    wrong = await client.post("/auth/login", json={**CREDENTIALS, "armNumber": 99})
    assert wrong.status_code == 401 and wrong.json()["error"]["message"] == "Неверный логин или пароль"
    bad = await client.post("/auth/login", json={**CREDENTIALS, "armNumber": "abc"})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "validationFailed"


async def test_wrong_password_sets_no_cookie(client: AsyncClient):
    response = await client.post("/auth/login", json={**CREDENTIALS, "password": "nope"})
    assert response.status_code == 401 and not response.headers.get_list("set-cookie")


async def test_jwt_only_cookie_is_accepted(client: AsyncClient, app):
    from httpx import ASGITransport

    session = (await client.post("/auth/login", json=CREDENTIALS)).json()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock") as bare:
        bare.cookies.set("arm112_session", session["token"])
        response = await bare.get("/auth/session")
    assert response.status_code == 200 and response.json()["id"] == session["userId"]


async def test_legacy_json_cookie_and_bearer_still_work(client: AsyncClient, app):
    from httpx import ASGITransport

    session = (await client.post("/auth/login", json=CREDENTIALS)).json()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock") as legacy:
        legacy.cookies.set("arm112_session", cookie_value(session))
        assert (await legacy.get("/auth/session")).status_code == 200
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock") as bearer:
        response = await bearer.get("/auth/session", headers={"authorization": f"Bearer {session['token']}"})
        assert response.status_code == 200


async def test_forged_cookies_are_rejected(client: AsyncClient, app):
    from httpx import ASGITransport

    session = (await client.post("/auth/login", json=CREDENTIALS)).json()
    head, payload, _signature = session["token"].split(".")
    forged = [
        f"{head}.{payload}.{'A' * 43}",  # подпись подделана
        "not-a-token",
        '{"userId":"u-001","role":"admin","token":"x","twoFactorUsed":false,"issuedAt":"2026-01-01T00:00:00+03:00"}',
    ]
    for value in forged:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock") as bare:
            bare.cookies.set("arm112_session", value)
            assert (await bare.get("/auth/session")).status_code == 401, value


async def test_logout_clears_cookie_and_revokes_session(client: AsyncClient, app):
    from httpx import ASGITransport

    session = (await client.post("/auth/login", json=CREDENTIALS)).json()
    response = await client.post("/auth/logout")
    assert response.status_code == 204
    raw, morsel = _set_cookie(response)
    assert morsel.value == "" and morsel["max-age"] == "0" and "HttpOnly" in raw
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock") as old:
        old.cookies.set("arm112_session", session["token"])
        assert (await old.get("/auth/session")).status_code == 401  # старая cookie после выхода недействительна


async def test_logout_without_session_is_idempotent_and_clears_cookie(app):
    from httpx import ASGITransport

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock") as anonymous:
        response = await anonymous.post("/auth/logout")
    assert response.status_code == 204
    _, morsel = _set_cookie(response)
    assert morsel["max-age"] == "0"


# ─── T033: смена пароля и «выйти на всех устройствах» ─────────────────────────────────────────────


async def _fresh_login(app, login: str, password: str) -> AsyncClient:
    from httpx import ASGITransport

    http = AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock")
    response = await http.post("/auth/login", json={"login": login, "password": password})
    assert response.status_code == 200, response.text
    return http


async def _audit_actions(app) -> list[str]:
    admin = await _fresh_login(app, "admin", "admin112")
    try:
        response = await admin.get("/admin/audit", params={"perPage": 100})
        assert response.status_code == 200
        return [entry["action"] for entry in response.json()["items"]]
    finally:
        await admin.aclose()


async def test_password_change_revokes_other_sessions_keeps_current(app):
    # petrova: отдельная учётка, чтобы не задеть остальные тесты; пароль возвращается в конце
    first = await _fresh_login(app, "petrova", "student112")
    second = await _fresh_login(app, "petrova", "student112")
    try:
        changed = await first.post("/auth/password", json={"currentPassword": "student112", "newPassword": "Novyj-parol-77"})
        assert changed.status_code == 204
        assert (await first.get("/auth/session")).status_code == 200  # текущая сессия жива
        assert (await second.get("/auth/session")).status_code == 401  # другая — отозвана
        assert "auth.passwordChange" in await _audit_actions(app)
        old = await first.post("/auth/login", json={"login": "petrova", "password": "student112"})
        assert old.status_code == 401
        restored = await first.post("/auth/password", json={"currentPassword": "Novyj-parol-77", "newPassword": "student112"})
        assert restored.status_code == 204
    finally:
        await first.aclose()
        await second.aclose()


async def test_password_change_rejects_wrong_weak_and_same_password(app):
    http = await _fresh_login(app, "ivanov", "student112")
    try:
        wrong = await http.post("/auth/password", json={"currentPassword": "nope", "newPassword": "Novyj-parol-77"})
        assert wrong.status_code == 400 and wrong.json()["error"]["message"] == "Текущий пароль указан неверно"
        weak = await http.post("/auth/password", json={"currentPassword": "student112", "newPassword": "short"})
        assert weak.status_code == 400 and "не менее 8" in weak.json()["error"]["message"]
        same = await http.post("/auth/password", json={"currentPassword": "student112", "newPassword": "student112"})
        assert same.status_code == 400 and "отличаться" in same.json()["error"]["message"]
        missing = await http.post("/auth/password", json={"currentPassword": "student112"})
        assert missing.status_code == 400
        assert (await http.get("/auth/session")).status_code == 200  # ни один отказ не завершает сессию
    finally:
        await http.aclose()


async def test_password_change_requires_session(client: AsyncClient):
    response = await client.post("/auth/password", json={"currentPassword": "a", "newPassword": "b" * 9})
    assert response.status_code == 401


async def test_logout_all_revokes_every_session_and_clears_cookie(app):
    first = await _fresh_login(app, "morozova", "teacher112")
    second = await _fresh_login(app, "morozova", "teacher112")
    try:
        response = await first.post("/auth/logout-all")
        assert response.status_code == 204
        _, morsel = _set_cookie(response)
        assert morsel["max-age"] == "0"
        assert (await first.get("/auth/session")).status_code == 401
        assert (await second.get("/auth/session")).status_code == 401
        assert "auth.logoutAll" in await _audit_actions(app)
    finally:
        await first.aclose()
        await second.aclose()


async def test_logout_all_requires_session(client: AsyncClient):
    assert (await client.post("/auth/logout-all")).status_code == 401
