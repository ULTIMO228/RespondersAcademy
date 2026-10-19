"""Спека 004, T002/T004: клиент Polza.ai (`ml.generate.llm.PolzaClient`) — запрос, ошибки, лимиты, утечка ключа.

Сеть не используется: `httpx.MockTransport`. Внешний провайдер выключен по умолчанию (`AI_PROVIDER=local`), и тогда
исходящих запросов нет вообще.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from app.ai_gateway import LocalAiGateway
from app.config import Settings
from ml.generate import llm

KEY = "pk-secret-key-1234567890"
SCHEMA = {"type": "object", "properties": {"text": {"type": "string"}}}


def _answer(content: Any) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def _client(handler, **kwargs: Any) -> llm.PolzaClient:
    options: dict[str, Any] = {"rpm": 100, "daily_limit": 1000}
    options.update(kwargs)
    return llm.PolzaClient(
        "https://polza.ai/api/v1/", KEY, "openai/gpt-4o", 30.0, transport=httpx.MockTransport(handler), **options
    )


@pytest.fixture(autouse=True)
def _clean_events():
    llm.drain_external_events()
    yield
    llm.drain_external_events()


def test_request_shape_and_parsed_answer():
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return _answer(json.dumps({"text": "ответ"}))

    client = _client(handler)
    assert client.chat_json("система", "запрос", SCHEMA, seed=7, max_tokens=200) == {"text": "ответ"}
    assert seen["url"] == "https://polza.ai/api/v1/chat/completions"
    assert seen["auth"] == f"Bearer {KEY}"
    body = seen["body"]
    assert body["model"] == "openai/gpt-4o" and body["max_tokens"] == 200
    assert body["messages"] == [{"role": "system", "content": "система"}, {"role": "user", "content": "запрос"}]
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["schema"] == SCHEMA
    assert client.provider == "polza:openai/gpt-4o"


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, json={"error": "bad key"}),
        httpx.Response(402, json={"error": "no money"}),
        httpx.Response(429, json={"error": "slow down"}),
        httpx.Response(500, text="boom"),
        _answer("это не json"),
        _answer(json.dumps(["не", "объект"])),
        _answer(None),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(200, text="<html>"),
    ],
)
def test_provider_errors_give_none(response):
    client = _client(lambda request: response)
    assert client.chat_json("s", "u", SCHEMA) is None


def test_timeout_and_network_error_give_none():
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("медленно", request=request)

    assert _client(timeout).chat_json("s", "u", SCHEMA) is None


def test_valid_answer_is_the_only_ok_event_and_events_carry_no_content_or_key():
    ok = _client(lambda request: _answer(json.dumps({"text": "x"})))
    ok.purpose = "scenario_generation"
    ok.chat_json("секретный запрос", "u", SCHEMA)
    bad = _client(lambda request: httpx.Response(401, json={"error": KEY}))
    bad.chat_json("s", "u", SCHEMA)
    events = llm.drain_external_events()
    assert [event["result"] for event in events] == ["ok", "http_401"]
    assert events[0]["purpose"] == "scenario_generation" and events[0]["provider"] == "polza:openai/gpt-4o"
    assert events[0]["requestChars"] > 0
    dumped = json.dumps(events, ensure_ascii=False)
    assert KEY not in dumped and "секретный" not in dumped
    assert llm.drain_external_events() == []


def test_key_is_not_in_repr_or_str():
    client = _client(lambda request: _answer("{}"))
    assert KEY not in repr(client) and KEY not in str(client)


def test_requests_per_minute_limit_falls_back_without_network():
    calls = []
    now = [1000.0]

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return _answer(json.dumps({"text": "x"}))

    client = _client(handler, rpm=2, clock=lambda: now[0])
    assert client.chat_json("s", "u", SCHEMA) and client.chat_json("s", "u", SCHEMA)
    assert client.healthy() is False
    assert client.chat_json("s", "u", SCHEMA) is None
    assert len(calls) == 2
    assert llm.drain_external_events()[-1]["result"] == "rate_limited"
    now[0] += 61
    assert client.healthy() is True
    assert client.chat_json("s", "u", SCHEMA) == {"text": "x"}


def test_daily_limit_blocks_until_next_day():
    day = [1]
    client = _client(
        lambda request: _answer(json.dumps({"text": "x"})), daily_limit=1, today=lambda: day[0], clock=lambda: 0.0
    )
    assert client.chat_json("s", "u", SCHEMA) == {"text": "x"}
    assert client.chat_json("s", "u", SCHEMA) is None
    day[0] = 2
    assert client.chat_json("s", "u", SCHEMA) == {"text": "x"}


def _settings(**values: Any) -> SimpleNamespace:
    base = {
        "ai_provider": "local",
        "polza_api_key": None,
        "polza_base_url": "https://polza.ai/api/v1",
        "polza_model": "openai/gpt-4o",
        "polza_timeout_sec": 30.0,
        "polza_rpm": 20,
        "polza_daily_limit": 500,
        "llama_url": None,
        "ollama_url": None,
        "llama_model": "m",
        "ollama_model": "m",
        "ollama_timeout_sec": 5.0,
    }
    base.update(values)
    return SimpleNamespace(**base)


class _Secret:
    def get_secret_value(self) -> str:
        return KEY


def test_local_provider_never_builds_external_client(monkeypatch):
    monkeypatch.setattr("app.config.get_settings", lambda: _settings(polza_api_key=_Secret()))
    llm.reset_external_client()
    assert llm.external_client() is None
    assert llm.generation_client() is None


def test_polza_provider_builds_one_shared_guarded_client(monkeypatch):
    monkeypatch.setattr("app.config.get_settings", lambda: _settings(ai_provider="polza", polza_api_key=_Secret()))
    llm.reset_external_client()
    first = llm.external_client()
    assert isinstance(first, llm.PolzaClient) and first is llm.external_client()
    assert llm.generation_client() is first
    llm.reset_external_client()


def test_local_clients_stay_for_warmup_even_with_polza(monkeypatch):
    monkeypatch.setattr(
        "app.config.get_settings",
        lambda: _settings(ai_provider="polza", polza_api_key=_Secret(), llama_url="http://127.0.0.1:8081"),
    )
    llm.reset_external_client()
    client = llm.configured_client()
    assert client is not None and not isinstance(client, llm.PolzaClient)
    llm.reset_external_client()


def test_polza_without_key_fails_at_startup():
    with pytest.raises(ValueError, match="POLZA_API_KEY"):
        Settings(JWT_SECRET="x" * 40, AI_PROVIDER="polza")
    assert Settings(JWT_SECRET="x" * 40, AI_PROVIDER="polza", POLZA_API_KEY="k").ai_provider == "polza"
    assert Settings(JWT_SECRET="x" * 40).ai_provider == "local"


def test_unknown_provider_is_rejected():
    with pytest.raises(ValueError):
        Settings(JWT_SECRET="x" * 40, AI_PROVIDER="somebody")


class _FakeExternal:
    provider = "polza:fake"

    def __init__(self, answer: Any) -> None:
        self.answer = answer
        self.calls: list[tuple[str, str]] = []

    def healthy(self) -> bool:
        return True

    def chat_json(self, system: str, user: str, schema: Any, **kwargs: Any) -> Any:
        self.calls.append((system, user))
        return self.answer


ERRORS = [{"ruleId": "v1", "plainText": "Не проставлен статус «Принята»", "severity": "critical", "studentCount": 3}]
STAGE = {"id": "statuses", "title": "Статусы реагирования"}
CONTEXT = {"subject": "group", "level": {"level": "often", "share": 0.5, "attempts": 10, "attemptsWithError": 5, "affectedStudents": 3}}


def test_explain_stage_without_external_provider_is_none(monkeypatch):
    monkeypatch.setattr(llm, "external_client", lambda: None)
    assert LocalAiGateway().explain_stage("dds", STAGE, ERRORS, CONTEXT) is None


def test_explain_stage_uses_external_text_and_sends_no_people(monkeypatch):
    fake = _FakeExternal({"text": "Обучающиеся торопятся и пропускают статус."})
    monkeypatch.setattr(llm, "external_client", lambda: fake)
    text = LocalAiGateway().explain_stage("dds", STAGE, ERRORS, CONTEXT)
    assert text == "Обучающиеся торопятся и пропускают статус."
    sent = " ".join(fake.calls[0])
    assert "Статусы реагирования" in sent and "Не проставлен статус" in sent
    assert "studentId" not in sent and "students" not in sent


@pytest.mark.parametrize("answer", [None, {}, {"text": ""}, {"text": 5}, {"other": "x"}])
def test_explain_stage_bad_external_answer_is_none(monkeypatch, answer):
    monkeypatch.setattr(llm, "external_client", lambda: _FakeExternal(answer))
    assert LocalAiGateway().explain_stage("dds", STAGE, ERRORS, CONTEXT) is None
