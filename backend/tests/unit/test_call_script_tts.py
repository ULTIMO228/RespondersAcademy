"""T080/T081 (Phase 10): реплика заявителя из билета, подготовка текста для Silero, список оповещения по опросной карте."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config import get_settings
from ml.classify import notification_list as nl
from ml.classify.ekp_group_classifier import classifier_entries
from ml.generate import call_script
from ml.speech import tts

TICKET = {
    "id": "c-010",
    "ticketNo": 10,
    "group": "пожар в жилом доме",
    "summary": "Горит балкон и два окна на 13-м этаже, открытое пламя, наблюдают с улицы. Дом 14 эт., газифицирован",
    "address": "Москва, ул. Грина, № дома неизвестен, в доме библиотека № 19",
    "caller": {"name": "Сидорова Анна Викторовна", "phone": "916-126-34-71", "status": "очевидец"},
    "expectedServices": ["101 (главная)", "104 (дом газифицирован)", "102"],
    "expectedTags": ["жилой дом", "балкон", "открытое пламя"],
}


@pytest.fixture(scope="module")
def reference():
    with (get_settings().seed_dir / "spec" / "000-фронт" / "mocks" / "reference.json").open(encoding="utf-8") as handle:
        return json.load(handle)


def test_call_script_contains_all_ticket_facts_and_is_deterministic():
    built = call_script.build(TICKET)
    text = built["transcript"]
    for fact in ("Горит балкон и два окна на 13-м этаже", "газифицирован", "ул. Грина", "библиотека № 19", "Сидорова Анна Викторовна", "916-126-34-71"):
        assert fact in text, fact
    assert text.startswith("Алло, здравствуйте!") and "вижу всё своими глазами" in text  # статус «очевидец»
    assert built["voice"] == "female" and call_script.build(TICKET) == built
    victims = {**TICKET, "caller": {"name": "мама", "phone": "9163201283", "status": "родственник"}, "victims": {"count": 1, "note": "ребёнок 11 лет, отёк руки"}, "noAmbulance": True}
    spoken = call_script.build_script(victims)
    assert "Есть пострадавшие" in spoken and "ребёнок 11 лет, отёк руки" in spoken and "отказываемся" in spoken and "Я мама" in spoken
    assert call_script.build(victims)["voice"] == "female"


def test_voice_resolution():
    assert call_script.guess_voice("Соколов Пётр Ильич") == "male"
    assert call_script.guess_voice("Иванова Мария Сергеевна") == "female"
    assert call_script.guess_voice("сама") == "female" and call_script.guess_voice("папа") == "male"
    assert call_script.guess_voice("не указан", 4) == "male" and call_script.guess_voice("не указан", 5) == "female"
    assert call_script.resolve_voice("male", TICKET) == "male" and call_script.resolve_voice("auto", TICKET) == "female"


def test_tts_text_preparation_numbers_and_phones():
    prepared = tts.prepare_text("Горит балкон на 13-м этаже, дом 14 эт., 2-й подъезд. Мой телефон: 916-126-34-71. Ребёнок 11 лет, +7 (916) 896 32 54")
    assert "тринадцать этаже" in prepared and "четырнадцать" in prepared and "два подъезд" in prepared
    assert "девять один шесть, один два шесть, три четыре, семь один" in prepared
    assert "восемь девять шесть, три два, пять четыре" in prepared and not any(ch.isdigit() for ch in prepared)
    assert tts.number_to_words(0) == "ноль" and tts.number_to_words(21) == "двадцать один" and tts.number_to_words(115) == "сто пятнадцать"
    assert tts.number_to_words(2001) == "две тысячи один" and tts.number_to_words(1000) == "одна тысяча"
    assert tts.split_chunks("Первое. Второе! Третье?", limit=12) == ["Первое.", "Второе!", "Третье?"]


def test_tts_fallback_without_model(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(tts, "model_path", lambda: tmp_path / "silero" / "v4_ru.pt")
    tts.reset()
    assert tts.available() is False and "prepare_models" in (tts.unavailable_reason() or "")
    with pytest.raises(tts.TtsUnavailable):
        tts.synthesize("Проверка", "male", tmp_path / "out.wav")
    tts.reset()


@pytest.mark.skipif(not tts.available(), reason="нет модели Silero (prepare_models --only tts)")
def test_tts_synthesizes_wav(tmp_path: Path):
    result = tts.synthesize("Алло, здравствуйте! Это служба сто двенадцать? Горит балкон на девятом этаже.", "female", tmp_path / "c-test.wav")
    assert result.path.exists() and result.speaker == "kseniya"
    assert 2_000 < result.duration_ms < 20_000 and tts.wav_duration_ms(result.path) == result.duration_ms


def test_notification_list_by_signs_code_and_flags(reference):
    entries = list(classifier_entries())
    by_signs = nl.build(entries, reference, signs=["Происшествие 101", "Дом", "Дым"])
    assert by_signs.group == "пожар в жилом доме" and by_signs.final_type.startswith("задымление") and "svc-101" in by_signs.service_ids
    gas = nl.build(entries, reference, signs=["Запах газа в помещении", "Квартира"])
    assert gas.classifier_code == "13020201" and "svc-104" in gas.service_ids
    by_code = nl.build(entries, reference, classifier_code="14080106", manual=[{"serviceId": "svc-mgts"}])
    assert by_code.final_type == "Дерево упало во дворе" and by_code.services[-1].added_by == "manual" and by_code.services[-1].service_id == "svc-mgts"
    # Условные реакции: «выбран признак Пострадавшие» → в список только при флаге.
    plain = nl.build(entries, reference, classifier_code="1010101")
    injured = nl.build(entries, reference, classifier_code="1010101", flags=["Пострадавшие"])
    assert "svc-103" not in plain.service_ids and "svc-103" in injured.service_ids
    assert any(c.service_id == "svc-103" for c in plain.conditional)
    assert nl.expected_service_ids(TICKET["expectedServices"], reference) == ["svc-101", "svc-104", "svc-102"]
    assert nl.build(entries, reference, signs=[]).entry is None


def test_every_classifier_service_resolves_to_reference(reference):
    names = {n["service"] for e in classifier_entries() for n in e.get("notifications") or [] if n.get("mode") in nl.NOTIFICATION_MODES}
    unresolved = [name for name in names if nl.resolve_service_id(name, reference)[0].startswith("cls:")]
    assert unresolved == [], unresolved
