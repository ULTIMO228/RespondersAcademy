"""Фича 006, T009: единый вызов модели `ml.generate.llm.complete_json` — цепочка облако → локальная → шаблон.

Сеть не используется: облако — `httpx.MockTransport` (через `llm._cloud_transport`), локальная модель — подменённый
`configured_client`. Настройки окружения подменяются (`app.config.get_settings`), `backend/.env` не читается.
Проверки на отсутствие ключа пишутся как `(KEY in text) is False`, чтобы при падении ключ не печатался.
"""

from __future__ import annotations

import dataclasses
import json
import logging
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from pydantic import SecretStr

from app.services import ai_settings_service
from app.services.ai_settings_service import EffectiveAiSettings
from ml.generate import llm

KEY = "pza-cloud-key-0123456789-QWER"
SCHEMA = {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}
ROUTE_FOR_TESTS = {"x_test_route": "подтверждено-в-тесте"}  # изоляция тестов от реального маршрута


def _settings(**values: Any) -> SimpleNamespace:
    base = {
        "ai_provider": "local",
        "polza_api_key": None,
        "polza_base_url": "https://polza.test/api/v1",
        "polza_model": "openai/gpt-4o",
        "polza_timeout_sec": 5.0,
        "polza_rpm": 100,
        "polza_daily_limit": 1000,
        "llama_url": None,
        "ollama_url": None,
        "llama_model": "m",
        "ollama_model": "m",
        "ollama_timeout_sec": 5.0,
    }
    base.update(values)
    return SimpleNamespace(**base)


class FakeLocal:
    provider = "llamacpp:qwen-local"

    def __init__(self, answer: Any = None, *, healthy: bool = True) -> None:
        self.answer = {"text": "локальный ответ"} if answer is None else answer
        self._healthy = healthy
        self.calls: list[tuple[str, str]] = []

    def healthy(self) -> bool:
        return self._healthy

    def chat_json(self, system: str, user: str, schema: Any, **kwargs: Any) -> Any:
        self.calls.append((system, user))
        return self.answer


class CloudSpy:
    def __init__(self, respond) -> None:
        self.respond = respond
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.respond(request)


def _ok_answer(text: str = "облачный ответ") -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"text": text})}}]})


def _cloud_ai(key: str = KEY) -> EffectiveAiSettings:
    return EffectiveAiSettings(source="cloud", origin="env", key_set=True, key_last4=key[-4:], _env_key=SecretStr(key))


def _local_ai() -> EffectiveAiSettings:
    return EffectiveAiSettings(source="local", origin="env", key_set=True, key_last4=KEY[-4:], _env_key=SecretStr(KEY))


@pytest.fixture(autouse=True)
def _hermetic(monkeypatch):
    monkeypatch.setattr("app.config.get_settings", lambda: _settings())
    llm.reset_external_client()
    yield
    llm.reset_external_client()


@pytest.fixture
def local(monkeypatch) -> FakeLocal:
    fake = FakeLocal()
    monkeypatch.setattr(llm, "configured_client", lambda: fake)
    return fake


@pytest.fixture
def route_open(monkeypatch):
    """Подменяет маршрут в тесте, не используя сетевой контур."""
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", True)
    monkeypatch.setattr(llm, "CLOUD_ROUTE_PARAMS", ROUTE_FOR_TESTS)


def _cloud(monkeypatch, respond) -> CloudSpy:
    spy = CloudSpy(respond)
    monkeypatch.setattr(llm, "_cloud_transport", httpx.MockTransport(spy))
    return spy


def _call(ctx: llm.LlmCallContext | None, purpose: str = "error_map_explain") -> llm.LlmOutcome:
    if ctx is None:
        return llm.complete_json(purpose, "система", "запрос", SCHEMA, max_tokens=200)
    with llm.bind_context(ctx):
        return llm.complete_json(purpose, "система", "запрос", SCHEMA, max_tokens=200)


# --- стопор облака -------------------------------------------------------------------------------------------------


def test_cloud_payload_pins_model_and_route_without_fallbacks():
    assert llm.CLOUD_MODEL == "qwen/qwen3.8-27b" and llm.CLOUD_ROUTE == "cerebras/fp16"
    payload = llm.build_cloud_payload("s", "u", SCHEMA, max_tokens=200)
    assert payload["model"] == "qwen/qwen3.8-27b"
    assert payload["provider"] == {"only": ["cerebras/fp16"], "allow_fallbacks": False}
    assert payload["max_tokens"] >= llm.CLOUD_MIN_MAX_TOKENS  # рассуждения тратят часть лимита


def test_payload_is_none_when_route_params_missing(monkeypatch):
    monkeypatch.setattr(llm, "CLOUD_ROUTE_PARAMS", None)
    assert llm.build_cloud_payload("s", "u", SCHEMA) is None


def test_cloud_gate_closed_goes_local_without_request(monkeypatch, local):
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", False)  # маршрут есть, но флаг-стопор закрыт
    spy = _cloud(monkeypatch, lambda request: _ok_answer())
    outcome = _call(llm.LlmCallContext(ai=_cloud_ai()))
    assert spy.requests == []
    assert outcome.source == "local" and outcome.reason == "wrong_route" and outcome.data == {"text": "локальный ответ"}
    assert outcome.active_source == "cloud" and outcome.cloud_sent is False


def test_unconfirmed_route_blocks_cloud_even_with_flag(monkeypatch, local):
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", True)  # флаг снят, а форма маршрута не задана
    monkeypatch.setattr(llm, "CLOUD_ROUTE_PARAMS", None)
    spy = _cloud(monkeypatch, lambda request: _ok_answer())
    outcome = _call(llm.LlmCallContext(ai=_cloud_ai()))
    assert spy.requests == [] and outcome.source == "local" and outcome.reason == "wrong_route"


def test_without_bound_context_cloud_is_never_used(monkeypatch, route_open, local):
    monkeypatch.setattr("app.config.get_settings", lambda: _settings(ai_provider="polza", polza_api_key=SecretStr(KEY)))
    spy = _cloud(monkeypatch, lambda request: _ok_answer())
    outcome = _call(None)
    assert spy.requests == [] and outcome.source == "local" and outcome.active_source == "local"
    assert outcome.reason is None


# --- облако ----------------------------------------------------------------------------------------------------------


def test_cloud_ok_uses_fixed_model_and_route(monkeypatch, route_open, local):
    spy = _cloud(monkeypatch, lambda request: _ok_answer())
    ctx = llm.LlmCallContext(ai=_cloud_ai())
    outcome = _call(ctx)
    assert outcome.source == "cloud" and outcome.reason is None and outcome.data == {"text": "облачный ответ"}
    assert outcome.provider == f"polza:{llm.CLOUD_MODEL}" and outcome.cloud_sent is True and outcome.cloud_result == "ok"
    assert local.calls == []
    assert len(spy.requests) == 1
    request = spy.requests[0]
    assert str(request.url) == "https://polza.test/api/v1/chat/completions"
    assert request.headers["authorization"] == f"Bearer {KEY}"
    body = json.loads(request.content)
    assert body["model"] == llm.CLOUD_MODEL  # модель — константа кода, а не POLZA_MODEL окружения
    assert body["x_test_route"] == "подтверждено-в-тесте"
    assert body["messages"] == [{"role": "system", "content": "система"}, {"role": "user", "content": "запрос"}]
    assert ctx.outcomes == [outcome]


def _raise(exc_type):
    def respond(request: httpx.Request) -> httpx.Response:
        raise exc_type("сбой", request=request)

    return respond


@pytest.mark.parametrize(
    ("respond", "reason"),
    [
        (lambda request: httpx.Response(401, json={"error": KEY}), "invalid_key"),
        (lambda request: httpx.Response(403, json={"error": "forbidden"}), "invalid_key"),
        (lambda request: httpx.Response(402, json={"error": "no money"}), "insufficient_funds"),
        (lambda request: httpx.Response(429, json={"error": "slow"}), "rate_limited"),
        (lambda request: httpx.Response(500, text="boom"), "network"),
        (lambda request: httpx.Response(404, text="?"), "bad_response"),
        (_raise(httpx.ReadTimeout), "timeout"),
        (_raise(httpx.ConnectError), "network"),
        (lambda request: httpx.Response(200, json={"choices": [{"message": {"content": "не json"}}]}), "bad_response"),
        (lambda request: httpx.Response(200, text="<html>"), "bad_response"),
        (lambda request: httpx.Response(200, json={"choices": []}), "bad_response"),
    ],
)
def test_cloud_errors_fall_back_to_local(monkeypatch, route_open, local, respond, reason):
    _cloud(monkeypatch, respond)
    outcome = _call(llm.LlmCallContext(ai=_cloud_ai()))
    assert outcome.source == "local" and outcome.reason == reason and outcome.cloud_result == reason
    assert outcome.data == {"text": "локальный ответ"} and outcome.provider == "llamacpp:qwen-local"
    assert len(local.calls) == 1


def test_wrong_route_in_answer_falls_back_to_local(monkeypatch, route_open, local):
    monkeypatch.setattr(llm, "check_cloud_route", lambda body: False)
    _cloud(monkeypatch, lambda request: _ok_answer())
    outcome = _call(llm.LlmCallContext(ai=_cloud_ai()))
    assert outcome.source == "local" and outcome.reason == "wrong_route" and outcome.cloud_sent is True


def test_undecryptable_key_is_invalid_key_without_request(monkeypatch, route_open, local):
    spy = _cloud(monkeypatch, lambda request: _ok_answer())
    broken = EffectiveAiSettings(source="cloud", origin="db", key_set=True, key_last4="ABCD", _cipher="не-шифртекст")
    outcome = _call(llm.LlmCallContext(ai=broken))
    assert spy.requests == [] and outcome.source == "local" and outcome.reason == "invalid_key"


def test_daily_limit_from_context_survives_restart(monkeypatch, route_open, local):
    monkeypatch.setattr("app.config.get_settings", lambda: _settings(polza_daily_limit=5))
    spy = _cloud(monkeypatch, lambda request: _ok_answer())
    outcome = _call(llm.LlmCallContext(ai=_cloud_ai(), calls_today=5))  # расход из ai_health, процесс «новый»
    assert spy.requests == [] and outcome.source == "local" and outcome.reason == "daily_limit"
    below = _call(llm.LlmCallContext(ai=_cloud_ai(), calls_today=4))
    assert below.source == "cloud" and len(spy.requests) == 1


def test_requests_per_minute_limit(monkeypatch, route_open, local):
    monkeypatch.setattr("app.config.get_settings", lambda: _settings(polza_rpm=1))
    spy = _cloud(monkeypatch, lambda request: _ok_answer())
    assert _call(llm.LlmCallContext(ai=_cloud_ai())).source == "cloud"
    second = _call(llm.LlmCallContext(ai=_cloud_ai()))
    assert second.source == "local" and second.reason == "rate_limited" and len(spy.requests) == 1


# --- локальная и шаблон --------------------------------------------------------------------------------------------


def test_cloud_and_local_down_gives_template(monkeypatch, route_open):
    monkeypatch.setattr(llm, "configured_client", lambda: FakeLocal(healthy=False))
    _cloud(monkeypatch, lambda request: httpx.Response(401, json={}))
    outcome = _call(llm.LlmCallContext(ai=_cloud_ai()))
    assert outcome.source == "template" and outcome.data is None and outcome.provider is None
    assert outcome.reason == "invalid_key" and outcome.fallback_reason == "local_down"


def test_local_source_never_requests_cloud(monkeypatch, route_open, local):
    spy = _cloud(monkeypatch, lambda request: _ok_answer())
    outcome = _call(llm.LlmCallContext(ai=_local_ai()))
    assert spy.requests == []
    assert outcome.source == "local" and outcome.reason is None and outcome.active_source == "local"


class GarbageLocal(FakeLocal):
    """Сервер жив, но ответ не разобран: `chat_json` вернул None."""

    def chat_json(self, system: str, user: str, schema: Any, **kwargs: Any) -> Any:
        self.calls.append((system, user))
        return None


@pytest.mark.parametrize(
    ("client", "reason"),
    [(None, "local_down"), (FakeLocal(healthy=False), "local_down"), (GarbageLocal(), "bad_response")],
)
def test_local_failure_gives_template(monkeypatch, client, reason):
    monkeypatch.setattr(llm, "configured_client", lambda: client)
    outcome = _call(llm.LlmCallContext(ai=_local_ai()))
    assert outcome.source == "template" and outcome.reason == reason and outcome.data is None


# --- события в контексте вызова, утечки ----------------------------------------------------------------------------


def test_outcomes_go_to_own_context_and_purpose_does_not_stick(monkeypatch, local):
    first, second = llm.LlmCallContext(ai=_local_ai()), llm.LlmCallContext(ai=_local_ai())
    _call(first, "error_map_explain")
    _call(second, "scenario_generation")
    assert [o.purpose for o in first.outcomes] == ["error_map_explain"]
    assert [o.purpose for o in second.outcomes] == ["scenario_generation"]
    assert not hasattr(llm, "drain_external_events") and not hasattr(llm, "_external_events")


def test_key_never_leaks_to_outcome_context_or_logs(monkeypatch, route_open, local, caplog):
    caplog.set_level(logging.DEBUG)
    _cloud(monkeypatch, lambda request: httpx.Response(401, json={"error": f"bad {KEY}"}))
    ctx = llm.LlmCallContext(ai=_cloud_ai())
    outcome = _call(ctx)
    dumped = json.dumps(dataclasses.asdict(outcome), ensure_ascii=False, default=str)
    for text in (repr(outcome), str(outcome), repr(ctx), dumped, caplog.text):
        assert (KEY in text) is False
    assert ("запрос" in dumped) is False and ("локальный ответ" in repr(outcome)) is False
    assert outcome.request_chars == len("система") + len("запрос")


# --- клиент генерации сценариев -------------------------------------------------------------------------------------


def test_generation_client_is_none_when_nothing_is_available(monkeypatch):
    monkeypatch.setattr(llm, "configured_client", lambda: None)
    assert llm.generation_client() is None
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", False)
    with llm.bind_context(llm.LlmCallContext(ai=_cloud_ai())):  # облако выбрано, но стопор закрыт
        assert llm.generation_client() is None
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", True)
    with llm.bind_context(llm.LlmCallContext(ai=_cloud_ai())):  # стопор снят: облако доступно
        assert llm.generation_client() is not None


def test_generation_client_routes_through_complete_json(monkeypatch, local):
    ctx = llm.LlmCallContext(ai=_local_ai())
    with llm.bind_context(ctx):
        client = llm.generation_client()
        assert client is not None and client.healthy() is True
        assert client.chat_json("s", "u", SCHEMA, seed=1, max_tokens=50) == {"text": "локальный ответ"}
    assert client.provider == "llamacpp:qwen-local"
    assert [(o.purpose, o.source) for o in ctx.outcomes] == [("scenario_generation", "local")]


def test_generation_client_uses_cloud_when_open(monkeypatch, route_open, local):
    _cloud(monkeypatch, lambda request: _ok_answer())
    ctx = llm.LlmCallContext(ai=_cloud_ai())
    with llm.bind_context(ctx):
        client = llm.generation_client()
        assert client is not None and client.healthy() is True
        assert client.chat_json("s", "u", SCHEMA) == {"text": "облачный ответ"}
    assert client.provider == f"polza:{llm.CLOUD_MODEL}" and local.calls == []
