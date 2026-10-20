"""Схемы сводной успеваемости (спека 005): `spec/005-performance-report/data-model.md`, camelCase.

Обязательные nullable-поля (`avgScore`, `delta`, …) остаются `null`; опциональные (`from`, `to`, `groupId` в фильтрах)
опускаются, если не заданы — поэтому база та же, что у карты ошибок.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.error_map import ErrorMapModel

PerformanceMode = Literal["all", "dds", "operator112"]
PerformancePeriod = Literal["2w", "1m", "all", "range"]
PerformanceLevel = Literal["ok", "risk", "noData"]


class PerformanceFilters(ErrorMapModel):
    mode: PerformanceMode
    period: PerformancePeriod
    date_from: str | None = Field(default=None, alias="from")
    date_to: str | None = Field(default=None, alias="to")
    group_id: str | None = None


class PerformanceThresholds(ErrorMapModel):
    min_attempts_student: int
    min_attempts_group: int
    risk_score: int


class PerformanceStats(ErrorMapModel):
    students: int
    active_students: int
    attempts: int
    avg_score: float | None
    previous_avg_score: float | None
    delta: float | None
    reaction_in_norm_share: float | None
    processing_in_norm_share: float | None
    exams: int
    exams_passed: int
    weak_stage: str | None
    level: PerformanceLevel


class PerformanceGroupRow(ErrorMapModel):
    group_id: str
    title: str
    stats: PerformanceStats


class PerformanceStudentRow(ErrorMapModel):
    student_id: str
    name: str
    group_id: str | None
    stats: PerformanceStats


class PerformanceError(ErrorMapModel):
    label: str
    attempts: int


class PerformanceReport(ErrorMapModel):
    filters: PerformanceFilters
    generated_at: str
    thresholds: PerformanceThresholds
    totals: PerformanceStats
    groups: list[PerformanceGroupRow]
    students: list[PerformanceStudentRow]
    top_errors: list[PerformanceError]
