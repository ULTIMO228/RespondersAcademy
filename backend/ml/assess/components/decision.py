"""Компонент «решение»: первичный статус против эталона (памятка №1–3, ловушки), служба-получатель (ЕКП)."""

from __future__ import annotations

import re

from ml.assess import rules
from ml.assess.components import clamp01
from ml.assess.etalon import PRIMARY_STATUSES, number_title, resolve_card_etalon, status_title
from ml.assess.types import AssessContext, ComponentResult

NAME = "decision"
DECISION_SHARE = 0.6
CALLS_SHARE = 0.4
EMERGENCY_NUMBERS = ("101", "102", "103", "104")
TRANSFER_PATTERN = re.compile(r"цус|перевед|перевод|другой регион|друг\w+ област|област", re.IGNORECASE)
WRONG_RECIPIENT_PENALTY = 0.25


def _actual_calls(ctx: AssessContext) -> list[str]:
    numbers = [str(c.get("toNumber")) for c in ctx.calls if c.get("toNumber")]
    numbers.extend(str(n) for n in (ctx.attempt.get("servicesCalled") or []) if n)
    seen: list[str] = []
    for number in numbers:
        if number not in seen:
            seen.append(number)
    return seen


def _all_text(ctx: AssessContext) -> str:
    parts = list(ctx.entered_text.values())
    parts.extend(str(s.get("comment") or "") for s in ctx.statuses)
    return " ".join(parts)


def run(ctx: AssessContext) -> ComponentResult:
    card_id = str(ctx.attempt.get("cardId") or "")
    etalon = resolve_card_etalon(ctx.etalon, card_id)
    result = ComponentResult(name=NAME, score=1.0)
    result.details["expectedDecision"] = etalon.expected_decision
    result.details["expectedCalls"] = etalon.expected_calls
    statuses = sorted(ctx.statuses, key=lambda s: str(s.get("at") or ""))
    first = next((s for s in statuses if s.get("ddsStatus") in PRIMARY_STATUSES), None)
    if first is None:
        result.errors.append(rules.V1_NO_PRIMARY_STATUS.error())
        decision_score = 0.0
        result.details["actualDecision"] = None
    else:
        actual = str(first["ddsStatus"])
        result.details["actualDecision"] = actual
        step = str(first.get("id") or f"status:{actual}")
        expected_title = status_title(ctx.reference, etalon.expected_decision)
        actual_title = status_title(ctx.reference, actual)
        if actual == etalon.expected_decision:
            decision_score = 1.0
        else:
            decision_score = 0.0
            hint = f", передано в {etalon.expected_transfer_to}" if etalon.expected_transfer_to else ""
            if etalon.expected_decision == "accepted":
                result.errors.append(rules.V3_REFUSED_PROFILE.error(step=step, actual=actual_title, expected=expected_title))
            elif etalon.trap == "duplicate":
                original = (ctx.card or {}).get("duplicateOf") or "другой службы"
                result.errors.append(rules.DUPLICATE_MISSED.error(step=step, original=original))
            elif etalon.trap:
                result.errors.append(rules.V2_TRAP_MISSED.error(step=step, trap=etalon.trap_title, actual=actual_title, expected=expected_title, hint=hint))
            else:
                result.errors.append(rules.V2_WRONG_DECISION.error(step=step, actual=actual_title, expected=expected_title, hint=hint))
    # Служба-получатель: ожидаемые звонки точке C и перевод в другой регион.
    actual_calls = _actual_calls(ctx)
    result.details["actualCalls"] = actual_calls
    expected_units = len(etalon.expected_calls) + (1 if etalon.expected_transfer_region else 0)
    if expected_units == 0:
        calls_score = 1.0
    else:
        matched = 0
        for number in etalon.expected_calls:
            if number in actual_calls:
                matched += 1
            else:
                result.errors.append(rules.MISSED_CALL.error(step=f"call:{number}", target=number_title(ctx.reference, number)))
        if etalon.expected_transfer_region:
            if TRANSFER_PATTERN.search(_all_text(ctx)):
                matched += 1
            else:
                result.errors.append(rules.TRANSFER_MISSING.error())
        calls_score = matched / expected_units
        wrong = [n for n in actual_calls if n in EMERGENCY_NUMBERS and n not in etalon.expected_calls]
        for number in wrong:
            result.errors.append(rules.WRONG_RECIPIENT.error(step=f"call:{number}", actual=number_title(ctx.reference, number), expected=", ".join(etalon.expected_calls) or "перевод вызова"))
        calls_score = clamp01(calls_score - WRONG_RECIPIENT_PENALTY * len(wrong))
    result.score = clamp01(DECISION_SHARE * decision_score + CALLS_SHARE * calls_score)
    return result
