"""Компонент «многозадачность»: реакция на карточки, выданные параллельно с текущей (FR-035f, решение команды).

Параллельная карточка — элемент cardFlow того же курсанта, выданный в интервале работы с текущей попыткой.
Она считается отработанной, если по ней открыта попытка в норматив первичной реакции.
"""

from __future__ import annotations

from ml.assess import rules
from ml.assess.components import parse_ms, to_sec
from ml.assess.types import AssessContext, ComponentResult

NAME = "multitask"


def run(ctx: AssessContext) -> ComponentResult:
    result = ComponentResult(name=NAME, score=1.0)
    session = ctx.session or {}
    attempt = ctx.attempt
    student_id = attempt.get("studentId")
    opened = parse_ms(attempt.get("openedAt"))
    closed = parse_ms(attempt.get("completedAt"))
    if opened is None or not session:
        result.applicable = False
        return result
    parallel = []
    for item in session.get("cardFlow") or []:
        if item.get("studentId") != student_id or item.get("cardId") == attempt.get("cardId"):
            continue
        issued = parse_ms(item.get("issuedAt"))
        if issued is None or issued < opened or (closed is not None and issued > closed):
            continue
        parallel.append((item, issued))
    if not parallel:
        result.applicable = False
        return result
    norm = ctx.time_norms.primary_reaction_ms
    handled = 0
    for item, issued in parallel:
        opened_at = next((parse_ms(e.get("openedAt")) for e in session.get("cardEvents") or [] if e.get("cardId") == item["cardId"] and e.get("studentId") == student_id), None)
        if opened_at is not None and opened_at - issued <= norm:
            handled += 1
        else:
            result.errors.append(rules.PARALLEL_IGNORED.error(step=f"issued:{item['cardId']}", card=item["cardId"], norm=to_sec(norm)))
    result.score = handled / len(parallel)
    result.details.update({"parallel": [i["cardId"] for i, _ in parallel], "handled": handled})
    return result
