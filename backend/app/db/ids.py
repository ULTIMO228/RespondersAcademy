"""Генерация id в форматах сидов мок-слоя: "<prefix>-NNN" (продолжает нумерацию, ширина 3)."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

ID_PAD = 3
_SUFFIX = re.compile(r"-(\d+)$")

PREFIX = {
    "statusEvent": "st",
    "workLine": "wl",
    "workMessage": "wm",
    "reminder": "rem",
    "sms": "sms",
    "audit": "audit",
    "systemLog": "log",
    "user": "u",
    "material": "mat",
    "scenario": "s",
    "session": "ses",
    "attempt": "att",
    "assignment": "asg",
    "call": "call",
    "card": "c",
}


def max_suffix(ids: list[str], prefix: str) -> int:
    best = 0
    for value in ids:
        if not value.startswith(f"{prefix}-"):
            continue
        match = _SUFFIX.search(value)
        if match:
            best = max(best, int(match.group(1)))
    return best


def format_id(prefix: str, number: int) -> str:
    return f"{prefix}-{str(number).zfill(ID_PAD)}"


async def next_id(db: AsyncSession, prefix: str, column) -> str:
    """Следующий id по максимальному суффиксу в колонке (таблицы маленькие — полный скан допустим)."""
    ids = [row for row in (await db.execute(select(column))).scalars().all() if isinstance(row, str)]
    return format_id(prefix, max_suffix(ids, prefix) + 1)


def report_id(session_id: str, student_id: str) -> str:
    return f"rep-{session_id.split('-', 1)[1] if '-' in session_id else session_id}-{student_id}"


def group_report_id(session_id: str) -> str:
    return f"rep-{session_id.split('-', 1)[1] if '-' in session_id else session_id}-group"
