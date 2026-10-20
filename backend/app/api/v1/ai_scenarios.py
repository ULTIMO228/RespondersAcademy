"""Новые версионируемые сценарии `/api/v1/ai/scenarios/*`."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_viewer
from app.api.errors import forbidden
from app.db.session import get_db
from app.schemas.v1.ai import (
    GraphValidateRequest,
    ScenarioApproveRequest,
    ScenarioDeriveRequest,
    ScenarioDraftRequest,
    ScenarioManualCreateRequest,
    ScenarioReviewRequest,
    ScenarioReviseRequest,
)
from app.services.ai_scenario_review import approve_scenario, revise_scenario, versions_for_teacher
from app.services.ai_scenario_service import (
    create_manual_draft,
    graph_validation,
    list_scenarios,
    list_sources,
    read_version,
)
from app.services.scenario_access import user_permissions
from app.services.scenario_service import create_ai_drafts
from app.services.scenario_workflow import derive_version, publish_version, review_version, submit_for_review

router = APIRouter(prefix="/ai/scenarios", tags=["AI scenarios"])


@router.get("")
async def list_(
    mode: str | None = None,
    approval: str | None = None,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> list[dict[str, Any]]:
    return await list_scenarios(db, viewer, mode, approval)


@router.get("/permissions")
async def my_permissions(
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> dict[str, Any]:
    if viewer.role not in ("teacher", "admin"):
        raise forbidden("Права эксперта показываются преподавателю или администратору")
    return {"permissions": sorted(await user_permissions(db, viewer))}


@router.get("/sources")
async def sources(
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> list[dict[str, Any]]:
    return await list_sources(db, viewer)


@router.post("/graph/validate")
async def validate_graph(body: GraphValidateRequest, viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    if viewer.role not in ("teacher", "admin"):
        raise forbidden("Проверка графа доступна преподавателю или администратору")
    return graph_validation(body.graph)


@router.post("", status_code=201)
async def create_manual(
    body: ScenarioManualCreateRequest,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> JSONResponse:
    result = await create_manual_draft(db, body, viewer)
    await db.commit()
    return JSONResponse(result, status_code=201)


@router.get("/{scenario_id}/versions/{version}")
async def version_detail(
    scenario_id: str,
    version: int,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> dict[str, Any]:
    return await read_version(db, scenario_id, version, viewer)


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


@router.post("/{scenario_id}/submit")
async def submit(
    scenario_id: str,
    body: ScenarioApproveRequest,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> dict[str, Any]:
    result = await submit_for_review(db, scenario_id, body, viewer)
    await db.commit()
    return result


@router.post("/{scenario_id}/review")
async def review(
    scenario_id: str,
    body: ScenarioReviewRequest,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> dict[str, Any]:
    result = await review_version(db, scenario_id, body, viewer)
    await db.commit()
    return result


@router.post("/{scenario_id}/publish")
async def publish(
    scenario_id: str,
    body: ScenarioApproveRequest,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> dict[str, Any]:
    result = await publish_version(db, scenario_id, body, viewer)
    await db.commit()
    return result


@router.post("/{scenario_id}/versions/{version}/derive", status_code=201)
async def derive(
    scenario_id: str,
    version: int,
    body: ScenarioDeriveRequest,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> JSONResponse:
    result = await derive_version(db, scenario_id, version, body, viewer)
    await db.commit()
    return JSONResponse(result, status_code=201)
