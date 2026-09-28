"""Сценарии преподавателя (US6, волна A): CRUD, машина валидации, генерация через ИИ-шлюз, аудит (T061).

Порт логики мока `src/shared/api/mock/scenarios.ts` поверх БД:
- список без удалённых; фильтры `validationStatus`, `source`, `difficulty[]`, `group[]` (группа — по карточкам `cardIds`);
- `PATCH` — только переданные поля, `difficulty` пересчитывает `level`, изменения — в `history`;
- `DELETE` — мягкое (`deleted=true`); шаблоны и сценарии из `sessions.scenario_ids` → 409 `conflict`;
- валидация: `submit` из draft | rejected | approved → pending; approve | approvePartial | reject из pending; иначе 409
  `invalidTransition` (граф мока; e2e-teacher.sh требует `submit` из approved — см. research.md);
- генерация: шлюз → новые карточки (`c-NNN`, `mode_origin=generated`) + сценарии `pending/generated` с
  `validation_report` валидатора R22; повтор по той же категории возвращает существующие (дедупликация по `title`).
Аудит: `scenario.update/delete/generate/submit/approve/approvePartial/reject` с userId преподавателя.
"""

from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import QueryParams

from app.ai_gateway import get_gateway
from app.api.deps import Viewer, actor_role, require_teacher_actor
from app.api.errors import conflict, forbidden, invalid_transition, not_found, unauthorized, validation_failed
from app.db.ids import PREFIX, next_id
from app.models.ai_scenario import ScenarioVersion
from app.models.card import Address, IncidentCard
from app.models.scenario import Scenario
from app.models.session import TrainingSession
from app.schemas.common import read_list, read_string
from app.schemas.scenarios import (
    MAX_DIFFICULTY,
    MIN_DIFFICULTY,
    ScenarioCreateRequest,
    ScenarioGenerateRequest,
    ScenarioUpdateRequest,
    ScenarioValidateRequest,
    parse_body,
    to_level,
)
from app.services.audit import record
from app.services.cards import list_training_cards
from app.services.time import now_iso
from ml.generate import scenario_generator, validator

VALIDATION_STATUSES = ("draft", "pending", "approved", "rejected")
SOURCES = ("template", "generated")
GENERATED_COUNT = 3

# Допустимые исходные статусы действия (граф мока `ACTION_FROM`); результат — `ACTION_TO`.
ACTION_FROM: dict[str, tuple[str, ...]] = {
    "submit": ("draft", "rejected", "approved"),
    "approve": ("pending",),
    "approvePartial": ("pending",),
    "reject": ("pending",),
}
ACTION_TO = {"submit": "pending", "approve": "approved", "approvePartial": "approved", "reject": "rejected"}
DELETE_BLOCK_MESSAGES = {
    "system": "Системные сценарии-шаблоны преподаватель удалять не может",
    "inSession": "Сценарий назначен в занятие — удаление недоступно",
}


def scenario_contract(row: Scenario) -> dict[str, Any]:
    doc = row.to_contract()
    if row.validation_report:
        doc["validationReport"] = row.validation_report  # расширение контракта (R22); фронт волны A игнорирует
    return doc


async def require_scenario(db: AsyncSession, scenario_id: str) -> Scenario:
    row = await db.get(Scenario, scenario_id)
    if row is None or row.deleted:
        raise not_found(f"Сценарий «{scenario_id}» не найден")
    return row


async def require_scenario_access(db: AsyncSession, row: Scenario, viewer: Viewer | None) -> None:
    if viewer is None or viewer.role == "admin":
        return
    if viewer.role == "teacher":
        if row.source == "template" or row.created_by in (None, viewer.user_id):
            return
    if viewer.role == "student":
        sessions = (await db.execute(select(TrainingSession.scenario_ids).where(TrainingSession.student_ids.contains([viewer.user_id])))).scalars().all()
        if any(row.id in ids for ids in sessions):
            return
    raise forbidden("Сценарий недоступен пользователю")


def require_scenario_editor(row: Scenario, viewer: Viewer | None) -> None:
    if viewer is None or viewer.role == "admin":
        return
    if viewer.role == "teacher" and (row.created_by in (None, viewer.user_id) or row.source == "template"):
        return
    raise forbidden("Правка сценария доступна только его автору")


# ─── Список ───────────────────────────────────────────────────────────────────────────────────────


def _read_enum(params: QueryParams, key: str, allowed: tuple[str, ...]) -> str | None:
    raw = read_string(params, key)
    if raw is not None and raw not in allowed:
        raise validation_failed(f"Некорректное значение «{key}»: {raw}")
    return raw


def _read_difficulties(params: QueryParams) -> list[int]:
    values: list[int] = []
    for raw in read_list(params, "difficulty"):
        if not raw.isdigit() or not (MIN_DIFFICULTY <= int(raw) <= MAX_DIFFICULTY):
            raise validation_failed(f"Некорректная сложность: {raw} (допустимо 1–5)")
        values.append(int(raw))
    return values


async def list_scenarios(db: AsyncSession, params: QueryParams, viewer: Viewer) -> list[dict[str, Any]]:
    groups = read_list(params, "group")
    difficulties = _read_difficulties(params)
    source = _read_enum(params, "source", SOURCES)
    status = _read_enum(params, "validationStatus", VALIDATION_STATUSES)
    rows = (await db.execute(select(Scenario).where(Scenario.deleted.is_(False)).order_by(Scenario.id))).scalars().all()
    card_groups: dict[str, str] = {}
    if groups:
        card_groups = dict((await db.execute(select(IncidentCard.id, IncidentCard.group))).all())
    result: list[dict[str, Any]] = []
    for row in rows:
        try:
            await require_scenario_access(db, row, viewer)
        except Exception:
            continue
        if difficulties and row.difficulty not in difficulties:
            continue
        if source and row.source != source:
            continue
        if status and row.validation_status != status:
            continue
        if groups and not any(card_groups.get(card_id) in groups for card_id in row.card_ids or []):
            continue
        result.append(scenario_contract(row))
    return result


# ─── Создание и правка ────────────────────────────────────────────────────────────────────────────


async def _assert_card_ids(db: AsyncSession, card_ids: list[str]) -> None:
    known = set((await db.execute(select(IncidentCard.id))).scalars().all())
    unknown = next((c for c in card_ids if c not in known), None)
    if unknown:
        raise validation_failed(f"Карточка «{unknown}» не найдена")


async def create_scenario(db: AsyncSession, body: dict[str, Any], viewer: Viewer | None = None) -> dict[str, Any]:
    if viewer is not None and viewer.role not in ("teacher", "admin"):
        raise forbidden("Создание сценария доступно преподавателю")
    request: ScenarioCreateRequest = parse_body(ScenarioCreateRequest, body)
    await _assert_card_ids(db, request.card_ids)
    doc = request.dump()
    if request.call_target is not None and not request.call_target.strip():
        doc.pop("callTarget", None)
    doc["validation"] = {"status": "draft"}
    creator_id = viewer.user_id if viewer is not None else None
    row = Scenario(id=await next_id(db, PREFIX["scenario"], Scenario.id), doc=doc, title="", level="", difficulty=1, source="", validation_status="", history=[], created_by=creator_id)
    doc["id"] = row.id
    row.sync_columns()
    db.add(row)
    await db.commit()
    return scenario_contract(row)


async def update_scenario(db: AsyncSession, scenario_id: str, body: dict[str, Any], viewer: Viewer | None) -> dict[str, Any]:
    row = await require_scenario(db, scenario_id)
    request: ScenarioUpdateRequest = parse_body(ScenarioUpdateRequest, body)
    teacher = await require_teacher_actor(db, viewer, request.updated_by, "updatedBy")
    require_scenario_editor(row, viewer)
    doc = dict(row.doc)
    provided = request.model_fields_set
    changed: list[str] = []
    previous: dict[str, Any] = {}

    def apply(key: str, value: Any, label: str | None) -> None:
        previous[key] = doc.get(key)
        doc[key] = value
        if label:
            changed.append(label)

    if "title" in provided:
        apply("title", request.title, "название")
    if "difficulty" in provided:
        apply("difficulty", request.difficulty, f"сложность {request.difficulty}")
        previous.setdefault("level", doc.get("level"))
        doc["level"] = to_level(int(request.difficulty))
    if "level" in provided:
        apply("level", request.level, None)
    if "mode" in provided:
        apply("mode", request.mode, f"режим {request.mode}")
    if "time_norms" in provided and request.time_norms is not None:
        apply("timeNorms", request.time_norms.dump(), "тайминги")
    if "etalon" in provided and request.etalon is not None:
        apply("etalon", request.etalon.model_dump(by_alias=True, exclude_none=True), "эталон")
    if "success_criteria" in provided and request.success_criteria is not None:
        apply("successCriteria", request.success_criteria.dump(), "критерии успешности")
    at = now_iso()
    row.doc = doc
    row.sync_columns()
    row.updated_by, row.updated_at = teacher.id, at
    row.history = [*(row.history or []), {"at": at, "by": teacher.id, "changes": changed, "previous": previous}]
    details = ", ".join(changed) if changed else "без изменений"
    await record(db, action="scenario.update", user_id=teacher.id, role=actor_role(viewer), details=f"Изменён сценарий {scenario_id}: {details}")
    await db.commit()
    return scenario_contract(row)


# ─── Удаление ─────────────────────────────────────────────────────────────────────────────────────


async def delete_block(db: AsyncSession, row: Scenario) -> str | None:
    """Правило удаления (ТЗ §8): шаблон — системный, назначенный в занятие — используется; None — можно."""
    if row.source == "template":
        return "system"
    for scenario_ids in (await db.execute(select(TrainingSession.scenario_ids))).scalars().all():
        if row.id in (scenario_ids or []):
            return "inSession"
    return None


async def delete_scenario(db: AsyncSession, scenario_id: str, params: QueryParams, viewer: Viewer | None) -> dict[str, Any]:
    row = await require_scenario(db, scenario_id)
    teacher = await require_teacher_actor(db, viewer, read_string(params, "deletedBy"), "deletedBy")
    require_scenario_editor(row, viewer)
    block = await delete_block(db, row)
    if block:
        raise conflict(DELETE_BLOCK_MESSAGES[block])
    snapshot = scenario_contract(row)
    row.deleted = True
    row.updated_by, row.updated_at = teacher.id, now_iso()
    await record(db, action="scenario.delete", user_id=teacher.id, role=actor_role(viewer), details=f"Удалён сценарий {scenario_id} «{row.title}» ({row.source})")
    await db.commit()
    return snapshot


# ─── Валидация ────────────────────────────────────────────────────────────────────────────────────


async def validate_scenario(db: AsyncSession, scenario_id: str, body: dict[str, Any], viewer: Viewer | None) -> dict[str, Any]:
    row = await require_scenario(db, scenario_id)
    request: ScenarioValidateRequest = parse_body(ScenarioValidateRequest, body)
    reviewer = await require_teacher_actor(db, viewer, request.reviewed_by, "reviewedBy")
    require_scenario_editor(row, viewer)
    if reviewer.role != "teacher":
        raise validation_failed("Проверяющий должен быть преподавателем")
    fields = request.fields
    if request.action == "approvePartial":
        if not isinstance(fields, list) or not fields or any(not isinstance(f, str) for f in fields):
            raise validation_failed("Для частичного утверждения выберите поля эталона")
    else:
        fields = None
    current = row.validation_status
    if current not in ACTION_FROM[request.action]:
        raise invalid_transition(f"Действие «{request.action}» недоступно для сценария в статусе «{current}»")
    comment = request.comment.strip() if isinstance(request.comment, str) and request.comment.strip() else None
    validation: dict[str, Any] = {"status": ACTION_TO[request.action], "reviewedBy": reviewer.id}
    if comment:
        validation["comment"] = comment
    if fields:
        validation["approvedFields"] = list(fields)
    doc = dict(row.doc)
    before = doc.get("validation")
    doc["validation"] = validation
    at = now_iso()
    row.doc = doc
    row.sync_columns()
    row.updated_by, row.updated_at = reviewer.id, at
    row.history = [*(row.history or []), {"at": at, "by": reviewer.id, "changes": [f"validation:{request.action}"], "previous": {"validation": before}}]
    details = "; ".join(part for part in (f"Сценарий {scenario_id} → «{validation['status']}»", f"поля: {', '.join(fields)}" if fields else "", f"комментарий: {comment}" if comment else "") if part)
    await record(db, action=f"scenario.{request.action}", user_id=reviewer.id, role=actor_role(viewer), details=details)
    if validation["status"] == "approved":
        # T085: утверждённый билет режима A получает аудиозапись обращения (текст сразу, синтез в фоне; без TTS — failed).
        from app.services import ticket_audio_service

        await ticket_audio_service.prepare_for_cards(db, list(row.card_ids or []))
    await db.commit()
    return scenario_contract(row)


# ─── Генерация ────────────────────────────────────────────────────────────────────────────────────


def _card_row(card_id: str, ticket: dict[str, Any]) -> IncidentCard:
    known = {"id", "ticketNo", "situationNo", "group", "summary", "address", "addressRefined", "caller", "victims", "noAmbulance", "crossRegion", "expectedServices", "expectedTags", "duplicateOf", "createdByStudentId"}
    extra = {k: v for k, v in ticket.items() if k not in known}
    return IncidentCard(
        id=card_id,
        ticket_no=int(ticket.get("ticketNo") or 0),
        situation_no=int(ticket.get("situationNo") or 0),
        group=str(ticket.get("group") or ""),
        summary=str(ticket.get("summary") or ""),
        address=str(ticket.get("address") or ""),
        address_refined=ticket.get("addressRefined") or None,
        caller=dict(ticket.get("caller") or {}),
        victims=ticket.get("victims"),
        no_ambulance=ticket.get("noAmbulance"),
        cross_region=ticket.get("crossRegion"),
        expected_services=list(ticket.get("expectedServices") or []),
        expected_tags=list(ticket.get("expectedTags") or []),
        duplicate_of=ticket.get("duplicateOf"),
        mode_origin="generated",
        extra=extra or None,
    )


def _aggregate_report(reports: dict[str, validator.ValidationReport]) -> dict[str, Any]:
    checks = [{**c.to_contract(), "cardId": card_id} for card_id, report in reports.items() for c in report.checks]
    return {
        "version": validator.VALIDATOR_VERSION,
        "passed": all(r.passed for r in reports.values()),
        "needsReview": any(r.needsReview for r in reports.values()),
        "checks": checks,
        "tickets": {card_id: report.to_contract() for card_id, report in reports.items()},
    }


async def generate_scenarios(db: AsyncSession, body: dict[str, Any], viewer: Viewer | None) -> list[dict[str, Any]]:
    request: ScenarioGenerateRequest = parse_body(ScenarioGenerateRequest, body)
    teacher = await require_teacher_actor(db, viewer, request.requested_by, "requestedBy")
    category = request.category
    all_cards = await list_training_cards(db)
    bases = scenario_generator.base_cards(category, all_cards)
    if not bases:
        raise validation_failed(f"Для категории «{category}» нет учебных карточек-источников")
    addresses = [row.doc for row in (await db.execute(select(Address).order_by(Address.id))).scalars().all()]
    gateway = get_gateway()
    produced = await asyncio.to_thread(gateway.generate_scenario, category, all_cards, addresses, count=GENERATED_COUNT)
    existing = (await db.execute(select(Scenario).where(Scenario.deleted.is_(False), Scenario.source == "generated"))).scalars().all()
    by_title = {row.title: row for row in existing if row.created_by == teacher.id}
    saved: list[Scenario] = []
    created = 0
    for item in produced:
        scenario_doc = dict(item.get("scenario") or {})
        title = str(scenario_doc.get("title") or "").strip()
        if not title:
            continue
        twin = by_title.get(title)
        if twin is not None:
            saved.append(twin)
            continue
        card_ids: list[str] = []
        reports: dict[str, validator.ValidationReport] = {}
        for ticket in item.get("cards") or []:
            card_id = await next_id(db, PREFIX["card"], IncidentCard.id)
            row = _card_row(card_id, ticket)
            db.add(row)
            await db.flush()
            card_ids.append(card_id)
            contract = row.to_contract()
            reports[card_id] = await asyncio.to_thread(validator.validate, contract, all_cards)
            all_cards.append(contract)
        doc = scenario_generator.resolve_placeholders(scenario_doc, card_ids)
        if not doc.get("cardIds"):
            doc["cardIds"] = [c["id"] for c in bases[: scenario_generator.DEFAULT_COUNT]]
        for card_id in doc["cardIds"]:  # исходные карточки группы в очереди сценария тоже проходят валидатор
            if card_id not in reports:
                contract = next((c for c in all_cards if c.get("id") == card_id), None)
                if contract is not None:
                    reports[card_id] = await asyncio.to_thread(validator.validate, contract, all_cards)
        doc["validation"] = {"status": "pending"}
        doc["source"] = "generated"
        scenario_row = Scenario(id=await next_id(db, PREFIX["scenario"], Scenario.id), doc=doc, title="", level="", difficulty=1, source="", validation_status="", history=[], created_by=teacher.id)
        doc["id"] = scenario_row.id
        scenario_row.validation_report = _aggregate_report(reports) if reports else None
        scenario_row.updated_by, scenario_row.updated_at = teacher.id, now_iso()
        scenario_row.sync_columns()
        db.add(scenario_row)
        await db.flush()
        by_title[title] = scenario_row
        saved.append(scenario_row)
        created += 1
    provider = next((str((item.get("scenario") or {}).get("generation", {}).get("provider", "")) for item in produced), "")
    await record(db, action="scenario.generate", user_id=teacher.id, role=actor_role(viewer), details=f"Сгенерировано сценариев (ИИ{', ' + provider if provider else ''}): {created} новых из {len(saved)} по категории «{category}»")
    await db.commit()
    return [scenario_contract(row) for row in saved]


async def create_ai_drafts(db: AsyncSession, body: Any, viewer: Viewer) -> list[dict[str, Any]]:
    """Новый версионируемый workflow остаётся за сервисным API сценариев."""
    from app.services.ai_scenario_service import create_drafts

    return await create_drafts(db, body, viewer)


async def bind_text_check(db: AsyncSession, scenario_id: str, scenario_version: int | None, viewer: Viewer | None) -> dict[str, Any]:
    """US3: привязка замечаний проверки текста к сценарию и его **текущей** версии (T054).

    Только преподаватель с доступом к сценарию (или администратор). Версия — последняя `ai_scenario_versions`;
    переданная `scenarioVersion` должна совпадать с ней (проверка устаревшего текста → 409, как `baseVersion` в revise).
    У сценария без AI-версий привязка — только к `scenarioId`; запрошенная версия тогда → 404.
    """
    from app.services.ai_scenario_service import require_scenario_access as require_ai_scenario_access

    if viewer is None:
        raise unauthorized("Проверка текста сценария доступна после входа преподавателя")
    await require_ai_scenario_access(db, scenario_id, viewer)
    current = await db.scalar(select(func.max(ScenarioVersion.version)).where(ScenarioVersion.scenario_id == scenario_id))
    if current is None:
        if scenario_version is not None:
            raise not_found(f"Версия {scenario_version} сценария «{scenario_id}» не найдена")
        return {"scenarioId": scenario_id}
    if scenario_version is not None and scenario_version != current:
        raise conflict(f"Текст относится к версии {scenario_version}, текущая версия сценария — {current}; повторите проверку")
    return {"scenarioId": scenario_id, "scenarioVersion": int(current)}


async def create_chain_dds_input(db: AsyncSession, attempt: Any, assignment: Any) -> dict[str, Any]:
    from app.services.ai_scenario_service import create_chain_dds_draft

    return await create_chain_dds_draft(db, attempt=attempt, assignment=assignment)
