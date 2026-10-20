"""Банк карточек обучающихся-112 для подачи оператору ДДС (фича 011): `GET /student-cards`."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_viewer
from app.db.session import get_db
from app.schemas.v1.student_cards import StudentCard
from app.services import student_card_service as service

router = APIRouter()


@router.get("/student-cards", response_model=list[StudentCard], response_model_exclude_none=True)
async def list_student_cards(db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> list[dict[str, Any]]:
    return await service.list_bank(db, viewer)
