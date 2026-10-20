"""Сводная успеваемость (спека 005): `GET /api/v1/performance/{report,export.xlsx,export.pdf}`."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.deps import Viewer, require_role
from app.api.errors import validation_failed
from app.db.session import get_db
from app.models.user import User
from app.schemas.performance import PerformanceReport
from app.services import performance_export, performance_service
from app.services.performance_service import Filters
from app.services.time import MOSCOW
from app.services.xlsx_export import XLSX_MEDIA_TYPE

router = APIRouter()
teacher_or_admin = require_role("teacher", "admin")
MODES = ("all", "dds", "operator112")
PERIODS = ("1m", "2w", "all", "range")


def _date(name: str, raw: str | None) -> date | None:
    if raw is None or not raw.strip():
        return None
    try:
        return date.fromisoformat(raw.strip())
    except ValueError as exc:
        raise validation_failed(f"Некорректная дата в поле «{name}»: ожидается ГГГГ-ММ-ДД") from exc


def report_filters(
    mode: Annotated[str | None, Query(description="all (по умолчанию), dds или operator112")] = None,
    period: Annotated[str | None, Query(description="1m (по умолчанию), 2w, all или range")] = None,
    date_from: Annotated[str | None, Query(alias="from", description="Начало диапазона ГГГГ-ММ-ДД, только при period=range")] = None,
    date_to: Annotated[str | None, Query(alias="to", description="Конец диапазона ГГГГ-ММ-ДД, только при period=range")] = None,
    group_id: Annotated[str | None, Query(alias="groupId", description="Одна группа")] = None,
) -> Filters:
    chosen_mode = (mode or "all").strip()
    chosen_period = (period or "1m").strip()
    if chosen_mode not in MODES:
        raise validation_failed(f"Некорректное значение поля «mode»: допустимо {', '.join(MODES)}")
    if chosen_period not in PERIODS:
        raise validation_failed(f"Некорректное значение поля «period»: допустимо {', '.join(PERIODS)}")
    start, end = _date("from", date_from), _date("to", date_to)
    if chosen_period == "range":
        if start is None or end is None:
            raise validation_failed("Для period=range нужны даты «from» и «to»")
        if start > end:
            raise validation_failed("Дата «from» не может быть позже «to»")
    elif start is not None or end is not None:
        raise validation_failed("Даты «from» и «to» допустимы только при period=range")
    return Filters(
        mode=chosen_mode, period=chosen_period, date_from=start, date_to=end, group_id=(group_id or "").strip() or None
    )


@router.get("/performance/report", response_model=PerformanceReport, response_model_by_alias=True)
async def performance_report(
    filters: Filters = Depends(report_filters),
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> dict[str, Any]:
    """Сводка: итого, группы, обучающиеся, топ ошибок. 403 — чужая группа или роль student, 404 — нет группы."""
    return (await performance_service.build_report(db, viewer, filters)).dump()


async def _export(filters: Filters, db: AsyncSession, viewer: Viewer) -> tuple[PerformanceReport, str, str]:
    report = await performance_service.build_report(db, viewer, filters)
    user = await db.get(User, viewer.user_id)
    who = user.full_name if user else viewer.user_id
    scope = "Все группы организации" if viewer.role == "admin" and not filters.group_id else "Группы преподавателя"
    if filters.group_id:
        scope = f"Группа {filters.group_id}"
    return report, who, scope


@router.get("/performance/export.xlsx", response_class=Response)
async def performance_xlsx(
    filters: Filters = Depends(report_filters),
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> Response:
    """Excel: листы «Сводка», «Группы», «Обучающиеся», «Ошибки», «Параметры»; параметры и ошибки — как у `report`."""
    report, who, scope = await _export(filters, db, viewer)
    content = await run_in_threadpool(
        lambda: performance_export.render_xlsx_report(report, generated_by=who, scope_title=scope)
    )
    name = quote(performance_export.xlsx_filename(datetime.now(MOSCOW).date()), safe="")
    return Response(
        content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{name}", "Cache-Control": "no-store"},
    )


@router.get("/performance/export.pdf", response_class=Response)
async def performance_pdf(
    filters: Filters = Depends(report_filters),
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(teacher_or_admin),
) -> Response:
    """PDF-сводка для печати и руководства (открывается во вкладке просмотра)."""
    report, who, scope = await _export(filters, db, viewer)
    content = await run_in_threadpool(
        lambda: performance_export.render_pdf_report(report, generated_by=who, scope_title=scope)
    )
    name = quote(performance_export.pdf_filename(datetime.now(MOSCOW).date()), safe="")
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{name}", "Cache-Control": "no-store"},
    )
