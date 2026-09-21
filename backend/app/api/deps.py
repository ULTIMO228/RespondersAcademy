"""Пользователь запроса (viewer) из cookie arm112_session или Bearer; проверка ролей."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import forbidden, unauthorized, validation_failed
from app.db.session import get_db
from app.models.user import User
from app.services.security import decode_token

SESSION_COOKIE = "arm112_session"
OWN_DATA_ONLY_MESSAGE = "Обучающемуся доступны только собственные результаты"
SESSION_REQUIRED_MESSAGE = "Войдите в систему, чтобы просмотреть результаты"
ROLES = ("student", "teacher", "admin")


@dataclass(frozen=True)
class Viewer:
    user_id: str
    role: str

    @property
    def is_student(self) -> bool:
        return self.role == "student"


def _parse_cookie(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    for candidate in (raw, unquote(raw)):
        try:
            parsed = json.loads(candidate)
        except (ValueError, TypeError):
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def viewer_from_request(request: Request) -> Viewer | None:
    """Нет cookie / битая / истёкшая или неподписанная сессия → None (аноним, как в моке)."""
    token: str | None = None
    session = _parse_cookie(request.cookies.get(SESSION_COOKIE))
    if session and isinstance(session.get("token"), str):
        token = session["token"]
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    user_id, role = payload.get("sub"), payload.get("role")
    if not isinstance(user_id, str) or role not in ROLES:
        return None
    if session and session.get("userId") not in (None, user_id):
        return None
    return Viewer(user_id=user_id, role=role)


def get_viewer(request: Request) -> Viewer | None:
    return viewer_from_request(request)


def require_viewer(request: Request) -> Viewer:
    viewer = viewer_from_request(request)
    if viewer is None:
        raise unauthorized(SESSION_REQUIRED_MESSAGE)
    return viewer


def require_role(*roles: str):
    def dependency(viewer: Viewer = Depends(require_viewer)) -> Viewer:
        if viewer.role not in roles:
            raise forbidden("Недостаточно прав")
        return viewer

    return dependency


def resolve_student_scope(viewer: Viewer | None, requested_student_id: str | None) -> str | None:
    """Обучающийся: всегда свой id (чужой → 403); аноним со studentId → 401; иначе — из query."""
    if viewer is not None and viewer.is_student:
        if requested_student_id is not None and requested_student_id != viewer.user_id:
            raise forbidden(OWN_DATA_ONLY_MESSAGE)
        return viewer.user_id
    if requested_student_id is not None and viewer is None:
        raise unauthorized(SESSION_REQUIRED_MESSAGE)
    return requested_student_id


def assert_own_attempt(viewer: Viewer | None, attempt_student_id: str) -> None:
    if viewer is not None and viewer.is_student and viewer.user_id != attempt_student_id:
        raise forbidden(OWN_DATA_ONLY_MESSAGE)


async def require_admin_actor(db: AsyncSession, viewer: Viewer | None, admin_id: str | None) -> User:
    """Совместимый режим мока: администратор — по viewer либо по adminId из тела (403 иначе)."""
    actor_id = viewer.user_id if viewer is not None else admin_id
    if viewer is not None and viewer.role != "admin":
        raise forbidden("Действие доступно только администратору")
    if not actor_id:
        raise forbidden("Действие доступно только администратору")
    user = await db.get(User, actor_id)
    if user is None or user.role != "admin":
        raise forbidden("Действие доступно только администратору")
    return user


async def require_teacher_actor(db: AsyncSession, viewer: Viewer | None, user_id: object, field: str) -> User:
    """Преподаватель-автор действия по id из тела/query (как в моке: 400, если это не преподаватель).

    При наличии сессии (решение Phase 5): обучающийся → 403; преподаватель может действовать только от своего
    имени → иначе 403; администратор — без ограничений.
    """
    if viewer is not None and viewer.role not in ("teacher", "admin"):
        raise forbidden("Действие доступно преподавателю и администратору")
    user = await db.get(User, user_id) if isinstance(user_id, str) and user_id else None
    if user is None or user.role != "teacher":
        raise validation_failed(f"Поле «{field}» — userId преподавателя")
    if viewer is not None and viewer.role == "teacher" and viewer.user_id != user.id:
        raise forbidden("Нельзя действовать от имени другого преподавателя")
    return user


def actor_role(viewer: Viewer | None, fallback: str = "teacher") -> str:
    return viewer.role if viewer is not None else fallback


DbDep = Depends(get_db)
ViewerDep = Depends(get_viewer)
