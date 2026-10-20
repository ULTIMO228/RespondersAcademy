"""Схемы рейтинга обучающихся 1:1 с `src/shared/api/types/student-rating.ts` (спека 006).

Контракт — `spec/006-student-rating/contracts/student-rating-endpoints.md`. Показатели без попыток — `null`
(обязательные nullable-поля), поэтому ответы сериализуются без `exclude_none`.
"""

from __future__ import annotations

from typing import Any, Literal

from app.schemas.common import ApiModel

RatingMode = Literal["operator112", "dds", "all"]
RatingPeriod = Literal["2w", "1m", "all"]
AttemptMode = Literal["operator112", "dds"]


class _Nullable(ApiModel):
    def dump(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True)


class RatingNorms(_Nullable):
    reaction_ms: int
    processing_ms: int


class RatingGroup(_Nullable):
    group_id: str
    student_count: int


class StudentStatsSummary(_Nullable):
    attempts: int
    average_score: float | None
    average_reaction_ms: int | None
    average_processing_ms: int | None
    within_norms_share: float | None


class StudentRatingRow(StudentStatsSummary):
    student_id: str
    full_name: str
    group_id: str
    rating_operator112: int
    rating_dds: int
    enough_data: bool


class StudentRatingResponse(_Nullable):
    groups: list[RatingGroup]
    group_id: str | None
    period: RatingPeriod
    mode: RatingMode
    norms: RatingNorms
    min_attempts: int
    rows: list[StudentRatingRow]


class StudentStatsPoint(_Nullable):
    attempt_id: str
    at: str
    mode: AttemptMode
    score: float
    reaction_ms: int
    processing_ms: int


class StudentStatsAttempt(StudentStatsPoint):
    session_id: str | None
    format: str
    title: str
    passed: bool | None


class StudentStatsByMode(_Nullable):
    operator112: StudentStatsSummary
    dds: StudentStatsSummary


class StudentStats(_Nullable):
    student_id: str
    full_name: str
    group_id: str
    period: RatingPeriod
    mode: RatingMode
    norms: RatingNorms
    summary: StudentStatsSummary
    by_mode: StudentStatsByMode
    dynamics: list[StudentStatsPoint]
    attempts: list[StudentStatsAttempt]
