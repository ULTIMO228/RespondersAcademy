"""Новые версионируемые сценарии `/api/v1/ai/scenarios/*`."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_viewer
from app.db.session import get_db
from app.schemas.v1.ai import ScenarioApproveRequest, ScenarioDraftRequest, ScenarioReviseRequest
from app.services.ai_scenario_review import approve_scenario, revise_scenario, versions_for_teacher
from app.services.scenario_service import create_ai_drafts

router = APIRouter(prefix="/ai/scenarios", tags=["AI scenarios"])


@router.post("/drafts", status_code=201)
async def create_drafts(
    body: ScenarioDraftRequest,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> JSONResponse:
    result = await create_ai_drafts(db, body, viewer)
    await db.commit()
    return JSONResponse(result, status_code=201)


@router.post("/{scenario_id}/revise", status_code=201)
async def revise(
    scenario_id: str,
    body: ScenarioReviseRequest,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> JSONResponse:
    result = await revise_scenario(db, scenario_id, body, viewer)
    await db.commit()
    return JSONResponse(result, status_code=201)


@router.post("/{scenario_id}/approve")
async def approve(
    scenario_id: str,
    body: ScenarioApproveRequest,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> dict[str, Any]:
    result = await approve_scenario(db, scenario_id, body, viewer)
    await db.commit()
    return result


@router.get("/{scenario_id}/versions")
async def versions(
    scenario_id: str,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> list[dict[str, Any]]:
    result = await versions_for_teacher(db, scenario_id, viewer)
    await db.commit()
    return result
