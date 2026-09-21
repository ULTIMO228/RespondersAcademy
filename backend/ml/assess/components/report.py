"""Компонент «доклад»: реплики диспетчера в звонках точке C против чек-листа доклада (FR-035i, решение команды).

Два источника чек-листа: явный `etalon.reportChecklist` (волна B, сравнение смысловое rubert-tiny2 с лексическим
фолбэком) либо, если его нет, сверка с фактами карточки, сохранённая в звонке при записи (`PhoneCall.report`,
`ml.insights.call_responder.check_report`: номер карточки, адрес, тип, пострадавшие, решение — решение
2026-09-21, US10). Без звонков с расшифровкой или без обоих источников компонент не применим — по абстрактным
пунктам не штрафуем.
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
        return _from_stored_reports(ctx, result)
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


def _from_stored_reports(ctx: AssessContext, result: ComponentResult) -> ComponentResult:
    """Чек-лист фактов карточки из `calls[].report` (лучший доклад по доле пунктов; пропуски — в ошибку)."""
    reports = [call["report"] for call in ctx.calls if isinstance(call.get("report"), dict) and isinstance(call["report"].get("checks"), list)]
    if not reports:
        result.applicable = False
        return result
    best = max(reports, key=lambda r: float(r.get("score") or 0.0))
    checks = [c for c in best["checks"] if isinstance(c, dict)]
    missing = [str(c.get("label") or c.get("id")) for c in checks if not c.get("found")]
    if missing:
        result.errors.append(rules.REPORT_INCOMPLETE.error(items="; ".join(f"«{p}»" for p in missing)))
    result.score = clamp01(sum(1 for c in checks if c.get("found")) / len(checks)) if checks else 1.0
    result.details = {"checklist": {str(c.get("label") or c.get("id")): 1.0 if c.get("found") else 0.0 for c in checks}, "text": str(best.get("text") or ""), "source": "card"}
    return result
