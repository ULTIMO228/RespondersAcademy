"""Изменение специализации обучающегося преподавателем в рамках его групп."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, require_role
from app.api.errors import forbidden, not_found
from app.db.session import get_db
from app.models.user import SPECIALIZATION_TITLES, User
from app.schemas.scenarios import parse_body
from app.schemas.v1.teacher_students import SpecializationsPatch
from app.services import audit

router = APIRouter()
teacher_or_admin = require_role("teacher", "admin")


@router.patch("/teacher/students/{student_id}/specializations")
async def update_student_specializations(
    student_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> dict[str, Any]:
    student = await db.get(User, student_id)
    if student is None or student.role != "student":
        raise not_found("Обучающийся не найден")
    if viewer.role == "teacher":
        teacher = await db.get(User, viewer.user_id)
        if teacher is None or student.group is None or student.group not in (teacher.assigned_groups or []):
            raise forbidden("Обучающийся не относится к вашим группам")

    body = parse_body(SpecializationsPatch, await read_body(request))
    before = list(student.specializations or [])
    student.specializations = list(body.specializations)
    before_title = ", ".join(SPECIALIZATION_TITLES[item] for item in before) or "—"
    after_title = ", ".join(SPECIALIZATION_TITLES[item] for item in student.specializations)
    actor = await db.get(User, viewer.user_id)
    await audit.record(
        db,
        action="user.specialization_changed",
        user_id=viewer.user_id,
        role=viewer.role,
        details=f"Изменена специализация обучающегося {student.id}: {before_title} → {after_title}",
        operator_arm=actor.arm_number if actor is not None else None,
    )
    await db.commit()
    return student.to_public()
