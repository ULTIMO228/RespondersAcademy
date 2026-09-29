"""T056: шаблонный генератор вариаций — категория, адрес из справочника, детерминизм, ловушки, LLM-фолбэк."""

from __future__ import annotations

import json
from typing import Any

import pytest

from app.config import get_settings
from ml.generate import llm, validator
from ml.generate import scenario_generator as gen
from ml.nlp import address as address_nlp

CATEGORY = "пожар в жилом доме"


def _read(relative: str) -> Any:
    with (get_settings().seed_dir / relative).open(encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def cards() -> list[dict[str, Any]]:
    return _read("spec/000-фронт/mocks/cards.json")["cards"]


@pytest.fixture(scope="module")
def addresses() -> list[dict[str, Any]]:
    return _read("mocks/local/addresses.json")["addresses"]


def test_template_variations_keep_category_and_use_directory_addresses(cards, addresses):
    produced = gen.generate_template(CATEGORY, cards, addresses)
    assert len(produced) == 3
    titles = [item["scenario"]["title"] for item in produced]
    assert len(set(titles)) == 3 and all(CATEGORY in t and "(ИИ)" in t for t in titles)
    known_streets = {a["street"] for a in addresses if a.get("street")}
    for item in produced:
        scenario, ticket = item["scenario"], item["cards"][0]
        assert ticket["group"] == CATEGORY
        assert ticket["baseCardId"].startswith("c-") and ticket["baseCardId"] != ""
        assert any(street in ticket["address"] for street in known_streets)
        assert address_nlp.match(ticket["address"]).exact
        assert "(место:" in ticket["summary"]
        assert scenario["source"] == "generated" and scenario["validation"] == {"status": "pending"}
        assert scenario["cardIds"] == ["new:0", ticket["baseCardId"]] and scenario["etalon"]["expectedActions"][0] == "openCard:new:0"
        assert f"openCard:{ticket['baseCardId']}" in scenario["etalon"]["expectedActions"]  # исходная карточка — отдельный сегмент эталона
        assert scenario["level"] == "advanced" and scenario["difficulty"] in (3, 4, 5)
        assert scenario["timeNorms"] == {"primaryReactionSec": 30, "fullProcessingSec": 180}
        assert scenario["hints"]["texts"] and scenario["successCriteria"]["maxGrammarErrors"] == 1
        assert scenario["generation"]["provider"] == "template"


def test_template_is_deterministic_and_unknown_category_is_empty(cards, addresses):
    first = gen.generate_template(CATEGORY, cards, addresses)
    second = gen.generate_template(CATEGORY, cards, addresses)
    assert first == second
    # Категория из справочника может не иметь исходной карточки: для неё генератор
    # использует безопасную базу-заглушку. Случайная неизвестная категория по-прежнему отклоняется.
    assert len(gen.generate_template("Радиация", cards, addresses)) == 3
    assert gen.generate_template("__неизвестная категория__", cards, addresses) == []
    assert len(gen.generate_template(CATEGORY, cards, addresses, count=2)) == 2


def test_known_category_without_source_has_complete_generated_ticket(cards, addresses):
    produced = gen.generate_template("Притон", cards, addresses, count=1, traps=[None])
    assert len(produced) == 1
    ticket = produced[0]["cards"][0]
    scenario = produced[0]["scenario"]
    assert "baseCardId" not in ticket
    assert scenario["cardIds"] == ["new:0"]
    assert scenario["generation"]["baseCardId"] is None
    assert validator.check_required_fields(ticket, tuple(gen._reference()["incidentGroups"])).passed
    assert "call:102" in scenario["etalon"]["expectedActions"]


def test_default_traps_and_etalon_from_expected_services(cards, addresses):
    produced = gen.generate_template(CATEGORY, cards, addresses)
    traps = [item["cards"][0].get("trap") for item in produced]
    assert traps == [None, "foreignTerritory", "operatorMistake"]
    clean = produced[0]["scenario"]["etalon"]
    assert clean["expectedActions"][:4] == ["openCard:new:0", "status:accepted", "call:101", "status:workDone"]
    assert clean["expectedActions"][4].startswith("openCard:c-")  # сегмент исходной карточки группы
    assert "расчёт направлен" in clean["keyPhrases"] and produced[0]["scenario"]["callTarget"] == "101"
    foreign = produced[1]["scenario"]["etalon"]
    assert foreign["expectedActions"][:2] == ["openCard:new:0", "status:notAccepted"] and foreign["expectedActions"][2].startswith("openCard:c-")
    per_card = foreign["cards"]["new:0"]
    assert per_card["expectedDecision"] == "notAccepted" and per_card["trap"] == "foreignTerritory"
    assert per_card["expectedTransferTo"].startswith("ОДС района ")
    mistake = produced[2]["cards"][0]
    assert mistake["group"] == CATEGORY and mistake["fabulaCardId"] != mistake["baseCardId"]
    fabula = next(c for c in cards if c["id"] == mistake["fabulaCardId"])
    assert fabula["group"] != CATEGORY and fabula["summary"] in mistake["summary"]
    assert produced[2]["scenario"]["etalon"]["cards"]["new:0"]["expectedTransferTo"] == gen.service_title(gen.service_numbers(fabula["expectedServices"])[0])


def test_explicit_traps_duplicate_and_cross_region(cards, addresses):
    produced = gen.generate_template(CATEGORY, cards, addresses, count=2, traps=["duplicate", "crossRegion"])
    duplicate, region = produced[0]["cards"][0], produced[1]["cards"][0]
    base = next(c for c in cards if c["id"] == duplicate["baseCardId"])
    assert duplicate["duplicateOf"] == base["id"] and duplicate["summary"] == base["summary"] and duplicate["address"] == base["address"]
    assert produced[0]["scenario"]["etalon"]["cards"]["new:0"]["expectedTransferTo"] == f"карточка {base['id']}"
    assert region["crossRegion"] is True and region["trap"] == "crossRegion"
    assert "transfer:region" in produced[1]["scenario"]["etalon"]["expectedActions"]


def test_resolve_placeholders_rewrites_ids(cards, addresses):
    scenario = gen.generate_template(CATEGORY, cards, addresses, count=1, traps=["foreignTerritory"])[0]["scenario"]
    resolved = gen.resolve_placeholders(scenario, ["c-097"])
    assert resolved["cardIds"][0] == "c-097" and len(resolved["cardIds"]) == 2
    assert resolved["etalon"]["expectedActions"][0] == "openCard:c-097"
    assert list(resolved["etalon"]["cards"]) == ["c-097"]
    assert scenario["cardIds"][0] == "new:0"  # исходный документ не изменён


def test_service_helpers():
    assert gen.service_numbers(["102 (главная)", "103", "МГПСС", "102"]) == ["102", "103"]
    assert gen.service_numbers(["103", "101 (главная)"]) == ["101", "103"]
    assert gen.service_numbers(["перевод вызова в ЦУС Тульской обл."]) == []
    assert gen.format_address({"street": "Чертановская улица", "house": "58", "building": "2", "entrance": "2"}) == "Москва, Чертановская улица, 58 корп. 2, под. 2"


class _DeadClient(llm.OllamaClient):
    def healthy(self) -> bool:
        return False


class _FlakyClient(llm.OllamaClient):
    """Первый ответ — мусор, второй — корректный JSON по схеме."""

    def __init__(self) -> None:
        super().__init__("http://ollama.test", "test-model")
        self.calls = 0

    def healthy(self) -> bool:
        return True

    def chat_json(self, system, user, schema, *, seed=None):
        self.calls += 1
        if self.calls == 1:
            return {"tickets": "not-a-list"}
        return {"tickets": [{"summary": f"Задымление в квартире {i}, запах гари", "addressIndex": i, "callerName": "Тестов Тест", "callerStatus": "очевидец", "victimsCount": i} for i in range(3)]}


def test_llm_path_falls_back_and_retries(cards, addresses):
    dead = gen.generate(CATEGORY, cards, addresses, client=_DeadClient("http://ollama.test", "m"))
    assert dead == gen.generate_template(CATEGORY, cards, addresses)
    flaky = _FlakyClient()
    produced = gen.generate(CATEGORY, cards, addresses, client=flaky)
    assert flaky.calls == 2 and len(produced) == 3
    assert all(item["scenario"]["generation"]["provider"] == "ollama:test-model" for item in produced)
    assert all(item["cards"][0]["group"] == CATEGORY and "(место:" in item["cards"][0]["summary"] for item in produced)
    assert produced[1]["cards"][0]["victims"] == {"count": 1, "note": ""} and "victims" not in produced[0]["cards"][0]
    assert produced[0]["scenario"]["title"] == gen.generate_template(CATEGORY, cards, addresses)[0]["scenario"]["title"]
