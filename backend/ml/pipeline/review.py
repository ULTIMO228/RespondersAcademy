"""Журнал решений арбитража человека human_adjudication (T043)."""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class HumanDecision:
    decision_id: str
    thread_id: str
    reviewer_id: str
    timestamp: str
    decision: str  # "accepted" | "rejected" | "revised"
    reason: str
    approved_output: dict[str, Any] | None = None


_DECISIONS_JOURNAL: dict[str, HumanDecision] = {}


def record_human_decision(
    thread_id: str,
    reviewer_id: str,
    decision: str,
    reason: str,
    approved_output: dict[str, Any] | None = None,
) -> HumanDecision:
    """Записывает вердикт преподавателя в журнал арбитража."""
    dec_id = f"humandec-{uuid.uuid4().hex[:12]}"
    record = HumanDecision(
        decision_id=dec_id,
        thread_id=thread_id,
        reviewer_id=reviewer_id,
        timestamp=datetime.datetime.now(datetime.UTC).isoformat(),
        decision=decision,
        reason=reason,
        approved_output=approved_output,
    )
    _DECISIONS_JOURNAL[thread_id] = record
    return record


def get_human_decision(thread_id: str) -> HumanDecision | None:
    """Возвращает зафиксированное решение человека по идентификатору ветки."""
    return _DECISIONS_JOURNAL.get(thread_id)


def clear_human_decisions() -> None:
    """Очищает журнал решений (для изоляции тестовых прогонов)."""
    _DECISIONS_JOURNAL.clear()
