"""Формула R10, затухание ошибок и выбор следующей сложности."""

from __future__ import annotations

from ml.insights.rating import BASE_RATING, difficulty, norm_factor, update
from ml.insights.recommender import adaptive_order, weak_categories
from ml.scripts.eval_recommender import evaluate


def test_rating_moves_with_score_and_norm():
    challenge = difficulty(3, traps=1, services=3)
    assert challenge > difficulty(3)
    assert update(BASE_RATING, challenge, 95) > BASE_RATING
    assert update(BASE_RATING, challenge, 20) < BASE_RATING
    assert update(BASE_RATING, challenge, 95, norm_factor(40_000, 200_000)) < update(BASE_RATING, challenge, 95)


def test_weak_category_decays_and_has_reason():
    history = [
        {"group": "Запах газа", "at": "2026-09-28T12:00:00+03:00", "mode": "dds", "score": 30,
         "errors": [{"type": "wrongType"}]},
        {"group": "ДТП", "at": "2026-07-01T12:00:00+03:00", "mode": "dds", "score": 30,
         "errors": [{"type": "wrongType"}]},
    ]
    ranked = weak_categories(history, "2026-09-28T12:00:00+03:00")
    assert ranked[0]["group"] == "Запах газа"
    assert ranked[0]["errorType"] == "wrongType" and ranked[0]["count"] == 1


def test_three_successes_raise_next_level():
    cards = [{"cardId": "c-1", "group": "Газ", "level": 2},
             {"cardId": "c-2", "group": "Газ", "level": 3},
             {"cardId": "c-3", "group": "Газ", "level": 4}]
    assert adaptive_order(cards, 1000, {}, [90, 85, 95], 2)[0]["level"] > 2
    assert adaptive_order(cards, 1000, {"Газ": 3}, [40], 4)[0]["level"] < 4


def test_sc008_ten_histories():
    result = evaluate()
    assert result["cases"] == 10 and result["passed"]
