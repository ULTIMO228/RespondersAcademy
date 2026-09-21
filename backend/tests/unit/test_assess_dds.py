"""T036: пять размеченных попыток режима B (spec US2 Independent Test) → ожидаемые типы ошибок и диапазоны
баллов; детерминизм при повторе. Данные — из размеченной выборки backend/data/labeled/attempts."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config import get_settings
from ml.assess import adapter, engine

LABELED = Path(__file__).resolve().parents[2] / "data" / "labeled" / "attempts"


def load(name: str) -> dict:
    path = sorted(LABELED.glob(f"*-{name}.json"))
    assert path, f"нет размеченной попытки «{name}»"
    return json.loads(path[0].read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def reference() -> dict:
    return json.loads((get_settings().seed_dir / "spec" / "mocks" / "reference.json").read_text(encoding="utf-8"))


def evaluate(doc: dict, reference: dict) -> dict:
    result = engine.assess(doc["attempt"], doc["scenario"], {doc["card"]["id"]: doc["card"]}, reference, session=doc.get("session"))
    return adapter.to_evaluation(result)


def types(evaluation: dict) -> set[str]:
    return {e["type"] for e in evaluation["errors"]}


def test_etalon_attempt_scores_high(reference):
    evaluation = evaluate(load("etalon"), reference)
    assert evaluation["totalScore"] >= 90
    assert types(evaluation) == set()
    assert evaluation["aiComment"].startswith("ИИ-оценка:")
    assert evaluation["assessorVersion"] == engine.ASSESSOR_VERSION
    assert all(" — " in e["message"] for e in evaluation["errors"])


def test_late_attempt_flags_timing(reference):
    evaluation = evaluate(load("late"), reference)
    assert "timeReactionExceeded" in types(evaluation)
    assert evaluation["timeScore"] < 100
    assert 60 <= evaluation["totalScore"] < 100


def test_not_accepted_without_transfer_is_incomplete_comment(reference):
    evaluation = evaluate(load("trap-incompleteComment"), reference)
    found = types(evaluation)
    assert "incompleteComment" in found
    assert "wrongDecision" not in found and "missingComment" not in found
    message = next(e["message"] for e in evaluation["errors"] if e["type"] == "incompleteComment")
    assert "нарушение №5" in message and "кому передана информация" in message
    assert 60 <= evaluation["totalScore"] < 100
    # Полный комментарий «территория …, передано в …» засчитывается без побуквенного совпадения.
    correct = evaluate(load("trap-correct"), reference)
    assert "incompleteComment" not in types(correct) and correct["totalScore"] >= 85


def test_missed_trap_is_wrong_decision_capped(reference):
    evaluation = evaluate(load("trap-missed"), reference)
    assert "wrongDecision" in types(evaluation)
    message = next(e["message"] for e in evaluation["errors"] if e["type"] == "wrongDecision")
    assert "ожидалось «Не принята»" in message and "передано в" in message
    assert evaluation["totalScore"] <= 50


def test_refused_profile_without_comment(reference):
    evaluation = evaluate(load("refusedProfile-noComment"), reference)
    found = types(evaluation)
    assert {"refusedProfile", "missingComment"} <= found
    assert any("нарушение №3" in e["message"] for e in evaluation["errors"])
    assert any("нарушение №4" in e["message"] for e in evaluation["errors"])
    assert evaluation["totalScore"] <= 50


def test_address_lookalike_separate_from_grammar(reference):
    evaluation = evaluate(load("address-lookalike"), reference)
    assert "addressLookalike" in types(evaluation)
    assert all(e["field"] != "address" or e["type"] != "spelling" for e in evaluation["grammarErrors"])
    assert evaluation["grammarScore"] < 100
    assert "addressTypo" in types(evaluate(load("address-typo"), reference))
    assert "addressLookalike" not in types(evaluate(load("address-exact"), reference))


def test_guessing_is_warning_only(reference):
    doc = load("etalon")
    fast = json.loads(json.dumps(doc))
    fast["attempt"]["statuses"][0]["at"] = fast["attempt"]["openedAt"]
    baseline = evaluate(doc, reference)
    quick = evaluate(fast, reference)
    assert any("угадывание" in w for w in quick["warnings"])
    assert quick["timeScore"] == baseline["timeScore"]
    assert "guessing" not in types(quick)


def test_deterministic(reference):
    doc = load("typos")
    first = evaluate(doc, reference)
    second = evaluate(doc, reference)
    assert first == second
    assert len(first["grammarErrors"]) == doc["expectedGrammarErrors"]


def test_components_and_weights_normalized(reference):
    evaluation = evaluate(load("etalon"), reference)
    components = evaluation["components"]
    applicable = [c for c in components.values() if c["details"]["applicable"]]
    assert abs(sum(c["weight"] for c in applicable) - 1.0) < 1e-3
    assert all(0.0 <= c["score"] <= 1.0 for c in components.values())
    assert components["address"]["details"]["applicable"] is False
    assert components["report"]["details"]["applicable"] is False
