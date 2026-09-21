"""T056: валидатор билетов — 6 критериев на 20 корректных + 20 дефектных билетах `data/labeled/tickets/`.

Порог приёмки (SC-005, как в eval_validator): корректные проходят ≥ 90 %, дефекты ловятся по ожидаемому
критерию ≥ 90 %; критерий `category` зависит от режима классификатора (артефакт LR / прототипы) — на нём
допускается «требует ручной проверки», остальные пять детерминированы. Без эмбеддера (FR-043) проверки не блокируют.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.config import get_settings
from ml.classify import ekp_group_classifier as classifier
from ml.generate import validator
from ml.nlp import dedup, embedder

TICKETS_DIR = Path(__file__).resolve().parents[2] / "data" / "labeled" / "tickets"
ACCEPTANCE = 0.9


@pytest.fixture(scope="module")
def cards() -> list[dict[str, Any]]:
    with (get_settings().seed_dir / "spec" / "mocks" / "cards.json").open(encoding="utf-8") as handle:
        return json.load(handle)["cards"]


@pytest.fixture(scope="module")
def labeled() -> list[dict[str, Any]]:
    docs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(TICKETS_DIR.glob("tk-*.json"))]
    assert len(docs) == 40
    return docs


def _bank(cards: list[dict[str, Any]], doc: dict[str, Any]) -> list[dict[str, Any]]:
    """Банк для дедупликации — без карточки-источника размеченного билета (иначе он дубль самого себя)."""
    return [c for c in cards if c["id"] != doc["sourceCardId"]]


def test_report_shape(cards, labeled):
    report = validator.validate(labeled[0]["ticket"], _bank(cards, labeled[0]))
    assert [c.id for c in report.checks] == list(validator.CHECK_IDS)
    contract = report.to_contract()
    assert set(contract) == {"version", "passed", "needsReview", "checks"}
    assert all({"id", "passed", "message", "needsReview", "available", "details"} <= set(c) for c in contract["checks"])
    assert validator.validate(labeled[0]["ticket"], _bank(cards, labeled[0])).to_contract() == contract  # детерминизм


def test_correct_tickets_pass(cards, labeled):
    correct = [d for d in labeled if d["kind"] == "correct"]
    reports = {d["id"]: validator.validate(d["ticket"], _bank(cards, d)) for d in correct}
    deterministic = [c for c in validator.CHECK_IDS if c != "category"]
    failures = {i: [c.id for c in r.checks if not c.passed and c.id in deterministic] for i, r in reports.items()}
    assert not any(failures.values()), failures
    category_ok = sum(r.check("category").passed for r in reports.values()) / len(reports)
    assert category_ok >= ACCEPTANCE, {i: r.check("category").message for i, r in reports.items() if not r.check("category").passed}
    assert sum(r.passed for r in reports.values()) / len(reports) >= ACCEPTANCE


def test_defective_tickets_are_caught_on_expected_criterion(cards, labeled):
    defective = [d for d in labeled if d["kind"] == "defective"]
    assert {d["defect"] for d in defective} == {"wrongCategory", "unknownStreet", "missingField", "duplicate", "typo", "inconsistent"}
    missed: dict[str, str] = {}
    for doc in defective:
        report = validator.validate(doc["ticket"], _bank(cards, doc))
        check = report.check(doc["expectedFailed"][0])
        if check.passed and not (check.id == "category" and check.needsReview):
            missed[doc["id"]] = f"{doc['defect']}: {check.message}"
        assert not report.passed or check.needsReview, doc["id"]
    assert len(missed) <= len(defective) * (1 - ACCEPTANCE), missed
    detected = [d for d in defective if d["defect"] != "wrongCategory"]
    for doc in detected:
        assert not validator.validate(doc["ticket"], _bank(cards, doc)).check(doc["expectedFailed"][0]).passed, doc["id"]


def test_duplicate_links_and_reverse_links_are_declared(cards):
    twin = next(c for c in cards if c.get("duplicateOf"))
    original = next(c for c in cards if c["id"] == twin["duplicateOf"])
    assert validator.check_duplicate(twin, cards).passed  # объявленный дубль
    assert validator.check_duplicate(original, cards).passed  # обратная связь c-047 → c-003
    lone = next(c for c in cards if not c.get("duplicateOf") and not any(o.get("duplicateOf") == c["id"] for o in cards))
    variation = {**lone, "id": "c-900", "baseCardId": lone["id"]}
    check = validator.check_duplicate(variation, cards)
    assert check.passed and check.details["declared"] == [lone["id"]]
    assert not validator.check_duplicate({**lone, "id": "c-902"}, cards).passed  # та же копия без объявленной связи
    undeclared = {**twin, "id": "c-901"}
    undeclared.pop("duplicateOf")
    assert not validator.check_duplicate(undeclared, cards).passed


def test_operator_mistake_trap_expects_category_mismatch(cards):
    gas = next(c for c in cards if c["group"].startswith("Запах газа в помещении"))
    trap = {**gas, "group": "пожар в жилом доме", "trap": "operatorMistake"}
    check = validator.check_category(trap)
    if check.available:
        assert check.passed and "Ловушка" in check.message
    plain = validator.check_category({**gas, "group": "Радиация"})
    assert not plain.passed or plain.needsReview


def test_address_policy():
    assert validator.check_address({"address": "Москва, ул. Дубининская, 12"}).passed
    lookalike = validator.check_address({"address": "Москва, ул. Зверенецкая, 22"})
    assert lookalike.passed and lookalike.needsReview and lookalike.details["kind"] == "lookalike"
    descriptive = validator.check_address({"address": "МКАД между 74 и 68 км"})
    assert descriptive.passed and descriptive.needsReview and descriptive.details["kind"] == "descriptive"
    assert validator.check_address({"address": "Тульская обл., г. Киреевск", "crossRegion": True}).details["kind"] == "crossRegion"
    unknown = validator.check_address({"address": "Москва, ул. Несуществующая, 9"})
    assert not unknown.passed and unknown.details["kind"] == "unknown"
    assert not validator.check_address({"address": ""}).passed


def test_consistency_rules():
    assert validator.check_consistency({"summary": "Дерутся, 5 пострадавших", "address": "Москва, ул. Тверская", "victims": {"count": 5}}).passed
    assert not validator.check_consistency({"summary": "Дерутся, 5 пострадавших", "address": "Москва, ул. Тверская"}).passed
    assert validator.check_consistency({"summary": "Горит поле, пострадавших нет", "address": "Москва, ул. Тверская"}).passed
    assert not validator.check_consistency({"summary": "Заблудилась, 03 не требуется", "address": "Москва, ул. Тверская"}).passed
    assert validator.check_consistency({"summary": "Заблудилась, 03 не требуется", "address": "Москва, ул. Тверская", "noAmbulance": True}).passed
    assert not validator.check_consistency({"summary": "Пожар", "address": "Тульская обл., г. Киреевск"}).passed
    assert validator.check_consistency({"summary": "Пожар", "address": "Тульская обл., г. Киреевск", "crossRegion": True}).passed
    assert not validator.check_consistency({"summary": "Пожар", "address": "Москва, ул. Тверская", "crossRegion": True}).passed


def test_required_fields_and_unknown_group():
    check = validator.check_required_fields({"group": "Драка", "summary": "", "address": "x", "caller": {"name": "А", "phone": "", "status": "очевидец"}, "expectedServices": []}, ("Драка",))
    assert not check.passed and check.details["missing"] == ["summary", "caller.phone", "expectedServices"]
    assert not validator.check_required_fields({"group": "Нет такой", "summary": "x", "address": "x", "caller": {"name": "А", "phone": "1", "status": "s"}, "expectedServices": ["102"]}, ("Драка",)).passed


def test_without_embeddings_checks_do_not_block(monkeypatch, cards, labeled):
    monkeypatch.setattr(embedder, "encode", lambda texts: None)
    monkeypatch.setattr(embedder, "available", lambda: False)
    monkeypatch.setattr(dedup, "_load_e5", lambda: None)
    classifier.reset()
    try:
        doc = labeled[0]
        report = validator.validate(doc["ticket"], _bank(cards, doc))
        category, duplicate = report.check("category"), report.check("duplicate")
        assert category.passed and category.needsReview and not category.available
        assert duplicate.passed and duplicate.needsReview and not duplicate.available
        assert report.needsReview
    finally:
        classifier.reset()
