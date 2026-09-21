"""Аутентифицированный экспорт индивидуального или группового отчёта."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.deps import Viewer, require_viewer
from app.db.session import get_db
from app.services.report_export import export_data, render_csv, render_pdf

router = APIRouter()


async def export(report_id: str, extension: str, db: AsyncSession, viewer: Viewer) -> Response:
    data = await export_data(db, report_id, viewer)
    content = await run_in_threadpool(render_pdf if extension == "pdf" else render_csv, data)
    return Response(content, media_type="application/pdf" if extension == "pdf" else "text/csv; charset=utf-8", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(report_id, safe='')}.{extension}", "Cache-Control": "no-store"})


@router.get("/reports/{report_id}/export.csv", response_class=Response)
async def csv_export(report_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> Response:
    return await export(report_id, "csv", db, viewer)


@router.get("/reports/{report_id}/export.pdf", response_class=Response)
async def pdf_export(report_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> Response:
    return await export(report_id, "pdf", db, viewer)
