"""Права эксперта сценариев: проверка и публикация выдаются пользователю, а не новой ролью JWT."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import forbidden
from app.models.user import User

REVIEW = "scenario.review"
PUBLISH = "scenario.publish"
ALL_PERMISSIONS = (REVIEW, PUBLISH)


async def user_permissions(db: AsyncSession, viewer: Viewer) -> set[str]:
    """Администратор имеет все права; преподаватель — только выданные; остальные роли — никаких."""
    if viewer.role == "admin":
        return set(ALL_PERMISSIONS)
    if viewer.role != "teacher":
        return set()
    user = await db.get(User, viewer.user_id)
    if user is None or not user.is_active:
        return set()
    return {item for item in (user.permissions or []) if item in ALL_PERMISSIONS}


async def require_permission(db: AsyncSession, viewer: Viewer, permission: str) -> None:
    if permission not in await user_permissions(db, viewer):
        raise forbidden("Недостаточно прав: требуется право эксперта сценариев")
