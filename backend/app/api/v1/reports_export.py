"""Аутентифицированный экспорт индивидуального или группового отчёта."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.deps import Viewer, require_viewer
from app.db.session import get_db
from app.services.report_export import export_data, render_csv, render_pdf, render_xlsx
from app.services.xlsx_export import XLSX_MEDIA_TYPE

router = APIRouter()
RENDERERS = {
    "pdf": (render_pdf, "application/pdf"),
    "csv": (render_csv, "text/csv; charset=utf-8"),
    "xlsx": (render_xlsx, XLSX_MEDIA_TYPE),
}


async def export(report_id: str, extension: str, db: AsyncSession, viewer: Viewer) -> Response:
    data = await export_data(db, report_id, viewer)
    render, media_type = RENDERERS[extension]
    content = await run_in_threadpool(render, data)
    return Response(content, media_type=media_type, headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(report_id, safe='')}.{extension}", "Cache-Control": "no-store"})


@router.get("/reports/{report_id}/export.csv", response_class=Response)
async def csv_export(report_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> Response:
    return await export(report_id, "csv", db, viewer)


@router.get("/reports/{report_id}/export.pdf", response_class=Response)
async def pdf_export(report_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> Response:
    return await export(report_id, "pdf", db, viewer)


@router.get("/reports/{report_id}/export.xlsx", response_class=Response)
async def xlsx_export(report_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> Response:
    return await export(report_id, "xlsx", db, viewer)
