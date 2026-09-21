"""Компонент «доклад»: реплики диспетчера в звонках точке C против чек-листа доклада (FR-035i, решение команды).

Применим только при наличии звонков с расшифровкой и явного чек-листа `etalon.reportChecklist`
(волна B; в волне A чек-листа нет — компонент не применим, чтобы не штрафовать по абстрактным пунктам).
Сравнение смысловое (rubert-tiny2), фолбэк — лексический.
"""

from __future__ import annotations

from ml.assess import rules
from ml.assess.components import clamp01
from ml.assess.etalon import resolve_card_etalon
from ml.assess.types import AssessContext, ComponentResult
from ml.nlp import semantic

NAME = "report"


def dispatcher_lines(ctx: AssessContext) -> str:
    lines: list[str] = []
    for call in ctx.calls:
        for turn in call.get("transcript") or []:
            if turn.get("speaker") == "dispatcher" and isinstance(turn.get("text"), str):
                lines.append(turn["text"])
    return " . ".join(lines).strip()


def run(ctx: AssessContext) -> ComponentResult:
    result = ComponentResult(name=NAME, score=1.0)
    text = dispatcher_lines(ctx)
    if not text:
        result.applicable = False
        return result
    etalon = resolve_card_etalon(ctx.etalon, str(ctx.attempt.get("cardId") or ""))
    checklist = etalon.report_checklist
    if not checklist:
        result.applicable = False
        return result
    covered = semantic.covers_key_phrases(text, checklist, ctx.options.semantic_threshold)
    absent = semantic.missing_key_phrases(text, checklist, ctx.options.semantic_threshold)
    if absent:
        result.errors.append(rules.REPORT_INCOMPLETE.error(items="; ".join(f"«{p}»" for p in absent)))
    result.available = covered.available
    if not covered.available:
        result.warnings.append("Доклад сравнён лексически: модель эмбеддингов недоступна")
    result.score = clamp01(covered.score)
    result.details = {"checklist": {p: round(v, 3) for p, v in covered.details.items()}, "text": text}
    return result
