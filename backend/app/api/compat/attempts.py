"""POST /cards/{id}/attempt, POST /attempts/{id}/progress (US1); GET/POST /attempts/{id}/evaluation (US2)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, assert_own_attempt, get_viewer
from app.db.session import get_db
from app.services import attempts as attempts_service
from app.services import evaluation_service
from app.services.cards import require_card

router = APIRouter()


@router.post("/cards/{card_id}/attempt")
async def open_card_attempt(card_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> JSONResponse:
    await require_card(db, card_id)
    body = await read_body(request)
    if isinstance(body.get("studentId"), str):
        assert_own_attempt(viewer, body["studentId"].strip())
    response, created = await attempts_service.open_attempt(db, card_id, body)
    await db.commit()
    return JSONResponse(status_code=201 if created else 200, content=response)


@router.post("/attempts/{attempt_id}/progress")
async def attempt_progress(attempt_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    body = await read_body(request)
    attempt, just_completed = await attempts_service.record_progress(db, attempt_id, body)
    assert_own_attempt(viewer, attempt.student_id)
    if just_completed:
        # Завершение ставит оценку синхронно (≤ 5 с); без эталона оценка появится при GET /evaluation.
        await evaluation_service.evaluate_if_possible(db, attempt)
    await db.commit()
    return await attempts_service.attempt_contract(db, attempt)


@router.get("/attempts/{attempt_id}/evaluation")
async def get_attempt_evaluation(attempt_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    evaluation = await evaluation_service.get_or_create_evaluation(db, attempt_id, viewer)
    await db.commit()
    return evaluation


@router.post("/attempts/{attempt_id}/evaluation")
async def override_attempt_evaluation(attempt_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    body = await read_body(request)
    evaluation = await evaluation_service.override_evaluation(db, attempt_id, body, viewer)
    await db.commit()
    return evaluation
