"""Компонент «поля»: обязательные поля ручного ввода по критериям сценария (successCriteria.requiredFields).

Фича 012 (памятка «Работа на АРМ-112», стр. 23–24): в карточке ДДС нет поля «Действие диспетчера» и номера наряда —
диспетчер пишет текст в комментарий к статусу и номер наряда в форме статуса. Поэтому `dispatcherAction` закрывается
комментарием к любому статусу, `outfitNumber` — номером наряда в форме статуса (старые попытки с полями — как раньше).
"""

from __future__ import annotations

from ml.assess import rules
from ml.assess.types import AssessContext, ComponentResult

NAME = "fields"

FIELD_TITLES = {
    "dispatcherAction": "действие диспетчера (комментарий к статусу)",
    "outfitNumber": "номер наряда (в форме статуса)",
}


def _status_form_values(ctx: AssessContext) -> dict[str, str]:
    comments = [str(s.get("comment") or "").strip() for s in ctx.statuses]
    duties = [str(s.get("dutyNumber") or "").strip() for s in ctx.statuses]
    return {
        "dispatcherAction": next((c for c in comments if c), ""),
        "outfitNumber": next((d for d in duties if d), ""),
    }


def run(ctx: AssessContext) -> ComponentResult:
    required = [f for f in (ctx.success_criteria.get("requiredFields") or []) if isinstance(f, str)]
    result = ComponentResult(name=NAME, score=1.0, details={"required": required})
    if not required:
        result.applicable = False
        return result
    entered = ctx.entered_text
    from_status = _status_form_values(ctx)
    filled = 0
    for field in required:
        if str(entered.get(field) or "").strip() or from_status.get(field):
            filled += 1
        else:
            result.errors.append(rules.FIELD_MISSING.error(field=FIELD_TITLES.get(field, field)))
    result.score = filled / len(required)
    return result
