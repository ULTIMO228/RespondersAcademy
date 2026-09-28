"""Частичная правка, история и утверждение версий сценария преподавателем."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import Viewer
from app.api.errors import conflict, forbidden, not_found, validation_failed
from app.models.ai_scenario import DraftFieldDecision, EtalonVersion, ScenarioVersion
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.card import Address
from app.models.scenario import Scenario
from app.models.session import Attempt
from app.schemas.v1.ai import ScenarioApproveRequest, ScenarioReviseRequest
from app.services import ai_scenario_service
from app.services.ai_scenario_service import (
    _finish_request,
    _reserve_request,
    scenario_version_contract,
    set_card_field,
    validate_card_snapshot,
)
from app.services.audit import record
from app.services.time import now_iso


def _require_teacher(viewer: Viewer) -> None:
    if viewer.role not in ("teacher", "admin"):
        raise forbidden("Операции с версиями доступны преподавателю или администратору")


async def _latest_version(db: AsyncSession, scenario_id: str) -> int:
    value = await db.scalar(
        select(func.max(ScenarioVersion.version)).where(ScenarioVersion.scenario_id == scenario_id)
    )
    if value is None:
        raise not_found(f"Версии сценария «{scenario_id}» не найдены")
    return int(value)


async def _load_version(db: AsyncSession, scenario_id: str, version_number: int) -> ScenarioVersion:
    version = await db.get(ScenarioVersion, (scenario_id, version_number))
    if version is None:
        raise not_found(f"Версия {version_number} сценария «{scenario_id}» не найдена")
    return version


async def _load_etalon(db: AsyncSession, version: ScenarioVersion) -> EtalonVersion:
    etalon = await db.get(EtalonVersion, version.etalon_version)
    if etalon is None:
        raise not_found(f"Эталон версии {version.version} сценария «{version.scenario_id}» не найден")
    return etalon


async def revise_scenario(
    db: AsyncSession,
    scenario_id: str,
    body: ScenarioReviseRequest,
    viewer: Viewer,
) -> dict[str, Any]:
    _require_teacher(viewer)
    await ai_scenario_service.require_scenario_access(db, scenario_id, viewer)
    payload = body.model_dump(by_alias=True, mode="json", exclude_unset=True)
    request, replay = await _reserve_request(
        db,
        viewer,
        operation=f"revise:{scenario_id}",
        request_id=body.request_id,
        payload=payload,
    )
    if request is None:
        return replay

    latest = await _latest_version(db, scenario_id)
    if body.base_version != latest:
        raise conflict(f"Устаревшая baseVersion: текущая версия сценария — {latest}")
    base = await _load_version(db, scenario_id, body.base_version)
    if base.approval == "approved":
        raise conflict("Утверждённая версия неизменяема; создайте новую версию от актуального черновика")

    fields = dict(base.card_snapshot.get("fields") or {})
    seen: set[str] = set()
    decisions: list[tuple[str, str, Any | None]] = []
    for item in body.accepted_fields:
        if item.field_path in seen:
            raise validation_failed(f"Поле «{item.field_path}» указано более одного раза")
        seen.add(item.field_path)
        old_value = ai_scenario_service._get_path(fields, item.field_path)
        if item.decision == "edited":
            set_card_field(fields, item.field_path, item.value)
            stored_value = item.value
        elif item.decision == "accepted":
            stored_value = old_value
        else:
            stored_value = None
        decisions.append((item.field_path, item.decision, stored_value))

    etalon = await _load_etalon(db, base)
    expected_fields = dict(etalon.expected_fields or {})
    for field_path, decision, value in decisions:
        if decision in ("accepted", "edited"):
            expected_fields[field_path] = value
    semantic_facts = [dict(item) for item in (etalon.semantic_facts or [])]
    for fact in semantic_facts:
        path = fact.get("fieldPath")
        if path in seen and any(chosen_path == path and decision in ("accepted", "edited") for chosen_path, decision, _ in decisions):
            fact["value"] = ai_scenario_service._get_path(fields, str(path))

    new_etalon_id = f"{scenario_id}:etalon:{latest + 1}"
    new_etalon = EtalonVersion(
        id=new_etalon_id,
        scenario_id=scenario_id,
        mode=base.mode,
        expected_fields=expected_fields,
        expected_actions=[dict(item) for item in (etalon.expected_actions or [])],
        semantic_facts=semantic_facts,
        rule_source_ids=list(etalon.rule_source_ids or []),
        classifier_version=etalon.classifier_version,
        created_at=now_iso(),
    )
    db.add(new_etalon)
    classifier_rows = (await db.execute(select(ai_scenario_service.ClassifierEntry).order_by(ai_scenario_service.ClassifierEntry.code))).scalars().all()
    classifier_entries = [row.to_contract() for row in classifier_rows]
    profiles = await ai_scenario_service._profile_groups(db)
    address_rows = (await db.execute(select(Address).order_by(Address.id))).scalars().all()
    errors = validate_card_snapshot(
        fields,
        base.mode,
        new_etalon,
        classifier_entries,
        profiles,
        ai_scenario_service._address_allowlist([row.doc for row in address_rows]),
    )
    rejected = [path for path, decision, _ in decisions if decision == "rejected"]
    errors.extend(
        {"fieldPath": path, "code": "field_rejected", "message": f"Поле «{path}» отклонено преподавателем"}
        for path in rejected
    )
    validation_passed = not errors
    version = ScenarioVersion(
        scenario_id=scenario_id,
        version=latest + 1,
        mode=base.mode,
        source_ticket_id=base.source_ticket_id,
        source_situation_no=base.source_situation_no,
        created_by=viewer.user_id,
        source_kind=base.source_kind,
        source_hash=base.source_hash,
        source_attempt_id=base.source_attempt_id,
        source_card_id=base.source_card_id,
        source_card_version=base.source_card_version,
        parent_version=base.version,
        teacher_comment=body.comment.strip() or None,
        validation="passed" if validation_passed else "failed",
        validation_report={"passed": validation_passed, "errors": errors},
        approval="draft" if validation_passed else "validation_failed",
        card_snapshot={"id": base.card_snapshot["id"], "fields": fields},
        etalon_version=new_etalon_id,
        rule_source_ids=list(new_etalon.rule_source_ids or []),
    )
    db.add(version)
    now = now_iso()
    for field_path, decision, value in decisions:
        db.add(
            DraftFieldDecision(
                scenario_id=scenario_id,
                scenario_version=latest + 1,
                field_path=field_path,
                decision=decision,
                value=value,
                teacher_id=viewer.user_id,
                at=now,
                comment=body.comment.strip() or None,
            )
        )
    scenario = await db.get(Scenario, scenario_id)
    if scenario is not None and scenario.validation_status != "approved":
        scenario.doc = {**scenario.doc, "validation": {"status": "draft", "comment": body.comment.strip()}}
        scenario.validation_report = {"version": "ai-workflow/1", "passed": validation_passed, "errors": errors}
        scenario.updated_by, scenario.updated_at = viewer.user_id, now
        scenario.sync_columns()
        flag_modified(scenario, "doc")
    await db.flush()
    response = scenario_version_contract(version, new_etalon, [])
    await record(
        db,
        action="ai.scenario.revise",
        user_id=viewer.user_id,
        role=viewer.role,
        details=f"Создана версия {latest + 1} сценария {scenario_id}; решений по полям: {len(decisions)}",
    )
    return _finish_request(request, response)


async def _verify_chain_teacher(db: AsyncSession, version: ScenarioVersion, viewer: Viewer) -> None:
    if version.source_kind != "student_card" or viewer.role == "admin":
        return
    if not version.source_attempt_id:
        raise conflict("У черновика student_card отсутствует sourceAttemptId")
    attempt = await db.get(Attempt, version.source_attempt_id)
    if attempt is None:
        raise not_found(f"Попытка «{version.source_attempt_id}» не найдена")
    link = (
        await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.attempt_id == attempt.id))
    ).scalar_one_or_none()
    assignment = await db.get(Assignment, link.assignment_id) if link is not None else None
    if assignment is None or assignment.teacher_id != viewer.user_id or assignment.training_mode != "chain":
        raise forbidden("Подтвердить применимость ДДС может только преподаватель задания")


async def approve_scenario(
    db: AsyncSession,
    scenario_id: str,
    body: ScenarioApproveRequest,
    viewer: Viewer,
) -> dict[str, Any]:
    _require_teacher(viewer)
    await ai_scenario_service.require_scenario_access(db, scenario_id, viewer)
    payload = body.model_dump(by_alias=True, mode="json")
    request, replay = await _reserve_request(
        db,
        viewer,
        operation=f"approve:{scenario_id}",
        request_id=body.request_id,
        payload=payload,
    )
    if request is None:
        return replay

    latest = await _latest_version(db, scenario_id)
    if body.version != latest:
        raise conflict(f"Устаревшая версия: текущая версия сценария — {latest}")
    version = await _load_version(db, scenario_id, body.version)
    if version.approval == "approved":
        raise conflict("Версия сценария уже утверждена")
    if version.validation != "passed":
        raise conflict("Нельзя утвердить сценарий до успешной структурной проверки")
    await _verify_chain_teacher(db, version, viewer)

    scenario = await db.get(Scenario, scenario_id)
    if scenario is None or scenario.deleted:
        raise not_found(f"Сценарий «{scenario_id}» не найден")
    version.approval = "approved"
    version.approved_by = viewer.user_id
    if version.mode == "operator112":
        scenario.doc = {**scenario.doc, "validation": {"status": "approved", "reviewedBy": viewer.user_id}}
        scenario.validation_report = {**(scenario.validation_report or {}), "approvedVersion": version.version}
        scenario.sync_columns()
        scenario.updated_by, scenario.updated_at = viewer.user_id, now_iso()
        flag_modified(scenario, "doc")
    await db.flush()
    etalon = await _load_etalon(db, version)
    response = scenario_version_contract(version, etalon, [])
    await record(
        db,
        action="ai.scenario.approve",
        user_id=viewer.user_id,
        role=viewer.role,
        details=f"Утверждена версия {version.version} сценария {scenario_id}; режим {version.mode}",
    )
    return _finish_request(request, response)


async def versions_for_teacher(
    db: AsyncSession,
    scenario_id: str,
    viewer: Viewer,
) -> list[dict[str, Any]]:
    _require_teacher(viewer)
    await ai_scenario_service.require_scenario_access(db, scenario_id, viewer)
    return await ai_scenario_service.list_versions(db, scenario_id)
