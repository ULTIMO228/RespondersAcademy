"""Привязка профильных категорий: контракт teacher.ts, аудит и атомарное сохранение."""

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, get_viewer
from app.api.errors import forbidden, not_found, validation_failed
from app.db.session import get_db
from app.models.teacher import ProfileMappingRow
from app.models.user import User
from app.services.audit import record
from app.services.reference import read_reference
from app.services.time import now_iso

router = APIRouter()


async def mapping_contract(db: AsyncSession) -> list[dict[str, Any]]:
    counts = dict((await db.execute(select(User.service, func.count()).where(User.role == "student").group_by(User.service))).all())
    rows = (await db.execute(select(ProfileMappingRow))).scalars().all()
    return [row.to_contract(counts.get(row.profile, 0)) for row in rows]


@router.get("/profile-mapping")
async def get_mapping(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    return await mapping_contract(db)


@router.put("/profile-mapping")
async def save_mapping(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> list[dict[str, Any]]:
    body = await read_body(request)
    if viewer and viewer.role not in ("teacher", "admin"):
        raise forbidden("Действие доступно преподавателю и администратору")
    teacher = await db.get(User, body["savedBy"]) if isinstance(body.get("savedBy"), str) else None
    if teacher is None or teacher.role != "teacher":
        raise validation_failed("Поле «savedBy» — userId преподавателя")
    if viewer and viewer.role == "teacher" and viewer.user_id != teacher.id:
        raise forbidden("Нельзя сохранить привязку от имени другого преподавателя")
    items = body.get("rows")
    if not isinstance(items, list) or not items:
        raise validation_failed("Передайте строки привязки профильных категорий")
    groups = set((await read_reference(db))["incidentGroups"])
    updates = []
    for item in items:
        row = await db.get(ProfileMappingRow, item["id"]) if isinstance(item, dict) and isinstance(item.get("id"), str) else None
        if row is None:
            raise not_found("Профиль обучающихся не найден")
        selected = item.get("incidentGroups")
        if not isinstance(selected, list) or any(not isinstance(g, str) for g in selected):
            raise validation_failed(f"Некорректные группы ЕКП профиля «{row.id}»")
        for group in selected:
            if group not in groups:
                raise validation_failed(f"Группа происшествий «{group}» не найдена")
        updates.append((row, selected))
    at = now_iso()
    actor = viewer.user_id if viewer else teacher.id
    for row, selected in updates:
        row.incident_groups = list(selected)
        row.updated_by, row.updated_at = actor, at
    details = "; ".join(f"{row.id}: {len(selected)} гр." for row, selected in updates)
    await record(db, action="profileMapping.save", user_id=actor, role=viewer.role if viewer else "teacher", details=f"Сохранена привязка профильных категорий — {details}")
    await db.commit()
    return await mapping_contract(db)
