"""Хранение версий сценариев и подготовка безопасных черновиков ai-workflow/1."""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import conflict, forbidden, not_found, unprocessable, validation_failed
from app.db.ids import PREFIX, next_id
from app.models.ai_scenario import (
    AIRequest,
    DraftFieldDecision,
    EtalonVersion,
    SanitizedTicket,
    ScenarioVersion,
)
from app.models.assignment import AssignmentScenarioVersion
from app.models.card import Address, IncidentCard
from app.models.classifier import ClassifierEntry
from app.models.scenario import Scenario
from app.models.teacher import ProfileMappingRow
from app.schemas.v1.ai import ScenarioDraftRequest
from app.services import reference as reference_service
from app.services.audit import record
from app.services.time import now_iso
from ml import source_gate
from ml.generate import llm, scenario_generator, validator

SOURCE_TICKET_NUMBER = re.compile(r"(\d+)$")
SERVICE_NUMBER = re.compile(r"\b10[1-4]\b")
EDITABLE_PATH_SEGMENT = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def _request_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


async def _reserve_request(
    db: AsyncSession,
    viewer: Viewer,
    *,
    operation: str,
    request_id: str,
    payload: dict[str, Any],
) -> tuple[AIRequest | None, Any | None]:
    request_hash = _request_hash(payload)
    existing = (
        await db.execute(
            select(AIRequest).where(
                AIRequest.actor_id == viewer.user_id,
                AIRequest.operation == operation,
                AIRequest.request_id == request_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.request_hash != request_hash:
            raise conflict("requestId уже использован с другим содержимым")
        if existing.response is None:
            raise conflict("Запрос с таким requestId ещё выполняется")
        return None, existing.response

    request = AIRequest(
        actor_id=viewer.user_id,
        operation=operation,
        request_id=request_id,
        request_hash=request_hash,
        response=None,
    )
    try:
        async with db.begin_nested():
            db.add(request)
            await db.flush()
    except IntegrityError:
        existing = (
            await db.execute(
                select(AIRequest).where(
                    AIRequest.actor_id == viewer.user_id,
                    AIRequest.operation == operation,
                    AIRequest.request_id == request_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None and existing.request_hash == request_hash and existing.response is not None:
            return None, existing.response
        raise conflict("requestId уже занят другим запросом") from None
    return request, None


def _finish_request(request: AIRequest, response: Any) -> Any:
    request.response = response
    return response


def scenario_version_contract(
    version: ScenarioVersion,
    etalon: EtalonVersion,
    decisions: list[DraftFieldDecision],
) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "schemaVersion": "ai-workflow/1",
        "scenarioId": version.scenario_id,
        "version": version.version,
        "mode": version.mode,
        "sourceTicketId": version.source_ticket_id,
        "sourceSituationNo": version.source_situation_no,
        "sourceKind": version.source_kind,
        "sourceHash": version.source_hash,
        "validation": version.validation,
        "validationErrors": list((version.validation_report or {}).get("errors") or []),
        "approval": version.approval,
        "cardSnapshot": {"id": version.card_snapshot["id"], "fields": version.card_snapshot["fields"]},
        "etalonVersion": version.etalon_version,
        "ruleSourceIds": list(etalon.rule_source_ids or []),
        "semanticFacts": list(etalon.semantic_facts or []),
        "classifierVersion": etalon.classifier_version,
        "etalon": {
            "expectedFields": dict(etalon.expected_fields or {}),
            "expectedActions": list(etalon.expected_actions or []),
            "semanticFacts": list(etalon.semantic_facts or []),
            "ruleSourceIds": list(etalon.rule_source_ids or []),
            "classifierVersion": etalon.classifier_version,
        },
        "fieldDecisions": [
            {
                "fieldPath": item.field_path,
                "decision": item.decision,
                **({"value": item.value} if item.value is not None else {}),
                "teacherId": item.teacher_id,
                "at": item.at,
                **({"comment": item.comment} if item.comment else {}),
            }
            for item in decisions
        ],
    }
    for key, value in (
        ("sourceAttemptId", version.source_attempt_id),
        ("sourceCardId", version.source_card_id),
        ("sourceCardVersion", version.source_card_version),
        ("parentVersion", version.parent_version),
        ("teacherComment", version.teacher_comment),
        ("approvedBy", version.approved_by),
    ):
        if value is not None:
            doc[key] = value
    return doc


async def _load_source(db: AsyncSession, source_ticket_id: str) -> source_gate.ApprovedSource:
    rows = (
        await db.execute(
            select(SanitizedTicket)
            .where(SanitizedTicket.source_ticket_id == source_ticket_id)
            .order_by(SanitizedTicket.situation_no)
        )
    ).scalars().all()
    if not rows:
        raise not_found(f"Утверждённый очищенный билет «{source_ticket_id}» не найден")
    for row in rows:
        try:
            return source_gate.approved_source(row)
        except source_gate.SourceGateError:
            continue
    raise not_found(f"Для билета «{source_ticket_id}» нет утверждённой очищенной ситуации")


def _source_ticket_number(source: source_gate.ApprovedSource) -> int:
    match = SOURCE_TICKET_NUMBER.search(source.source_ticket_id)
    return int(match.group(1)) if match else source.situation_no


def _expected_services(entry: dict[str, Any]) -> list[str]:
    number = scenario_generator.MAIN_SERVICE_NUMBERS.get(str(entry.get("mainService") or ""))
    if number is None:
        number = next(
            (
                found.group(0)
                for item in entry.get("notifications") or []
                if (found := SERVICE_NUMBER.search(str(item.get("service") or "")))
            ),
            None,
        )
    return [f"{number} (главная)"] if number else []


def _safe_base_card(
    source: source_gate.ApprovedSource,
    category: str,
    classifier_entry: dict[str, Any],
    addresses: list[dict[str, Any]],
) -> dict[str, Any]:
    address_pool = scenario_generator.usable_addresses(addresses)
    if not address_pool:
        raise validation_failed("В локальном справочнике нет подходящего адреса для черновика")
    services = _expected_services(classifier_entry)
    if not services:
        raise validation_failed(f"Для категории «{category}» в классификаторе не найдена главная служба")
    base_address = scenario_generator.format_address(address_pool[0])
    return {
        # Не передаём id или снимок исходного билета в генератор.
        "id": "",
        "ticketNo": _source_ticket_number(source),
        "situationNo": source.situation_no,
        "group": category,
        "summary": source.sanitized_text,
        "address": base_address,
        "caller": {"name": "Учебный заявитель", "phone": "0000000000", "status": "очевидец"},
        "expectedServices": services,
        "expectedTags": [str(classifier_entry.get("sign1") or category)],
        "classifierCode": str(classifier_entry["code"]),
    }


def generate_from_approved_source(
    source: source_gate.ApprovedSource,
    category: str,
    classifier_entry: dict[str, Any],
    addresses: list[dict[str, Any]],
    reference: dict[str, Any],
    classifier_entries: list[dict[str, Any]],
    *,
    count: int,
    generator: str = "auto",
) -> list[dict[str, Any]]:
    """Генератор видит только очищенный текст, локальные адреса и справочник ЕКП.

    `generator`: `auto` — LLM при живом Ollama, иначе шаблон; `template` — только шаблон; `ai` — только LLM
    (нет Ollama или ответ не получен → 422, без тихой подмены шаблоном).
    """
    base = _safe_base_card(source, category, classifier_entry, addresses)
    if generator == "template":
        return scenario_generator.generate_template(
            category,
            [base],
            addresses,
            count=count,
            traps=[None],
            reference=reference,
            entries=classifier_entries,
        )
    if generator == "ai":
        client = llm.configured_client()
        if client is None or not client.healthy():
            raise unprocessable("ИИ недоступен: модель не настроена (LLAMA_URL / OLLAMA_URL) или не отвечает")
        produced = scenario_generator.generate_llm(
            category,
            [base],
            addresses,
            count=count,
            traps=scenario_generator._traps_for(count, [None]),
            reference=reference,
            entries=classifier_entries,
            client=client,
        )
        if not produced:
            raise unprocessable("ИИ не вернул корректный ответ за отведённые попытки; повторите или выберите шаблон")
        return produced
    produced = scenario_generator.generate(
        category,
        [base],
        addresses,
        count=count,
        traps=[None],
        reference=reference,
        entries=classifier_entries,
    )
    return produced


def _action_records(
    mode: str,
    card: dict[str, Any],
    rule_source_ids: list[str],
) -> list[dict[str, Any]]:
    ticket_source = next(value for value in rule_source_ids if value.startswith("ticket:"))
    classifier_source = next(value for value in rule_source_ids if value.startswith("classifier:"))
    address_source = next(value for value in rule_source_ids if value.startswith("address:"))
    if mode == "operator112":
        names = ["captureCaller", "captureAddress", "classify"]
        names.extend(f"notify:{service}" for service in dict.fromkeys(SERVICE_NUMBER.findall(" ".join(card.get("expectedServices") or []))))
        names.append("submit")
        return [
            {"action": name, "sourceRef": [address_source if name == "captureAddress" else classifier_source if name == "classify" or name.startswith("notify:") else ticket_source]}
            for name in names
        ]

    card_id = str(card["id"])
    names = [f"openCard:{card_id}", "status:accepted"]
    names.extend(f"call:{service}" for service in dict.fromkeys(SERVICE_NUMBER.findall(" ".join(card.get("expectedServices") or []))))
    names.append("status:workDone")
    return [
        {"action": name, "sourceRef": [address_source if name.startswith("openCard:") else classifier_source if name.startswith("call:") else ticket_source]}
        for name in names
    ]


def _expected_fields(card: dict[str, Any]) -> dict[str, Any]:
    keys = ("group", "summary", "address", "classifierCode", "expectedServices", "expectedTags")
    return {key: card[key] for key in keys if key in card}


def _address_allowlist(addresses: list[dict[str, Any]]) -> set[str]:
    return {
        " ".join(scenario_generator.format_address(entry).casefold().replace("ё", "е").split())
        for entry in scenario_generator.usable_addresses(addresses)
    }


def _semantic_facts(card: dict[str, Any], source: source_gate.ApprovedSource, rule_source_ids: list[str]) -> list[dict[str, Any]]:
    ticket_source = next(value for value in rule_source_ids if value.startswith("ticket:"))
    classifier_source = next(value for value in rule_source_ids if value.startswith("classifier:"))
    return [
        {"id": f"fact:{source.source_ticket_id}:{source.situation_no}:summary", "fieldPath": "summary", "value": card.get("summary", ""), "sourceRef": [ticket_source]},
        {"id": f"fact:{source.source_ticket_id}:{source.situation_no}:group", "fieldPath": "group", "value": card.get("group", ""), "sourceRef": [classifier_source]},
        {"id": f"fact:{source.source_ticket_id}:{source.situation_no}:code", "fieldPath": "classifierCode", "value": card.get("classifierCode", ""), "sourceRef": [classifier_source]},
    ]


def _serialize_card(row: IncidentCard) -> dict[str, Any]:
    return row.to_contract()


async def _profile_groups(db: AsyncSession) -> set[str]:
    rows = (await db.execute(select(ProfileMappingRow))).scalars().all()
    return {group for row in rows for group in (row.incident_groups or [])}


async def _save_draft(
    db: AsyncSession,
    viewer: Viewer,
    source: source_gate.ApprovedSource,
    mode: str,
    category: str,
    item: dict[str, Any],
    classifier_entries: list[dict[str, Any]],
    profile_groups: set[str],
    address_allowlist: set[str],
) -> dict[str, Any]:
    scenario_doc = dict(item.get("scenario") or {})
    tickets = item.get("cards") or []
    if not tickets or not isinstance(tickets[0], dict):
        raise validation_failed("Генератор не вернул карточку для сценария")
    ticket = dict(tickets[0])
    classifier_entry = next((entry for entry in classifier_entries if entry.get("group") == category), None)
    if classifier_entry is None:
        raise validation_failed(f"Категория «{category}» отсутствует в классификаторе ЕКП")
    # Код/категория задаются серверным справочником, а не предложением модели.
    ticket["group"] = category
    ticket["classifierCode"] = str(classifier_entry["code"])
    card_id = await next_id(db, PREFIX["card"], IncidentCard.id)
    ticket["id"] = card_id
    card_row = IncidentCard(
        id=card_id,
        ticket_no=int(ticket.get("ticketNo") or _source_ticket_number(source)),
        situation_no=source.situation_no,
        group=category,
        summary=str(ticket.get("summary") or source.sanitized_text),
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
        extra={key: value for key, value in ticket.items() if key not in {
            "id", "ticketNo", "situationNo", "group", "summary", "address", "addressRefined", "caller", "victims",
            "noAmbulance", "crossRegion", "expectedServices", "expectedTags", "duplicateOf", "createdByStudentId",
        }},
    )
    db.add(card_row)
    await db.flush()
    card_contract = _serialize_card(card_row)

    scenario_id = await next_id(db, PREFIX["scenario"], Scenario.id)
    scenario_doc["id"] = scenario_id
    scenario_doc["title"] = str(scenario_doc.get("title") or f"Вариация: {category}")
    scenario_doc["cardIds"] = [card_id]
    scenario_doc["source"] = "generated"
    scenario_doc["mode"] = mode
    scenario_doc["validation"] = {"status": "draft"}
    scenario_doc.setdefault("generation", {})["sourceTicketId"] = source.source_ticket_id
    scenario = Scenario(
        id=scenario_id,
        doc=scenario_doc,
        title="",
        level="",
        difficulty=1,
        source="",
        validation_status="",
        history=[],
        validation_report=None,
        created_by=viewer.user_id,
        updated_by=viewer.user_id,
        updated_at=now_iso(),
    )
    scenario.sync_columns()
    db.add(scenario)

    ticket_rule = f"ticket:{source.source_ticket_id}:{source.situation_no}"
    classifier_rule = f"classifier:{classifier_entry['code']}"
    address_rule = "address:local-directory"
    rule_source_ids = [ticket_rule, classifier_rule, address_rule]
    actions = _action_records(mode, card_contract, rule_source_ids)
    errors = validator.validate_ai_scenario(
        card_contract,
        actions,
        mode=mode,
        classifier_entries=classifier_entries,
        profile_groups=profile_groups,
        rule_source_ids=rule_source_ids,
        address_allowlist=address_allowlist,
    )
    passed = not errors
    provider = str((scenario_doc.get("generation") or {}).get("provider") or "template")
    source_kind = "llm" if provider.startswith("ollama:") else "template"
    etalon_id = f"{scenario_id}:etalon:1"
    classifier_version = str((await reference_service.read_classifier_meta(db)).get("version") or "classifier-seed")
    etalon = EtalonVersion(
        id=etalon_id,
        scenario_id=scenario_id,
        mode=mode,
        expected_fields=_expected_fields(card_contract),
        expected_actions=actions,
        semantic_facts=_semantic_facts(card_contract, source, rule_source_ids),
        rule_source_ids=rule_source_ids,
        classifier_version=classifier_version,
        created_at=now_iso(),
    )
    db.add(etalon)
    version = ScenarioVersion(
        scenario_id=scenario_id,
        version=1,
        mode=mode,
        source_ticket_id=source.source_ticket_id,
        source_situation_no=source.situation_no,
        created_by=viewer.user_id,
        source_kind=source_kind,
        source_hash=source.source_hash,
        validation="passed" if passed else "failed",
        validation_report={"passed": passed, "errors": errors},
        approval="draft" if passed else "validation_failed",
        card_snapshot={"id": card_id, "fields": _serialize_card(card_row)},
        etalon_version=etalon_id,
        rule_source_ids=rule_source_ids,
    )
    db.add(version)
    scenario.validation_report = {"version": "ai-workflow/1", "passed": passed, "errors": errors}
    await db.flush()
    return scenario_version_contract(version, etalon, [])


async def create_drafts(db: AsyncSession, body: ScenarioDraftRequest, viewer: Viewer) -> list[dict[str, Any]]:
    if viewer.role not in ("teacher", "admin"):
        from app.api.errors import forbidden

        raise forbidden("Создавать AI-сценарии может преподаватель или администратор")
    payload = body.model_dump(by_alias=True, mode="json")
    request, replay = await _reserve_request(
        db, viewer, operation="drafts", request_id=body.request_id, payload=payload
    )
    if request is None:
        return replay

    source = await _load_source(db, body.source_ticket_id)
    classifier_rows = (await db.execute(select(ClassifierEntry).order_by(ClassifierEntry.code))).scalars().all()
    classifier_entries = [row.to_contract() for row in classifier_rows]
    classifier_entry = next((row for row in classifier_entries if row.get("group") == body.category), None)
    if classifier_entry is None:
        raise validation_failed(f"Категория «{body.category}» отсутствует в классификаторе ЕКП")
    addresses = [row.doc for row in (await db.execute(select(Address).order_by(Address.id))).scalars().all()]
    reference = await reference_service.read_reference(db)
    started = time.perf_counter()
    produced = await asyncio.to_thread(
        generate_from_approved_source,
        source,
        body.category,
        classifier_entry,
        addresses,
        reference,
        classifier_entries,
        count=body.count,
        generator=body.generator,
    )
    generation_ms = round((time.perf_counter() - started) * 1000)
    if len(produced) < body.count:
        base = _safe_base_card(source, body.category, classifier_entry, addresses)
        produced = scenario_generator.generate_template(
            body.category,
            [base],
            addresses,
            count=body.count,
            traps=[None],
            reference=reference,
            entries=classifier_entries,
        )
    profiles = await _profile_groups(db)
    allowed_addresses = _address_allowlist(addresses)
    template_fallback: list[dict[str, Any]] | None = None
    responses: list[dict[str, Any]] = []
    for index, item in enumerate(produced[: body.count]):
        candidate = dict(item)
        candidate_ticket = dict((candidate.get("cards") or [{}])[0])
        candidate_ticket.update({"id": "candidate-card", "group": body.category, "classifierCode": classifier_entry["code"]})
        candidate_rules = [
            f"ticket:{source.source_ticket_id}:{source.situation_no}",
            f"classifier:{classifier_entry['code']}",
            "address:local-directory",
        ]
        candidate_errors = validator.validate_ai_scenario(
            candidate_ticket,
            _action_records(body.mode, candidate_ticket, candidate_rules),
            mode=body.mode,
            classifier_entries=classifier_entries,
            profile_groups=profiles,
            rule_source_ids=candidate_rules,
            address_allowlist=allowed_addresses,
        )
        if candidate_errors:
            if template_fallback is None:
                base = _safe_base_card(source, body.category, classifier_entry, addresses)
                template_fallback = scenario_generator.generate_template(
                    body.category,
                    [base],
                    addresses,
                    count=body.count,
                    traps=[None],
                    reference=reference,
                    entries=classifier_entries,
                )
            if index < len(template_fallback):
                candidate = template_fallback[index]
        result = await _save_draft(
            db,
            viewer,
            source,
            body.mode,
            body.category,
            candidate,
            classifier_entries,
            profiles,
            allowed_addresses,
        )
        provider = str(((candidate.get("scenario") or {}).get("generation") or {}).get("provider") or "template")
        responses.append({**result, "generation": {"provider": provider, "durationMs": generation_ms}})
    await record(
        db,
        action="ai.scenario.drafts",
        user_id=viewer.user_id,
        role=viewer.role,
        details=f"Создано черновиков: {len(responses)}; режим {body.mode}; источник {source.source_ticket_id}:{source.situation_no}",
    )
    return _finish_request(request, responses)


async def require_scenario_access(db: AsyncSession, scenario_id: str, viewer: Viewer) -> Scenario:
    if viewer.role not in ("teacher", "admin"):
        raise forbidden("Операции со сценарием доступны только преподавателю или администратору")
    scenario = await db.get(Scenario, scenario_id)
    if scenario is None or scenario.deleted:
        raise not_found(f"Сценарий «{scenario_id}» не найден")
    if viewer.role == "admin":
        return scenario
    if viewer.role == "teacher":
        if scenario.source == "template" or scenario.created_by in (None, viewer.user_id):
            return scenario
        version_owner = await db.scalar(
            select(ScenarioVersion.created_by).where(
                ScenarioVersion.scenario_id == scenario_id,
                ScenarioVersion.created_by == viewer.user_id,
            )
        )
        if version_owner is not None:
            return scenario
    raise forbidden("Сценарий недоступен преподавателю")


async def list_versions(db: AsyncSession, scenario_id: str) -> list[dict[str, Any]]:
    versions = (
        await db.execute(
            select(ScenarioVersion).where(ScenarioVersion.scenario_id == scenario_id).order_by(ScenarioVersion.version)
        )
    ).scalars().all()
    result: list[dict[str, Any]] = []
    for version in versions:
        etalon = await db.get(EtalonVersion, version.etalon_version)
        if etalon is None:
            continue
        decisions = (
            await db.execute(
                select(DraftFieldDecision)
                .where(
                    DraftFieldDecision.scenario_id == scenario_id,
                    DraftFieldDecision.scenario_version == version.version,
                )
                .order_by(DraftFieldDecision.id)
            )
        ).scalars().all()
        result.append(scenario_version_contract(version, etalon, decisions))
    return result


def _get_path(value: dict[str, Any], path: str) -> Any:
    current: Any = value
    for part in path.split("."):
        if not EDITABLE_PATH_SEGMENT.fullmatch(part) or not isinstance(current, dict) or part not in current:
            raise validation_failed(f"Поле «{path}» отсутствует в карточке версии")
        current = current[part]
    return current


def set_card_field(fields: dict[str, Any], path: str, value: Any) -> None:
    parts = path.split(".")
    if not all(EDITABLE_PATH_SEGMENT.fullmatch(part) for part in parts):
        raise validation_failed(f"Некорректный путь поля «{path}»")
    parent: Any = fields
    for part in parts[:-1]:
        if not isinstance(parent, dict) or part not in parent:
            raise validation_failed(f"Поле «{path}» отсутствует в карточке версии")
        parent = parent[part]
    old_value = _get_path(fields, path)
    if old_value is not None and not isinstance(value, type(old_value)):
        raise validation_failed(f"Значение поля «{path}» должно иметь тип {type(old_value).__name__}")
    try:
        json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError) as error:
        raise validation_failed(f"Значение поля «{path}» не является JSON-значением") from error
    parent[parts[-1]] = value


def validate_card_snapshot(
    fields: dict[str, Any],
    mode: str,
    etalon: EtalonVersion,
    classifier_entries: list[dict[str, Any]],
    profile_groups: set[str],
    address_allowlist: set[str],
) -> list[dict[str, str]]:
    return validator.validate_ai_scenario(
        fields,
        list(etalon.expected_actions or []),
        mode=mode,
        classifier_entries=classifier_entries,
        profile_groups=profile_groups,
        rule_source_ids=list(etalon.rule_source_ids or []),
        address_allowlist=address_allowlist,
    )


async def create_chain_dds_draft(
    db: AsyncSession,
    *,
    attempt: Any,
    assignment: Any,
) -> dict[str, Any]:
    """Создаёт ожидающий подтверждения ДДС-снимок из IncidentCard, записанной submit-ом."""
    from app.services import operator112_service

    if assignment.training_mode != "chain" or attempt.mode != "operator112" or attempt.state != "submitted":
        raise conflict("Переход A → B требует сохранённой попытки режима operator112 в задании chain")
    if attempt.student_id not in (assignment.student_ids or []):
        raise validation_failed("Попытка не принадлежит обучающемуся из задания chain")
    saved_card = await operator112_service.saved_card_for_attempt(db, attempt.id)
    parents = (
        await db.execute(
            select(ScenarioVersion).where(
                ScenarioVersion.mode == "operator112",
                ScenarioVersion.approval == "approved",
                ScenarioVersion.validation == "passed",
            )
        )
    ).scalars().all()
    parent = next((row for row in parents if row.card_snapshot.get("id") == attempt.card_id), None)
    if parent is None:
        raise conflict("Для карточки задания нет утверждённой версии режима operator112")
    prior_versions = (
        await db.execute(select(ScenarioVersion.version).where(ScenarioVersion.scenario_id == parent.scenario_id))
    ).scalars().all()
    next_version = max(prior_versions, default=0) + 1
    card = saved_card.to_contract()
    encoded = json.dumps(card, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    source_hash = hashlib.sha256(encoded).hexdigest()
    rule_source_ids = list(parent.rule_source_ids or [])
    if not rule_source_ids:
        rule_source_ids = [f"ticket:{parent.source_ticket_id}:{parent.source_situation_no}"]
    ticket_rule = next((value for value in rule_source_ids if value.startswith("ticket:")), rule_source_ids[0])
    classifier_rule = next((value for value in rule_source_ids if value.startswith("classifier:")), rule_source_ids[0])
    address_rule = next((value for value in rule_source_ids if value.startswith("address:")), rule_source_ids[0])
    actions = _action_records("dds", card, [ticket_rule, classifier_rule, address_rule])
    etalon_id = f"{parent.scenario_id}:etalon:{next_version}"
    classifier_rows = (await db.execute(select(ClassifierEntry).order_by(ClassifierEntry.code))).scalars().all()
    classifier_entries = [row.to_contract() for row in classifier_rows]
    address_rows = (await db.execute(select(Address).order_by(Address.id))).scalars().all()
    allowed_addresses = _address_allowlist([row.doc for row in address_rows])
    etalon = EtalonVersion(
        id=etalon_id,
        scenario_id=parent.scenario_id,
        mode="dds",
        expected_fields=_expected_fields(card),
        expected_actions=actions,
        semantic_facts=_semantic_facts(
            card,
            source_gate.ApprovedSource(
                source_ticket_id=parent.source_ticket_id,
                situation_no=saved_card.situation_no,
                sanitized_text=str(card.get("summary") or ""),
                source_hash=source_hash,
                reviewer_id=assignment.teacher_id,
                reviewed_at=now_iso(),
            ),
            [ticket_rule, classifier_rule, address_rule],
        ),
        rule_source_ids=[ticket_rule, classifier_rule, address_rule],
        classifier_version="student-card-etalon-1",
        created_at=now_iso(),
    )
    errors = validate_card_snapshot(
        dict(card),
        "dds",
        etalon,
        classifier_entries,
        await _profile_groups(db),
        allowed_addresses,
    )
    dds_version = ScenarioVersion(
        scenario_id=parent.scenario_id,
        version=next_version,
        mode="dds",
        source_ticket_id=parent.source_ticket_id,
        source_situation_no=saved_card.situation_no,
        created_by=attempt.student_id,
        source_kind="student_card",
        source_hash=source_hash,
        source_attempt_id=attempt.id,
        source_card_id=saved_card.id,
        source_card_version=1,
        parent_version=parent.version,
        teacher_comment=None,
        validation="passed" if not errors else "failed",
        validation_report={"passed": not errors, "errors": errors},
        approval="pending_review" if not errors else "validation_failed",
        card_snapshot={"id": saved_card.id, "fields": card},
        etalon_version=etalon_id,
        rule_source_ids=[ticket_rule, classifier_rule, address_rule],
    )
    db.add_all([etalon, dds_version])
    db.add(
        AssignmentScenarioVersion(
            assignment_id=assignment.id,
            scenario_id=parent.scenario_id,
            version=next_version,
            card_id=saved_card.id,
            mode="dds",
        )
    )
    await db.flush()
    await record(
        db,
        action="ai.scenario.chain_review",
        user_id=attempt.student_id,
        role="student",
        details=f"Подготовлен черновик ДДС для попытки {attempt.id}; ожидает подтверждения преподавателя",
        card_id=saved_card.id,
    )
    return {"scenarioId": parent.scenario_id, "version": next_version, "cardId": saved_card.id}


# Доступны через существующий scenario_service: новый workflow остаётся частью сервиса сценариев.
async def create_ai_drafts(db: AsyncSession, body: ScenarioDraftRequest, viewer: Viewer) -> list[dict[str, Any]]:
    return await create_drafts(db, body, viewer)


__all__ = [
    "_reserve_request",
    "_finish_request",
    "_request_hash",
    "create_ai_drafts",
    "create_chain_dds_draft",
    "generate_from_approved_source",
    "list_versions",
    "scenario_version_contract",
    "set_card_field",
    "validate_card_snapshot",
]
