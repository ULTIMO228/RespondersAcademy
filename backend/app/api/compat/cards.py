"""GET /cards (список с расширенным поиском), GET /cards/{id} (детали с рантайм-мутациями)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.cards import card_details
from app.services.cards_query import list_cards

router = APIRouter()


@router.get("/cards")
async def get_cards(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await list_cards(db, request.query_params)


@router.get("/cards/{card_id}")
async def get_card(card_id: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await card_details(db, card_id)
