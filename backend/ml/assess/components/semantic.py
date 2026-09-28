"""Калиброванная смысловая оценка и классификация границ спорной семантики (US2, T020).

Калиброванные пороги зафиксированы по результатам разметки тренировочной выборки,
не подбираются по holdout. Спорная зона (dispute) направляется во второй эшелон (LLM)
или на арбитраж преподавателю.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

CALIBRATED_VERSION = "semantic-calibrated-v1"

# Пороги спорной зоны
DISPUTE_LOW_THRESHOLD = 0.65
DISPUTE_HIGH_THRESHOLD = 0.82

SemanticDecision = Literal["equivalent", "different", "uncertain", "dispute"]


@dataclass(frozen=True)
class SemanticFieldResult:
    decision: Literal["equivalent", "different", "uncertain"]
    requires_review: bool
    score: float | None
    similarity: float | None
    threshold_version: str = CALIBRATED_VERSION
    missing_facts: list[str] = field(default_factory=list)
    explanation: str = ""


def classify_similarity(similarity: float) -> SemanticDecision:
    """Классифицирует числовое подобие 0..1 по калиброванным границам."""
    if similarity >= DISPUTE_HIGH_THRESHOLD:
        return "equivalent"
    if similarity < DISPUTE_LOW_THRESHOLD:
        return "different"
    return "dispute"


def evaluate_semantic_field(
    actual_text: str,
    reference_facts: list[str],
    similarity: float | None,
) -> SemanticFieldResult:
    """Оценивает смысловое поле. При попадании в зону dispute переводит в uncertain (требует review)."""
    if similarity is None:
        return SemanticFieldResult(
            decision="uncertain",
            requires_review=True,
            score=None,
            similarity=None,
            explanation="Смысловое подобие не определено, требуется ручная проверка",
        )

    classification = classify_similarity(similarity)
    if classification == "equivalent":
        return SemanticFieldResult(
            decision="equivalent",
            requires_review=False,
            score=1.0,
            similarity=similarity,
            explanation="Смысл передан эквивалентно эталону",
        )
    if classification == "different":
        return SemanticFieldResult(
            decision="different",
            requires_review=False,
            score=0.0,
            similarity=similarity,
            explanation="Смысловое содержание существенно расходится с эталоном",
        )

    # classification == "dispute":
    return SemanticFieldResult(
        decision="uncertain",
        requires_review=True,
        score=None,
        similarity=similarity,
        explanation="Пограничное семантическое подобие, требуется арбитраж",
    )
