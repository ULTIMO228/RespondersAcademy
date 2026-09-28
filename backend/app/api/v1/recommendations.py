"""Рекомендации обучаемого и аналитические представления преподавателя (US7)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_role
from app.api.errors import forbidden
from app.db.session import get_db
from app.schemas.common import read_int, read_string
from app.services import recommendation_service as service

router = APIRouter()
student_only = require_role("student")
teacher_or_admin = require_role("teacher", "admin")


@router.get("/me/recommendations")
async def recommendations(request: Request, db: AsyncSession = Depends(get_db),
                          viewer: Viewer = Depends(student_only)) -> list[dict[str, Any]]:
    limit = read_int(request.query_params, "limit", 10, minimum=1, maximum=50)
    result = await service.generate(db, viewer.user_id, limit)
    await db.commit()
    return result


@router.post("/me/recommendations/{rec_id}/accept")
async def accept(rec_id: str, db: AsyncSession = Depends(get_db),
                 viewer: Viewer = Depends(student_only)) -> dict[str, Any]:
    result = await service.accept(db, viewer.user_id, rec_id)
    await db.commit()
    return result


@router.get("/teacher/students/{student_id}/profile")
async def student_profile(student_id: str, db: AsyncSession = Depends(get_db),
                          viewer: Viewer = Depends(teacher_or_admin)) -> dict[str, Any]:
    result = await service.profile(db, student_id)
    await db.commit()
    return result


@router.get("/teacher/groups/{group_id}/insights")
async def group_insights(group_id: str, request: Request, db: AsyncSession = Depends(get_db),
                         viewer: Viewer = Depends(teacher_or_admin)) -> dict[str, Any]:
    assignment_id = read_string(request.query_params, "assignmentId")
    if assignment_id:
        from app.models.assignment import Assignment

        assignment = await db.get(Assignment, assignment_id)
        if assignment is not None and viewer.role == "teacher" and assignment.teacher_id != viewer.user_id:
            raise forbidden("Задание другого преподавателя")
    return await service.group_insights(db, group_id, assignment_id)
