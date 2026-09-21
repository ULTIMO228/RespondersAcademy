"""Компонент «грамотность»: symspell + доменный словарь по ручному вводу и комментариям к статусам (R2)."""

from __future__ import annotations

from ml.assess import rules
from ml.assess.components import clamp01
from ml.assess.components.address import address_fields
from ml.assess.types import AssessContext, ComponentResult
from ml.nlp import grammar as grammar_nlp

NAME = "grammar"
PENALTY_WITHIN_LIMIT = 0.10
PENALTY_OVER_LIMIT = 0.30


def collect_errors(ctx: AssessContext) -> list[dict[str, str]]:
    # Адресные поля проверяет компонент «адрес» по справочнику улиц — здесь они пропускаются.
    entered = ctx.entered_text
    skip = ("outfitNumber", *address_fields(entered))
    errors = [e.to_contract() for e in grammar_nlp.check_fields(entered, skip=skip)]
    for mark in ctx.statuses:
        comment = str(mark.get("comment") or "")
        if comment.strip():
            # Комментарий к статусу — короткая свободная запись: проверяем только орфографию, без синтаксиса.
            errors.extend(e.to_contract() for e in grammar_nlp.check_spelling(comment, field=f"status.{mark.get('ddsStatus')}"))
    return errors


def run(ctx: AssessContext) -> ComponentResult:
    errors = collect_errors(ctx)
    limit = ctx.success_criteria.get("maxGrammarErrors")
    limit = int(limit) if isinstance(limit, (int, float)) and not isinstance(limit, bool) and limit >= 0 else 0
    count = len(errors)
    result = ComponentResult(name=NAME, score=1.0, available=grammar_nlp.available(), details={"count": count, "limit": limit, "grammarErrors": errors})
    if count > limit:
        result.errors.append(rules.GRAMMAR_LIMIT.error(count=count, limit=limit))
        result.score = clamp01(1.0 - PENALTY_OVER_LIMIT * count)
    else:
        result.score = clamp01(1.0 - PENALTY_WITHIN_LIMIT * count)
    if not result.available:
        result.warnings.append("Проверка орфографии недоступна (нет словаря): учтён только синтаксис")
    return result
