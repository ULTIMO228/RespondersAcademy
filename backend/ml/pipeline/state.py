"""Типизированное состояние конвейера LangGraph (T036)."""

from __future__ import annotations

from typing import Any, TypedDict


class PipelineState(TypedDict, total=False):
    run_id: str
    thread_id: str
    source_ticket_id: str
    situation_no: int
    mode: str
    sanitized_ticket: dict[str, Any]
    prompt_version: str
    base_output: dict[str, Any] | None
    base_reasoning_summary: str | None
    teacher_candidates: list[dict[str, Any]]
    checks_passed: bool
    check_failures: list[str]
    judge_review: dict[str, Any] | None
    human_decision: dict[str, Any] | None
    final_example: dict[str, Any] | None
    status: str
