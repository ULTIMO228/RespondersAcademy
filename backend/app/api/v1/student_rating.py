"""Рейтинг обучающихся (спека 017): `/api/v1/teacher/rating`, `/api/v1/teacher/students/{id}/stats`.

Права проверяет сервис (`error_map_access`): обучающемуся — 403, преподавателю — только закреплённые группы.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_viewer
from app.db.session import get_db
from app.schemas.common import read_one_of, read_string
from app.services import student_rating_service as service

router = APIRouter()

MODES = ("operator112", "dds", "all")
PERIODS = ("2w", "1m", "all")


def _filters(request: Request) -> tuple[str, str]:
    params = request.query_params
    return read_one_of(params, "mode", MODES, "all"), read_one_of(params, "period", PERIODS, "all")


@router.get("/teacher/rating")
async def rating(request: Request, db: AsyncSession = Depends(get_db),
                 viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    mode, period = _filters(request)
    result = await service.group_rating(db, viewer, read_string(request.query_params, "groupId"), mode, period)
    await db.commit()  # rating_service.sync мог создать или дополнить строки рейтинга
    return result.dump()


@router.get("/teacher/students/{student_id}/stats")
async def stats(student_id: str, request: Request, db: AsyncSession = Depends(get_db),
                viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    mode, period = _filters(request)
    return (await service.student_stats(db, viewer, student_id, mode, period)).dump()
