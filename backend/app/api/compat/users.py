"""GET /users — состав групп для мастера занятия и мониторинга; обучающемуся — 403."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ROLES, Viewer, get_viewer
from app.api.errors import forbidden, validation_failed
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import read_string

router = APIRouter()


@router.get("/users")
async def list_users(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> list[dict[str, Any]]:
    if viewer is not None and viewer.is_student:
        raise forbidden("Список пользователей недоступен обучающемуся")
    role = read_string(request.query_params, "role")
    group = read_string(request.query_params, "group")
    if role is not None and role not in ROLES:
        raise validation_failed(f"Некорректная роль: {role}")
    query = select(User).order_by(User.id)
    if role:
        query = query.where(User.role == role)
    if group:
        query = query.where(User.group == group)
    rows = (await db.execute(query)).scalars().all()
    return [row.to_public() for row in rows]
