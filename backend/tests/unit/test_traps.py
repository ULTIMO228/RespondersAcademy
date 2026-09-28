"""Phase 15: source-derived traps and an explainable missed-trap rule."""

from ml.assess import rules
from ml.assess.etalon import resolve_card_etalon
from ml.generate.scenario_generator import build_trap_from_source

BASE = {"id": "c-100", "ticketNo": 100, "situationNo": 1, "group": "Водоснабжение",
        "summary": "Прорыв трубы", "address": "Дубнинская улица, 2", "caller": {"name": "Иванов"},
        "expectedServices": ["Мосводоканал"], "expectedTags": []}


def test_all_traps_mutate_source_and_require_detection():
    for trap in ("wrongType", "addressTypo", "outOfZone", "duplicate"):
        ticket, etalon = build_trap_from_source(BASE, trap, "c-101")
        assert ticket["id"] == "c-101" and ticket["baseCardId"] == BASE["id"]
        assert ticket["trap"] == trap
        expected = resolve_card_etalon(etalon, "c-101")
        assert expected.expected_decision == "notAccepted"
        assert expected.trap == trap and expected.expected_comment_phrases
    assert build_trap_from_source(BASE, "wrongType", "c-101")[0]["group"] != BASE["group"]
    assert build_trap_from_source(BASE, "addressTypo", "c-101")[0]["address"] != BASE["address"]
    assert build_trap_from_source(BASE, "outOfZone", "c-101")[0]["address"] != BASE["address"]
    assert build_trap_from_source(BASE, "duplicate", "c-101")[0]["duplicateOf"] == BASE["id"]


def test_trap_rule_has_a_source():
    error = rules.TRAP_NOT_DETECTED.error(trap="дубль", actual="Принята", expected="Не принята", hint="")
    assert error.type == "trapNotDetected"
    assert "памятка" in error.message and "эталон" in error.message
