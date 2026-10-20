"""Рейтинг обучающихся и полная статистика ученика для преподавателя (спека 017).

Источник показателей — `analytics.rows()`: те же оценённые попытки с правкой преподавателя, что в отчётах и
аналитике обучающегося (FR-004, FR-011). Рейтинг режима — существующий `rating_service` (за всё время).
Права — общий модуль карты ошибок `error_map_access` (закрепление групп, FR-009). Место считает клиент под
выбранный столбец сортировки (research R5), сервер отдаёт только показатели и признак достаточности данных.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.models.user import User
from app.schemas.student_rating import (
    RatingGroup,
    RatingNorms,
    StudentRatingResponse,
    StudentRatingRow,
    StudentStats,
    StudentStatsAttempt,
    StudentStatsByMode,
    StudentStatsPoint,
    StudentStatsSummary,
)
from app.services import analytics, error_map_access, rating_service
from app.services.error_map_service import period_cutoff

# Нормативы Q&A: первичная реакция 30 с, полная отработка карточки 3 мин (AGENTS §2).
REACTION_NORM_MS = 30_000
PROCESSING_NORM_MS = 180_000
MIN_ATTEMPTS = 3
NORMS = RatingNorms(reaction_ms=REACTION_NORM_MS, processing_ms=PROCESSING_NORM_MS)


def _filter(items: list[dict[str, Any]], mode: str, period: str) -> list[dict[str, Any]]:
    cutoff = period_cutoff(period)
    return [
        item for item in items
        if (mode == "all" or item["mode"] == mode) and (cutoff is None or str(item["at"]) >= cutoff)
    ]


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def summarize(items: list[dict[str, Any]]) -> StudentStatsSummary:
    """Средние по попыткам; время — только по попыткам с записанным временем (0 = не измерено)."""
    score = _mean([float(item["score"]) for item in items])
    reaction = _mean([item["reactionMs"] for item in items if item["reactionMs"]])
    processing = _mean([item["processingMs"] for item in items if item["processingMs"]])
    within = _mean([
        1.0 if 0 < item["reactionMs"] <= REACTION_NORM_MS and 0 < item["processingMs"] <= PROCESSING_NORM_MS else 0.0
        for item in items
    ])
    return StudentStatsSummary(
        attempts=len(items),
        average_score=round(score, 1) if score is not None else None,
        average_reaction_ms=round(reaction) if reaction is not None else None,
        average_processing_ms=round(processing) if processing is not None else None,
        within_norms_share=round(within, 3) if within is not None else None,
    )


async def group_rating(db: AsyncSession, viewer: Viewer | None, group_id: str | None, mode: str, period: str) -> StudentRatingResponse:
    groups = await error_map_access.accessible_groups(db, viewer)
    chosen = group_id or (groups[0].group_id if groups else None)
    empty = StudentRatingResponse(
        groups=[RatingGroup(group_id=g.group_id, student_count=g.student_count) for g in groups],
        group_id=chosen, period=period, mode=mode, norms=NORMS, min_attempts=MIN_ATTEMPTS, rows=[],
    )
    if chosen is None:
        return empty
    await error_map_access.require_group_access(db, viewer, chosen)
    students = (await db.execute(
        select(User).where(User.role == "student", User.group == chosen).order_by(User.full_name, User.id)
    )).scalars().all()
    items = await analytics.rows(db, student_ids={student.id for student in students})
    by_student: dict[str, list[dict[str, Any]]] = {student.id: [] for student in students}
    for item in _filter(items, mode, period):
        by_student[item["studentId"]].append(item)
    rows = []
    for student in students:
        ratings = await rating_service.ratings(db, student.id)
        summary = summarize(by_student[student.id])
        rows.append(StudentRatingRow(
            **summary.model_dump(), student_id=student.id, full_name=student.full_name, group_id=chosen,
            rating_operator112=round(ratings["operator112"]), rating_dds=round(ratings["dds"]),
            enough_data=summary.attempts >= MIN_ATTEMPTS,
        ))
    return empty.model_copy(update={"rows": rows})


def _point(item: dict[str, Any]) -> dict[str, Any]:
    return {"attempt_id": item["attemptId"], "at": item["at"], "mode": item["mode"], "score": item["score"],
            "reaction_ms": item["reactionMs"], "processing_ms": item["processingMs"]}


async def student_stats(db: AsyncSession, viewer: Viewer | None, student_id: str, mode: str, period: str) -> StudentStats:
    student = await error_map_access.require_student_access(db, viewer, student_id)
    items = _filter(await analytics.rows(db, student.id), mode, period)  # по убыванию времени
    return StudentStats(
        student_id=student.id, full_name=student.full_name, group_id=student.group or "",
        period=period, mode=mode, norms=NORMS, summary=summarize(items),
        by_mode=StudentStatsByMode(
            operator112=summarize([item for item in items if item["mode"] == "operator112"]),
            dds=summarize([item for item in items if item["mode"] == "dds"]),
        ),
        dynamics=[StudentStatsPoint(**_point(item)) for item in reversed(items)],
        attempts=[StudentStatsAttempt(**_point(item), session_id=item.get("sessionId"), format=item["format"], title=item["title"], passed=item["passed"])
                  for item in items],
    )
