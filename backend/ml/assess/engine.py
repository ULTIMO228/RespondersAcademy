"""Движок оценщика (R8/R17): компоненты → взвешенный итог 0..1; детерминирован при одинаковом входе.

`assess(attempt, scenario, cards, reference, weights, session, options)` → AssessmentResult.
Веса нормируются по применимым компонентам (например, без адреса и доклада в режиме B волны A).
"""

from __future__ import annotations

from typing import Any

from ml.assess.components import (
    address,
    comments,
    decision,
    fields,
    grammar,
    multitask,
    report,
    statuses,
    timing,
)
from ml.assess.types import (
    DEFAULT_WEIGHTS_DDS,
    MODE_DDS,
    AssessContext,
    AssessmentResult,
    AssessOptions,
    ComponentResult,
    TimeNorms,
)

ASSESSOR_VERSION = "dds-1.0.0"
COMPONENTS_DDS = (timing, decision, statuses, comments, fields, grammar, address, multitask, report)
# Решение команды (spec 002, US2 сценарий 2): неверное первичное решение — не сдал. Итог ограничен сверху:
# нет статуса реагирования (памятка №1) — 0,4; статус не соответствует заявке / отказ от профильного (№2, №3) — 0,5.
DECISION_CAPS = {"v1": 0.4, "v2": 0.5, "v2t": 0.5, "v3": 0.5, "d4": 0.5}


def resolve_time_norms(scenario: dict[str, Any] | None, overrides: dict[str, Any] | None = None) -> TimeNorms:
    """Дефолты заказчика ← Scenario.timeNorms (сек) ← переопределения занятия (plan.timeNorms, сек)."""
    reaction, processing = TimeNorms().primary_reaction_ms, TimeNorms().full_processing_ms
    norms = (scenario or {}).get("timeNorms") or {}
    if isinstance(norms.get("primaryReactionSec"), (int, float)) and norms["primaryReactionSec"] > 0:
        reaction = int(norms["primaryReactionSec"] * 1000)
    if isinstance(norms.get("fullProcessingSec"), (int, float)) and norms["fullProcessingSec"] > 0:
        processing = int(norms["fullProcessingSec"] * 1000)
    over = overrides or {}
    if isinstance(over.get("primaryReactionSec"), (int, float)) and over["primaryReactionSec"] > 0:
        reaction = int(over["primaryReactionSec"] * 1000)
    if isinstance(over.get("fullProcessingSec"), (int, float)) and over["fullProcessingSec"] > 0:
        processing = int(over["fullProcessingSec"] * 1000)
    return TimeNorms(primary_reaction_ms=reaction, full_processing_ms=processing)


def resolve_weights(weights: dict[str, float] | None) -> dict[str, float]:
    merged = dict(DEFAULT_WEIGHTS_DDS)
    for key, value in (weights or {}).items():
        if key in merged and isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0:
            merged[key] = float(value)
    return merged


def normalize_weights(weights: dict[str, float], components: dict[str, ComponentResult]) -> dict[str, float]:
    applicable = {name: weights.get(name, 0.0) for name, comp in components.items() if comp.applicable}
    total = sum(applicable.values())
    if total <= 0:
        return {name: 0.0 for name in components}
    return {name: (applicable.get(name, 0.0) / total) for name in components}


def assess(
    attempt: dict[str, Any],
    scenario: dict[str, Any],
    cards: dict[str, dict[str, Any]] | None = None,
    reference: dict[str, Any] | None = None,
    weights: dict[str, float] | None = None,
    session: dict[str, Any] | None = None,
    options: AssessOptions | None = None,
    time_norms: TimeNorms | None = None,
) -> AssessmentResult:
    cards = cards or {}
    ctx = AssessContext(
        attempt=attempt,
        scenario=scenario or {},
        card=cards.get(str(attempt.get("cardId") or "")),
        cards=cards,
        reference=reference or {},
        session=session,
        time_norms=time_norms or resolve_time_norms(scenario, ((session or {}).get("plan") or {}).get("timeNorms")),
        weights=resolve_weights(weights),
        options=options or AssessOptions(),
        mode=MODE_DDS,
    )
    results: dict[str, ComponentResult] = {}
    for component in COMPONENTS_DDS:
        results[component.NAME] = component.run(ctx)
    effective = normalize_weights(ctx.weights, results)
    total = sum(effective[name] * comp.score for name, comp in results.items() if comp.applicable)
    caps = [DECISION_CAPS[e.rule_id] for e in results["decision"].errors if e.rule_id in DECISION_CAPS]
    if caps:
        total = min(total, min(caps))
    grammar_errors = list(results["grammar"].details.get("grammarErrors") or [])
    return AssessmentResult(mode=MODE_DDS, version=ASSESSOR_VERSION, components=results, weights=effective, grammar_errors=grammar_errors, total=max(0.0, min(1.0, total)))
