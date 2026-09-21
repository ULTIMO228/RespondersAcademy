"""Метки времени контракта: ISO 8601 с московским смещением +03:00, без миллисекунд."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

MOSCOW = timezone(timedelta(hours=3))


def to_moscow_iso(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(MOSCOW).replace(microsecond=0).isoformat()


def now_iso() -> str:
    return to_moscow_iso(datetime.now(UTC))


def parse_iso_ms(value: str) -> int:
    """ISO → epoch ms; некорректная метка → ValueError. Принимает 'Z' и смещения."""
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return int(parsed.timestamp() * 1000)


def is_iso(value: object) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        parse_iso_ms(value)
    except (ValueError, TypeError):
        return False
    return True


def ms_to_iso(ms: int) -> str:
    return to_moscow_iso(datetime.fromtimestamp(ms / 1000, tz=UTC))
