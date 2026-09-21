"""POST /cards/{id}/attempt, POST /attempts/{id}/progress (часть 1 US1); оценка — часть 2 (US2)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, assert_own_attempt, get_viewer
from app.db.session import get_db
from app.services import attempts as attempts_service
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
        try:
            from app.services.evaluation_service import evaluate_if_possible

            await evaluate_if_possible(db, attempt)
        except ImportError:
            pass
    await db.commit()
    return await attempts_service.attempt_contract(db, attempt)
