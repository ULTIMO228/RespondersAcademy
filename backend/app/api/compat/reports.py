"""GET /reports, GET /reports/journal, POST /reports/feedback — по src/shared/api/mock/{reports,reports-journal,reports-teacher}.ts."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, get_viewer
from app.db.session import get_db
from app.schemas.common import read_string
from app.services import report_builder

router = APIRouter()


@router.get("/reports/journal")
async def report_journal(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    params = request.query_params
    query = {key: read_string(params, key) for key in ("teacherId", "studentId", "group", "category", "from", "to")}
    response = await report_builder.get_journal(db, viewer, query)
    await db.commit()
    return response


@router.get("/reports")
async def get_reports(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    params = request.query_params
    response = await report_builder.get_reports(db, viewer, read_string(params, "sessionId"), read_string(params, "studentId"))
    await db.commit()
    return response


@router.post("/reports/feedback")
async def report_feedback(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> JSONResponse:
    body = await read_body(request)
    feedback = await report_builder.save_feedback(db, viewer, body)
    await db.commit()
    return JSONResponse(status_code=201, content=feedback)
