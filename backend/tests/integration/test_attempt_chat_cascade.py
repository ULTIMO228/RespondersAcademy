"""Фича 020, T021/T022/T024: каскад источников ответа чата и лимит запросов (`POST /api/v1/ai/chat`).

Попытка `att-01` принадлежит `u-005`. Сеть облака — `httpx.MockTransport`, локальная модель — заглушка клиента.
Облачная ветка чата включается флагом `CHAT_CLOUD_ENABLED` (по умолчанию включена, решение владельца 2026-10-20; выключатель — T020), поэтому проверяются оба значения.
"""

from __future__ import annotations

import json
import time

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.audit import AuditLog
from app.models.session import Attempt
from app.services import ai_settings_service, attempt_chat
from app.services.ai_settings_service import EffectiveAiSettings
from ml.generate import llm
from tests.conftest import login_as

ATTEMPT = "att-01"
KEY = "pza-chat-test-key-123456-SECRET"
CLOUD_TEXT = "Балл снижен из-за превышения норматива реакции, при следующей попытке сначала примите вызов."
LOCAL_TEXT = "Локальный разбор: проверьте порядок статусов реагирования и сверьтесь с памяткой по регламенту."


class Local:
    provider = "llamacpp:chat-test"

    def __init__(self, answer=None, delay: float = 0.0, up: bool = True) -> None:
        self.answer = {"text": LOCAL_TEXT} if answer is None else answer
        self.delay = delay
        self.up = up
        self.calls = 0

    def healthy(self) -> bool:
        return self.up

    def chat_json(self, *_args, **_kwargs):
        self.calls += 1
        if self.delay:
            time.sleep(self.delay)
        return self.answer


@pytest_asyncio.fixture
async def v1(app, ai_env):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest.fixture
def cloud(ai_env, monkeypatch):
    """Источник `cloud` выбран, стопор маршрута открыт; `state['status']`/`state['text']` управляют ответом облака."""
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", True)
    monkeypatch.setattr(llm, "CLOUD_ROUTE_PARAMS", {"provider": {"only": [llm.CLOUD_ROUTE], "allow_fallbacks": False}})
    ai = EffectiveAiSettings(source="cloud", origin="db", key_set=True, key_last4="CRET", _env_key=SecretStr(KEY))

    async def effective(_db):
        return ai

    monkeypatch.setattr(ai_settings_service, "effective", effective)
    state = {"status": 200, "text": CLOUD_TEXT, "requests": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        state["requests"] += 1
        if state["status"] == 200:
            return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"text": state["text"]})}}]})
        return httpx.Response(state["status"], json={"error": {"message": "x"}})

    monkeypatch.setattr(llm, "_cloud_transport", httpx.MockTransport(handler))
    llm.reset_external_client()
    return state


async def _mode() -> str:
    async with get_sessionmaker()() as db:
        attempt = await db.get(Attempt, ATTEMPT)
        assert attempt is not None
        return attempt.mode


async def _ask(v1: AsyncClient, message: str = "Почему снижен балл?") -> httpx.Response:
    await login_as(v1, "student")
    return await v1.post("/ai/chat", json={"attemptId": ATTEMPT, "mode": await _mode(), "message": message, "history": []})


async def _external_audit() -> list[AuditLog]:
    async with get_sessionmaker()() as db:
        return list((await db.execute(select(AuditLog).where(AuditLog.action == "ai.external_call"))).scalars().all())


async def test_local_source_answers_with_local_model(v1, ai_env, monkeypatch):
    local = Local()
    monkeypatch.setattr(llm, "configured_client", lambda: local)
    body = (await _ask(v1)).json()
    assert body == {"reply": LOCAL_TEXT, "source": "local", "provider": "llamacpp:chat-test", "modelName": "chat-test"}


async def test_cloud_source_with_flag_answers_from_cloud_and_is_audited(v1, ai_env, cloud, monkeypatch):
    ai_env.configure(chat_cloud_enabled=True)
    monkeypatch.setattr(llm, "configured_client", lambda: Local())
    before = len(await _external_audit())
    body = (await _ask(v1)).json()
    assert body["source"] == "cloud" and body["reply"] == CLOUD_TEXT
    assert body["provider"] == llm.CLOUD_PROVIDER and body["modelName"] == llm.CLOUD_MODEL
    entries = (await _external_audit())[before:]
    assert len(entries) == 1
    assert "ответ чата разбора попытки" in entries[0].details
    assert KEY not in entries[0].details and "Почему снижен балл" not in entries[0].details


@pytest.mark.parametrize("status", [401, 429, 503])
async def test_cloud_failure_falls_back_to_local(v1, ai_env, cloud, monkeypatch, status):
    ai_env.configure(chat_cloud_enabled=True)
    cloud["status"] = status
    monkeypatch.setattr(llm, "configured_client", lambda: Local())
    body = (await _ask(v1)).json()
    assert body["source"] == "local" and body["reply"] == LOCAL_TEXT
    assert cloud["requests"] == 1


async def test_cloud_daily_limit_falls_back_to_local(v1, ai_env, cloud, monkeypatch):
    ai_env.configure(chat_cloud_enabled=True, polza_daily_limit=1)
    monkeypatch.setattr(llm, "configured_client", lambda: Local())
    assert (await _ask(v1)).json()["source"] == "cloud"
    assert (await _ask(v1)).json()["source"] == "local"
    assert cloud["requests"] == 1


async def test_flag_off_never_calls_cloud_even_when_cloud_selected(v1, ai_env, cloud, monkeypatch):
    assert ai_env.settings.chat_cloud_enabled is True  # значение по умолчанию — выключатель вручную
    ai_env.configure(chat_cloud_enabled=False)
    monkeypatch.setattr(llm, "configured_client", lambda: Local())
    before = len(await _external_audit())
    body = (await _ask(v1)).json()
    assert body["source"] == "local" and body["reply"] == LOCAL_TEXT
    assert cloud["requests"] == 0
    assert len(await _external_audit()) == before


async def test_flag_off_and_local_down_gives_template(v1, ai_env, cloud, monkeypatch):
    ai_env.configure(chat_cloud_enabled=False)
    monkeypatch.setattr(llm, "configured_client", lambda: Local(up=False))
    body = (await _ask(v1)).json()
    assert body["source"] == "template" and body["provider"] is None and body["modelName"] is None
    assert "справочном режиме" in body["reply"]
    assert cloud["requests"] == 0


async def test_both_unavailable_gives_template(v1, ai_env, cloud, monkeypatch):
    ai_env.configure(chat_cloud_enabled=True)
    cloud["status"] = 503
    monkeypatch.setattr(llm, "configured_client", lambda: Local(up=False))
    body = (await _ask(v1)).json()
    assert body["source"] == "template" and "справочном режиме" in body["reply"]


async def test_no_models_configured_gives_template(v1, ai_env):
    body = (await _ask(v1)).json()
    assert body["source"] == "template"


@pytest.mark.parametrize(
    "answer",
    [
        {"text": "short"},
        {"text": "This answer is written in English only and is long enough to pass length."},
        {"text": "# Заголовок\n- первый пункт списка\n- второй пункт списка"},
        {"text": "а" * 601},
        {"other": "ключа text нет"},
    ],
)
async def test_invalid_model_text_gives_template(v1, ai_env, monkeypatch, answer):
    monkeypatch.setattr(llm, "configured_client", lambda: Local(answer=answer))
    body = (await _ask(v1)).json()
    assert body["source"] == "template" and "справочном режиме" in body["reply"]


async def test_timeout_gives_template_without_waiting(v1, ai_env, monkeypatch):
    local = Local(delay=0.5)
    monkeypatch.setattr(llm, "configured_client", lambda: local)
    monkeypatch.setattr(attempt_chat, "CHAT_TIMEOUT_SEC", 0.05)
    started = time.monotonic()
    body = (await _ask(v1)).json()
    assert body["source"] == "template"
    assert time.monotonic() - started < 0.45
    assert (await _ask(v1)).json()["source"] == "template"  # пара: тот же путь остаётся рабочим после таймаута


async def test_source_matches_llm_outcome_source(v1, ai_env, cloud, monkeypatch):
    ai_env.configure(chat_cloud_enabled=True)
    monkeypatch.setattr(llm, "configured_client", lambda: Local())
    seen: list[llm.LlmOutcome] = []
    original = llm.complete_json

    def spy(*args, **kwargs):
        outcome = original(*args, **kwargs)
        seen.append(outcome)
        return outcome

    monkeypatch.setattr(llm, "complete_json", spy)
    for status in (200, 503):
        cloud["status"] = status
        body = (await _ask(v1)).json()
        assert body["source"] == seen[-1].source and body["provider"] == seen[-1].provider
    assert [outcome.source for outcome in seen] == ["cloud", "local"]
    assert all(outcome.purpose == "attempt_chat" for outcome in seen)


async def test_rate_limit_429_then_ok_after_window(v1, ai_env, monkeypatch):
    now = [1000.0]
    limiter = attempt_chat.ChatRateLimiter(lambda: 10, clock=lambda: now[0])
    monkeypatch.setattr(attempt_chat, "rate_limiter", limiter)
    monkeypatch.setattr(llm, "configured_client", lambda: Local())
    for _ in range(10):
        assert (await _ask(v1)).status_code == 200
    blocked = await _ask(v1)
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rateLimited"
    assert "Подождите" in blocked.json()["error"]["message"]
    now[0] += attempt_chat.RATE_WINDOW_SEC + 1
    assert (await _ask(v1)).status_code == 200


def test_rate_limiter_is_per_user_and_cleans_up():
    now = [0.0]
    limiter = attempt_chat.ChatRateLimiter(lambda: 2, clock=lambda: now[0])
    limiter.check("a")
    limiter.check("a")
    limiter.check("b")  # другой пользователь не затронут
    with pytest.raises(Exception) as raised:
        limiter.check("a")
    assert getattr(raised.value, "status", None) == 429
    now[0] = 61.0
    limiter.check("a")
    assert set(limiter._hits) == {"a"}  # очередь «b» удалена как устаревшая
