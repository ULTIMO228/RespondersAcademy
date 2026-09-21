"""Компонент «время»: первичная реакция и полная отработка против нормативов (Q&A 30 с / 3 мин), угадывание (FR-042)."""

from __future__ import annotations

from ml.assess import rules
from ml.assess.components import clamp01, parse_ms, to_sec
from ml.assess.types import AssessContext, ComponentResult

NAME = "timing"
SHARE = 0.5  # доля каждого норматива в компоненте


def _norm_part(fact_ms: int, norm_ms: int) -> float:
    if norm_ms <= 0:
        return SHARE
    return SHARE if fact_ms <= norm_ms else SHARE * norm_ms / fact_ms


def run(ctx: AssessContext) -> ComponentResult:
    attempt = ctx.attempt
    norms = ctx.time_norms
    reaction = int(attempt.get("primaryReactionMs") or 0)
    processing = int(attempt.get("fullProcessingMs") or 0)
    completed = bool(attempt.get("completedAt"))
    result = ComponentResult(name=NAME, score=1.0)
    if reaction > norms.primary_reaction_ms:
        result.errors.append(rules.TIME_REACTION.error(fact=to_sec(reaction), norm=to_sec(norms.primary_reaction_ms)))
    if completed and processing > norms.full_processing_ms:
        result.errors.append(rules.TIME_PROCESSING.error(fact=to_sec(processing), norm=to_sec(norms.full_processing_ms)))
    if not completed:
        result.errors.append(rules.TIME_NOT_COMPLETED.error())
    processing_part = _norm_part(processing, norms.full_processing_ms) if completed else 0.0
    result.score = clamp01(_norm_part(reaction, norms.primary_reaction_ms) + processing_part)
    # Угадывание: первичное решение быстрее порога чтения карточки — предупреждение без снижения балла.
    opened_ms = parse_ms(attempt.get("openedAt"))
    first = next((s for s in ctx.statuses if s.get("ddsStatus") in ("accepted", "notAccepted")), None)
    first_ms = parse_ms(first.get("at")) if first else None
    if opened_ms is not None and first_ms is not None:
        decision_ms = first_ms - opened_ms
        result.details["decisionMs"] = decision_ms
        if 0 <= decision_ms < ctx.options.guessing_threshold_ms:
            warning = rules.GUESSING.error(fact=round(decision_ms / 1000, 1), threshold=to_sec(ctx.options.guessing_threshold_ms))
            result.warnings.append(warning.message)
            result.details["guessing"] = True
    result.details.update({"reactionMs": reaction, "processingMs": processing, "normReactionMs": norms.primary_reaction_ms, "normProcessingMs": norms.full_processing_ms, "completed": completed})
    return result
