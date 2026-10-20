"""Прохождение опубликованных сценариев обучающимся: `/api/v1/ai/...`."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_viewer
from app.db.session import get_db
from app.schemas.v1.ai import ScenarioRunActionRequest
from app.services import scenario_runs

router = APIRouter(prefix="/ai", tags=["AI scenario runs"])


@router.post("/scenarios/{scenario_id}/versions/{version}/runs", status_code=201)
async def start(
    scenario_id: str,
    version: int,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> JSONResponse:
    result, created = await scenario_runs.start_run(db, scenario_id, version, viewer)
    await db.commit()
    return JSONResponse(result, status_code=201 if created else 200)


@router.get("/scenario-runs")
async def list_(
    scenarioId: str | None = None,  # noqa: N803 - имя параметра запроса контракта
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> list[dict[str, Any]]:
    return await scenario_runs.list_runs(db, viewer, scenarioId)


@router.get("/scenario-runs/{run_id}")
async def read(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> dict[str, Any]:
    return await scenario_runs.read_run(db, run_id, viewer)


@router.post("/scenario-runs/{run_id}/actions")
async def act(
    run_id: str,
    body: ScenarioRunActionRequest,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> dict[str, Any]:
    result = await scenario_runs.perform_action(db, run_id, body, viewer)
    await db.commit()
    return result


@router.post("/scenario-runs/{run_id}/finish")
async def finish(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> dict[str, Any]:
    result = await scenario_runs.finish_run(db, run_id, viewer)
    await db.commit()
    return result
