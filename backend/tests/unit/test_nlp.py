"""T037: грамматика (symspell + домен), адрес по справочнику улиц, смысловое сравнение."""

from __future__ import annotations

import pytest

from ml.nlp import address, embedder, grammar, semantic


def test_grammar_spelling_from_seed_examples():
    errors = grammar.check("Сообщение пренято, механик напрален", "dispatcherAction")
    spelling = [(e.wrong, e.expected, e.type) for e in errors]
    assert ("пренято", "принято", "spelling") in spelling
    assert ("напрален", "направлен", "spelling") in spelling
    assert all(e.field == "dispatcherAction" for e in errors)
    assert errors[0].fragment == "Сообщение пренято"


def test_grammar_syntax_rules_match_front_mock():
    issues = [(e.type, e.wrong, e.expected) for e in grammar.check("наряд  направлен , ожидаем")]
    assert issues == [("syntax", "наряд", "Наряд"), ("syntax", "  ", " "), ("syntax", " ,", ",")]


def test_grammar_domain_words_and_clean_text():
    assert grammar.check("Сообщение принято, наряд полиции направлен") == []
    assert grammar.check("Информация передана в Мосводоканал, реагируют по карточке") == []
    assert grammar.check("   ") == []
    fields = {"dispatcherAction": "Бригадда направлена", "outfitNumber": "5"}
    assert grammar.check_fields(fields) == grammar.check_fields(fields)
    assert len(grammar.check_fields(fields)) == 1


def test_address_lookalike_and_typo():
    check = address.compare("ул. Дубнинская", "ул. Дубининская")
    assert check.kind == "lookalike" and check.ratio >= 85
    assert check.entered.street is not None and check.entered.street.name == "Дубнинская улица"
    assert address.compare("Дубининская улица, 12", "Москва, ул. Дубининская, д. 12").kind == "exact"
    assert address.compare("ул. Дубиниская", "ул. Дубининская").kind == "typo"
    assert address.compare("Тверская", "ул. Дубининская").kind == "mismatch"


def test_address_directory_size_and_match():
    assert len(address.load_streets()) >= 3000
    assert address.match("Ленинский проспект, 10").street.name == "Ленинский проспект"
    assert address.match("Леонтьевский пер., 16, стр.1").street.name == "Леонтьевский переулок"
    assert address.match("парковка ресторана WHITE").unknown


@pytest.mark.skipif(not embedder.available(), reason="модель rubert-tiny2 не установлена (prepare_models.py)")
def test_semantic_similarity_with_model():
    full = "территория ЖКХ Басманного района, передано в ОДС-3"
    good = semantic.covers_key_phrases(full, ["не обслуживаем территорию", "передано в ОДС"])
    assert good.available and good.score >= 0.5
    assert semantic.similarity("в доме газ", "дом газифицирован").score >= semantic.DEFAULT_THRESHOLD
    assert semantic.similarity("квартира на пятом этаже", "дом газифицирован").score < semantic.DEFAULT_THRESHOLD
    short = semantic.covers_key_phrases("не обслуживаем", ["передано в ОДС"], threshold=0.7)
    assert short.score < 1.0


def test_semantic_lexical_fallback_is_deterministic(monkeypatch):
    monkeypatch.setattr(embedder, "encode", lambda texts: None)
    result = semantic.covers_key_phrases("Сообщение принято, наряд полиции направлен", ["сообщение принято", "наряд полиции направлен", "бригада СМП направлена"])
    assert result.available is False
    # Лексический фолбэк — непрерывное покрытие основ: (1 + 1 + 1/3) / 3.
    assert abs(result.score - 7 / 9) < 1e-6
    assert semantic.covers_key_phrases("не обслуживаем", ["причина", "кому передано"]).score < 0.5


# ─── T052 (US3): ручной текст преподавателя и курсанта без LLM ─────────────────────────────────────


def _pairs(errors):
    return [(e.wrong, e.expected, e.type) for e in errors]


@pytest.mark.parametrize(
    "text",
    [
        "Информация передана в ЦУКБ, ПСЦ и ОИВ, АСМ направлена, код ЕКП уточнён, ДДС оповещена",
        "Передано дежурному ОМВД, ЕДДС, ЦУКС, ЦОДД, АСС, ПСО и ПСЧ",
        "Заявка передана в МосгорБТИ и ГКУ ЦОДД",
    ],
)
def test_grammar_professional_abbreviations_are_not_errors(text):
    assert grammar.check(text, "dispatcherAction") == []


@pytest.mark.parametrize(
    "text",
    [
        "Заявитель сообщил о запахе газа в подъезде, ориентир: рядом с магазином",
        "Отработка карточки завершена, ОДС уведомлена",
        "Мосводоканалом перекрыта задвижка",
        "Госпитализация не потребовалась, эвакуация жильцов не проводилась",
    ],
)
def test_grammar_valid_word_forms_are_not_corrected(text):
    assert grammar.check(text, "summary") == []


def test_grammar_unknown_proper_name_without_basis_is_not_error():
    # Фамилия заявителя не известна словарям: нет надёжного основания для замены «Карпин» → «Картин».
    assert grammar.check("Заявитель Карпин сообщил о задымлении", "summary") == []
    assert grammar.check("Звонил Лапшин из управы", "summary") == []
    # Опечатка в доменном названии с заглавной — по-прежнему замечание.
    assert ("Мосводакнал", "Мосводоканал", "spelling") in _pairs(grammar.check("Передано в Мосводакнал", "summary"))


def test_grammar_real_typos_are_still_found():
    pairs = _pairs(grammar.check("Бригада направленна, эвакуацыя жильцов, адресс уточнён", "summary"))
    assert ("направленна", "направлена", "spelling") in pairs
    assert ("эвакуацыя", "эвакуация", "spelling") in pairs
    assert ("адресс", "адрес", "spelling") in pairs


def test_grammar_fragment_is_exact_substring_and_text_is_not_changed():
    text = "Сообщение, пренято;  механик напрален"
    original = str(text)
    errors = grammar.check(text, "dispatcherAction")
    assert text == original
    assert errors and all(e.wrong in text and e.fragment in text for e in errors)
    spelling = [e for e in errors if e.type == "spelling"]
    assert spelling[0].fragment == "Сообщение, пренято"
    assert all(set(e.to_contract()) == {"field", "fragment", "wrong", "expected", "type"} for e in errors)


def test_grammar_empty_input_and_repeat_after_edit():
    for empty in ("", " ", "\n\t"):
        assert grammar.check_field(empty, "summary") == []
        assert grammar.check_field(empty, "address") == []
    before = grammar.check_field("Сообщение пренято, бригадда направлена", "summary")
    assert before == grammar.check_field("Сообщение пренято, бригадда направлена", "summary")
    assert {e.wrong for e in before} == {"пренято", "бригадда"}
    # Повторная проверка после правки: исправленное слово исчезает, оставшееся — сохраняется.
    after = grammar.check_field("Сообщение принято, бригадда направлена", "summary")
    assert [e.wrong for e in after] == ["бригадда"]
    assert grammar.check_field("Сообщение принято, бригада направлена", "summary") == []


def test_grammar_address_field_uses_street_directory():
    assert grammar.check_field("ул. Дубининская, д. 12, корп. 2, стр. 1, кв. 45", "address") == []
    assert grammar.check_field("Москва, Чертановская улица, 58", "addressRefined") == []
    lookalike = grammar.check_field("ул. Зверенецкая, 22", "address")
    assert _pairs(lookalike) == [("ул. Зверенецкая", "Зверинецкая улица", "spelling")]
    assert lookalike[0].field == "address" and lookalike[0].fragment in "ул. Зверенецкая, 22"
    typo = grammar.check_field("Ленинскй проспект, 10", "address")
    assert _pairs(typo) == [("Ленинскй проспект", "Ленинский проспект", "spelling")]


def test_grammar_unknown_street_is_not_error():
    # Улицы нет в справочнике и похожей нет — основания для замечания нет, текст не «исправляется» словарём.
    assert grammar.check_field("Москва, ул. Несуществующая, 5", "address") == []


def test_grammar_non_address_field_keeps_syntax_rules():
    assert _pairs(grammar.check_field("выехал наряд", "summary")) == [("выехал", "Выехал", "syntax")]
    assert grammar.is_address_field("addressRefined") and grammar.is_address_field("address")
    assert not grammar.is_address_field("summary")


def test_grammar_check_is_fast_without_llm():
    import time

    text = "Сообщение пренято, бригада СМП направлена, ЕДДС и ЦУКС оповещены, заявитель Карпин ожидает у подъезда"
    grammar.check_field(text, "summary")
    grammar.check_field("ул. Зверенецкая, 22", "address")
    runs = []
    for _ in range(15):
        started = time.perf_counter()
        grammar.check_field(text, "summary")
        grammar.check_field("ул. Зверенецкая, 22", "address")
        runs.append(time.perf_counter() - started)
    assert sorted(runs)[len(runs) // 2] < 0.010
