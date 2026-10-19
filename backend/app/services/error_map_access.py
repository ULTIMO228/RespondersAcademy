"""Права карты ошибок (спека 003, FR-028; research.md R4, решение D7).

Правило: преподаватель видит группу только если она закреплена за ним в `User.assigned_groups` и реально
существует. Группы по занятиям и заданиям правом доступа не являются. Администратор читает всё. Обучающийся
не допускается ни к одной точке карты (его данные — только `GET /me/focus`).

Группа существует, если есть хотя бы один пользователь с ролью `student` и `User.group == groupId`
(активность не учитывается: заблокированный обучающийся тоже делает группу существующей).

Порядок проверок одинаков для всех функций модуля:
1. нет сессии → 401 (`unauthorized`);
2. роль не `teacher` и не `admin` (в том числе обучающийся) → 403 — до поиска, чтобы обучающийся не получал
   по кодам 404/403 сведений о существовании групп и людей;
3. существование: группы — есть обучающийся с этой группой; обучающегося — пользователь с этим id и ролью
   `student`; иначе 404. Существование проверяется раньше прав: несуществующая группа даёт 404 даже
   преподавателю без закреплений;
4. права: администратор — без ограничений; преподаватель — только группа из `assigned_groups`
   (пусто = ни одной); иначе 403 «Нет доступа к группе / обучающемуся».
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import forbidden, not_found, unauthorized
from app.models.user import User

ACCESS_DENIED_MESSAGE = "Нет доступа к группе / обучающемуся"
_MANAGERS = ("teacher", "admin")


@dataclass(frozen=True)
class AccessibleGroup:
    group_id: str
    student_count: int


def _actor(viewer: Viewer | None) -> Viewer:
    if viewer is None:
        raise unauthorized("Войдите в систему, чтобы просмотреть карту ошибок")
    if viewer.role not in _MANAGERS:
        raise forbidden("Карта ошибок доступна преподавателю и администратору")
    return viewer


async def _assigned_groups(db: AsyncSession, actor: Viewer) -> list[str]:
    user = await db.get(User, actor.user_id)
    return list(user.assigned_groups or []) if user is not None else []


async def _student_count(db: AsyncSession, group_id: str) -> int:
    return int(
        (
            await db.execute(
                select(func.count(User.id)).where(User.role == "student", User.group == group_id)
            )
        ).scalar_one()
    )


async def accessible_groups(db: AsyncSession, viewer: Viewer | None) -> list[AccessibleGroup]:
    """Группы, доступные пользователю, по возрастанию id.

    Администратор — все группы, у которых есть обучающиеся. Преподаватель — пересечение `assigned_groups`
    с группами, реально существующими у обучающихся; пустые `assigned_groups` дают пустой список.
    """
    actor = _actor(viewer)
    statement = (
        select(User.group, func.count(User.id))
        .where(User.role == "student", User.group.is_not(None))
        .group_by(User.group)
    )
    if actor.role == "teacher":
        assigned = await _assigned_groups(db, actor)
        if not assigned:
            return []
        statement = statement.where(User.group.in_(assigned))
    rows = (await db.execute(statement)).all()
    return sorted(
        (AccessibleGroup(group_id=str(group), student_count=int(count)) for group, count in rows),
        key=lambda item: item.group_id,
    )


async def require_group_access(db: AsyncSession, viewer: Viewer | None, group_id: str) -> AccessibleGroup:
    """Проверка доступа к группе; см. порядок проверок в докстринге модуля."""
    actor = _actor(viewer)
    count = await _student_count(db, group_id)
    if count == 0:
        raise not_found(f"Группа «{group_id}» не найдена")
    if actor.role == "admin":
        return AccessibleGroup(group_id=group_id, student_count=count)
    if group_id not in await _assigned_groups(db, actor):
        raise forbidden(ACCESS_DENIED_MESSAGE)
    return AccessibleGroup(group_id=group_id, student_count=count)


async def require_student_access(db: AsyncSession, viewer: Viewer | None, student_id: str) -> User:
    """Проверка доступа к обучающемуся: его группа должна быть закреплена за преподавателем.

    Обучающийся без группы недоступен преподавателю; администратору доступен любой обучающийся.
    Пользователь с другой ролью (например, преподаватель) по этому id — 404.
    """
    actor = _actor(viewer)
    student = await db.get(User, student_id)
    if student is None or student.role != "student":
        raise not_found(f"Обучающийся «{student_id}» не найден")
    if actor.role == "admin":
        return student
    if not student.group or student.group not in await _assigned_groups(db, actor):
        raise forbidden(ACCESS_DENIED_MESSAGE)
    return student
