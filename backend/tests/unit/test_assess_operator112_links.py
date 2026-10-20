"""Спека 009, T055: компонент `links` режима 112 (007 FR-030, research R9).

Повторный звонок (`repeatOf`) должен быть привязан к своей карточке, и она должна быть главной. Потеря за связь
равна потере за одну пропущенную службу. Без `repeatOf` и без привязок компонента нет, баллы как раньше (SC-004).
"""

from __future__ import annotations

import copy
from typing import Any

import pytest

from app.config import get_settings
from ml.assess import adapter
from ml.assess import operator112 as assessor
from ml.assess.types import AssessOptions
from ml.classify.ekp_group_classifier import classifier_entries
from tests.unit.test_assess_operator112 import GAS_DRAFT, GAS_TICKET, attempt_with

REPEAT_ID = "card-881412"  # карточка фона журнала, к которой привязывается повторный звонок
OTHER_ID = "card-881500"  # чужое происшествие
REPEAT_TICKET: dict[str, Any] = {**GAS_TICKET, "repeatOf": REPEAT_ID}


@pytest.fixture(scope="module")
def reference() -> dict[str, Any]:
    import json

    with (get_settings().seed_dir / "spec" / "000-фронт" / "mocks" / "reference.json").open(encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def entries() -> list[dict[str, Any]]:
    return list(classifier_entries())


def with_links(draft: dict[str, Any], *links: dict[str, Any]) -> dict[str, Any]:
    return {**copy.deepcopy(draft), "links": [dict(item) for item in links]}


def assess(draft: dict[str, Any], ticket: dict[str, Any], entries: list[dict[str, Any]], reference: dict[str, Any]):
    return assessor.assess(attempt_with(draft), ticket, entries, reference, options=AssessOptions())


def link_codes(result) -> set[str]:
    return {e.rule_id for e in result.components["links"].errors} if "links" in result.components else set()


def test_correct_link_has_no_loss(entries, reference):
    result = assess(with_links(GAS_DRAFT, {"cardId": REPEAT_ID, "primary": True}), REPEAT_TICKET, entries, reference)
    assert "links" in result.components and result.components["links"].score == 1.0
    assert link_codes(result) == set()
    evaluation = adapter.to_evaluation(result)
    assert evaluation["errors"] == [] and evaluation["correctnessScore"] == 100


def test_missing_link_costs_one_missing_service(entries, reference):
    """Без привязки в билете с повторным звонком — потеря с весом пропущенной службы (одна строка с правилом)."""
    correct = assess(with_links(GAS_DRAFT, {"cardId": REPEAT_ID, "primary": True}), REPEAT_TICKET, entries, reference)
    missing = assess(GAS_DRAFT, REPEAT_TICKET, entries, reference)
    assert link_codes(missing) == {"op-l1"} and missing.components["links"].score == pytest.approx(0.75)
    error = missing.components["links"].errors[0]
    assert "\n" not in error.message and " — " in error.message and "FR-030" in error.message
    assert error.type == "missingLink" and error.severity == "major"
    assert missing.total < correct.total
    # Эквивалент потери за пропущенную службу: та же карточка без одной службы в списке оповещения (N = 2).
    draft = with_links(GAS_DRAFT, {"cardId": REPEAT_ID, "primary": True})
    draft["notificationList"] = [item for item in draft["notificationList"] if item["serviceId"] != "svc-104"]
    service = assess(draft, REPEAT_TICKET, entries, reference)
    assert "missingService" in {e.type for e in service.errors}
    assert abs((correct.total - missing.total) - (correct.total - service.total)) < 1e-9


def test_wrong_card_and_wrong_primary_cost_the_same_as_missing(entries, reference):
    missing = assess(GAS_DRAFT, REPEAT_TICKET, entries, reference)
    wrong_card = assess(with_links(GAS_DRAFT, {"cardId": OTHER_ID, "primary": True}), REPEAT_TICKET, entries, reference)
    wrong_primary = assess(with_links(GAS_DRAFT, {"cardId": REPEAT_ID, "primary": False}), REPEAT_TICKET, entries, reference)
    assert link_codes(wrong_card) == {"op-l2"} and link_codes(wrong_primary) == {"op-l3"}
    assert wrong_card.components["links"].score == pytest.approx(0.75) and wrong_primary.components["links"].score == pytest.approx(0.75)
    assert abs(wrong_card.total - missing.total) < 1e-9 and abs(wrong_primary.total - missing.total) < 1e-9
    assert "Привязана не та карточка" in wrong_card.components["links"].errors[0].message
    assert "Неверная главная карточка" in wrong_primary.components["links"].errors[0].message


def test_extra_link_without_repeat_costs_the_same(entries, reference):
    """Билет без `repeatOf` и лишняя привязка — та же потеря, что и непривязанная карточка с повторным звонком."""
    extra = assess(with_links(GAS_DRAFT, {"cardId": REPEAT_ID, "primary": True}), GAS_TICKET, entries, reference)
    missing = assess(GAS_DRAFT, REPEAT_TICKET, entries, reference)
    assert link_codes(extra) == {"op-l4"} and extra.components["links"].score == pytest.approx(0.75)
    assert extra.components["links"].errors[0].type == "extraLink"
    assert abs(extra.total - missing.total) < 1e-9


def test_without_repeat_and_links_component_is_absent(entries, reference):
    """Без `repeatOf` и без связей компонента нет: баллы и веса как до появления `links` (SC-004)."""
    result = assess(GAS_DRAFT, GAS_TICKET, entries, reference)
    assert "links" not in result.components and "links" not in result.weights
    evaluation = adapter.to_evaluation(result)
    assert "links" not in evaluation["components"] and evaluation["errors"] == []
    assert evaluation["totalScore"] >= 90
    assert adapter.to_evaluation(assess(GAS_DRAFT, GAS_TICKET, entries, reference))["totalScore"] == evaluation["totalScore"]


def test_empty_links_list_without_repeat_is_absent(entries, reference):
    result = assess(with_links(GAS_DRAFT), GAS_TICKET, entries, reference)
    assert "links" not in result.components
