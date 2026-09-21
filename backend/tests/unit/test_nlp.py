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
