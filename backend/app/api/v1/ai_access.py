"""Проверка доступа AI-маршрутов по подписанной серверной сессии."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import forbidden, not_found, unauthorized
from app.models.ai_scenario import ScenarioVersion
from app.models.assignment import Assignment, AssignmentScenarioVersion, AssignmentStudent
from app.models.scenario import Scenario
from app.models.session import Attempt, TrainingSession


def _authenticated(viewer: Viewer | None) -> Viewer:
    if viewer is None:
        raise unauthorized("Войдите в систему, чтобы просмотреть AI-ресурсы")
    return viewer


async def require_session_access(
    db: AsyncSession,
    session_id: str,
    viewer: Viewer | None,
    *,
    allow_student_participant: bool = False,
) -> TrainingSession:
    """По умолчанию занятие доступно преподавателю и администратору; студенту — только явно."""
    actor = _authenticated(viewer)
    row = await db.get(TrainingSession, session_id)
    if row is None:
        raise not_found(f"Занятие «{session_id}» не найдено")
    if actor.role == "admin":
        return row
    if actor.role == "teacher" and row.teacher_id == actor.user_id:
        return row
    if allow_student_participant and actor.role == "student" and actor.user_id in (row.student_ids or []):
        return row
    raise forbidden("Нет доступа к занятию")


async def require_attempt_access(db: AsyncSession, attempt_id: str, viewer: Viewer | None) -> Attempt:
    """Проверяет владельца попытки и привязку преподавателя к занятию."""
    actor = _authenticated(viewer)
    row = await db.get(Attempt, attempt_id)
    if row is None:
        raise not_found(f"Попытка «{attempt_id}» не найдена")
    if actor.role == "admin":
        return row
    if actor.role == "student":
        if row.student_id != actor.user_id:
            raise forbidden("Обучающемуся доступны только собственные попытки")
        await require_session_access(db, row.session_id, actor, allow_student_participant=True)
        return row
    if actor.role == "teacher":
        await require_session_access(db, row.session_id, actor)
        return row
    raise forbidden("Нет доступа к попытке")


async def require_scenario_access(
    db: AsyncSession, scenario_id: str, viewer: Viewer | None, *, version: int | None = None
) -> Scenario:
    """Ограничивает сценарий автором/занятием, а обучающегося — назначенной утверждённой версией."""
    actor = _authenticated(viewer)
    scenario = await db.get(Scenario, scenario_id)
    if scenario is None or scenario.deleted:
        raise not_found(f"Сценарий «{scenario_id}» не найден")
    if actor.role == "admin":
        return scenario

    if actor.role == "teacher":
        owned = (
            await db.execute(
                select(ScenarioVersion.scenario_id)
                .where(ScenarioVersion.scenario_id == scenario_id, ScenarioVersion.created_by == actor.user_id)
                .limit(1)
            )
        ).first()
        if owned is not None:
            return scenario
        raise forbidden("Нет доступа к сценарию")

    if actor.role == "student":
        if version is None:
            raise forbidden("Для доступа к AI-сценарию требуется точная назначенная версия")
        assigned = (
            await db.execute(
                select(ScenarioVersion)
                .join(
                    AssignmentScenarioVersion,
                    (AssignmentScenarioVersion.scenario_id == ScenarioVersion.scenario_id)
                    & (AssignmentScenarioVersion.version == ScenarioVersion.version),
                )
                .join(Assignment, Assignment.id == AssignmentScenarioVersion.assignment_id)
                .join(AssignmentStudent, AssignmentStudent.assignment_id == Assignment.id)
                .where(
                    ScenarioVersion.scenario_id == scenario_id,
                    ScenarioVersion.version == version,
                    ScenarioVersion.approval == "approved",
                    ScenarioVersion.validation == "passed",
                    AssignmentStudent.student_id == actor.user_id,
                    AssignmentScenarioVersion.mode == ScenarioVersion.mode,
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if assigned is not None:
            return scenario
        raise forbidden("Доступны только утверждённые сценарии своего занятия или задания")

    raise forbidden("Нет доступа к сценарию")
