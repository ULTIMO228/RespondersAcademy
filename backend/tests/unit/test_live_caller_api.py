import json

import httpx
import pytest
from pydantic import SecretStr

from app.api.errors import ApiError
from app.config import get_settings
from app.services.live_caller_api import CallerApiClient
from app.services.live_caller_provider import ApiCallerProvider, LocalCallerProvider, get_provider

SCHEMA = {"type": "object", "properties": {"reply": {"type": "string"}}, "required": ["reply"], "additionalProperties": False}


def response(payload=None, status=200):
    return httpx.Response(status, json=payload or {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps({"reply": "Я вижу дым."})}}]})


def test_bearer_base_url_messages_and_no_local_parameters(monkeypatch):
    seen = []
    monkeypatch.setattr(httpx, "post", lambda url, **kwargs: seen.append((url, kwargs)) or response())
    client = CallerApiClient("https://example.test/api/v1/", "qwen/example", "test-secret")
    assert client.healthy() and not seen
    assert client.complete([{"role": "user", "content": "Что случилось?"}], SCHEMA, 240) == {"reply": "Я вижу дым."}
    url, request = seen[0]
    assert url == "https://example.test/api/v1/chat/completions"
    assert request["headers"]["Authorization"] == "Bearer test-secret"
    assert request["json"]["model"] == "qwen/example"
    assert request["json"]["response_format"]["json_schema"]["strict"] is True
    assert "cache_prompt" not in request["json"]
    assert request["follow_redirects"] is False


def test_missing_key_never_calls_network(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: pytest.fail("No API request without key"))
    with pytest.raises(ApiError, match="LIVE_CALL_LLM_API_KEY"):
        CallerApiClient("https://example.test/v1", "model", "").complete([], SCHEMA, 100)


@pytest.mark.parametrize(("status", "message"), [(401, "ключ"), (403, "ключ"), (402, "средств"), (429, "лимит"), (500, "отклонил")])
def test_provider_errors_are_useful_and_do_not_echo_secret(monkeypatch, status, message):
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: response({"error": "test-secret and private upstream details"}, status))
    with pytest.raises(ApiError) as error:
        CallerApiClient("https://example.test/v1", "model", "test-secret").complete([], SCHEMA, 100)
    assert message in error.value.message
    assert "test-secret" not in error.value.message


@pytest.mark.parametrize("payload", [{"choices": []}, {"error": "error inside 200"}, {"choices": [{"finish_reason": "length", "message": {"content": '{"reply":"обрезано"}'}}]}])
def test_incomplete_responses_are_rejected(monkeypatch, payload):
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: response(payload))
    with pytest.raises(ApiError, match="неполный"):
        CallerApiClient("https://example.test/v1", "model", "test-secret").complete([], SCHEMA, 100)


def test_cloud_dialogue_preserves_roles_and_excludes_hidden_reference(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "live_call_llm_transport", "api")
    monkeypatch.setattr(settings, "live_call_llm_url", "https://example.test/v1")
    monkeypatch.setattr(settings, "live_call_llm_api_key", SecretStr("test-secret"))
    monkeypatch.setattr(settings, "live_call_reply_mode", "auto")
    seen = []
    monkeypatch.setattr(httpx, "post", lambda url, **kwargs: seen.append(kwargs["json"]) or response())
    provider = get_provider()
    assert isinstance(provider, ApiCallerProvider)
    reply = provider.reply({"summary": "Дым из окна", "addressRefined": "hidden answer", "expectedServices": ["101"]},
                           [{"speaker": "caller", "text": "Помогите"}, {"speaker": "dispatcher", "text": "Что происходит?"}])
    assert reply == "Я вижу дым."
    assert [message["role"] for message in seen[0]["messages"]] == ["system", "assistant", "user"]
    assert "hidden answer" not in json.dumps(seen[0], ensure_ascii=False)
    assert "expectedServices" not in json.dumps(seen[0])
    monkeypatch.setattr(settings, "live_call_llm_transport", "local")
    assert type(get_provider()) is LocalCallerProvider


def test_local_settings_do_not_expose_cloud_key(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "live_call_llm_api_key", SecretStr("test-secret"))
    assert "test-secret" not in repr(settings)
