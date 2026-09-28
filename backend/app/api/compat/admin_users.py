"""Реестр пользователей администратора (T069) — порт `src/shared/api/mock/admin-users.ts`.

Доступ: viewer-администратор либо `adminId` в теле (совместимый режим мока, 403 иначе); списки — viewer не
администратор → 403, аноним — как мок. Каждая мутация пишет аудит `user.*`; наружу — `PublicUser` без пароля.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, get_viewer, require_admin_actor
from app.api.errors import conflict, forbidden, not_found, validation_failed
from app.db.ids import PREFIX, next_id
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin import (
    ADMIN_ONLY_MESSAGE,
    ADMIN_USER_STATES,
    LOGIN_TAKEN_MESSAGE,
    ROLE_TITLE,
    ROLES,
    SELF_BLOCK_MESSAGE,
    AdminUserCreateRequest,
    AdminUserUpdateRequest,
)
from app.schemas.common import read_string
from app.schemas.scenarios import parse_body
from app.services import audit
from app.services.security import hash_password, revoke_user_sessions, temporary_password

router = APIRouter()


def _assert_admin_viewer(viewer: Viewer | None) -> None:
    if viewer is None or viewer.role != "admin":
        raise forbidden(ADMIN_ONLY_MESSAGE)


async def _actor(db: AsyncSession, viewer: Viewer | None, raw: dict[str, Any]) -> User:
    """Администратор-инициатор: viewer либо `adminId` тела; без обоих — 400 «Укажите adminId» (как мок)."""
    admin_id = raw.get("adminId")
    return await require_admin_actor(db, viewer, admin_id.strip() if isinstance(admin_id, str) else None)


async def _require_user(db: AsyncSession, user_id: str) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise not_found(f"Пользователь «{user_id}» не найден")
    return user


async def _assert_login_free(db: AsyncSession, login: str, owner_id: str | None = None) -> None:
    taken = (await db.execute(select(User).where(User.login == login))).scalar_one_or_none()
    if taken is not None and taken.id != owner_id:
        raise conflict(LOGIN_TAKEN_MESSAGE)


def _describe(user: User) -> str:
    return f"{user.login} ({user.id})"


async def _audit(db: AsyncSession, admin: User, action: str, details: str) -> None:
    await audit.record(db, action=action, user_id=admin.id, role="admin", details=details, operator_arm=admin.arm_number)


def _apply_role_fields(user: User, role: str, group: str | None, service: str | None, assigned_groups: list[str] | None) -> None:
    """Ролевые поля по правилам роли (T4.1-08): лишние отбрасываются, не переданные сохраняются."""
    user.role = role
    user.group = (group or user.group) if role == "student" else None
    user.service = None if role == "admin" else (service or user.service)
    user.assigned_groups = (assigned_groups or user.assigned_groups) if role == "teacher" else None


@router.get("/admin/users")
async def list_admin_users(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> list[dict[str, Any]]:
    _assert_admin_viewer(viewer)
    params = request.query_params
    role = read_string(params, "role")
    if role is not None and role not in ROLES:
        raise validation_failed(f"Некорректная роль: {role}")
    state = read_string(params, "state")
    if state is not None and state not in ADMIN_USER_STATES:
        raise validation_failed(f"Некорректное состояние: {state}")
    group = read_string(params, "group")
    query = (read_string(params, "q") or "").lower()
    rows = (await db.execute(select(User).order_by(User.id))).scalars().all()
    result = []
    for user in rows:
        if role and user.role != role:
            continue
        if group and user.group != group:
            continue
        if state and user.is_active != (state == "active"):
            continue
        if query and query not in f"{user.full_name} {user.login}".lower():
            continue
        result.append(user.to_public())
    return result


@router.post("/admin/users")
async def create_admin_user(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> JSONResponse:
    raw = await read_body(request)
    admin = await _actor(db, viewer, raw)
    body: AdminUserCreateRequest = parse_body(AdminUserCreateRequest, raw)
    await _assert_login_free(db, body.login)
    user = User(
        id=await next_id(db, PREFIX["user"], User.id),
        login=body.login,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        arm_number=body.arm_number,
        is_active=True,
    )
    _apply_role_fields(user, body.role, body.group, body.service, body.assigned_groups)
    db.add(user)
    await db.flush()
    await _audit(db, admin, "user.create", f"Создана учётная запись {_describe(user)}, роль «{ROLE_TITLE[user.role]}», АРМ {user.arm_number}")
    await db.commit()
    return JSONResponse(status_code=201, content=user.to_public())


def _collect_changes(before: dict[str, Any], user: User) -> list[str]:
    changes: list[str] = []
    if before["full_name"] != user.full_name:
        changes.append(f"ФИО «{before['full_name']}» → «{user.full_name}»")
    if before["login"] != user.login:
        changes.append(f"логин «{before['login']}» → «{user.login}»")
    if before["arm_number"] != user.arm_number:
        changes.append(f"АРМ {before['arm_number']} → {user.arm_number}")
    if before["group"] != user.group:
        changes.append(f"группа «{before['group'] or '—'}» → «{user.group or '—'}»")
    if before["service"] != user.service:
        changes.append(f"служба «{before['service'] or '—'}» → «{user.service or '—'}»")
    if ", ".join(before["assigned_groups"] or []) != ", ".join(user.assigned_groups or []):
        changes.append(f"закреплённые группы «{', '.join(before['assigned_groups'] or []) or '—'}» → «{', '.join(user.assigned_groups or []) or '—'}»")
    return changes


@router.patch("/admin/users/{user_id}")
async def update_admin_user(user_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    raw = await read_body(request)
    admin = await _actor(db, viewer, raw)
    body: AdminUserUpdateRequest = parse_body(AdminUserUpdateRequest, raw)
    user = await _require_user(db, user_id)
    before = {"full_name": user.full_name, "login": user.login, "arm_number": user.arm_number, "group": user.group, "service": user.service, "assigned_groups": list(user.assigned_groups or []), "role": user.role}
    next_role = body.role or user.role
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.login is not None:
        await _assert_login_free(db, body.login, user.id)
        user.login = body.login
    if body.arm_number is not None:
        user.arm_number = body.arm_number
    _apply_role_fields(user, next_role, body.group, body.service, body.assigned_groups)
    await db.flush()
    if next_role != before["role"]:
        await revoke_user_sessions(db, user.id)
        await _audit(db, admin, "user.roleChange", f"Изменена роль учётной записи {_describe(user)}: «{ROLE_TITLE[before['role']]}» → «{ROLE_TITLE[next_role]}»")
    changes = _collect_changes(before, user)
    if changes:
        await _audit(db, admin, "user.update", f"Изменена учётная запись {_describe(user)}: {'; '.join(changes)}")
    await db.commit()
    return user.to_public()


async def _read_action(request: Request, db: AsyncSession, viewer: Viewer | None) -> User:
    return await _actor(db, viewer, await read_body(request))


async def _set_active(db: AsyncSession, admin: User, user_id: str, is_active: bool) -> dict[str, Any]:
    if user_id == admin.id:
        raise conflict(SELF_BLOCK_MESSAGE)
    user = await _require_user(db, user_id)
    user.is_active = is_active
    await revoke_user_sessions(db, user.id)
    if is_active:
        user.failed_logins = 0
        user.locked_until = None
    await db.flush()
    await _audit(db, admin, "user.unblock" if is_active else "user.block", f"{'Разблокирован' if is_active else 'Заблокирован'} пользователь {_describe(user)}")
    await db.commit()
    return user.to_public()


@router.post("/admin/users/{user_id}/block")
async def block_user(user_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    admin = await _read_action(request, db, viewer)
    return await _set_active(db, admin, user_id, False)


@router.post("/admin/users/{user_id}/unblock")
async def unblock_user(user_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    admin = await _read_action(request, db, viewer)
    return await _set_active(db, admin, user_id, True)


@router.post("/admin/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    admin = await _read_action(request, db, viewer)
    user = await _require_user(db, user_id)
    return await _set_active(db, admin, user_id, not user.is_active)


@router.post("/admin/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    admin = await _read_action(request, db, viewer)
    user = await _require_user(db, user_id)
    password = temporary_password()
    user.password_hash = hash_password(password)
    await revoke_user_sessions(db, user.id)
    user.failed_logins = 0
    user.locked_until = None
    await db.flush()
    await _audit(db, admin, "user.passwordReset", f"Сброшен пароль учётной записи {_describe(user)}; выдан временный пароль")
    await db.commit()
    return {"user": user.to_public(), "temporaryPassword": password}
