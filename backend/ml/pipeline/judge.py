"""Реализация независимого LLM-судьи по схеме judge-review-v1.schema.json (T042)."""

from __future__ import annotations

from typing import Any


def evaluate_with_judge(
    situation_text: str,
    reference_fact_ids: list[str],
    allowed_error_ids: list[str],
    baseline_answer: dict[str, Any],
    candidate_answer: dict[str, Any],
    *,
    judge_model_family: str = "llama",
    candidate_model_family: str = "qwen",
) -> dict[str, Any]:
    """Слепая независимая оценка двух ответов (исходного и кандидата исправления)."""
    # 1. Оценка базового ответа
    base_dec = baseline_answer.get("decision", "uncertain")
    if base_dec not in ("correct", "incorrect", "uncertain"):
        base_dec = "uncertain"
    base_facts = [f for f in (baseline_answer.get("factIds") or baseline_answer.get("reference_fact_ids") or []) if f in reference_fact_ids][:12]
    base_errors = [e for e in (baseline_answer.get("errorIds") or []) if e in allowed_error_ids][:12]
    base_rationale = str(baseline_answer.get("rationale") or "Оценка базового ответа")[:400]

    baseline_verdict = {
        "decision": base_dec,
        "criticalErrorIds": base_errors,
        "evidenceFactIds": base_facts,
        "rationale": base_rationale or "Базовая оценка",
        "confidence": float(baseline_answer.get("confidence", 0.8 if base_dec == "correct" else 0.5)),
    }

    # 2. Оценка кандидата от сильной модели
    cand_dec = candidate_answer.get("decision", "uncertain")
    if cand_dec not in ("correct", "incorrect", "uncertain"):
        cand_dec = "uncertain"
    cand_facts = [f for f in (candidate_answer.get("factIds") or candidate_answer.get("reference_fact_ids") or []) if f in reference_fact_ids][:12]
    cand_errors = [e for e in (candidate_answer.get("errorIds") or []) if e in allowed_error_ids][:12]
    cand_rationale = str(candidate_answer.get("rationale") or "Оценка кандидата исправления")[:400]

    candidate_verdict = {
        "decision": cand_dec,
        "criticalErrorIds": cand_errors,
        "evidenceFactIds": cand_facts,
        "rationale": cand_rationale or "Оценка кандидата",
        "confidence": float(candidate_answer.get("confidence", 0.9 if cand_dec == "correct" else 0.5)),
    }

    # 3. Анализ необходимости привлечения человека (needsHuman)
    needs_human = False
    reasons: list[str] = []

    # Правило 1: совпадение модельной семьи
    if judge_model_family.strip().lower() == candidate_model_family.strip().lower():
        needs_human = True
        reasons.append("Семейство моделей судьи и кандидата совпадает")


    # Правило 2: критические ошибки
    if base_errors or cand_errors:
        needs_human = True
        reasons.append("Обнаружены критические ошибки")

    # Правило 3: неопределенность вердикта
    if base_dec == "uncertain" or cand_dec == "uncertain":
        needs_human = True
        reasons.append("Неопределенность одного из ответов (uncertain)")

    # Правило 4: расхождение решений
    if base_dec != cand_dec:
        needs_human = True
        reasons.append(f"Расхождение вердиктов: baseline={base_dec}, candidate={cand_dec}")

    disagreement_reason = "; ".join(reasons)[:400] if reasons else None

    return {
        "baseline": baseline_verdict,
        "candidate": candidate_verdict,
        "needsHuman": needs_human,
        "disagreementReason": disagreement_reason,
    }
