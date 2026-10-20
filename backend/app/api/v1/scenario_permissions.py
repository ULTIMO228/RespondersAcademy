"""Выдача прав эксперта сценариев преподавателю (только администратор)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import Viewer, require_role
from app.api.errors import not_found, validation_failed
from app.db.session import get_db
from app.models.user import User
from app.schemas.v1.ai import ScenarioPermissionsRequest
from app.services.audit import record

admin_only = require_role("admin")
router = APIRouter(prefix="/admin/users", tags=["Scenario permissions"])


@router.get("/{user_id}/permissions")
async def read_permissions(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(admin_only),
) -> dict[str, Any]:
    user = await db.get(User, user_id)
    if user is None:
        raise not_found(f"Пользователь «{user_id}» не найден")
    return {"userId": user.id, "permissions": list(user.permissions or [])}


@router.put("/{user_id}/permissions")
async def set_permissions(
    user_id: str,
    body: ScenarioPermissionsRequest,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(admin_only),
) -> dict[str, Any]:
    user = await db.get(User, user_id)
    if user is None:
        raise not_found(f"Пользователь «{user_id}» не найден")
    if user.role != "teacher" and body.permissions:
        raise validation_failed("Права эксперта сценариев выдаются только преподавателю")
    user.permissions = list(body.permissions) or None
    flag_modified(user, "permissions")
    await record(db, action="user.permissions", user_id=viewer.user_id, role=viewer.role,
                 details=f"Права эксперта сценариев пользователя {user.id}: {', '.join(body.permissions) or 'нет'}")
    await db.commit()
    return {"userId": user.id, "permissions": list(body.permissions)}
