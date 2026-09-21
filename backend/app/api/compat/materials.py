"""Учебные материалы-заглушки (ТЗ §12): содержимое файла не хранится — имя, формат по расширению, размер, автор."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, actor_role, get_viewer, require_teacher_actor
from app.api.errors import validation_failed
from app.db.ids import PREFIX, next_id
from app.db.session import get_db
from app.models.teacher import TrainingMaterial
from app.schemas.scenarios import SUPPORTED_EXTENSIONS, MaterialUploadRequest, parse_body
from app.services.audit import record
from app.services.time import now_iso

router = APIRouter()


@router.get("/materials")
async def get_materials(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """Новые первыми (по времени загрузки, затем по id)."""
    rows = (await db.execute(select(TrainingMaterial).order_by(TrainingMaterial.uploaded_at.desc(), TrainingMaterial.id.desc()))).scalars().all()
    return [row.to_contract() for row in rows]


@router.post("/materials", status_code=201)
async def post_material(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    body: MaterialUploadRequest = parse_body(MaterialUploadRequest, await read_body(request))
    material_format = body.resolved_format
    if material_format is None:
        raise validation_failed(f"Неподдерживаемый тип файла «{body.name}»: допустимо {SUPPORTED_EXTENSIONS}")
    teacher = await require_teacher_actor(db, viewer, body.uploaded_by, "uploadedBy")
    row = TrainingMaterial(
        id=await next_id(db, PREFIX["material"], TrainingMaterial.id),
        name=body.name,
        format=material_format,
        size_bytes=body.size_bytes or 0,
        uploaded_by=teacher.id,
        uploaded_at=now_iso(),
    )
    db.add(row)
    await record(db, action="material.upload", user_id=teacher.id, role=actor_role(viewer), details=f"Загружен учебный материал «{body.name}» ({material_format})")
    await db.commit()
    return row.to_contract()
