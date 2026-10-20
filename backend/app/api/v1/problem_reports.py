"""«Сообщить о проблеме» (спека 009, US6): `POST /api/v1/problem-reports` (ученик) и `/api/v1/teacher/problem-reports/*`.

Пути полные, как у `error_map.py`. Отправка — только обучающийся (иначе 403); чтение и вложение — преподаватель и
администратор (ученик — 403). Видимость групп и 404 для чужих сообщений — в `problem_report_service`.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_role
from app.db.session import get_db
from app.services import problem_report_service as service

router = APIRouter()
student_only = require_role("student")
teacher_or_admin = require_role("teacher", "admin")


@router.post("/problem-reports", status_code=201)
async def create_problem_report(
    text: Annotated[str | None, Form()] = None,
    attempt_id: Annotated[str | None, Form(alias="attemptId")] = None,
    incident_number: Annotated[str | None, Form(alias="incidentNumber")] = None,
    attachment: Annotated[UploadFile | None, File()] = None,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(student_only),
) -> dict[str, Any]:
    return await service.create_report(
        db, viewer, text=text, attempt_id=attempt_id, incident_number=incident_number, attachment=attachment,
    )


@router.get("/teacher/problem-reports")
async def list_problem_reports(db: AsyncSession = Depends(get_db),
                               viewer: Viewer = Depends(teacher_or_admin)) -> dict[str, Any]:
    return {"items": await service.list_for_teacher(db, viewer)}


@router.post("/teacher/problem-reports/{report_id}/read")
async def mark_problem_report_read(report_id: str, db: AsyncSession = Depends(get_db),
                                   viewer: Viewer = Depends(teacher_or_admin)) -> dict[str, Any]:
    return await service.mark_read(db, viewer, report_id)


@router.get("/teacher/problem-reports/{report_id}/attachment")
async def get_problem_report_attachment(report_id: str, db: AsyncSession = Depends(get_db),
                                        viewer: Viewer = Depends(teacher_or_admin)) -> FileResponse:
    path, media_type = await service.attachment_file(db, viewer, report_id)
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "no-store"})
