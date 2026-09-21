"""Компоненты оценщика: каждый `run(ctx) -> ComponentResult` (score 0..1, ошибки с правилами, предупреждения)."""

from __future__ import annotations

from datetime import UTC, datetime


def parse_ms(value: object) -> int | None:
    """ISO → epoch ms; пусто/мусор → None (ml не зависит от app.services.time)."""
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return int(parsed.timestamp() * 1000)


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def to_sec(ms: int | float) -> int:
    return int(round(ms / 1000))
