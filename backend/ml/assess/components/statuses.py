"""Компонент «статусы»: последовательность и полнота статусов хода работ после первичного решения (памятка №6, эталон)."""

from __future__ import annotations

from datetime import datetime

from ml.assess import rules
from ml.assess.components import clamp01
from ml.assess.etalon import (
    CLOSING_STATUSES,
    PRIMARY_STATUSES,
    PROGRESS_STATUSES,
    resolve_card_etalon,
    status_title,
)
from ml.assess.types import AssessContext, ComponentResult

NAME = "statuses"


def lcs_length(left: list[str], right: list[str]) -> int:
    previous = [0] * (len(right) + 1)
    for item in left:
        current = [0]
        for index, other in enumerate(right):
            current.append(previous[index] + 1 if item == other else max(previous[index + 1], current[index]))
        previous = current
    return previous[len(right)]


def run(ctx: AssessContext) -> ComponentResult:
    etalon = resolve_card_etalon(ctx.etalon, str(ctx.attempt.get("cardId") or ""))
    result = ComponentResult(name=NAME, score=1.0)
    statuses = sorted(ctx.statuses, key=lambda s: str(s.get("at") or ""))
    actual_all = [str(s.get("ddsStatus")) for s in statuses]
    first = next((s for s in actual_all if s in PRIMARY_STATUSES), None)
    actual = [s for s in actual_all if s not in PRIMARY_STATUSES]
    expected = list(etalon.expected_statuses)
    result.details.update({"expected": expected, "actual": actual})
    # Отказ «Не принята» по эталону: ход работ не ожидается — компонент не применим.
    if etalon.expected_decision == "notAccepted" and first == "notAccepted":
        result.applicable = False
        return result
    if first is None:
        # Нет первичного статуса — это ошибка компонента «решение»; здесь считаем только ход работ.
        result.score = 0.0 if expected else 1.0
        return result
    for status in expected:
        if status in actual:
            continue
        title = status_title(ctx.reference, status)
        if status in PROGRESS_STATUSES:
            result.errors.append(rules.V6_NO_PROGRESS_STATUS.error(step=f"status:{status}", status=title))
        elif status in CLOSING_STATUSES:
            if not any(s in CLOSING_STATUSES for s in actual):
                result.errors.append(rules.STATUS_NOT_CLOSED.error(step=f"status:{status}"))
            else:
                result.errors.append(rules.STATUS_MISSING.error(step=f"status:{status}", status=title))
        else:
            result.errors.append(rules.STATUS_MISSING.error(step=f"status:{status}", status=title))
    if not expected and ctx.attempt.get("completedAt") and first == "accepted" and not any(s in CLOSING_STATUSES for s in actual):
        result.errors.append(rules.STATUS_NOT_CLOSED.error())
    common = lcs_length(expected, actual)
    if expected and not result.errors and common < len(expected):
        result.errors.append(rules.STATUS_ORDER.error(actual=" → ".join(status_title(ctx.reference, s) for s in actual)))
    for mark in statuses:
        status = str(mark.get("ddsStatus"))
        if status in PROGRESS_STATUSES and not str(mark.get("comment") or "").strip():
            result.warnings.append(rules.V6_NO_PROGRESS_COMMENT.error(status=status_title(ctx.reference, status)).message)
    message_errors = 0
    for message in ctx.attempt.get("workMessages") or []:
        expected_status = str(message.get("expectedStatus") or "")
        marks = [s for s in statuses if s.get("ddsStatus") == expected_status]
        title = status_title(ctx.reference, expected_status)
        if not marks:
            if not message.get("delivered", True):
                continue
            if expected_status not in expected:
                result.errors.append(rules.V6_NO_PROGRESS_STATUS.error(step=f"status:{expected_status}", status=title))
            message_errors += 1
            continue
        delay_ms = round((datetime.fromisoformat(str(marks[0]["at"])) - datetime.fromisoformat(str(message["at"]))).total_seconds() * 1000)
        if delay_ms < 0:
            result.errors.append(rules.V6_STATUS_WITHOUT_BASIS.error(step=f"status:{expected_status}", status=title))
            message_errors += 1
        elif delay_ms > 30_000:
            result.errors.append(rules.V6_STATUS_LATE.error(step=f"status:{expected_status}", status=title,
                                                            delay=round(delay_ms / 1000), window=30))
            message_errors += 1
    # Балл — покрытие эталона в правильном порядке; дополнительные статусы хода работ (памятка №6) не штрафуются.
    if not expected:
        result.score = 0.0 if any(e.rule_id == "s3" for e in result.errors) else 1.0
    else:
        result.score = clamp01(common / len(expected))
        if any(e.rule_id == "s3" for e in result.errors):
            result.score = clamp01(result.score * 0.5)
    if message_errors:
        result.score = clamp01(result.score * (1 - message_errors / max(1, len(ctx.attempt.get("workMessages") or []))))
    return result
