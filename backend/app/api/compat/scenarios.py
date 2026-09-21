"""Сценарии и учебные карточки: контракт `docs/mock-api.md` строки 18–25 (логика — services/scenario_service.py)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, get_viewer
from app.db.session import get_db
from app.services import scenario_service
from app.services.cards import list_training_cards

router = APIRouter()


@router.get("/scenarios")
async def get_scenarios(request: Request, db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    return await scenario_service.list_scenarios(db, request.query_params)


@router.post("/scenarios", status_code=201)
async def post_scenario(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return await scenario_service.create_scenario(db, await read_body(request))


@router.post("/scenarios/generate", status_code=201)
async def post_generate(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> list[dict[str, Any]]:
    return await scenario_service.generate_scenarios(db, await read_body(request), viewer)


@router.get("/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return scenario_service.scenario_contract(await scenario_service.require_scenario(db, scenario_id))


@router.patch("/scenarios/{scenario_id}")
async def patch_scenario(scenario_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    return await scenario_service.update_scenario(db, scenario_id, await read_body(request), viewer)


@router.delete("/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    return await scenario_service.delete_scenario(db, scenario_id, request.query_params, viewer)


@router.post("/scenarios/{scenario_id}/validate")
async def post_validate(scenario_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    return await scenario_service.validate_scenario(db, scenario_id, await read_body(request), viewer)


@router.get("/training-cards")
async def get_training_cards(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """96 карточек билетов + сформированные обучаемыми и сгенерированные (contracts/compat-endpoints.md, строка 25)."""
    return await list_training_cards(db)
