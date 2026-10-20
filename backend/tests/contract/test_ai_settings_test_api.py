"""Фича 006, T019: `POST /api/v1/admin/ai/settings/test` — одна проба, ничего не сохраняет (FR-006, SC-008).

Облако — `httpx.MockTransport` через `llm._cloud_transport`, локальная модель — подменённый `configured_client`.
Сеть не используется. Проверки на отсутствие ключа — `(KEY in text) is False`.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.api.v1 import ai_settings as ai_settings_api
from app.db.session import get_sessionmaker
from app.models.ai_settings import AiHealth
from app.models.audit import AuditLog
from app.services import ai_settings_service
from ml.generate import llm
from tests.conftest import login_as

ROUTE = "/admin/ai/settings/test"
SETTINGS = "/admin/ai/settings"
KEY = "pza-probe-key-0123456789-PRBE"
SAVED = "pza-saved-key-0123456789-SAVD"


class CloudSpy:
    def __init__(self, status: int = 200, body: Any = None) -> None:
        self.status = status
        self.body = body if body is not None else {"choices": [{"message": {"content": json.dumps({"ok": True})}}]}
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(self.status, json=self.body)


class FakeLocal:
    provider = "llamacpp:qwen-local"

    def __init__(self, *, healthy: bool = True, answer: Any = None, delay: float = 0.0) -> None:
        self._healthy = healthy
        self.answer = {"ok": True} if answer is None else answer
        self.delay = delay
        self.calls = 0

    def healthy(self) -> bool:
        return self._healthy

    def chat_json(self, system: str, user: str, schema: Any, **kwargs: Any) -> Any:
        self.calls += 1
        if self.delay:
            time.sleep(self.delay)
        return self.answer


@pytest_asyncio.fixture
async def v1(app, ai_env) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def _drop_external_audit_rows() -> AsyncIterator[None]:
    """Проба облака пишет `ai.external_call` в общую сессионную БД; убираем только строки проб, не чужие."""
    yield
    async with get_sessionmaker()() as db:
        await db.execute(
            delete(AuditLog).where(AuditLog.action == "ai.external_call", AuditLog.details.contains("проверка подключения"))
        )
        await db.commit()


def _cloud(monkeypatch, *, allowed: bool, spy: CloudSpy | None = None) -> CloudSpy:
    spy = spy or CloudSpy()
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", allowed)
    if allowed:
        monkeypatch.setattr(llm, "CLOUD_ROUTE_PARAMS", {"x_test_route": "подтверждено-в-тесте"})
    monkeypatch.setattr(llm, "_cloud_transport", httpx.MockTransport(spy))
    return spy


async def _audit() -> list[AuditLog]:
    async with get_sessionmaker()() as db:
        rows = await db.execute(select(AuditLog).where(AuditLog.action == "ai.connection_test").order_by(AuditLog.id))
        return list(rows.scalars().all())


async def _health_row() -> AiHealth | None:
    async with get_sessionmaker()() as db:
        return await db.get(AiHealth, 1)


@pytest.mark.asyncio
async def test_cloud_probe_blocked_by_stopper_sends_nothing(v1, monkeypatch):
    spy = _cloud(monkeypatch, allowed=False)
    await login_as(v1, "admin")
    response = await v1.post(ROUTE, json={"source": "cloud", "apiKey": KEY})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["ok"] is False and body["reason"] == "wrong_route" and body["route"] is None
    assert isinstance(body["latencyMs"], int)
    assert spy.requests == []
    assert (KEY in response.text) is False


@pytest.mark.asyncio
async def test_cloud_probe_ok_with_route(v1, monkeypatch):
    spy = _cloud(monkeypatch, allowed=True)
    await login_as(v1, "admin")
    response = await v1.post(ROUTE, json={"source": "cloud", "apiKey": KEY})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is True and body["route"] == "cerebras/fp16"
    assert isinstance(body["latencyMs"], int) and body["latencyMs"] >= 0
    assert "reason" not in body or body["reason"] is None
    assert len(spy.requests) == 1  # квота пробы — один запрос
    request = spy.requests[0]
    sent = json.loads(request.content)
    assert sent["model"] == llm.CLOUD_MODEL and sent["x_test_route"] == "подтверждено-в-тесте"
    assert (request.headers["authorization"] == f"Bearer {KEY}") is True
    assert all(value <= 15 for value in request.extensions["timeout"].values() if value is not None)
    assert (KEY in response.text) is False


@pytest.mark.asyncio
@pytest.mark.parametrize(("status", "reason"), [(401, "invalid_key"), (402, "insufficient_funds"), (429, "rate_limited")])
async def test_cloud_probe_failures_have_reason(v1, monkeypatch, status, reason):
    spy = _cloud(monkeypatch, allowed=True, spy=CloudSpy(status=status, body={"error": "x"}))
    await login_as(v1, "admin")
    response = await v1.post(ROUTE, json={"source": "cloud", "apiKey": KEY})
    assert response.status_code == 200
    body = response.json()
    assert body == {"ok": False, "latencyMs": body["latencyMs"], "route": None, "reason": reason}
    assert len(spy.requests) == 1
    entry = (await _audit())[-1].details
    assert "source=cloud" in entry and "ok=false" in entry and f"reason={reason}" in entry
    assert (KEY in entry) is False


@pytest.mark.asyncio
async def test_cloud_probe_wrong_route(v1, monkeypatch):
    _cloud(monkeypatch, allowed=True)
    monkeypatch.setattr(llm, "check_cloud_route", lambda body: False)
    await login_as(v1, "admin")
    body = (await v1.post(ROUTE, json={"source": "cloud", "apiKey": KEY})).json()
    assert body["ok"] is False and body["reason"] == "wrong_route" and body["route"] is None


@pytest.mark.asyncio
async def test_cloud_probe_uses_saved_key_and_changes_nothing(v1, monkeypatch):
    spy = _cloud(monkeypatch, allowed=True)
    await login_as(v1, "admin")
    assert (await v1.put(SETTINGS, json={"source": "local", "apiKey": SAVED})).status_code == 200
    before = (await v1.get(SETTINGS)).json()
    async with get_sessionmaker()() as db:
        db.add(AiHealth(id=1, active_source="cloud", calls_today=3, day=dt.datetime.now().astimezone().date()))
        await db.commit()
    response = await v1.post(ROUTE, json={"source": "cloud"})
    assert response.status_code == 200 and response.json()["ok"] is True
    assert (spy.requests[0].headers["authorization"] == f"Bearer {SAVED}") is True
    assert (await v1.get(SETTINGS)).json() == before  # настройки не меняются
    health = await _health_row()
    assert health is not None and health.calls_today == 3 and health.probe_calls_today == 1
    status = await v1.get("/ai/health")
    assert status.status_code == 200 and status.json()["callsToday"] == 4


@pytest.mark.asyncio
async def test_cloud_probe_respects_persisted_daily_limit(v1, ai_env, monkeypatch):
    spy = _cloud(monkeypatch, allowed=True)
    ai_env.configure(polza_daily_limit=1)
    await login_as(v1, "admin")
    async with get_sessionmaker()() as db:
        db.add(AiHealth(id=1, active_source="cloud", calls_today=1, day=dt.datetime.now().astimezone().date()))
        await db.commit()

    response = await v1.post(ROUTE, json={"source": "cloud", "apiKey": KEY})

    assert response.status_code == 200 and response.json()["reason"] == "daily_limit"
    assert spy.requests == []
    health = await _health_row()
    assert health is not None and health.calls_today == 1 and health.probe_calls_today == 0


@pytest.mark.asyncio
async def test_cloud_probe_without_any_key_is_400(v1, monkeypatch):
    spy = _cloud(monkeypatch, allowed=True)
    await login_as(v1, "admin")
    refused = await v1.post(ROUTE, json={"source": "cloud"})
    assert refused.status_code == 400 and refused.json()["error"]["code"] == "validationFailed"
    assert spy.requests == []
    assert (await v1.post(ROUTE, json={"source": "cloud", "apiKey": KEY})).status_code == 200  # парный


@pytest.mark.asyncio
async def test_local_probe_makes_no_external_requests(v1, monkeypatch):
    spy = _cloud(monkeypatch, allowed=True)
    local = FakeLocal()
    monkeypatch.setattr(llm, "configured_client", lambda: local)
    await login_as(v1, "admin")
    response = await v1.post(ROUTE, json={"source": "local", "apiKey": KEY})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True and body["route"] is None
    assert local.calls == 1 and spy.requests == []
    entry = (await _audit())[-1].details
    assert "source=local" in entry and "ok=true" in entry


@pytest.mark.asyncio
async def test_local_probe_reports_local_down(v1, monkeypatch):
    _cloud(monkeypatch, allowed=False)
    await login_as(v1, "admin")
    body = (await v1.post(ROUTE, json={"source": "local"})).json()  # локальная модель не настроена
    assert body["ok"] is False and body["reason"] == "local_down"
    monkeypatch.setattr(llm, "configured_client", lambda: FakeLocal(healthy=False))
    assert (await v1.post(ROUTE, json={"source": "local"})).json()["reason"] == "local_down"
    monkeypatch.setattr(llm, "configured_client", lambda: FakeLocal(answer={}))
    monkeypatch.setattr(FakeLocal, "chat_json", lambda self, *a, **k: None)
    assert (await v1.post(ROUTE, json={"source": "local"})).json()["reason"] == "bad_response"


@pytest.mark.asyncio
async def test_probe_fits_timeout(v1, monkeypatch):
    """SC-008: проба укладывается в таймаут (в тесте он уменьшен до 0.2 с), медленная модель → `timeout`."""
    _cloud(monkeypatch, allowed=False)
    assert ai_settings_api.PROBE_TIMEOUT_SEC <= 15
    monkeypatch.setattr(ai_settings_api, "PROBE_TIMEOUT_SEC", 0.2)
    monkeypatch.setattr(llm, "configured_client", lambda: FakeLocal(delay=1.5))
    await login_as(v1, "admin")
    started = time.perf_counter()
    body = (await v1.post(ROUTE, json={"source": "local"})).json()
    assert time.perf_counter() - started < 1.2
    assert body["ok"] is False and body["reason"] == "timeout"


@pytest.mark.asyncio
async def test_slow_quota_reservation_times_out_without_sending_probe(v1, monkeypatch):
    spy = _cloud(monkeypatch, allowed=True)
    entered_reservation = asyncio.Event()

    async def slow_reserve(*_args, **_kwargs):
        entered_reservation.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(ai_settings_api.ai_health_service, "reserve_cloud_call", slow_reserve)
    monkeypatch.setattr(ai_settings_api, "PROBE_TIMEOUT_SEC", 0.1)
    await login_as(v1, "admin")

    response = await v1.post(ROUTE, json={"source": "cloud", "apiKey": KEY})

    assert response.status_code == 200 and response.json()["reason"] == "timeout"
    assert entered_reservation.is_set() and spy.requests == []


@pytest.mark.asyncio
async def test_probe_roles_and_validation(v1, monkeypatch):
    _cloud(monkeypatch, allowed=False)
    assert (await v1.post(ROUTE, json={"source": "local"})).status_code == 401
    for role in ("student", "teacher"):
        await login_as(v1, role)
        assert (await v1.post(ROUTE, json={"source": "local"})).status_code == 403
    await login_as(v1, "admin")
    assert (await v1.post(ROUTE, json={"source": "gpt"})).status_code == 400
    assert (await v1.post(ROUTE, json={"source": "cloud", "apiKey": 5})).status_code == 400
    assert (await v1.post(ROUTE, json={"source": "local"})).status_code == 200  # парный


@pytest.mark.asyncio
async def test_probe_never_leaks_key(v1, monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)
    _cloud(monkeypatch, allowed=True, spy=CloudSpy(status=401, body={"error": KEY}))
    await login_as(v1, "admin")
    response = await v1.post(ROUTE, json={"source": "cloud", "apiKey": KEY})
    assert (KEY in response.text) is False
    async with get_sessionmaker()() as db:
        details = "\n".join(row or "" for row in (await db.execute(select(AuditLog.details))).scalars().all())
    assert (KEY in details) is False
    assert (KEY in caplog.text) is False


async def _external_audit() -> list[AuditLog]:
    async with get_sessionmaker()() as db:
        rows = await db.execute(select(AuditLog).where(AuditLog.action == "ai.external_call").order_by(AuditLog.id))
        return list(rows.scalars().all())


async def _seed_health(**fields: Any) -> None:
    async with get_sessionmaker()() as db:
        db.add(AiHealth(id=1, day=dt.datetime.now().astimezone().date(), **fields))
        await db.commit()


@pytest.mark.asyncio
async def test_cloud_probe_ok_turns_health_ok(v1, monkeypatch):
    """Фича 006, T041: успешная проба облака — исход в `ai_health`: state ok, servedBy=cloud, lastOkAt заполнен.

    История прежнего сбоя не стирается; квота пробы учитывается один раз; ключ не попадает в ответы и аудит.
    """
    spy = _cloud(monkeypatch, allowed=True)
    await login_as(v1, "admin")
    assert (await v1.put(SETTINGS, json={"source": "cloud", "apiKey": SAVED})).status_code == 200
    await _seed_health(
        active_source="cloud",
        served_by_last="template",
        last_error_at=dt.datetime(2026, 10, 20, 10, 0, tzinfo=dt.UTC),
        last_error_reason="network",
        errors_today=1,
        calls_today=0,
        probe_calls_today=0,
    )
    before = (await v1.get("/ai/health")).json()
    assert before["state"] == "down" and before["lastOkAt"] is None  # красная база: до пробы — только шаблоны

    response = await v1.post(ROUTE, json={"source": "cloud"})

    assert response.status_code == 200 and response.json()["ok"] is True
    assert len(spy.requests) == 1
    after = (await v1.get("/ai/health")).json()
    assert after["state"] == "ok" and after["servedBy"] == "cloud" and after["activeSource"] == "cloud"
    assert isinstance(after["lastOkAt"], str)
    assert after["reason"] == "network"  # последняя причина сбоя не стирается полностью
    assert after["callsToday"] == 1 and after["errorsToday"] == 1  # проба одна: квота учтена однократно
    assert (SAVED in json.dumps(after)) is False and (SAVED in json.dumps(before)) is False
    audit = (await _external_audit())[-1].details
    assert "проверка подключения" in audit and "результат ok" in audit and (SAVED in audit) is False


@pytest.mark.asyncio
@pytest.mark.parametrize(("status", "reason"), [(401, "invalid_key"), (402, "insufficient_funds"), (429, "rate_limited")])
async def test_cloud_probe_failure_records_reason_in_health(v1, monkeypatch, status, reason):
    spy = _cloud(monkeypatch, allowed=True, spy=CloudSpy(status=status, body={"error": "x"}))
    await login_as(v1, "admin")
    assert (await v1.put(SETTINGS, json={"source": "cloud", "apiKey": SAVED})).status_code == 200
    await _seed_health(active_source="cloud", served_by_last="cloud", last_ok_at=dt.datetime(2026, 10, 20, 9, 0, tzinfo=dt.UTC))

    response = await v1.post(ROUTE, json={"source": "cloud"})

    assert response.status_code == 200 and response.json()["reason"] == reason
    assert len(spy.requests) == 1
    health = (await v1.get("/ai/health")).json()
    assert health["reason"] == reason and isinstance(health["lastErrorAt"], str)
    assert health["state"] == "down"  # облако не ответило; запасной путь пробой не проверяется
    assert health["errorsToday"] == 1 and health["callsToday"] == 1  # ошибка одна, квота пробы учтена однократно
    assert (KEY in json.dumps(health)) is False and (SAVED in json.dumps(health)) is False
    async with get_sessionmaker()() as db:
        assert (await db.get(AiHealth, 1)).last_ok_at is not None  # прежний успех не затирается
    assert (await v1.post(ROUTE, json={"source": "cloud"})).json()["reason"] == reason  # парный: повтор снова идёт в облако


@pytest.mark.asyncio
async def test_cloud_probe_refused_by_daily_limit_is_recorded_once(v1, ai_env, monkeypatch):
    """Отказ по суточному лимиту до отправки: причина `daily_limit` в `ai_health`, квота не списывается второй раз."""
    spy = _cloud(monkeypatch, allowed=True)
    ai_env.configure(polza_daily_limit=1)
    await login_as(v1, "admin")
    assert (await v1.put(SETTINGS, json={"source": "cloud", "apiKey": SAVED})).status_code == 200
    await _seed_health(active_source="cloud", served_by_last="cloud", calls_today=1, probe_calls_today=0, errors_today=0)

    response = await v1.post(ROUTE, json={"source": "cloud"})

    assert response.status_code == 200 and response.json()["reason"] == "daily_limit"
    assert spy.requests == []
    health = (await v1.get("/ai/health")).json()
    assert health["reason"] == "daily_limit" and health["state"] == "down"
    assert health["errorsToday"] == 1 and health["callsToday"] == 1  # обычный вызов один, проба не списана


@pytest.mark.asyncio
@pytest.mark.parametrize(("status", "reason"), [(200, None), (401, "invalid_key")])
async def test_cloud_probe_with_typed_key_changes_no_health(v1, monkeypatch, status, reason):
    """quickstart шаг 2: проба введённым, несохранённым ключом ничего не меняет; квота пробы учтена однократно."""
    spy = _cloud(monkeypatch, allowed=True, spy=CloudSpy(status=status, body=None if status == 200 else {"error": "x"}))
    await login_as(v1, "admin")
    assert (await v1.put(SETTINGS, json={"source": "cloud", "apiKey": SAVED})).status_code == 200
    await _seed_health(
        active_source="cloud",
        served_by_last="cloud",
        last_ok_at=dt.datetime(2026, 10, 20, 9, 0, tzinfo=dt.UTC),
        calls_today=0,
        probe_calls_today=0,
        errors_today=0,
    )
    before = (await v1.get("/ai/health")).json()

    response = await v1.post(ROUTE, json={"source": "cloud", "apiKey": KEY})

    assert response.status_code == 200 and response.json()["ok"] is (reason is None)
    assert len(spy.requests) == 1
    after = (await v1.get("/ai/health")).json()
    assert after["state"] == "ok" and after["servedBy"] == "cloud"
    assert after["lastOkAt"] == before["lastOkAt"] and after["lastErrorAt"] is None and after["reason"] is None
    assert after["errorsToday"] == 0 and after["callsToday"] == 1
    assert (KEY in json.dumps(after)) is False


@pytest.mark.asyncio
async def test_saved_key_probe_never_leaks_key_into_health_or_audit(v1, monkeypatch, caplog):
    """Облако выбрано, ключ сохранён, ошибка облака возвращает сам ключ в теле: ни ответ, ни `ai_health`, ни аудит,
    ни лог его не содержат."""
    caplog.set_level(logging.DEBUG)
    _cloud(monkeypatch, allowed=True, spy=CloudSpy(status=401, body={"error": SAVED}))
    await login_as(v1, "admin")
    assert (await v1.put(SETTINGS, json={"source": "cloud", "apiKey": SAVED})).status_code == 200

    response = await v1.post(ROUTE, json={"source": "cloud"})

    assert response.status_code == 200 and response.json()["reason"] == "invalid_key"
    health = await v1.get("/ai/health")
    assert (SAVED in response.text) is False and (SAVED in health.text) is False
    assert len(await _external_audit()) >= 1 and "проверка подключения" in (await _external_audit())[-1].details
    async with get_sessionmaker()() as db:
        details = "\n".join(row or "" for row in (await db.execute(select(AuditLog.details))).scalars().all())
    assert (SAVED in details) is False
    assert (SAVED in caplog.text) is False


@pytest.mark.asyncio
async def test_cloud_probe_while_local_active_leaves_health_alone(v1, monkeypatch):
    """Проба облака до сохранения (выбран локальный источник) не описывает состояние выбранного источника."""
    _cloud(monkeypatch, allowed=True)
    await login_as(v1, "admin")
    assert (await v1.put(SETTINGS, json={"source": "local"})).status_code == 200
    await _seed_health(active_source="local", served_by_last="local", last_ok_at=dt.datetime(2026, 10, 20, 9, 0, tzinfo=dt.UTC))
    before = (await v1.get("/ai/health")).json()

    response = await v1.post(ROUTE, json={"source": "cloud", "apiKey": KEY})

    assert response.status_code == 200 and response.json()["ok"] is True
    after = (await v1.get("/ai/health")).json()
    assert after["state"] == "ok" and after["servedBy"] == "local"
    assert after["lastOkAt"] == before["lastOkAt"] and after["lastErrorAt"] == before["lastErrorAt"]
