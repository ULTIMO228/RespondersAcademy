from types import SimpleNamespace

import pytest

from app.api.errors import ApiError
from app.services.live_caller_provider import LocalCallerProvider


@pytest.mark.parametrize(("question", "expected"), [
    ("Назовите адрес происшествия", "Москва, ул. Грина, номер дома неизвестен"),
    ("Какой номер дома?", "Москва, ул. Грина, номер дома неизвестен"),
    ("Как вас зовут?", "Анна"),
    ("Ваш телефон?", "916-126-34-71"),
])
def test_requisites_are_not_generated(question, expected, monkeypatch):
    provider = LocalCallerProvider()
    monkeypatch.setattr(provider, "client", lambda: pytest.fail("Реквизиты не должны генерироваться LLM"))
    facts = {"address": "Москва, ул. Грина, номер дома неизвестен", "addressRefined": "ул. Грина, 11",
             "caller": {"name": "Анна", "phone": "916-126-34-71"}}
    assert provider.reply(facts, [{"speaker": "dispatcher", "text": question}]) == expected


def test_only_selected_ticket_facts_are_voiced(monkeypatch):
    provider = LocalCallerProvider()
    monkeypatch.setattr(provider, "client", lambda: SimpleNamespace(chat_json=lambda *args, **kwargs: {"answer_ids": ["summary"], "reply": "Пожарные уже приехали"}))
    assert provider.reply({"summary": "Горит балкон"}, [{"speaker": "dispatcher", "text": "Что происходит?"}]) == "Горит балкон"


@pytest.mark.parametrize("ids", [["invented"], [], [None], "summary"])
def test_invalid_model_selection_is_rejected(ids, monkeypatch):
    provider = LocalCallerProvider()
    monkeypatch.setattr(provider, "client", lambda: SimpleNamespace(chat_json=lambda *args, **kwargs: {"answer_ids": ids}))
    with pytest.raises(ApiError):
        provider.reply({"summary": "Горит балкон"}, [{"speaker": "dispatcher", "text": "Что происходит?"}])
