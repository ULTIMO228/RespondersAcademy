"""Прозрачный Эло-подобный рейтинг по R10; отдельный рейтинг для каждого режима."""

from __future__ import annotations

from typing import Any

BASE_RATING = 1000.0
K = 32.0
LEVEL_STEP = 200.0


def difficulty(level: int, *, traps: int = 0, services: int = 1, address_complete: bool = True) -> float:
    """Сложность в шкале Эло: уровень сценария, ловушки, многослужбовость, неполный адрес."""
    return 600.0 + LEVEL_STEP * (max(1, min(5, level)) - 1) + 50 * max(0, traps) + 25 * max(0, services - 1) + (25 if not address_complete else 0)


def update(rating: float, challenge: float, score: float, norm_ok: float = 1.0, k: float = K) -> float:
    expected = 1 / (1 + 10 ** ((challenge - rating) / 400))
    actual = max(0.0, min(1.0, score / 100)) * max(0.0, min(1.0, norm_ok))
    return round(rating + k * (actual - expected), 4)


def norm_factor(reaction_ms: int, processing_ms: int, *, reaction_limit: int = 30_000, processing_limit: int = 180_000) -> float:
    known = [(reaction_ms, reaction_limit), (processing_ms, processing_limit)]
    exceeded = sum(value > limit for value, limit in known if value > 0)
    return max(0.5, 1.0 - 0.25 * exceeded)


def card_difficulty(card: Any, level: int) -> float:
    extra = card.extra or {} if card is not None else {}
    traps = extra.get("traps") or []
    if not isinstance(traps, list):
        traps = []
    return difficulty(level, traps=len(traps), services=len(card.expected_services or []) if card else 1,
                      address_complete=bool(card.address) if card else True)
