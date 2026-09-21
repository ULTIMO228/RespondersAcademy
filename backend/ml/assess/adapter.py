"""Адаптер AssessmentResult → Evaluation фронта (contracts/evaluation.schema.json, R17).

timeScore = timing; correctnessScore = decision + statuses + fields + multitask; grammarScore = grammar + address;
semanticScore = comments + report (взвешенные средние по применимым компонентам); totalScore = Σ w·s × 100.
aiComment детерминирован и начинается с «ИИ-оценка:». Полный результат — в `components`.
"""

from __future__ import annotations

from typing import Any

from ml.assess.types import AXES, AssessmentResult, axes_for

AI_COMMENT_PREFIX = "ИИ-оценка:"
AXIS_TITLES = {"timeScore": "время", "correctnessScore": "корректность", "grammarScore": "грамотность", "semanticScore": "смысловая точность"}


def clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def axis_score(result: AssessmentResult, names: tuple[str, ...]) -> int:
    parts = [(result.weights.get(name, 0.0), result.components[name].score) for name in names if name in result.components and result.components[name].applicable]
    if not parts:
        return 100
    total_weight = sum(w for w, _ in parts)
    if total_weight <= 0:
        return clamp_score(100 * sum(s for _, s in parts) / len(parts))
    return clamp_score(100 * sum(w * s for w, s in parts) / total_weight)


def build_ai_comment(scores: dict[str, int], errors: list[dict[str, Any]], grammar_count: int, warnings: list[str]) -> str:
    parts = ", ".join(f"{AXIS_TITLES[axis]} {scores[axis]}" for axis in AXES if axis in scores)
    critical = sum(1 for e in errors if e.get("severity") == "critical")
    total_errors = len(errors) + grammar_count
    if total_errors == 0:
        verdict = "Замечаний нет."
    else:
        verdict = f"Замечаний: {total_errors}" + (f", из них критичных {critical}." if critical else ".")
    top = [e["message"].split(" — ")[0] for e in errors if e.get("severity") == "critical"][:2]
    hint = (" В первую очередь: " + "; ".join(top) + ".") if top else ""
    warn = (" Предупреждение: " + warnings[0] + ".") if warnings else ""
    return f"{AI_COMMENT_PREFIX} {parts}. {verdict}{hint}{warn}"


def to_evaluation(result: AssessmentResult, teacher_override: dict[str, Any] | None = None, passed: bool | None = None) -> dict[str, Any]:
    scores = {axis: axis_score(result, names) for axis, names in axes_for(result.mode).items()}
    errors = [error.to_contract() for error in result.errors]
    grammar_errors = list(result.grammar_errors)
    warnings = list(result.warnings)
    evaluation: dict[str, Any] = {
        **scores,
        "totalScore": clamp_score(100 * result.total),
        "grammarErrors": grammar_errors,
        "errors": errors,
        "aiComment": build_ai_comment(scores, errors, len(grammar_errors), warnings),
        "mode": result.mode,
        "assessorVersion": result.version,
        "components": {
            name: {
                "score": round(component.score, 4),
                "weight": round(result.weights.get(name, 0.0), 4),
                "available": component.available,
                "details": {**{k: v for k, v in component.details.items() if k != "grammarErrors"}, "applicable": component.applicable},
            }
            for name, component in result.components.items()
        },
        "warnings": warnings,
    }
    if result.field_diff is not None:
        evaluation["fieldDiff"] = list(result.field_diff)
    if passed is not None:
        evaluation["passed"] = passed
    if teacher_override:
        evaluation["teacherOverride"] = teacher_override
    return evaluation
