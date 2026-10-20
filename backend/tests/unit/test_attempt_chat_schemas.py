"""Фича 020, T004: границы схем чата разбора попытки (`ChatRequest` / `ChatResponse`, camelCase на проводе)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.v1.ai_chat import ChatRequest, ChatResponse

BASE = {"attemptId": "att-01", "mode": "dds", "message": "Почему снижен балл?", "history": []}


def _request(**overrides) -> dict:
    return {**BASE, **overrides}


def test_message_is_trimmed_and_must_have_text():
    parsed = ChatRequest.model_validate(_request(message="  Почему снижен балл?  "))
    assert parsed.message == "Почему снижен балл?"
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(_request(message="   \n\t  "))
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(_request(message=""))


def test_message_length_bounds_are_1_to_1000_after_trim():
    assert ChatRequest.model_validate(_request(message="а" * 1000)).message == "а" * 1000
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(_request(message="а" * 1001))
    # Пробелы по краям не считаются: 1000 символов текста + пробелы — допустимо.
    assert len(ChatRequest.model_validate(_request(message=" " + "а" * 1000 + " ")).message) == 1000


def test_mode_is_limited_to_two_training_modes():
    assert ChatRequest.model_validate(_request(mode="operator112")).mode == "operator112"
    assert ChatRequest.model_validate(_request(mode="dds")).mode == "dds"
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(_request(mode="teacher"))


def test_history_holds_at_most_six_replies_with_known_roles():
    six = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"реплика {i}"} for i in range(6)]
    assert len(ChatRequest.model_validate(_request(history=six)).history) == 6
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(_request(history=six + [{"role": "user", "content": "лишняя"}]))
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(_request(history=[{"role": "system", "content": "правила"}]))


def test_history_reply_content_is_capped_at_1000_characters():
    ok = [{"role": "assistant", "content": "а" * 1000}]
    assert ChatRequest.model_validate(_request(history=ok)).history[0].content == "а" * 1000
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(_request(history=[{"role": "assistant", "content": "а" * 1001}]))


def test_history_is_optional_and_attempt_id_is_required():
    without_history = {k: v for k, v in BASE.items() if k != "history"}
    assert ChatRequest.model_validate(without_history).history == []
    with pytest.raises(ValidationError):
        ChatRequest.model_validate({k: v for k, v in BASE.items() if k != "attemptId"})


def test_response_reply_is_capped_and_source_is_known():
    ok = ChatResponse(reply="а" * 600, source="template", provider=None, model_name=None)
    assert len(ok.reply) == 600
    with pytest.raises(ValidationError):
        ChatResponse(reply="а" * 601, source="template", provider=None, model_name=None)
    with pytest.raises(ValidationError):
        ChatResponse(reply="ответ", source="gpt", provider=None, model_name=None)


def test_response_keeps_null_provider_and_model_on_the_wire():
    body = ChatResponse(reply="Ответ.", source="template", provider=None, model_name=None).dump()
    assert body == {"reply": "Ответ.", "source": "template", "provider": None, "modelName": None}
    cloud = ChatResponse(reply="Ответ.", source="cloud", provider="polza:qwen/qwen3.8-27b", model_name="qwen/qwen3.8-27b").dump()
    assert cloud["source"] == "cloud" and cloud["modelName"] == "qwen/qwen3.8-27b"
