"""API заданий и экзамена (T092)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, require_viewer
from app.db.session import get_db
from app.schemas.scenarios import parse_body
from app.schemas.v1.assignments import (
    Assignment,
    AssignmentCreateRequest,
    AssignmentDetail,
    AssignmentStartRequest,
    StartResponse,
)
from app.services import assignment_service as service

router = APIRouter()


@router.post("/assignments", status_code=201, response_model=Assignment, response_model_exclude_none=True)
async def create_assignment(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> JSONResponse:
    body: AssignmentCreateRequest = parse_body(AssignmentCreateRequest, await read_body(request))
    result = await service.create(db, body.dump(), viewer)
    await db.commit()
    return JSONResponse(result, status_code=201)


@router.get("/assignments", response_model=list[Assignment], response_model_exclude_none=True)
async def list_assignments(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> list[dict[str, Any]]:
    result = await service.list_rows(db, viewer, student_id=request.query_params.get("studentId"), teacher_id=request.query_params.get("teacherId"), state=request.query_params.get("state"))
    await db.commit()
    return result


@router.get("/assignments/{assignment_id}", response_model=AssignmentDetail, response_model_exclude_none=True)
async def get_assignment(assignment_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    result = await service.detail(db, assignment_id, viewer)
    await db.commit()
    return result


@router.post("/assignments/{assignment_id}/start", response_model=StartResponse)
async def start_assignment(assignment_id: str, request: Request, background: BackgroundTasks, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    raw = await request.body()
    body = parse_body(AssignmentStartRequest, await read_body(request)) if raw.strip() else AssignmentStartRequest()
    result = await service.start(db, assignment_id, viewer, body.student_id, background)
    await db.commit()
    return result


@router.post("/assignments/{assignment_id}/finish", response_model=Assignment, response_model_exclude_none=True)
async def finish_assignment(assignment_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    result = await service.finish(db, assignment_id, viewer)
    await db.commit()
    return result
