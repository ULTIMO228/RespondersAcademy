"""Пользователь запроса (viewer) из cookie arm112_session или Bearer; проверка ролей."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import unquote

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import forbidden, unauthorized, validation_failed
from app.db.session import get_db
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.security import decode_token, jti_hash

SESSION_COOKIE = "arm112_session"
OWN_DATA_ONLY_MESSAGE = "Обучающемуся доступны только собственные результаты"
SESSION_REQUIRED_MESSAGE = "Войдите в систему, чтобы просмотреть результаты"
ROLES = ("student", "teacher", "admin")


@dataclass(frozen=True)
class Viewer:
    user_id: str
    role: str
    session_hash: str = ""

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


def _looks_like_jwt(raw: str) -> bool:
    """Серверная cookie сессии — «голый» JWT (три base64url-сегмента); JSON начинается с `{` / `%7B`."""
    return raw.count(".") == 2 and not raw.lstrip().startswith(("{", "%7B", "%7b"))


def viewer_from_request(request: Request) -> Viewer | None:
    """Нет cookie / битая / истёкшая или неподписанная сессия → None (аноним, как в моке).

    Источники токена: cookie из одного JWT (её выдаёт сервер при входе), устаревшая JSON-cookie
    (переходный период) и заголовок Bearer (приоритетнее cookie).
    """
    token: str | None = None
    session: dict[str, Any] | None = None
    raw_cookie = request.cookies.get(SESSION_COOKIE)
    if raw_cookie and _looks_like_jwt(raw_cookie):
        token = raw_cookie
    else:
        session = _parse_cookie(raw_cookie)
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
    if session and (session.get("userId") not in (None, user_id) or session.get("role") not in (None, role)):
        return None
    return Viewer(user_id=user_id, role=role, session_hash=jti_hash(payload["jti"]))


async def get_viewer(request: Request, db: AsyncSession = Depends(get_db)) -> Viewer | None:
    """Проверяет подпись и действующую серверную сессию с текущей ролью пользователя."""
    viewer = viewer_from_request(request)
    if viewer is None:
        return None
    row = (
        await db.execute(
            select(AuthSession, User)
            .join(User, User.id == AuthSession.user_id)
            .where(AuthSession.jti_hash == viewer.session_hash)
        )
    ).one_or_none()
    if row is None:
        return None
    session, user = row
    now = int(datetime.now(UTC).timestamp())
    if session.revoked_at is not None or session.expires_at <= now or not user.is_active or user.role != viewer.role:
        return None
    if session.user_id != viewer.user_id:
        return None
    return viewer


async def require_viewer(viewer: Viewer | None = Depends(get_viewer)) -> Viewer:
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
    """Администратор определяется только действующей серверной сессией."""
    if viewer is None:
        raise unauthorized(SESSION_REQUIRED_MESSAGE)
    if viewer.role != "admin" or (admin_id is not None and admin_id != viewer.user_id):
        raise forbidden("Действие доступно только администратору")
    user = await db.get(User, viewer.user_id)
    if user is None or user.role != "admin":
        raise forbidden("Действие доступно только администратору")
    return user


async def require_teacher_actor(db: AsyncSession, viewer: Viewer | None, user_id: object, field: str) -> User:
    """Преподаватель-автор действия по id из тела/query (как в моке: 400, если это не преподаватель).

    При наличии сессии: обучающийся → 403; преподаватель может действовать только от своего
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
