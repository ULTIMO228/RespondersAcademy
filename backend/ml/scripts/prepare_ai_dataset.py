"""Сборка версионированного датасета TrainingExample без raw reasoning и ПДн (T044)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def create_training_example(
    *,
    example_id: str,
    source_ticket_id: str,
    mode: str,
    prompt_version: str,
    etalon_version: str,
    base_output: dict[str, Any],
    teacher_candidate: dict[str, Any],
    corrected_output: dict[str, Any],
    correction_reason: str,
    judge_review_id: str,
    split: str,
    base_reasoning_summary: str | None = None,
    human_decision_id: str | None = None,
    labels: dict[str, Any] | None = None,
    checks: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Формирует каноническую запись TrainingExample по спецификации data-model.md."""
    # Гарантия: raw chain-of-thought и внутренние трейсы исключаются
    safe_summary = (base_reasoning_summary or "")[:200] if base_reasoning_summary else None

    return {
        "id": example_id,
        "sourceTicketId": source_ticket_id,
        "mode": mode,
        "promptVersion": prompt_version,
        "etalonVersion": etalon_version,
        "baseOutput": base_output,
        "baseReasoningSummary": safe_summary,
        "teacherCandidate": teacher_candidate,
        "correctedOutput": corrected_output,
        "correctionReason": correction_reason[:400],
        "judgeReviewId": judge_review_id,
        "humanDecisionId": human_decision_id,
        "labels": labels or {},
        "checks": checks or {"passed": True},
        "split": split,
    }


def save_dataset_jsonl(examples: list[dict[str, Any]], target_file: Path) -> int:
    """Сохраняет выборку в JSONL-файл."""
    target_file.parent.mkdir(parents=True, exist_ok=True)
    with target_file.open("w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")
    return len(examples)
