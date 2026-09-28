"""Типы оценщика: контекст попытки, результат компонента, итог (R8/R17)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

MODE_DDS = "dds"
MODE_OPERATOR112 = "operator112"

DEFAULT_PRIMARY_REACTION_MS = 30_000
DEFAULT_FULL_PROCESSING_MS = 180_000

# Веса компонентов режима B по умолчанию (R17, R14-001); нормируются по применимым компонентам.
DEFAULT_WEIGHTS_DDS: dict[str, float] = {
    "timing": 0.25,
    "decision": 0.20,
    "statuses": 0.15,
    "comments": 0.15,
    "fields": 0.10,
    "grammar": 0.10,
    "multitask": 0.05,
    "report": 0.10,
    "address": 0.05,
}

# Веса компонентов режима A (специалист-112, FR-036 a–g); (h) прослушивания/подсказки — информационно, без веса.
DEFAULT_WEIGHTS_OPERATOR112: dict[str, float] = {
    "answer_timing": 0.15,
    "final_type": 0.25,
    "address": 0.15,
    "description_facts": 0.15,
    "signs_flags": 0.10,
    "applicant_phone": 0.10,
    "grammar": 0.10,
    "activity": 0.0,
}

# Оси Evaluation фронта ← компоненты (R17).
AXES: dict[str, tuple[str, ...]] = {
    "timeScore": ("timing",),
    "correctnessScore": ("decision", "statuses", "fields", "multitask"),
    "grammarScore": ("grammar", "address"),
    "semanticScore": ("comments", "report"),
}
AXES_OPERATOR112: dict[str, tuple[str, ...]] = {
    "timeScore": ("answer_timing",),
    "correctnessScore": ("final_type", "signs_flags", "applicant_phone"),
    "grammarScore": ("grammar", "address"),
    "semanticScore": ("description_facts",),
}


def axes_for(mode: str) -> dict[str, tuple[str, ...]]:
    return AXES_OPERATOR112 if mode == MODE_OPERATOR112 else AXES


@dataclass(frozen=True)
class TimeNorms:
    primary_reaction_ms: int = DEFAULT_PRIMARY_REACTION_MS
    full_processing_ms: int = DEFAULT_FULL_PROCESSING_MS


@dataclass(frozen=True)
class AssessOptions:
    """Настройки, не входящие в веса: порог «угадывания» (FR-042), порог семантики."""

    guessing_threshold_ms: int = 3_000
    semantic_threshold: float = 0.70
    hints_enabled: bool = False


@dataclass
class AssessContext:
    attempt: dict[str, Any]  # CardEvent контракта
    scenario: dict[str, Any]  # Scenario контракта (etalon, successCriteria, timeNorms)
    card: dict[str, Any] | None  # IncidentCard карточки попытки
    cards: dict[str, dict[str, Any]] = field(default_factory=dict)  # карточки по id (дубли, параллельные)
    reference: dict[str, Any] = field(default_factory=dict)  # ddsStatuses, internalNumbers, services
    session: dict[str, Any] | None = None  # Session контракта (cardFlow, cardEvents, plan)
    time_norms: TimeNorms = field(default_factory=TimeNorms)
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS_DDS))
    options: AssessOptions = field(default_factory=AssessOptions)
    mode: str = MODE_DDS

    @property
    def etalon(self) -> dict[str, Any]:
        return self.scenario.get("etalon") or {}

    @property
    def success_criteria(self) -> dict[str, Any]:
        return self.scenario.get("successCriteria") or {}

    @property
    def entered_text(self) -> dict[str, str]:
        return {k: v for k, v in (self.attempt.get("enteredText") or {}).items() if isinstance(v, str)}

    @property
    def statuses(self) -> list[dict[str, Any]]:
        return list(self.attempt.get("statuses") or [])

    @property
    def calls(self) -> list[dict[str, Any]]:
        return list(self.attempt.get("calls") or [])


@dataclass
class AssessError:
    rule_id: str
    type: str
    severity: str  # critical | major | minor
    message: str  # «<пояснение> — <правило-источник>»
    step: str | None = None  # id события таймлайна (статус/звонок)
    fixed: bool = False
    evidence_key: str | None = None
    field_path: str | None = None
    observed: str | None = None
    expected: str | None = None
    source_ref: str | None = None
    detector: str = "rule"

    def to_contract(self) -> dict[str, Any]:
        data: dict[str, Any] = {"type": self.type, "severity": self.severity, "message": self.message, "ruleId": self.rule_id}
        if self.step:
            data["step"] = self.step
        if self.fixed:
            data["fixed"] = True
        return data


@dataclass
class ComponentResult:
    name: str
    score: float  # 0..1
    errors: list[AssessError] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    available: bool = True  # False — ML-компонент недоступен, использован фолбэк (FR-043)
    applicable: bool = True  # False — для попытки нет данных; в итог не входит
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class AssessmentResult:
    mode: str
    version: str
    components: dict[str, ComponentResult]
    weights: dict[str, float]  # эффективные (нормированные по применимым) веса
    grammar_errors: list[dict[str, str]]
    total: float  # 0..1
    field_diff: list[dict[str, Any]] | None = None  # режим A: сравнение «моя карточка ↔ эталон» по полям (FR-040)

    @property
    def errors(self) -> list[AssessError]:
        return [error for component in self.components.values() for error in component.errors]

    @property
    def warnings(self) -> list[str]:
        return [warning for component in self.components.values() for warning in component.warnings]
