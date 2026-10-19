"""Сводная успеваемость для руководства (спека 005): расчёт «все вместе / группы / обучающиеся» на чтении.

Попытка — оценённая (`Attempt` ⋈ `Evaluation`) за период по `Evaluation.generated_at`; итоговый балл — оценка, а если
есть правка преподавателя, то последняя правка (как `effective_score` в отчёте занятия). Нормативы — по умолчанию
(`TimeNorms`: 30 с / 3 мин). Правила и пороги — `data-model.md`. Доступ: teacher — группы из `assigned_groups`, admin — все.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import forbidden
from app.models.session import Attempt, Evaluation, TeacherOverride, TrainingSession
from app.models.user import User
from app.schemas.performance import (
    PerformanceError,
    PerformanceFilters,
    PerformanceGroupRow,
    PerformanceReport,
    PerformanceStats,
    PerformanceStudentRow,
    PerformanceThresholds,
)
from app.services.error_map_access import require_group_access
from app.services.error_map_stages import rule_plain, stage_for_rule
from app.services.time import MOSCOW, now_iso, to_moscow_iso
from ml.assess.engine import TimeNorms

NO_GROUP: Final = "Без группы"
MIN_ATTEMPTS_STUDENT: Final = 3
MIN_ATTEMPTS_GROUP: Final = 5
RISK_SCORE: Final = 60
TOP_ERRORS: Final = 5
PERIOD_DAYS: Final = {"2w": 14, "1m": 30}


@dataclass(frozen=True, slots=True)
class Filters:
    mode: str = "all"
    period: str = "1m"
    date_from: date | None = None
    date_to: date | None = None
    group_id: str | None = None


@dataclass(frozen=True, slots=True)
class Row:
    student_id: str
    mode: str
    score: int
    reaction_ms: int
    processing_ms: int
    exam: bool
    passed: bool
    rules: tuple[str, ...]


def _windows(filters: Filters, now: datetime) -> tuple[tuple[str | None, str | None], tuple[str, str] | None]:
    """Текущее окно `[lo, hi)` и предыдущее окно той же длины (для `all` предыдущего нет)."""
    if filters.period == "all":
        return (None, None), None
    if filters.period == "range":
        assert filters.date_from and filters.date_to
        length = (filters.date_to - filters.date_from).days + 1
        lo = datetime.combine(filters.date_from, datetime.min.time(), MOSCOW)
        hi = datetime.combine(filters.date_to + timedelta(days=1), datetime.min.time(), MOSCOW)
        return (to_moscow_iso(lo), to_moscow_iso(hi)), (to_moscow_iso(lo - timedelta(days=length)), to_moscow_iso(lo))
    days = PERIOD_DAYS[filters.period]
    lo = now - timedelta(days=days)
    return (to_moscow_iso(lo), None), (to_moscow_iso(lo - timedelta(days=days)), to_moscow_iso(lo))


async def _load(
    db: AsyncSession, student_ids: list[str], mode: str, window: tuple[str | None, str | None]
) -> list[Row]:
    if not student_ids:
        return []
    query = (
        select(
            Attempt.id,
            Attempt.student_id,
            Attempt.mode,
            Attempt.session_id,
            Attempt.primary_reaction_ms,
            Attempt.completed_at,
            Attempt.full_processing_ms,
            Evaluation.total_score,
            Evaluation.errors,
        )
        .join(Evaluation, Evaluation.attempt_id == Attempt.id)
        .where(Attempt.student_id.in_(student_ids))
    )
    if mode != "all":
        query = query.where(Attempt.mode == mode)
    low, high = window
    if low is not None:
        query = query.where(Evaluation.generated_at >= low)
    if high is not None:
        query = query.where(Evaluation.generated_at < high)
    found = (await db.execute(query)).all()
    if not found:
        return []
    overrides: dict[str, int] = {}
    for attempt_id, score in (
        await db.execute(
            select(TeacherOverride.attempt_id, TeacherOverride.score)
            .where(TeacherOverride.attempt_id.in_(select(Attempt.id).where(Attempt.student_id.in_(student_ids))))
            .order_by(TeacherOverride.id)
        )
    ).all():
        overrides[attempt_id] = score  # последняя правка перекрывает предыдущие
    sessions = {
        row.id: row
        for row in (
            await db.execute(select(TrainingSession).where(TrainingSession.id.in_({r.session_id for r in found})))
        ).scalars()
    }
    result: list[Row] = []
    for row in found:
        score = overrides.get(row.id, row.total_score)
        session = sessions.get(row.session_id)
        exam = bool(session and session.format == "exam")
        threshold = (session.exam or {}).get("passThreshold") if session else None
        passed = exam and isinstance(threshold, (int, float)) and not isinstance(threshold, bool) and score >= threshold
        measured_processing = row.full_processing_ms if row.completed_at else 0
        result.append(
            Row(
                student_id=row.student_id,
                mode=row.mode,
                score=int(score),
                reaction_ms=int(row.primary_reaction_ms or 0),
                processing_ms=int(measured_processing or 0),
                exam=exam,
                passed=bool(passed),
                rules=tuple(dict.fromkeys(str(e.get("ruleId")) for e in (row.errors or []) if e.get("ruleId"))),
            )
        )
    return result


def _share(values: list[int], limit: int) -> float | None:
    measured = [value for value in values if value > 0]
    return round(sum(1 for value in measured if value <= limit) / len(measured), 3) if measured else None


def _stats(rows: list[Row], previous: list[Row] | None, students: int, minimum: int) -> PerformanceStats:
    count = len(rows)
    enough = count >= minimum
    average = round(sum(r.score for r in rows) / count, 1) if enough else None
    before = round(sum(r.score for r in previous) / len(previous), 1) if previous else None
    norms = TimeNorms()
    weak: str | None = None
    if enough:
        per_stage: Counter[str] = Counter()
        titles: dict[str, tuple[int, str]] = {}
        for row in rows:
            for stage in {stage_for_rule(row.mode, rule) for rule in row.rules}:
                per_stage[stage.id] += 1
                titles[stage.id] = (stage.order, stage.title)
        if per_stage:
            best = min(per_stage, key=lambda stage_id: (-per_stage[stage_id], titles[stage_id][0]))
            weak = titles[best][1]
    level = "noData" if not enough else "risk" if average is not None and average < RISK_SCORE else "ok"
    return PerformanceStats(
        students=students,
        active_students=len({r.student_id for r in rows}),
        attempts=count,
        avg_score=average,
        previous_avg_score=before,
        delta=round(average - before, 1) if average is not None and before is not None else None,
        reaction_in_norm_share=_share([r.reaction_ms for r in rows], norms.primary_reaction_ms) if enough else None,
        processing_in_norm_share=_share([r.processing_ms for r in rows], norms.full_processing_ms) if enough else None,
        exams=sum(1 for r in rows if r.exam),
        exams_passed=sum(1 for r in rows if r.passed),
        weak_stage=weak,
        level=level,
    )


async def build_report(
    db: AsyncSession, viewer: Viewer, filters: Filters, *, now: datetime | None = None
) -> PerformanceReport:
    if viewer.role not in ("teacher", "admin"):
        raise forbidden("Сводка успеваемости доступна преподавателю и администратору")
    if filters.group_id:
        await require_group_access(db, viewer, filters.group_id)
    query = select(User).where(User.role == "student")
    if filters.group_id:
        query = query.where(User.group == filters.group_id)
    elif viewer.role == "teacher":
        teacher = await db.get(User, viewer.user_id)
        query = query.where(User.group.in_(list(teacher.assigned_groups or []) if teacher else []))
    students = list((await db.execute(query)).scalars())

    moment = now or datetime.now(MOSCOW)
    current_window, previous_window = _windows(filters, moment)
    ids = [s.id for s in students]
    rows = await _load(db, ids, filters.mode, current_window)
    previous_rows = await _load(db, ids, filters.mode, previous_window) if previous_window else []

    def title(group: str | None) -> str:
        return group or NO_GROUP

    by_group: dict[str, list[User]] = defaultdict(list)
    for student in students:
        by_group[title(student.group)].append(student)
    rows_by_student: dict[str, list[Row]] = defaultdict(list)
    previous_by_student: dict[str, list[Row]] = defaultdict(list)
    for row in rows:
        rows_by_student[row.student_id].append(row)
    for row in previous_rows:
        previous_by_student[row.student_id].append(row)

    def collect(source: dict[str, list[Row]], members: list[User]) -> list[Row]:
        return [row for member in members for row in source.get(member.id, [])]

    use_previous = previous_window is not None
    group_rows = [
        PerformanceGroupRow(
            group_id=name,
            title=name,
            stats=_stats(
                collect(rows_by_student, members),
                collect(previous_by_student, members) if use_previous else None,
                len(members),
                MIN_ATTEMPTS_GROUP,
            ),
        )
        for name, members in sorted(by_group.items(), key=lambda item: (item[0] == NO_GROUP, item[0].casefold()))
    ]
    student_rows = [
        PerformanceStudentRow(
            student_id=student.id,
            name=student.full_name,
            group_id=student.group,
            stats=_stats(
                rows_by_student.get(student.id, []),
                previous_by_student.get(student.id) if use_previous else None,
                1,
                MIN_ATTEMPTS_STUDENT,
            ),
        )
        for student in sorted(students, key=lambda s: (title(s.group) == NO_GROUP, title(s.group).casefold(), s.full_name.casefold()))
    ]
    errors: Counter[str] = Counter()
    for row in rows:
        for rule in row.rules:
            errors[rule_plain(rule)] += 1
    top = sorted(errors.items(), key=lambda item: (-item[1], item[0]))[:TOP_ERRORS]
    return PerformanceReport(
        filters=PerformanceFilters(
            mode=filters.mode,  # type: ignore[arg-type]
            period=filters.period,  # type: ignore[arg-type]
            date_from=filters.date_from.isoformat() if filters.date_from else None,
            date_to=filters.date_to.isoformat() if filters.date_to else None,
            group_id=filters.group_id,
        ),
        generated_at=now_iso(),
        thresholds=PerformanceThresholds(
            min_attempts_student=MIN_ATTEMPTS_STUDENT, min_attempts_group=MIN_ATTEMPTS_GROUP, risk_score=RISK_SCORE
        ),
        totals=_stats(rows, previous_rows if use_previous else None, len(students), MIN_ATTEMPTS_GROUP),
        groups=group_rows,
        students=student_rows,
        top_errors=[PerformanceError(label=label, attempts=count) for label, count in top],
    )
