"""Компонент «поля»: обязательные поля ручного ввода по критериям сценария (successCriteria.requiredFields)."""

from __future__ import annotations

from ml.assess import rules
from ml.assess.types import AssessContext, ComponentResult

NAME = "fields"


def run(ctx: AssessContext) -> ComponentResult:
    required = [f for f in (ctx.success_criteria.get("requiredFields") or []) if isinstance(f, str)]
    result = ComponentResult(name=NAME, score=1.0, details={"required": required})
    if not required:
        result.applicable = False
        return result
    entered = ctx.entered_text
    filled = 0
    for field in required:
        if str(entered.get(field) or "").strip():
            filled += 1
        else:
            result.errors.append(rules.FIELD_MISSING.error(field=field))
    result.score = filled / len(required)
    return result
