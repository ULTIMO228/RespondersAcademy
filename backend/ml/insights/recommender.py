"""Детерминированное ранжирование слабых категорий и учебных материалов (R22)."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime
from typing import Any

HALF_LIFE_DAYS = 30.0


def _timestamp_ms(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000


def weak_categories(history: list[dict[str, Any]], now: str) -> list[dict[str, Any]]:
    """Ошибки × группа × режим с экспоненциальным затуханием и низкими баллами."""
    buckets: dict[str, dict[str, Any]] = defaultdict(lambda: {"weight": 0.0, "count": 0, "errors": defaultdict(int), "modes": defaultdict(float)})
    now_ms = _timestamp_ms(now)
    for attempt in history:
        group = str(attempt.get("group") or "")
        if not group:
            continue
        age_days = max(0.0, (now_ms - _timestamp_ms(attempt["at"])) / 86_400_000)
        decay = 2 ** (-age_days / HALF_LIFE_DAYS)
        errors = attempt.get("errors") or []
        failure = max(0.0, (70 - float(attempt.get("score", 0))) / 70)
        bucket = buckets[group]
        bucket["weight"] += decay * (len(errors) + failure)
        bucket["count"] += len(errors)
        bucket["modes"][attempt.get("mode") or "dds"] += decay * (len(errors) + failure)
        for error in errors:
            bucket["errors"][str(error.get("type") or "lowScore")] += 1
        if not errors and failure:
            bucket["errors"]["lowScore"] += 1
    result = []
    for group, data in buckets.items():
        if data["weight"] <= 0:
            continue
        error_type, count = max(data["errors"].items(), key=lambda item: (item[1], item[0]))
        result.append({"group": group, "weight": round(data["weight"], 6), "count": max(1, count),
                       "errorType": error_type, "mode": max(data["modes"], key=data["modes"].get)})
    return sorted(result, key=lambda item: (-item["weight"], item["group"]))


def card_priority(card: dict[str, Any], weak: dict[str, float], rating: float, *, issued: set[str], completed: set[str]) -> tuple[float, str]:
    distance = abs(float(card["difficulty"]) - (rating + 40))
    score = weak.get(card["group"], 0.0) * 100 - distance / 20
    if card["id"] in issued:
        score -= 1000
    if card["id"] in completed:
        score -= 500
    return (-score, card["id"])


def stronger_mode(ratings: dict[str, float]) -> str | None:
    if not ratings:
        return None
    if math.isclose(ratings.get("dds", 1000), ratings.get("operator112", 1000), abs_tol=1):
        return None
    return max(ratings, key=ratings.get)


def adaptive_order(cards: list[dict[str, Any]], rating: float, weak: dict[str, float],
                   recent_scores: list[int], last_level: int | None = None) -> list[dict[str, Any]]:
    """Три удачные попытки поднимают уровень; слабая категория получает приоритет при неудаче."""
    if not cards:
        return []
    rising = len(recent_scores) >= 3 and all(score >= 80 for score in recent_scores[-3:])
    falling = bool(recent_scores) and recent_scores[-1] < 60
    candidates = cards
    if last_level is not None and rising:
        harder = [card for card in cards if int(card["level"]) > last_level]
        if harder:
            candidates = harder
    elif last_level is not None and falling:
        easier = [card for card in cards if int(card["level"]) < last_level]
        if easier:
            candidates = easier
    target = rating + (100 if rising else -100 if falling else 40)
    return sorted(candidates, key=lambda card: (
        -weak.get(str(card.get("group") or ""), 0.0),
        abs(600 + 200 * (int(card["level"]) - 1) - target), card["cardId"]
    ))
