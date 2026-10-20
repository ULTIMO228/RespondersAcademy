"""Рабочий процесс версии сценария: отправка на проверку, проверка экспертом, публикация."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import Viewer
from app.api.errors import conflict, forbidden
from app.models.ai_scenario import ScenarioVersion
from app.models.scenario import Scenario
from app.schemas.v1.ai import ScenarioApproveRequest, ScenarioReviewRequest
from app.services import ai_scenario_service, scenario_access
from app.services.ai_scenario_review import _latest_version, _load_etalon, _load_version, _require_teacher
from app.services.ai_scenario_service import (
    _finish_request,
    _reserve_request,
    checked_graph,
    require_read_access,
    scenario_version_contract,
)
from app.services.audit import record
from app.services.time import now_iso


async def _load_current(db: AsyncSession, scenario_id: str, version_number: int) -> ScenarioVersion:
    latest = await _latest_version(db, scenario_id)
    if version_number != latest:
        raise conflict(f"Устаревшая версия: текущая версия сценария — {latest}")
    return await _load_version(db, scenario_id, version_number)


def _check_graph(version: ScenarioVersion) -> None:
    if version.graph is not None:
        checked_graph(version.graph)


def _not_author(version: ScenarioVersion, viewer: Viewer, action: str) -> None:
    if viewer.role != "admin" and version.created_by == viewer.user_id:
        raise forbidden(f"Автор версии не может {action} собственную версию")


async def submit_for_review(db: AsyncSession, scenario_id: str, body: ScenarioApproveRequest, viewer: Viewer) -> dict[str, Any]:
    _require_teacher(viewer)
    await ai_scenario_service.require_scenario_access(db, scenario_id, viewer)
    request, replay = await _reserve_request(
        db, viewer, operation=f"submit:{scenario_id}", request_id=body.request_id,
        payload=body.model_dump(by_alias=True, mode="json"),
    )
    if request is None:
        return replay
    version = await _load_current(db, scenario_id, body.version)
    if version.approval != "draft":
        raise conflict("На проверку отправляется только черновик")
    if version.validation != "passed":
        raise conflict("Нельзя отправить на проверку версию, не прошедшую структурную проверку")
    _check_graph(version)
    version.approval = "pending_review"
    await db.flush()
    etalon = await _load_etalon(db, version)
    await record(db, action="ai.scenario.submit", user_id=viewer.user_id, role=viewer.role,
                 details=f"Версия {version.version} сценария {scenario_id} отправлена на проверку")
    return _finish_request(request, scenario_version_contract(version, etalon, []))


async def review_version(db: AsyncSession, scenario_id: str, body: ScenarioReviewRequest, viewer: Viewer) -> dict[str, Any]:
    await scenario_access.require_permission(db, viewer, scenario_access.REVIEW)
    await require_read_access(db, scenario_id, viewer)
    request, replay = await _reserve_request(
        db, viewer, operation=f"review:{scenario_id}", request_id=body.request_id,
        payload=body.model_dump(by_alias=True, mode="json"),
    )
    if request is None:
        return replay
    version = await _load_current(db, scenario_id, body.version)
    if version.approval != "pending_review":
        raise conflict("Проверять можно только версию на проверке")
    if version.reviewed_by is not None:
        raise conflict("Версия уже проверена")
    _not_author(version, viewer, "проверять")
    if body.decision == "accept":
        if version.validation != "passed":
            raise conflict("Версия не прошла структурную проверку")
        _check_graph(version)
    else:
        version.approval = "rejected"
    version.reviewed_by = viewer.user_id
    version.review_comment = body.comment.strip() or None
    await db.flush()
    etalon = await _load_etalon(db, version)
    await record(db, action=f"ai.scenario.review.{body.decision}", user_id=viewer.user_id, role=viewer.role,
                 details=f"Проверена версия {version.version} сценария {scenario_id}: {body.decision}")
    return _finish_request(request, scenario_version_contract(version, etalon, []))


async def mark_approved(db: AsyncSession, scenario: Scenario, version: ScenarioVersion, viewer: Viewer) -> None:
    version.approval = "approved"
    version.approved_by = viewer.user_id
    if version.mode == "operator112":
        scenario.doc = {**scenario.doc, "validation": {"status": "approved", "reviewedBy": viewer.user_id}}
        scenario.validation_report = {**(scenario.validation_report or {}), "approvedVersion": version.version}
        scenario.sync_columns()
        scenario.updated_by, scenario.updated_at = viewer.user_id, now_iso()
        flag_modified(scenario, "doc")
    await db.flush()


async def publish_version(db: AsyncSession, scenario_id: str, body: ScenarioApproveRequest, viewer: Viewer) -> dict[str, Any]:
    await scenario_access.require_permission(db, viewer, scenario_access.PUBLISH)
    scenario = await require_read_access(db, scenario_id, viewer)
    request, replay = await _reserve_request(
        db, viewer, operation=f"publish:{scenario_id}", request_id=body.request_id,
        payload=body.model_dump(by_alias=True, mode="json"),
    )
    if request is None:
        return replay
    version = await _load_current(db, scenario_id, body.version)
    if version.approval == "approved":
        raise conflict("Версия сценария уже опубликована")
    if version.approval != "pending_review":
        raise conflict("Публиковать можно только версию на проверке")
    if version.reviewed_by is None:
        raise conflict("Сначала версию должен проверить эксперт")
    if version.validation != "passed":
        raise conflict("Нельзя опубликовать версию, не прошедшую структурную проверку")
    _not_author(version, viewer, "публиковать")
    _check_graph(version)
    await mark_approved(db, scenario, version, viewer)
    etalon = await _load_etalon(db, version)
    await record(db, action="ai.scenario.publish", user_id=viewer.user_id, role=viewer.role,
                 details=f"Опубликована версия {version.version} сценария {scenario_id}; режим {version.mode}")
    return _finish_request(request, scenario_version_contract(version, etalon, []))
