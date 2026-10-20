"""Фича 006, T013: `GET/PUT /api/v1/admin/ai/settings` (contracts/ai-endpoints.md).

Окружение ИИ герметичное (`ai_env`): `backend/.env` не влияет, сеть не используется. Стопор облака
(`CLOUD_ROUTE_VERIFIED`) задаётся в каждом тесте явно. Проверки на отсутствие ключа пишутся как
`(KEY in text) is False`, чтобы при падении ключ не печатался.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.ai_settings import AiSettings
from app.models.audit import AuditLog
from app.services import ai_settings_service
from ml.generate import llm
from tests.conftest import login_as

ROUTE = "/admin/ai/settings"
KEY = "pza-settings-key-0123456789-ABCD"
KEY2 = "pza-settings-key-9876543210-WXYZ"


@pytest_asyncio.fixture
async def v1(app, ai_env) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


def _cloud(monkeypatch, *, allowed: bool) -> None:
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", allowed)
    if allowed:
        monkeypatch.setattr(llm, "CLOUD_ROUTE_PARAMS", {"x_test_route": "подтверждено-в-тесте"})


async def _audit(action: str) -> list[AuditLog]:
    async with get_sessionmaker()() as db:
        rows = await db.execute(select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id))
        return list(rows.scalars().all())


async def _all_audit_text() -> str:
    async with get_sessionmaker()() as db:
        rows = (await db.execute(select(AuditLog.details))).scalars().all()
        return "\n".join(row or "" for row in rows)


@pytest.mark.asyncio
async def test_admin_reads_env_default_without_key(v1, monkeypatch):
    _cloud(monkeypatch, allowed=False)
    await login_as(v1, "admin")
    response = await v1.get(ROUTE)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["source"] == "local"
    assert body["fromEnv"] is True
    assert body["cloud"] == {
        "model": "qwen/qwen3.8-27b",
        "route": "cerebras/fp16",
        "keyConfigured": False,
        "keyLast4": None,
        "available": False,
    }
    assert isinstance(body["cloudFunctions"], list) and body["cloudFunctions"]
    assert all(isinstance(item, str) and item for item in body["cloudFunctions"])
    assert body["updatedAt"] is None and body["updatedBy"] is None


@pytest.mark.asyncio
async def test_cloud_available_follows_stopper(v1, monkeypatch):
    _cloud(monkeypatch, allowed=True)
    await login_as(v1, "admin")
    assert (await v1.get(ROUTE)).json()["cloud"]["available"] is True


@pytest.mark.asyncio
async def test_roles_and_anonymous(v1, monkeypatch):
    _cloud(monkeypatch, allowed=False)
    assert (await v1.get(ROUTE)).status_code == 401
    assert (await v1.put(ROUTE, json={"source": "local"})).status_code == 401
    for role in ("student", "teacher"):
        await login_as(v1, role)
        assert (await v1.get(ROUTE)).status_code == 403
        assert (await v1.put(ROUTE, json={"source": "local", "apiKey": KEY})).status_code == 403
    await login_as(v1, "admin")
    assert (await v1.get(ROUTE)).status_code == 200
    assert (await v1.put(ROUTE, json={"source": "local"})).status_code == 200
    async with get_sessionmaker()() as db:  # отказ ролям ничего не сохранил: ключа нет
        row = await db.get(AiSettings, 1)
        assert row is not None and row.cloud_key_cipher is None


@pytest.mark.asyncio
async def test_put_local_with_key_masks_key_and_audits(v1, monkeypatch, caplog):
    _cloud(monkeypatch, allowed=False)
    caplog.set_level(logging.DEBUG)
    await login_as(v1, "admin")
    audited_before = len(await _audit("ai.settings.change"))  # журнал общий на сессию тестов
    response = await v1.put(ROUTE, json={"source": "local", "apiKey": f"  {KEY}  "})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["source"] == "local" and body["fromEnv"] is False
    assert body["cloud"]["keyConfigured"] is True and body["cloud"]["keyLast4"] == "ABCD"
    assert body["updatedBy"] == "u-001"
    assert body["updatedAt"].endswith("+03:00")
    assert (KEY in response.text) is False

    again = await v1.get(ROUTE)
    assert again.json()["cloud"]["keyLast4"] == "ABCD" and (KEY in again.text) is False

    async with get_sessionmaker()() as db:
        row = await db.get(AiSettings, 1)
        assert row is not None and row.cloud_key_cipher and (KEY in row.cloud_key_cipher) is False

    entries = await _audit("ai.settings.change")
    assert len(entries) == audited_before + 1
    details = entries[-1].details
    assert "from=local" in details and "to=local" in details and "keyChanged=true" in details
    assert (KEY in await _all_audit_text()) is False
    assert (KEY in caplog.text) is False


@pytest.mark.asyncio
async def test_cloud_blocked_by_stopper_is_400_with_message(v1, monkeypatch):
    _cloud(monkeypatch, allowed=False)
    await login_as(v1, "admin")
    response = await v1.put(ROUTE, json={"source": "cloud", "apiKey": KEY})
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "validationFailed" and "Облачная модель" in error["message"]
    assert (KEY in response.text) is False
    assert (await v1.get(ROUTE)).json()["source"] == "local"  # парный: ничего не сохранено, чтение работает


@pytest.mark.asyncio
async def test_cloud_without_key_is_400_and_with_key_is_200(v1, monkeypatch):
    _cloud(monkeypatch, allowed=True)
    await login_as(v1, "admin")
    refused = await v1.put(ROUTE, json={"source": "cloud"})
    assert refused.status_code == 400 and refused.json()["error"]["code"] == "validationFailed"
    accepted = await v1.put(ROUTE, json={"source": "cloud", "apiKey": KEY})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["source"] == "cloud" and accepted.json()["cloud"]["keyConfigured"] is True
    # Ключ уже сохранён: повторный выбор облака без ключа допустим, ключ не меняется.
    kept = await v1.put(ROUTE, json={"source": "cloud"})
    assert kept.status_code == 200 and kept.json()["cloud"]["keyLast4"] == "ABCD"
    entries = await _audit("ai.settings.change")
    assert "from=local" in entries[-2].details and "to=cloud" in entries[-2].details
    assert "keyChanged=false" in entries[-1].details


@pytest.mark.asyncio
async def test_clear_key_on_cloud_switches_to_local(v1, monkeypatch):
    _cloud(monkeypatch, allowed=True)
    await login_as(v1, "admin")
    assert (await v1.put(ROUTE, json={"source": "cloud", "apiKey": KEY})).status_code == 200
    response = await v1.put(ROUTE, json={"source": "cloud", "clearKey": True})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "local"
    assert body["cloud"]["keyConfigured"] is False and body["cloud"]["keyLast4"] is None
    entry = (await _audit("ai.settings.change"))[-1].details
    assert "from=cloud" in entry and "to=local" in entry and "keyChanged=true" in entry


@pytest.mark.asyncio
async def test_replace_key(v1, monkeypatch):
    _cloud(monkeypatch, allowed=False)
    await login_as(v1, "admin")
    await v1.put(ROUTE, json={"source": "local", "apiKey": KEY})
    response = await v1.put(ROUTE, json={"source": "local", "apiKey": KEY2})
    assert response.json()["cloud"]["keyLast4"] == "WXYZ"
    assert (KEY in response.text) is False and (KEY2 in response.text) is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        {"source": "gpt"},
        {},
        {"source": "local", "apiKey": 12345},
        {"source": "local", "clearKey": "yes"},
        {"source": "local", "apiKey": KEY, "clearKey": True},
        {"source": "local", "apiKey": "x" * 600},
    ],
)
async def test_invalid_body_is_400_without_key(v1, monkeypatch, body):
    _cloud(monkeypatch, allowed=False)
    await login_as(v1, "admin")
    response = await v1.put(ROUTE, json=body)
    assert response.status_code == 400, response.text
    assert (KEY in response.text) is False


@pytest.mark.asyncio
async def test_settings_and_key_survive_app_recreation(v1, monkeypatch):
    """SC-002: сохранённое переживает пересоздание приложения (новый процесс = новый кэш, та же БД)."""
    _cloud(monkeypatch, allowed=False)
    await login_as(v1, "admin")
    assert (await v1.put(ROUTE, json={"source": "local", "apiKey": KEY})).status_code == 200

    from app.main import create_app

    ai_settings_service.invalidate_cache()
    llm.reset_external_client()
    fresh = create_app()
    async with AsyncClient(transport=ASGITransport(app=fresh), base_url="http://test/api/v1") as other:
        await login_as(other, "admin")
        body = (await other.get(ROUTE)).json()
    assert body["source"] == "local" and body["fromEnv"] is False
    assert body["cloud"]["keyConfigured"] is True and body["cloud"]["keyLast4"] == "ABCD"
