"""Рабочий процесс версии сценария: отправка на проверку, проверка экспертом, публикация."""

from __future__ import annotations

from typing import Any

from sqlalchemy import update
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import Viewer
from app.api.errors import conflict, forbidden
from app.models.ai_scenario import EtalonVersion, ScenarioVersion
from app.models.scenario import Scenario
from app.schemas.v1.ai import ScenarioApproveRequest, ScenarioDeriveRequest, ScenarioReviewRequest
from app.services import ai_scenario_service, scenario_access
from app.services.ai_scenario_review import _latest_version, _load_etalon, _load_version, _require_teacher
from app.services.ai_scenario_service import (
    _finish_request,
    _reserve_request,
    checked_graph,
    require_read_access,
    scenario_version_contract,
    thaw,
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
    # Условная запись: если параллельный эксперт уже принял решение, второе не перезаписывает первое.
    result = await db.execute(
        update(ScenarioVersion)
        .where(
            ScenarioVersion.scenario_id == scenario_id,
            ScenarioVersion.version == version.version,
            ScenarioVersion.approval == "pending_review",
            ScenarioVersion.reviewed_by.is_(None),
        )
        .values(
            approval="pending_review" if body.decision == "accept" else "rejected",
            reviewed_by=viewer.user_id,
            review_comment=body.comment.strip() or None,
        )
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise conflict("Версия уже проверена другим экспертом; обновите данные")
    await db.refresh(version)
    etalon = await _load_etalon(db, version)
    await record(db, action=f"ai.scenario.review.{body.decision}", user_id=viewer.user_id, role=viewer.role,
                 details=f"Проверена версия {version.version} сценария {scenario_id}: {body.decision}")
    return _finish_request(request, scenario_version_contract(version, etalon, []))


async def mark_approved(db: AsyncSession, scenario: Scenario, version: ScenarioVersion, viewer: Viewer) -> None:
    # Документ сценария перечитывается под блокировкой строки: параллельные правки не теряются.
    await db.refresh(scenario, with_for_update=True)
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
    try:
        await mark_approved(db, scenario, version, viewer)
        etalon = await _load_etalon(db, version)
        await record(db, action="ai.scenario.publish", user_id=viewer.user_id, role=viewer.role,
                     details=f"Опубликована версия {version.version} сценария {scenario_id}; режим {version.mode}")
    except DBAPIError:
        # Параллельная публикация успела раньше: защитный триггер не даёт изменить утверждённую версию.
        raise conflict("Версия сценария уже опубликована параллельным запросом") from None
    return _finish_request(request, scenario_version_contract(version, etalon, []))


async def derive_version(
    db: AsyncSession, scenario_id: str, version_number: int, body: ScenarioDeriveRequest, viewer: Viewer
) -> dict[str, Any]:
    """Новая версия-черновик из опубликованной: старая версия, её назначения и результаты не меняются."""
    _require_teacher(viewer)
    await ai_scenario_service.require_scenario_access(db, scenario_id, viewer)
    request, replay = await _reserve_request(
        db, viewer, operation=f"derive:{scenario_id}:{version_number}", request_id=body.request_id,
        payload=body.model_dump(by_alias=True, mode="json"),
    )
    if request is None:
        return replay
    base = await _load_version(db, scenario_id, version_number)
    if base.approval != "approved":
        raise conflict("Новую версию можно создать только из опубликованной версии")
    latest = await _latest_version(db, scenario_id)
    latest_row = await _load_version(db, scenario_id, latest)
    if latest_row.approval != "approved":
        raise conflict(f"Уже есть неопубликованная версия {latest}: продолжите работу с ней")
    etalon = await _load_etalon(db, base)
    new_number = latest + 1
    new_etalon_id = f"{scenario_id}:etalon:{new_number}"
    new_etalon = EtalonVersion(
        id=new_etalon_id, scenario_id=scenario_id, mode=base.mode,
        expected_fields=thaw(etalon.expected_fields), expected_actions=thaw(etalon.expected_actions),
        semantic_facts=thaw(etalon.semantic_facts), rule_source_ids=list(etalon.rule_source_ids or []),
        classifier_version=etalon.classifier_version, created_at=now_iso(),
    )
    version = ScenarioVersion(
        scenario_id=scenario_id, version=new_number, mode=base.mode, source_ticket_id=base.source_ticket_id,
        source_situation_no=base.source_situation_no, created_by=viewer.user_id, source_kind=base.source_kind,
        source_hash=base.source_hash, source_attempt_id=base.source_attempt_id, source_card_id=base.source_card_id,
        source_card_version=base.source_card_version, parent_version=base.version,
        teacher_comment=body.comment.strip() or None, validation=base.validation,
        validation_report=thaw(base.validation_report or {}), approval="draft",
        card_snapshot=thaw(base.card_snapshot), etalon_version=new_etalon_id,
        rule_source_ids=list(base.rule_source_ids or []), graph=thaw(base.graph) if base.graph is not None else None,
    )
    db.add(new_etalon)
    db.add(version)
    try:
        await db.flush()
    except IntegrityError:
        raise conflict("Версия сценария создана параллельным запросом; обновите данные и повторите") from None
    await record(db, action="ai.scenario.derive", user_id=viewer.user_id, role=viewer.role,
                 details=f"Версия {new_number} сценария {scenario_id} создана из опубликованной {version_number}")
    return _finish_request(request, scenario_version_contract(version, new_etalon, []))
