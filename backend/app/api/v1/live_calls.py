"""API учебного голосового диалога с настраиваемой разговорной моделью."""
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_viewer
from app.api.errors import validation_failed
from app.db.session import get_db
from app.services import live_call_service as service

router = APIRouter()
BASE = "/operator112/attempts/{attempt_id}/live-call"


@router.get(BASE)
async def read(attempt_id: str, response: Response, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)):
    response.headers["Cache-Control"] = "no-store"
    return await service.read(db, attempt_id, viewer)


@router.post(BASE)
async def start(attempt_id: str, response: Response, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)):
    response.headers["Cache-Control"] = "no-store"
    return await service.start(db, attempt_id, viewer)


@router.post(BASE + "/turn")
async def turn(attempt_id: str, file: Annotated[UploadFile, File()], turnId: Annotated[str, Form()],
               db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)):
    data = await file.read(2 * 1024 * 1024 + 1)
    if not data or len(data) > 2 * 1024 * 1024:
        raise validation_failed("Реплика должна быть непустым WAV не больше 2 МБ")
    return await service.turn(db, attempt_id, viewer, turnId, data)


@router.post(BASE + "/finish")
async def finish(attempt_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)):
    return await service.finish(db, attempt_id, viewer)


@router.get(BASE + "/audio/{turn_id}")
async def audio(attempt_id: str, turn_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)):
    path = await service.audio(db, attempt_id, viewer, turn_id)
    return FileResponse(path, media_type="audio/wav", headers={"Cache-Control": "no-store"})
