"""Авторизованный билет и потоковый WebSocket учебного заявителя."""
from fastapi import APIRouter, Depends, Request, Response, WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_viewer
from app.db.session import get_db
from app.services import realtime_call_service as service

router = APIRouter()
# WebSocket не получает Request, поэтому cookie-зависимость роутера к нему неприменима: доступ даёт одноразовый билет.
ws_router = APIRouter()


@router.get("/operator112/realtime/status")
async def status(response: Response, viewer: Viewer = Depends(require_viewer)):
    response.headers["Cache-Control"] = "no-store"
    return {"configured": service.configured()}


@router.post("/operator112/attempts/{attempt_id}/realtime")
async def ticket(attempt_id: str, request: Request, response: Response,
                 db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)):
    response.headers["Cache-Control"] = "no-store"
    return await service.issue_ticket(db, attempt_id, viewer, request.headers.get("origin", ""))


@ws_router.websocket("/operator112/realtime")
async def stream(socket: WebSocket):
    await service.serve(socket)
