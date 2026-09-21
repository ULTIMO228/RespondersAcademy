"""Режим специалиста-112 (`contracts/v1-endpoints.md`, «Режим специалиста-112»; T084):
`POST /operator112/attempts`, `…/answer`, `…/events`, `GET …/notification-list`, `POST …/submit`, `GET …/evaluation`,
`GET /streets?q=&limit=`. Все эндпоинты требуют сессию (401); обучающийся — только свои попытки (403).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, require_viewer
from app.api.errors import validation_failed
from app.db.session import get_db
from app.schemas.scenarios import parse_body
from app.schemas.v1.operator112 import CardDraft, OperatorAttemptCreate, OperatorEventCreate
from app.services import operator112_service as service

router = APIRouter()
STREETS_MIN_QUERY = 3
STREETS_DEFAULT_LIMIT = 10
STREETS_MAX_LIMIT = 50


@router.post("/operator112/attempts")
async def create_attempt(request: Request, background: BackgroundTasks, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> JSONResponse:
    body: OperatorAttemptCreate = parse_body(OperatorAttemptCreate, await read_body(request))
    attempt, created = await service.create_attempt(db, body.assignment_id, body.card_id, body.student_id, viewer, background)
    await db.commit()
    return JSONResponse(attempt, status_code=201 if created else 200)


@router.post("/operator112/attempts/{attempt_id}/answer")
async def answer_attempt(attempt_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    attempt = await service.answer(db, attempt_id, viewer)
    await db.commit()
    return attempt


@router.post("/operator112/attempts/{attempt_id}/events", status_code=201)
async def add_event(attempt_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> JSONResponse:
    body: OperatorEventCreate = parse_body(OperatorEventCreate, await read_body(request))
    event = await service.add_event(db, attempt_id, body.type, body.payload, viewer)
    await db.commit()
    return JSONResponse(event, status_code=201)


@router.get("/operator112/attempts/{attempt_id}/notification-list")
async def notification_list(attempt_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    """По признакам опросной карты из событий; `?signs=a&signs=b` / `?classifierCode=` — предпросмотр до фиксации событий."""
    signs = [s.strip() for s in request.query_params.getlist("signs") if s.strip()] or None
    code = (request.query_params.get("classifierCode") or "").strip() or None
    return await service.notification_list(db, attempt_id, viewer, signs=signs, classifier_code=code)


@router.post("/operator112/attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    draft: CardDraft = parse_body(CardDraft, await read_body(request))
    result = await service.submit(db, attempt_id, draft.model_dump(by_alias=True), viewer)
    await db.commit()
    return result


@router.get("/operator112/attempts/{attempt_id}/evaluation")
async def attempt_evaluation(attempt_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    return await service.evaluation(db, attempt_id, viewer)


@router.get("/streets")
async def streets(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> list[dict[str, Any]]:
    query = (request.query_params.get("q") or "").strip()
    if len(query) < STREETS_MIN_QUERY:
        raise validation_failed(f"Параметр «q» — не менее {STREETS_MIN_QUERY} символов")
    raw_limit = request.query_params.get("limit") or ""
    limit = int(raw_limit) if raw_limit.isdigit() and int(raw_limit) > 0 else STREETS_DEFAULT_LIMIT
    return await service.search_streets(db, query, min(limit, STREETS_MAX_LIMIT))
