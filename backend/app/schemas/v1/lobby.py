"""Схемы публичного контракта лобби US4."""

from __future__ import annotations

from typing import Any, Literal

from app.schemas.common import ApiModel


class HistoryItem(ApiModel):
    attempt_id: str
    mode: Literal["dds", "operator112"]
    format: Literal["training", "exam"]
    card_id: str
    title: str
    score: int
    passed: bool | None = None
    at: str
    report_url: str | None = None


class KbSections(ApiModel):
    signs: list[str]
    notification: list[str]
    clarify: list[str]
    dds_decision: list[str]
    typical_errors: list[str]


class KbArticle(ApiModel):
    id: str
    group: str
    title: str
    sections: KbSections
    updated_by: str | None = None
    updated_at: str | None = None


class KbArticlePatch(ApiModel):
    sections: KbSections


class Stats(ApiModel):
    count: int
    average_score: float
    average_reaction_ms: int
    average_processing_ms: int
    replays: int
    hints_shown: int


class Analytics(ApiModel):
    by_mode: dict[str, Stats]
    reaction_ms: int
    top_errors: list[dict[str, Any]]
    dynamics: dict[str, Any]
    by_group: dict[str, Stats]
    by_format: dict[str, Stats]
