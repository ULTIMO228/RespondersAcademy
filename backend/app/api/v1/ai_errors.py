"""API маршруты реестра ошибок ai-workflow/1: ошибки занятия, сводка и личные ошибки (US4, T030)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, get_db, get_viewer
from app.api.v1.ai_access import _authenticated, require_session_access
from app.schemas.v1.ai import (
    ErrorRecord as ErrorRecordSchema,
)
from app.schemas.v1.ai import (
    ModeBreakdown,
    PaginatedErrorRecordsResponse,
    SessionErrorSummaryResponse,
    StudentAttemptErrorsItem,
    StudentErrorsResponse,
)
from app.schemas.v1.ai import (
    SessionReport as SessionReportSchema,
)
from app.services.ai_error_registry import (
    get_session_error_summary,
    get_student_errors,
    list_session_errors,
)
from app.services.report_builder import build_ai_session_report

router = APIRouter(prefix="/ai", tags=["ai-errors"])


def _to_error_schema(record) -> ErrorRecordSchema:
    payload = {
        "id": record.id,
        "attempt_id": record.attempt_id,
        "mode": record.mode,
        "rule_id": record.rule_id,
        "type": record.type,
        "severity": record.severity,
        "evidence_key": record.evidence_key,
        "observed": record.observed,
        "source_ref": record.source_ref,
        "detector": record.detector,
        "etalon_version": record.etalon_version,
        "created_at": record.created_at,
    }
    if record.field_path is not None:
        payload["field_path"] = record.field_path
    if record.event_id is not None:
        payload["event_id"] = record.event_id
    if record.expected is not None:
        payload["expected"] = record.expected
    if record.assessor_version is not None:
        payload["assessor_version"] = record.assessor_version
    if record.fixed:
        payload["fixed"] = True
    if record.teacher_id is not None:
        payload["teacher_id"] = record.teacher_id
    return ErrorRecordSchema(**payload)


@router.get("/sessions/{session_id}/errors", response_model=PaginatedErrorRecordsResponse)
async def get_session_errors(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[Viewer | None, Depends(get_viewer)],
    mode: Annotated[str | None, Query(description="Фильтр по режиму")] = None,
    student_id: Annotated[str | None, Query(alias="studentId", description="Фильтр по курсанту")] = None,
    error_type: Annotated[str | None, Query(alias="type", description="Фильтр по типу ошибки")] = None,
    severity: Annotated[str | None, Query(description="Фильтр по критичности")] = None,
    cursor: Annotated[str | None, Query(description="Курсор пагинации")] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Лимит записей")] = 50,
) -> PaginatedErrorRecordsResponse:
    """Реестр обнаруженных ошибок занятия: доступен только преподавателю сессии и администратору (T030)."""
    await require_session_access(db, session_id, viewer)

    records, next_cursor, total = await list_session_errors(
        db=db,
        session_id=session_id,
        mode=mode,
        student_id=student_id,
        error_type=error_type,
        severity=severity,
        cursor=cursor,
        limit=limit,
    )

    items = [_to_error_schema(r) for r in records]
    return PaginatedErrorRecordsResponse(
        schema_version="ai-workflow/1",
        session_id=session_id,
        items=items,
        next_cursor=next_cursor,
        total=total,
    )


@router.get("/sessions/{session_id}/error-summary", response_model=SessionErrorSummaryResponse)
async def get_session_summary(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[Viewer | None, Depends(get_viewer)],
    mode: Annotated[str | None, Query(description="Фильтр по режиму")] = None,
) -> SessionErrorSummaryResponse:
    """Сводка частот ошибок занятия по типам, режимам и студентам (T030)."""
    await require_session_access(db, session_id, viewer)

    summary = await get_session_error_summary(db, session_id, mode=mode)
    return SessionErrorSummaryResponse(
        schema_version="ai-workflow/1",
        session_id=session_id,
        total_errors=summary["total_errors"],
        by_type=summary["by_type"],
        by_mode=ModeBreakdown(
            operator112=summary["by_mode"].get("operator112", 0),
            dds=summary["by_mode"].get("dds", 0),
        ),
        by_severity=summary["by_severity"],
        by_student=summary["by_student"],
        error_record_ids=summary["error_record_ids"],
    )


@router.get("/me/errors", response_model=StudentErrorsResponse)
async def get_my_errors(
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[Viewer | None, Depends(get_viewer)],
    mode: Annotated[str | None, Query(description="Фильтр по режиму")] = None,
    error_type: Annotated[str | None, Query(alias="type", description="Фильтр по типу ошибки")] = None,
    severity: Annotated[str | None, Query(description="Фильтр по критичности")] = None,
    cursor: Annotated[str | None, Query(description="Курсор пагинации")] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Лимит записей")] = 50,
) -> StudentErrorsResponse:
    """Ошибки текущего авторизованного курсанта, сгруппированные по попыткам (T030)."""
    actor = _authenticated(viewer)

    data = await get_student_errors(
        db=db,
        student_id=actor.user_id,
        mode=mode,
        error_type=error_type,
        severity=severity,
        cursor=cursor,
        limit=limit,
    )

    attempt_items = [
        StudentAttemptErrorsItem(
            attempt_id=att["attempt_id"],
            card_id=att["card_id"],
            mode=att["mode"],
            errors=[_to_error_schema(e) for e in att["errors"]],
        )
        for att in data["attempts"]
    ]

    return StudentErrorsResponse(
        schema_version="ai-workflow/1",
        student_id=actor.user_id,
        attempts=attempt_items,
        total_errors=data["total_errors"],
    )


@router.get("/sessions/{session_id}/report", response_model=SessionReportSchema)
async def get_session_ai_report(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[Viewer | None, Depends(get_viewer)],
) -> SessionReportSchema:
    """Воспроизводимый отчет занятия SessionReport, построенный строго из ErrorRecord (T031)."""
    await require_session_access(db, session_id, viewer)
    return await build_ai_session_report(db, session_id)
