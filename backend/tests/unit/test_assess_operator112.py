"""T077: оценщик режима A (специалист-112) на пяти карточках из spec 002, US2 (Independent Test).

Эталонная; неверный тип («Дом → газовая плита» при «Запах газа в квартире»); потерян факт «дом газифицирован»;
опечатка улицы («Дубнинская» vs «Дубининская»); не выставлен «Пострадавшие». Результат воспроизводим.
"""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest

from app.config import get_settings
from ml.assess import adapter
from ml.assess import operator112 as assessor
from ml.assess.types import AssessOptions
from ml.classify.ekp_group_classifier import classifier_entries

GAS_TICKET: dict[str, Any] = {
    "id": "t-gas",
    "ticketNo": 901,
    "situationNo": 1,
    "group": "Запах газа в помещении (в доме, в квартире)",
    "summary": "Запах газа в квартире, дом газифицирован, пострадавших нет",
    "address": "Москва, ул. Дубининская, 20, кв. 5",
    "caller": {"name": "Петрова Анна Ивановна", "phone": "916-123-45-67", "status": "очевидец"},
    "expectedServices": ["104 (главная)", "101"],
    "expectedTags": ["Квартира помещение"],
}
DTP_TICKET: dict[str, Any] = {
    "id": "t-dtp",
    "ticketNo": 902,
    "situationNo": 2,
    "group": "Дорожно-транспортные происшествия с пострадавшими",
    "summary": "Столкновение двух автомобилей, один человек зажат в машине, пострадавший в сознании",
    "address": "Москва, Чертановская улица, 58",
    "caller": {"name": "Сидоров Иван Сергеевич", "phone": "916-126-34-71", "status": "очевидец"},
    "victims": {"count": 1, "note": "зажат в машине, в сознании"},
    "expectedServices": ["103 (главная)", "101 (деблокировка)", "102"],
    "expectedTags": ["Столкновение", "Зажат"],
}

GAS_DRAFT: dict[str, Any] = {
    "applicant": {"name": "Петрова", "status": "очевидец"},
    "phones": {"aon": "+7 (916) 123-45-67", "provided": "+7 (916) 123-45-67", "onSite": ""},
    "address": {"formal": "Россия, Москва, Дубининская улица, 20, кв. 5", "street": "ул. Дубининская", "house": "20", "source": "directory", "descriptive": ""},
    "what": {"pollAnswers": "Запах газа в квартире", "signs": ["Запах газа в помещении", "Квартира помещение"], "finalType": "Запах бытового газа в квартире", "classifierCode": "13020201", "casualties": {"injured": False, "ambulanceRefused": False, "blocked": False}},
    "description": "Со слов заявителя: в квартире сильный запах газа, дом газифицирован, пострадавших нет.",
    "emergency": {"chs": False, "chp": False},
    "notificationList": [{"serviceId": "svc-104", "addedBy": "auto"}, {"serviceId": "svc-101", "addedBy": "auto"}],
}
DTP_DRAFT: dict[str, Any] = {
    "applicant": {"name": "Сидоров", "status": "очевидец"},
    "phones": {"aon": "+7 (916) 126-34-71", "provided": "+7 (916) 126-34-71", "onSite": ""},
    "address": {"formal": "Россия, Москва, Чертановская улица, 58", "street": "Чертановская улица", "house": "58", "source": "directory"},
    "what": {"pollAnswers": "ДТП, столкновение", "signs": ["Столкновение", "Зажат"], "finalType": "", "classifierCode": "", "casualties": {"injured": True, "ambulanceRefused": False, "blocked": False}},
    "description": "Столкнулись два автомобиля, один человек зажат в машине, в сознании.",
    "emergency": {"chs": False, "chp": False},
    "notificationList": [{"serviceId": "svc-103", "addedBy": "auto"}, {"serviceId": "svc-101", "addedBy": "auto"}, {"serviceId": "svc-102", "addedBy": "auto"}],
}


def attempt_with(draft: dict[str, Any], *, answer_sec: int = 5, submit_sec: int = 120, replays: int = 1) -> dict[str, Any]:
    return {
        "id": "att-t",
        "openedAt": "2026-09-22T10:00:00+03:00",
        "answeredAt": f"2026-09-22T10:00:{answer_sec:02d}+03:00",
        "completedAt": f"2026-09-22T10:0{(answer_sec + submit_sec) // 60}:{(answer_sec + submit_sec) % 60:02d}+03:00",
        "replays": replays,
        "hintsShown": 0,
        "events": [],
        "cardSnapshot": draft,
    }


@pytest.fixture(scope="module")
def reference() -> dict[str, Any]:
    with (get_settings().seed_dir / "spec" / "000-фронт" / "mocks" / "reference.json").open(encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def entries() -> list[dict[str, Any]]:
    return list(classifier_entries())


def run(draft: dict[str, Any], ticket: dict[str, Any], entries: list[dict[str, Any]], reference: dict[str, Any], **kw: Any) -> tuple[Any, dict[str, Any]]:
    result = assessor.assess(attempt_with(draft, **kw), ticket, entries, reference, options=AssessOptions())
    return result, adapter.to_evaluation(result)


def types_of(evaluation: dict[str, Any]) -> set[str]:
    return {e["type"] for e in evaluation["errors"]}


def test_etalon_card_has_no_errors(entries, reference):
    result, evaluation = run(GAS_DRAFT, GAS_TICKET, entries, reference)
    assert evaluation["errors"] == [], evaluation["errors"]
    assert evaluation["totalScore"] >= 90 and evaluation["mode"] == "operator112" and evaluation["assessorVersion"].startswith("operator112-")
    assert evaluation["aiComment"].startswith("ИИ-оценка:")
    assert all(item["ok"] for item in evaluation["fieldDiff"]), evaluation["fieldDiff"]
    assert {item["field"] for item in evaluation["fieldDiff"]} >= {"applicant.name", "phones.provided", "address", "what.finalType", "what.signs", "description", "notificationList"}
    assert result.components["final_type"].details["classifierCode"] == "13020201"
    # Воспроизводимость (принцип III).
    assert adapter.to_evaluation(assessor.assess(attempt_with(GAS_DRAFT), GAS_TICKET, entries, reference))["totalScore"] == evaluation["totalScore"]


def test_wrong_final_type_lists_missing_services(entries, reference):
    draft = copy.deepcopy(GAS_DRAFT)
    draft["what"].update({"signs": ["Дом", "газовая плита"], "finalType": "пожар: газовая плита", "classifierCode": "1050401"})
    draft["notificationList"] = [{"serviceId": "svc-101", "addedBy": "auto"}]
    _, evaluation = run(draft, GAS_TICKET, entries, reference)
    assert "wrongFinalType" in types_of(evaluation)
    error = next(e for e in evaluation["errors"] if e["type"] == "wrongFinalType")
    assert "Служба 104" in error["message"] and "памятка" in error["message"] and error["severity"] == "critical"
    assert evaluation["totalScore"] <= 50
    assert next(i for i in evaluation["fieldDiff"] if i["field"] == "what.finalType")["ok"] is False


def test_lost_fact_house_gasified(entries, reference):
    draft = copy.deepcopy(GAS_DRAFT)
    draft["description"] = "Со слов заявителя: в квартире сильный запах газа, пострадавших нет."
    draft["what"]["pollAnswers"] = "Запах газа"
    _, evaluation = run(draft, GAS_TICKET, entries, reference)
    lost = [e for e in evaluation["errors"] if e["type"] == "lostFact"]
    assert lost and any("газифицирован" in e["message"] for e in lost), evaluation["errors"]
    assert types_of(evaluation) == {"lostFact"}
    # «в доме газ» засчитывается как факт «дом газифицирован» (сравнение по смыслу).
    draft["description"] = "Со слов заявителя: в квартире сильный запах газа, в доме газ, пострадавших нет."
    _, ok = run(draft, GAS_TICKET, entries, reference)
    assert "lostFact" not in types_of(ok), ok["errors"]


def test_address_lookalike_is_separate_from_grammar(entries, reference):
    draft = copy.deepcopy(GAS_DRAFT)
    draft["address"].update({"formal": "Россия, Москва, Дубнинская улица, 20", "street": "ул. Дубнинская", "source": "manual"})
    _, evaluation = run(draft, GAS_TICKET, entries, reference)
    assert "addressLookalike" in types_of(evaluation)
    assert evaluation["grammarErrors"] == [] and "grammarLimitExceeded" not in types_of(evaluation)
    assert next(i for i in evaluation["fieldDiff"] if i["field"] == "address")["ok"] is False


def test_missing_victims_flag(entries, reference):
    draft = copy.deepcopy(DTP_DRAFT)
    draft["what"]["casualties"]["injured"] = False
    _, evaluation = run(draft, DTP_TICKET, entries, reference)
    missing = [e for e in evaluation["errors"] if e["type"] == "missingSign"]
    assert missing and any("Пострадавшие" in e["message"] for e in missing), evaluation["errors"]
    assert next(i for i in evaluation["fieldDiff"] if i["field"] == "what.casualties.injured") == {"field": "what.casualties.injured", "entered": False, "expected": True, "ok": False}
    _, clean = run(DTP_DRAFT, DTP_TICKET, entries, reference)
    assert "missingSign" not in types_of(clean), clean["errors"]


def test_answer_timeout_and_activity_are_informational(entries, reference):
    result, evaluation = run(GAS_DRAFT, GAS_TICKET, entries, reference, answer_sec=45, replays=3)
    assert "answerTimeout" in types_of(evaluation) and evaluation["timeScore"] < 100
    assert result.components["activity"].applicable is False and result.components["activity"].details["replays"] == 3
    assert any("повторно" in w for w in evaluation["warnings"])
    unanswered = assessor.assess({**attempt_with(GAS_DRAFT), "answeredAt": None, "completedAt": None}, GAS_TICKET, entries, reference)
    assert {e.rule_id for e in unanswered.components["answer_timing"].errors} == {"op-t0", "op-t3"}


def test_every_rule_has_source(entries, reference):
    from ml.assess import rules

    for rule in rules.RULES.values():
        if rule.id.startswith("op-"):
            assert rule.source and rule.text and rule.severity in ("critical", "major", "minor")
