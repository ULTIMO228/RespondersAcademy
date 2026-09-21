"""GET/POST /sessions, start/stop, feed, control — по src/shared/api/mock/{sessions,session-control}.ts."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, get_viewer
from app.api.errors import forbidden
from app.db.session import get_db
from app.schemas.common import read_string
from app.services import session_engine

router = APIRouter()


def _report_builder():
    try:
        from app.services.report_builder import build_session_report

        return build_session_report
    except ImportError:
        return None


@router.get("/sessions")
async def list_sessions(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> list[dict[str, Any]]:
    params = request.query_params
    return await session_engine.list_sessions(db, viewer, read_string(params, "teacherId"), read_string(params, "studentId"), read_string(params, "state"))


@router.post("/sessions")
async def create_session(request: Request, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    body = await read_body(request)
    session = await session_engine.create_session(db, body)
    await db.commit()
    return JSONResponse(status_code=201, content=session)


@router.post("/sessions/{session_id}/start")
async def start_session(session_id: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    session = await session_engine.start_session(db, session_id)
    await db.commit()
    return session


@router.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    session = await session_engine.stop_session(db, session_id)
    await db.commit()
    return session


@router.get("/sessions/{session_id}/feed")
async def session_feed(session_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    params = request.query_params
    return await session_engine.session_feed(db, session_id, viewer, read_string(params, "since"), read_string(params, "at"), read_string(params, "studentId"))


@router.get("/sessions/{session_id}/control")
async def get_control(session_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    row = await session_engine.require_session_row(db, session_id)
    _assert_control_access(viewer, row.teacher_id)
    return await session_engine.control_response(db, row)


@router.post("/sessions/{session_id}/control")
async def post_control(session_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    row = await session_engine.require_session_row(db, session_id)
    _assert_control_access(viewer, row.teacher_id)
    body = await read_body(request)
    response = await session_engine.post_control(db, session_id, body, _report_builder())
    await db.commit()
    return response


def _assert_control_access(viewer: Viewer | None, teacher_id: str) -> None:
    if viewer and viewer.is_student:
        raise forbidden("Управление занятием доступно преподавателю и администратору")
    if viewer and viewer.role == "teacher" and viewer.user_id != teacher_id:
        raise forbidden(session_engine.FOREIGN_SESSION_MESSAGE)
