"""Спека 009, T044/T045: адрес режима 112 без улицы (субъект вне Москвы, research R4) и `what` из первой вкладки.

Адрес Московской области не имеет улицы в справочнике, поэтому сверяется по словам с `ticket.address`.
Адрес Москвы из справочника идёт прежним путём: результат не меняется. Старые снимки без вкладок читаются как раньше.
"""

from __future__ import annotations

import copy
from typing import Any

from ml.assess import operator112 as assessor
from ml.assess.components.address import SCORES as ADDRESS_SCORES

REGION_TICKET: dict[str, Any] = {
    "id": "t-region",
    "ticketNo": 910,
    "situationNo": 10,
    "group": "Пожар в жилом доме",
    "summary": "Горит балкон на третьем этаже жилого дома",
    "address": "Московская область, Химки, Юбилейный проспект, 12, жилой дом",
    "caller": {"name": "Смирнова Ольга Петровна", "phone": "916-555-01-02", "status": "очевидец"},
    "expectedServices": ["101", "103"],
    "expectedTags": ["Жилой дом"],
}
REGION_BLOCK: dict[str, Any] = {
    "country": "Россия",
    "subject": "Московская область",
    "locality": "Химки",
    "object": "Жилой дом",
    "descriptive": "у дома 12, подъезд 2",
    "formal": "",
    "street": "",
    "source": "manual",
}
MOSCOW_TICKET: dict[str, Any] = {**REGION_TICKET, "address": "Москва, ул. Дубининская, 20, кв. 5"}
MOSCOW_BLOCK: dict[str, Any] = {
    "formal": "Россия, Москва, Дубининская улица, 20, кв. 5",
    "street": "ул. Дубининская",
    "house": "20",
    "okrug": "Южный",
    "raion": "Даниловский",
    "source": "directory",
}


def draft_with(block: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {"address": copy.deepcopy(block), **extra}


def codes(component: assessor.ComponentResult) -> set[str]:
    return {e.rule_id for e in component.errors}


def test_region_address_without_street_is_counted():
    """Адрес Московской области без улицы: субъект, населённый пункт, объект и описание совпадают с билетом → засчитан."""
    result = assessor.address(draft_with(REGION_BLOCK), REGION_TICKET)
    assert result.errors == [], result.errors
    assert result.score == ADDRESS_SCORES["exact"] and result.applicable
    assert result.details["kind"] == "words" and result.details["coverage"] >= 0.5
    assert result.details["entered"] == "Московская область Химки Жилой дом у дома 12, подъезд 2"


def test_region_address_with_other_place_is_mismatch():
    """Парный отказ: другой населённый пункт и улица не совпадают с билетом → адрес не засчитан (addressMismatch)."""
    wrong = {**REGION_BLOCK, "locality": "Королёв", "object": "", "descriptive": "Ленинградская улица, 9"}
    result = assessor.address(draft_with(wrong), REGION_TICKET)
    assert codes(result) == {"a3"} and result.score == 0.0
    assert "Адрес не совпадает с билетом" in result.errors[0].message and "Королёв" in result.errors[0].message


def test_empty_region_address_is_still_missing():
    """Без улицы, объекта и описания адрес не заполнен — как раньше (op-a5), даже при умолчаниях субъекта и населённого пункта."""
    empty = {**REGION_BLOCK, "object": "", "descriptive": ""}
    result = assessor.address(draft_with(empty), REGION_TICKET)
    assert codes(result) == {"op-a5"} and result.score == 0.0


def test_moscow_directory_address_keeps_previous_result():
    """Московский адрес из справочника: результат тот же, что до изменений, и поля субъекта на него не влияют."""
    plain = assessor.address(draft_with(MOSCOW_BLOCK), MOSCOW_TICKET)
    assert plain.errors == [] and plain.score == ADDRESS_SCORES["exact"] and plain.details["kind"] == "exact"
    with_region_fields = assessor.address(draft_with({**MOSCOW_BLOCK, "subject": "Москва", "locality": "Москва", "object": "Жилой дом", "descriptive": "у дома 20"}), MOSCOW_TICKET)
    assert with_region_fields.score == plain.score and with_region_fields.errors == plain.errors
    assert with_region_fields.details["kind"] == "exact"


def test_moscow_lookalike_street_is_still_checked_by_directory():
    """Похожая улица справочника по-прежнему даёт addressLookalike, а не сверку по словам."""
    lookalike = {**MOSCOW_BLOCK, "formal": "Россия, Москва, Дубнинская улица, 20", "street": "ул. Дубнинская", "source": "manual"}
    result = assessor.address(draft_with({**lookalike, "object": "Жилой дом"}), MOSCOW_TICKET)
    assert codes(result) == {"a1"} and result.score == ADDRESS_SCORES["lookalike"]
    assert result.details["kind"] == "lookalike"


def test_what_is_read_from_first_incident_when_empty():
    """`what` пуст → читается `incidents[0]` (первая вкладка); непустой `what` не заменяется."""
    tab = {"pollAnswers": "Пожар, горит балкон", "signs": ["Жилой дом"], "finalType": "пожар: балкон", "classifierCode": "1050201", "casualties": {"injured": False}}
    attempt = {"cardSnapshot": {"what": {"pollAnswers": "", "signs": [], "casualties": {"injured": False}}, "incidents": [tab]}}
    draft = assessor.draft_of(attempt)
    assert draft["what"] == tab
    assert assessor.draft_signs(draft) == ["Жилой дом"]
    filled = {"cardSnapshot": {"what": {"finalType": "ДТП"}, "incidents": [tab]}}
    assert assessor.draft_of(filled)["what"] == {"finalType": "ДТП"}


def test_legacy_snapshot_without_incidents_is_unchanged():
    """Снимок старого формата (без `incidents`) читается как прежде: `what` остаётся как есть."""
    legacy_what = {"pollAnswers": "Пожар", "signs": ["Дом"], "finalType": "", "classifierCode": "", "casualties": {"injured": False}}
    draft = assessor.draft_of({"cardSnapshot": {"what": legacy_what, "address": MOSCOW_BLOCK}})
    assert draft["what"] == legacy_what and "incidents" not in draft
    assert assessor.draft_of({"cardSnapshot": {"what": {}}})["what"] == {}
