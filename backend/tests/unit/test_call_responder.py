"""T064: детерминированный ответчик точки C и чек-лист доклада (`ml.insights.call_responder`)."""

from __future__ import annotations

import json

import pytest

from app.config import get_settings
from ml.insights import call_responder as responder


@pytest.fixture(scope="module")
def reference() -> dict:
    return json.loads((get_settings().seed_dir / "spec" / "000-фронт" / "mocks" / "reference.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def cards() -> dict[str, dict]:
    data = json.loads((get_settings().seed_dir / "spec" / "000-фронт" / "mocks" / "cards.json").read_text(encoding="utf-8"))
    return {card["id"]: card for card in data["cards"]}


def test_reply_state_machine(reference):
    entry = responder.find_number(reference, "301")
    assert entry and responder.reply(entry, "answer").text == responder.GREETING
    confirmation = responder.reply(entry, "reply", "Карточка c-001, принята")
    assert confirmation.text == responder.CONFIRMATIONS["301"] and confirmation.speaker_title == entry["title"]
    assert responder.reply(responder.find_number(reference, "303"), "reply", "x").text != confirmation.text
    with pytest.raises(ValueError):
        responder.reply(entry, "hangup")
    assert responder.find_number(reference, "999") is None


def test_voice_is_deterministic_by_number():
    assert responder.voice_of("101") == "female" and responder.voice_of("102") == "male"
    assert responder.voice_of("301") == responder.voice_of("301")
    assert responder.voice_of("") == "male"


def test_full_report_passes_checklist(cards, reference):
    card = cards["c-063"]
    transcript = [
        {"speaker": "ai", "text": "Слушаю вас"},
        {"speaker": "dispatcher", "text": "Карточка c-063, ребёнок в опасности, парковка ресторана WHITE около Живописной бухты, один пострадавший, карточка принята, наряд направлен"},
    ]
    result = responder.check_report(transcript, card, statuses=[{"ddsStatus": "accepted"}], reference=reference)
    assert result is not None and result.missing == [] and result.score == 1.0
    contract = result.to_contract()
    assert contract["version"] == responder.RESPONDER_VERSION and [c["id"] for c in contract["checks"]] == list(responder.CHECK_IDS)
    assert next(c for c in contract["checks"] if c["id"] == "decision")["expected"] == "Принята"


def test_report_without_card_number_and_victims(cards):
    card = cards["c-063"]
    result = responder.check_report([{"speaker": "dispatcher", "text": "Ребёнок в опасности, около Живописной бухты, принято"}], card)
    assert result is not None and result.missing == ["номер карточки", "сведения о пострадавших"]
    assert 0 < result.score < 1


def test_card_number_by_ticket_word(cards):
    card = cards["c-063"]
    for phrase in ("карточка 63", "карточка № 063", "по карточке номер 21"):
        result = responder.check_report([{"speaker": "dispatcher", "text": phrase}], card)
        assert result is not None and "номер карточки" not in result.missing, phrase


def test_no_dispatcher_lines_gives_none(cards):
    assert responder.check_report([{"speaker": "ai", "text": "Слушаю вас"}], cards["c-001"]) is None
    assert responder.check_report([], cards["c-001"]) is None
