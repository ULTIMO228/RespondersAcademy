"""Режим специалиста-112 (T083, US3): вызов → ответ → события → список оповещения → карточка → оценка режима A.

Попытка — строка `attempts` с `mode=operator112` (`aon` из билета, номер происшествия продолжает нумерацию карточек
ПОВ-112), связь с заданием — `assignment_attempts` (прослушивания, подсказки, состояние, результат экзамена).
События хранятся в `attempts.events` с серверным таймстампом и «было/стало» для полей. Подсказки FR-017 — список
шагов в ответе попытки (`hints`), таймер простоя считает фронт и шлёт `hintShown` (решение 2026-09-22).
Отправка карточки создаёт `incident_cards` (`mode_origin=operator112`, US8) и оценку `ml.assess.operator112`.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import (
    conflict,
    evaluation_pending,
    forbidden,
    invalid_transition,
    not_found,
    validation_failed,
)
from app.db.ids import PREFIX, next_id
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.card import ArmCardFixture, IncidentCard
from app.models.classifier import ClassifierEntry
from app.models.session import Attempt, Evaluation
from app.models.street import Street
from app.models.ticket_audio import TicketAudio
from app.models.user import User
from app.schemas.v1.operator112 import Journal112Response, Journal112Row
from app.services import ticket_audio_service, training_profile
from app.services.reference import read_reference
from app.services.session_engine import evaluation_contract
from app.services.time import now_iso, parse_iso_ms
from ml.assess import adapter
from ml.assess import operator112 as assessor
from ml.classify import notification_list as nl
from ml.nlp import address as address_nlp

MODE = "operator112"
ANSWER_TIMEOUT_EVENT = "answerTimeout"
DEFAULT_ANSWER_SEC = 30
DEFAULT_IDLE_SEC = 20
HINT_STEPS: tuple[dict[str, str], ...] = (
    {"stage": "answer", "text": "Примите вызов: нажмите «Ответить»"},
    {"stage": "applicant", "text": "Заполните заявителя: ФИО и статус (очевидец, пострадавший…)"},
    {"stage": "address", "text": "Заполните адрес: улица по справочнику, дом, корпус, подъезд"},
    {"stage": "description", "text": "Запишите описание со слов заявителя — все факты записи"},
    {"stage": "poll", "text": "Пройдите опросную карту: тип происшествия → признаки → итоговый тип"},
    {"stage": "signs", "text": "Проверьте признаки и флаги: пострадавшие, отказ от СМП, ЧС/ЧП"},
    {"stage": "notification", "text": "Проверьте список оповещения; при необходимости добавьте службу вручную"},
    {"stage": "submit", "text": "Сохраните карточку — она получит статус «Зарегистрирована»"},
)
_DIGITS = re.compile(r"\D+")


# ─── Доступ и справочники ─────────────────────────────────────────────────────────────────────────


async def require_assignment(db: AsyncSession, assignment_id: str) -> Assignment:
    row = await db.get(Assignment, assignment_id)
    if row is None:
        raise not_found(f"Задание «{assignment_id}» не найдено")
    return row


async def require_attempt(db: AsyncSession, attempt_id: str, viewer: Viewer) -> tuple[Attempt, AssignmentAttempt | None, Assignment | None]:
    attempt = await db.get(Attempt, attempt_id)
    if attempt is None or attempt.mode != MODE:
        raise not_found(f"Попытка «{attempt_id}» режима 112 не найдена")
    if viewer.is_student and viewer.user_id != attempt.student_id:
        raise forbidden("Обучающемуся доступны только собственные попытки")
    link = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.attempt_id == attempt_id))).scalars().first()
    assignment = await db.get(Assignment, link.assignment_id) if link else None
    if viewer.role == "teacher" and assignment is not None and assignment.teacher_id != viewer.user_id and viewer.user_id not in (assignment.student_ids or []):
        raise forbidden("Попытка относится к заданию другого преподавателя")
    return attempt, link, assignment


async def classifier_entries(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (await db.execute(select(ClassifierEntry).order_by(ClassifierEntry.code))).scalars().all()
    return [row.to_contract() for row in rows]


def resolve_student_id(viewer: Viewer, requested: str | None) -> str:
    if viewer.is_student:
        if requested and requested != viewer.user_id:
            raise forbidden("Обучающийся создаёт попытку только за себя")
        return viewer.user_id
    if not requested:
        raise validation_failed("Укажите «studentId» обучающегося")
    return requested


def format_aon(phone: str) -> str:
    digits = _DIGITS.sub("", phone or "")
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    if len(digits) == 10:
        return f"+7 ({digits[:3]}) {digits[3:6]}-{digits[6:8]}-{digits[8:]}"
    return phone or ""


async def next_incident_number(db: AsyncSession) -> int:
    fixtures = (await db.execute(select(func.max(ArmCardFixture.number)))).scalar() or 0
    attempts = (await db.execute(select(func.max(Attempt.incident_number)))).scalar() or 0
    return int(max(fixtures, attempts)) + 1


async def in_student_journal(db: AsyncSession, student_id: str, card_id: str) -> bool:
    """Карточка из журнала ученика-112 (спека 009, FR-007): фон журнала или собственная карточка ученика режима 112.

    Карточки других обучающихся в журнал не попадают, поэтому и привязать их нельзя.
    """
    if await db.get(ArmCardFixture, card_id) is not None:
        return True
    card = await db.get(IncidentCard, card_id)
    return card is not None and card.mode_origin == MODE and card.created_by_student_id == student_id


def hints_of(assignment: Assignment | None) -> dict[str, Any]:
    params = dict((assignment.params if assignment else None) or {})
    hints = params.get("hints") if isinstance(params.get("hints"), dict) else {}
    enabled = bool(hints.get("enabled", True)) and (assignment is None or assignment.format != "exam")
    idle = hints.get("idleSec")
    idle_sec = int(idle) if isinstance(idle, (int, float)) and idle > 0 else DEFAULT_IDLE_SEC
    return {"enabled": enabled, "idleSec": idle_sec, "steps": [dict(step) for step in HINT_STEPS]}


def answer_norm_sec(assignment: Assignment | None) -> int:
    norms = ((assignment.params if assignment else None) or {}).get("norms") or {}
    value = norms.get("answerSec") or norms.get("primaryReactionSec")
    return int(value) if isinstance(value, (int, float)) and value > 0 else DEFAULT_ANSWER_SEC


def _event(events: list[dict[str, Any]], event_type: str, payload: dict[str, Any], before: Any = None) -> dict[str, Any]:
    event: dict[str, Any] = {"id": f"ev-{len(events) + 1:03d}", "type": event_type, "at": now_iso(), "payload": dict(payload)}
    if before is not None:
        event["before"] = before
    return event


def ticket_fields(card: IncidentCard | None) -> dict[str, Any]:
    """Поля билета для окна вызова (спека 009, FR-010, US5/US6): канал, текст СМС и повтор из `IncidentCard.extra`.

    Сид кладёт в `extra` ключи билета как есть (`channel`, `smsText`, `repeatOf` из cards.json: c-066 — СМС, c-093 — повтор).
    """
    extra = (card.extra if card is not None else None) or {}
    channel = "sms" if extra.get("channel") == "sms" else "call"
    repeat_of = extra.get("repeatOf")
    return {
        "channel": channel,
        "sms_text": str(extra.get("smsText") or "") if channel == "sms" else None,
        "repeat_of": str(repeat_of) if repeat_of else None,
    }


async def contract_of(db: AsyncSession, attempt: Attempt, link: AssignmentAttempt | None, assignment: Assignment | None) -> dict[str, Any]:
    audio = await db.get(TicketAudio, attempt.card_id)
    ticket = await db.get(IncidentCard, attempt.card_id)
    return attempt.to_operator_contract(
        replays=link.replays if link else 0,
        hints_shown=link.hints_shown if link else 0,
        hints=hints_of(assignment),
        assignment_id=link.assignment_id if link else None,
        audio=ticket_audio_service.audio_contract(audio, attempt.card_id),
        **ticket_fields(ticket),
    )


# ─── Попытка ──────────────────────────────────────────────────────────────────────────────────────


async def create_attempt(db: AsyncSession, assignment_id: str, card_id: str, student_id: str | None, viewer: Viewer, background: Any | None = None) -> tuple[dict[str, Any], bool]:
    """«Поступление вызова»: (OperatorAttempt, created). Тренировка возвращает открытую попытку, экзамен повтор → 409."""
    assignment = await require_assignment(db, assignment_id)
    student = resolve_student_id(viewer, student_id)
    if viewer.role == "teacher" and assignment.teacher_id != viewer.user_id:
        raise forbidden("Задание другого преподавателя")
    if student not in (assignment.student_ids or []):
        raise forbidden("Обучающийся не назначен на это задание")
    if assignment.state != "active":
        raise conflict("Задание завершено")
    if assignment.card_ids and card_id not in assignment.card_ids:
        raise validation_failed(f"Билет «{card_id}» не входит в задание")
    if not assignment.card_ids and assignment.random_rule:
        # Тренировочный randomRule не фиксируется в БД, но прямой endpoint режима 112
        # всё равно обязан ограничить билет тем же рассчитанным набором, что и /assignments/{id}/start.
        from app.services.assignment_service import candidate_card_ids

        allowed = await candidate_card_ids(db, assignment.random_rule, [student], assignment.training_mode)
        if card_id not in allowed:
            raise validation_failed(f"Билет «{card_id}» не входит в случайный набор задания")
    card = await db.get(IncidentCard, card_id)
    if card is None:
        raise not_found(f"Билет «{card_id}» не найден")
    links = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.assignment_id == assignment_id, AssignmentAttempt.student_id == student, AssignmentAttempt.card_id == card_id))).scalars().all()
    for link in links:
        existing = await db.get(Attempt, link.attempt_id)
        if existing is None:
            continue
        if assignment.format == "exam":
            raise conflict("В экзамене билет выдаётся один раз")
        if existing.state != "submitted":
            return await contract_of(db, existing, link, assignment), False
    _, needs_audio = await ticket_audio_service.ensure_audio(db, card)
    if needs_audio:
        ticket_audio_service.schedule_synthesis([card.id], background)
    caller = card.caller if isinstance(card.caller, dict) else {}
    attempt = Attempt(
        id=await next_id(db, PREFIX["attempt"], Attempt.id),
        session_id="",
        card_id=card.id,
        student_id=student,
        mode=MODE,
        opened_at=now_iso(),
        aon=format_aon(str(caller.get("phone") or "")),
        incident_number=await next_incident_number(db),
        state="ringing",
        events=[],
    )
    db.add(attempt)
    await db.flush()
    link = AssignmentAttempt(assignment_id=assignment_id, student_id=student, card_id=card.id, attempt_id=attempt.id, state="ringing")
    db.add(link)
    await db.flush()
    return await contract_of(db, attempt, link, assignment), True


async def answer(db: AsyncSession, attempt_id: str, viewer: Viewer) -> dict[str, Any]:
    attempt, link, assignment = await require_attempt(db, attempt_id, viewer)
    if attempt.state == "submitted":
        raise invalid_transition("Карточка уже отправлена")
    if attempt.state != "answered":
        attempt.answered_at = now_iso()
        attempt.primary_reaction_ms = max(0, parse_iso_ms(attempt.answered_at) - parse_iso_ms(attempt.opened_at))
        attempt.state = "answered"
        events = list(attempt.events or [])
        norm = answer_norm_sec(assignment)
        if attempt.primary_reaction_ms > norm * 1000:
            events.append(_event(events, ANSWER_TIMEOUT_EVENT, {"answerMs": attempt.primary_reaction_ms, "normSec": norm, "text": "Вызов не принят вовремя"}))
        attempt.events = events
        if link is not None:
            link.state = "answered"
        await db.flush()
    return await contract_of(db, attempt, link, assignment)


def _last_payload(events: list[dict[str, Any]], event_type: str, key: str | None = None, field: str | None = None) -> Any:
    for event in reversed(events):
        if event.get("type") != event_type:
            continue
        payload = event.get("payload") or {}
        if field is not None and payload.get("field") != field:
            continue
        return payload.get(key) if key else payload
    return None


async def add_event(db: AsyncSession, attempt_id: str, event_type: str, payload: dict[str, Any], viewer: Viewer) -> dict[str, Any]:
    attempt, link, assignment = await require_attempt(db, attempt_id, viewer)
    # Окно вызова можно закрыть «×» до приёма (спека 009, R5): «callHidden» — единственное событие в состоянии ringing.
    if attempt.state == "ringing" and event_type != "callHidden":
        raise invalid_transition("Сначала примите вызов")
    if attempt.state == "submitted":
        raise invalid_transition("Карточка уже отправлена")
    events = list(attempt.events or [])
    before: Any = None
    exam = assignment is not None and assignment.format == "exam"
    if event_type == "fieldChanged":
        before = _last_payload(events, "fieldChanged", "value", field=str(payload.get("field")))
    elif event_type == "replay":
        if exam and link is not None and link.replays >= 1:
            raise conflict("В экзамене запись прослушивается один раз")
        if link is not None:
            link.replays += 1
    elif event_type == "linkAdded":
        card_id = str(payload.get("cardId") or "").strip()
        if not await in_student_journal(db, attempt.student_id, card_id):
            raise validation_failed(f"Карточки «{card_id}» нет в журнале: привязать можно только карточку из журнала")
    elif event_type == "hintShown":
        if not hints_of(assignment)["enabled"]:
            raise conflict("Подсказки в этом задании отключены")
        if link is not None:
            link.hints_shown += 1
    event = _event(events, event_type, payload, before)
    events.append(event)
    attempt.events = events
    await db.flush()
    return event


def draft_from_events(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Текущее состояние опросной карты из событий: признаки, код/тип, флаги, ручные службы."""
    signs = _last_payload(events, "signSelected", "signs") or []
    flags: list[str] = []
    for event in events:
        if event.get("type") != "fieldChanged":
            continue
        payload = event.get("payload") or {}
        field, value = str(payload.get("field") or ""), payload.get("value")
        if field in ("what.casualties.injured", "casualties.injured") and value:
            flags.append("Пострадавшие")
        if field in ("what.casualties.blocked", "casualties.blocked") and value:
            flags.append("НД")
        if field in ("what.flags", "flags") and isinstance(value, list):
            flags.extend(str(v) for v in value)
    tabs = _last_payload(events, "signSelected", "tabs")
    if not isinstance(tabs, list) or not tabs:
        tabs = [{"signs": list(signs)}]
    return {
        "tabs": [{"group": str(t.get("group") or ""), "signs": [str(x) for x in t.get("signs") or [] if str(x).strip()]} for t in tabs if isinstance(t, dict)],
        "signs": [str(s) for s in signs if str(s).strip()],
        "classifierCode": str(_last_payload(events, "fieldChanged", "value", field="what.classifierCode") or ""),
        "finalType": str(_last_payload(events, "fieldChanged", "value", field="what.finalType") or ""),
        "flags": flags,
        "manual": [{"serviceId": sid} for sid in _manual_services(events)],
    }


def _manual_services(events: list[dict[str, Any]]) -> list[str]:
    """Ручные службы по порядку событий: serviceAdded добавляет, serviceRemoved («×» на плитке) убирает."""
    manual: list[str] = []
    for event in events:
        sid = str((event.get("payload") or {}).get("serviceId") or "").strip()
        if not sid:
            continue
        if event.get("type") == "serviceAdded" and sid not in manual:
            manual.append(sid)
        elif event.get("type") == "serviceRemoved" and sid in manual:
            manual.remove(sid)
    return manual


async def notification_list(db: AsyncSession, attempt_id: str, viewer: Viewer, *, signs: list[str] | None = None, classifier_code: str | None = None) -> dict[str, Any]:
    attempt, _, _ = await require_attempt(db, attempt_id, viewer)
    state = draft_from_events(list(attempt.events or []))
    reference = await read_reference(db)
    entries = await classifier_entries(db)
    tabs = None if signs else state["tabs"]  # предпросмотр по явным признакам — одна вкладка
    result = nl.build_tabs(entries, reference, tabs=tabs, signs=signs or state["signs"], classifier_code=classifier_code or state["classifierCode"], final_type=state["finalType"], flags=state["flags"], manual=state["manual"])
    return result.to_contract()


async def preview_notification_list(db: AsyncSession, *, signs: list[str], classifier_code: str | None, flags: list[str], manual: list[str], tabs: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Список оповещения без попытки (карточка-тренировка): те же правила ЕКП, состояние присылает клиент (вкладки — `tabs`)."""
    reference = await read_reference(db)
    entries = await classifier_entries(db)
    result = nl.build_tabs(entries, reference, tabs=tabs, signs=signs, classifier_code=classifier_code, flags=flags, manual=[{"serviceId": sid} for sid in manual])
    return result.to_contract()


def _fill_notification_list(draft: dict[str, Any], entries: list[dict[str, Any]], reference: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    """Список оповещения карточки: переданный фронтом либо автоматический по опросной карте + ручные из событий."""
    what = draft.get("what") or {}
    state = draft_from_events(events)
    manual = [*state["manual"], *[{"serviceId": n.get("serviceId")} for n in draft.get("notificationList") or [] if n.get("addedBy") == "manual"]]
    result = nl.build_tabs(entries, reference, tabs=state["tabs"] if not what.get("signs") or what.get("signs") == state["signs"] else None, signs=what.get("signs") or state["signs"], classifier_code=what.get("classifierCode") or state["classifierCode"], final_type=what.get("finalType") or state["finalType"], flags=[*assessor.draft_flags(draft), *state["flags"]], manual=manual)
    if not draft.get("notificationList"):
        draft["notificationList"] = [{"serviceId": s.service_id, "addedBy": s.added_by} for s in result.services]
    if result.entry is not None:
        what.setdefault("finalType", "")
        if not what.get("finalType"):
            what["finalType"] = result.final_type
        if not what.get("classifierCode"):
            what["classifierCode"] = result.classifier_code
        draft["what"] = what
    return draft


def _card_from_draft(card_id: str, draft: dict[str, Any], ticket: IncidentCard, attempt: Attempt, entries: list[dict[str, Any]], reference: dict[str, Any]) -> IncidentCard:
    what = draft.get("what") or {}
    entry = nl.find_entry_by_code(entries, str(what.get("classifierCode") or ""))
    address_block = draft.get("address") or {}
    # expectedServices в формате сидов: «101», «103» для служб ВИС, иначе короткое имя службы справочника.
    services = [sid.removeprefix("svc-") if re.match(r"^svc-10[1-4]$", sid) else nl.service_title(sid, reference) for sid in (str(n.get("serviceId") or "") for n in draft.get("notificationList") or []) if sid]
    return IncidentCard(
        id=card_id,
        ticket_no=int(attempt.incident_number or 0),
        situation_no=ticket.situation_no,
        group=str((entry or {}).get("group") or what.get("finalType") or ticket.group),
        summary=str(draft.get("description") or what.get("pollAnswers") or ""),
        address=str(address_block.get("formal") or address_block.get("street") or address_block.get("descriptive") or ""),
        caller={"name": str((draft.get("applicant") or {}).get("name") or "не указан"), "phone": str((draft.get("phones") or {}).get("provided") or attempt.aon or ""), "status": str((draft.get("applicant") or {}).get("status") or "очевидец")},
        victims={"count": 1, "note": ""} if (what.get("casualties") or {}).get("injured") else None,
        no_ambulance=bool((what.get("casualties") or {}).get("ambulanceRefused")) or None,
        expected_services=services,
        expected_tags=[str(s) for s in what.get("signs") or []],
        created_by_student_id=attempt.student_id,
        mode_origin=MODE,
        source_attempt_id=attempt.id,
        extra={"sourceCardId": ticket.id, "finalType": what.get("finalType") or "", "classifierCode": what.get("classifierCode") or "", "registeredAt": attempt.completed_at, "cardStatus": "registered"},
    )


async def submit(db: AsyncSession, attempt_id: str, draft: dict[str, Any], viewer: Viewer) -> dict[str, Any]:
    """Отправка карточки (FR-016): «Зарегистрирована», попытка завершена, оценка режима A, новая `incident_cards`."""
    attempt, link, assignment = await require_attempt(db, attempt_id, viewer)
    if attempt.state == "ringing":
        raise invalid_transition("Сначала примите вызов")
    if attempt.state == "submitted":
        raise invalid_transition("Карточка уже отправлена")
    ticket = await db.get(IncidentCard, attempt.card_id)
    if ticket is None:
        raise not_found(f"Билет «{attempt.card_id}» не найден")
    reference = await read_reference(db)
    entries = await classifier_entries(db)
    events = list(attempt.events or [])
    draft = _fill_notification_list(dict(draft), entries, reference, events)
    if not (draft.get("phones") or {}).get("aon"):
        draft.setdefault("phones", {})["aon"] = attempt.aon or ""
    attempt.completed_at = now_iso()
    attempt.full_processing_ms = max(0, parse_iso_ms(attempt.completed_at) - parse_iso_ms(attempt.answered_at or attempt.opened_at))
    attempt.card_snapshot = draft
    attempt.state = "submitted"
    if link is not None:
        link.state = "submitted"
    card = _card_from_draft(await next_id(db, PREFIX["card"], IncidentCard.id), draft, ticket, attempt, entries, reference)
    db.add(card)
    await db.flush()
    from app.services.chain_service import issue_submitted_card

    await issue_submitted_card(db, card, attempt)
    contract = attempt.to_operator_contract(replays=link.replays if link else 0, hints_shown=link.hints_shown if link else 0)
    params = dict((assignment.params if assignment else None) or {})
    weights = params.get("weights") if isinstance(params.get("weights"), dict) else None
    result = await asyncio.to_thread(assessor.assess, contract, ticket.to_contract(), entries, reference, weights=weights, params=params)
    passed: bool | None = None
    threshold = params.get("passThreshold")
    if assignment is not None and assignment.format == "exam" and isinstance(threshold, (int, float)):
        passed = round(100 * result.total) >= threshold
    evaluation = adapter.to_evaluation(result, passed=passed)

    from app.services.ai_assessment import create_evaluation_revision

    axes = {
        "timeScore": int(evaluation["timeScore"]),
        "correctnessScore": int(evaluation["correctnessScore"]),
        "grammarScore": int(evaluation["grammarScore"]),
        "semanticScore": int(evaluation["semanticScore"]),
    }
    available_axes = [k for k, v in axes.items() if v is not None]

    from app.services.ai_error_registry import save_error_records

    err_records_payload = adapter.to_error_records(
        result=result,
        attempt_id=attempt.id,
        etalon_version=str(ticket.id),
        assessor_version=str(evaluation["assessorVersion"]),
        mode=MODE,
    )
    saved_error_records = await save_error_records(db, err_records_payload)
    contract_errors = [r.to_contract() for r in saved_error_records]

    await create_evaluation_revision(
        db=db,
        attempt_id=attempt.id,
        mode=MODE,
        status="preliminary",
        available_axes=available_axes,
        axes=axes,
        total_score=int(evaluation["totalScore"]),
        etalon_version=str(ticket.id),
        assessor_version=str(evaluation["assessorVersion"]),
        errors=contract_errors,
    )

    db.add(
        Evaluation(
            attempt_id=attempt.id,
            assessor_version=str(evaluation["assessorVersion"]),
            time_score=int(evaluation["timeScore"]),
            correctness_score=int(evaluation["correctnessScore"]),
            grammar_score=int(evaluation["grammarScore"]),
            semantic_score=int(evaluation["semanticScore"]),
            total_score=int(evaluation["totalScore"]),
            grammar_errors=list(evaluation.get("grammarErrors") or []),
            errors=list(evaluation.get("errors") or []),
            ai_comment=str(evaluation.get("aiComment") or ""),
            components={"components": evaluation.get("components") or {}, "warnings": evaluation.get("warnings") or [], "fieldDiff": evaluation.get("fieldDiff") or []},
            generated_at=now_iso(),
            passed=passed,
            mode=MODE,
        )
    )
    if link is not None:
        link.passed = passed
    await db.flush()
    from app.services.rating_service import sync as sync_rating

    await sync_rating(db, attempt.student_id, MODE)
    return {"attempt": await contract_of(db, attempt, link, assignment), "card": card.to_contract(), "evaluationId": attempt.id}


async def saved_card_for_attempt(db: AsyncSession, attempt_id: str) -> IncidentCard:
    """Возвращает только фактически созданную при submit карточку обучающегося."""
    row = (
        await db.execute(
            select(IncidentCard).where(
                IncidentCard.source_attempt_id == attempt_id,
                IncidentCard.mode_origin == MODE,
            )
        )
    ).scalars().one_or_none()
    if row is None:
        raise not_found(f"Для попытки «{attempt_id}» нет сохранённой карточки обучающегося")
    return row


async def evaluation(db: AsyncSession, attempt_id: str, viewer: Viewer) -> dict[str, Any]:
    attempt, _, _ = await require_attempt(db, attempt_id, viewer)
    data = await evaluation_contract(db, attempt.id)
    if data is None:
        raise evaluation_pending("Оценка появится после отправки карточки")
    return data


# ─── Аудио и улицы ────────────────────────────────────────────────────────────────────────────────


async def audio_access(db: AsyncSession, card_id: str, viewer: Viewer) -> AssignmentAttempt | None:
    """Доступ к файлу записи активной учебной карточки; экзамен — один запрос."""
    if not viewer.is_student:
        return None
    rows = (await db.execute(select(Attempt).where(Attempt.card_id == card_id, Attempt.student_id == viewer.user_id).order_by(Attempt.opened_at.desc(), Attempt.id.desc()))).scalars().all()
    attempt = next((a for a in rows if a.state != "submitted"), None)
    if attempt is None:
        raise forbidden("Запись доступна только в рамках активной попытки по билету")
    link = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.attempt_id == attempt.id))).scalars().first()
    assignment = await db.get(Assignment, link.assignment_id) if link else None
    if assignment is not None and assignment.format == "exam" and link is not None:
        if link.replays >= 1:
            raise conflict("В экзамене запись прослушивается один раз")
        link.replays += 1
        await db.flush()
    return link


async def search_streets(db: AsyncSession, query: str, limit: int) -> list[dict[str, Any]]:
    """Подсказка адреса (FR-014): по префиксу нормализованного имени, затем нечётко (`ml.nlp.address.suggest`)."""
    norm = address_nlp.normalize_street(query)
    if len(norm) < 3:
        return []
    rows = (await db.execute(select(Street).where(Street.name_norm.like(f"{norm}%")).order_by(Street.name_norm, Street.id).limit(limit))).scalars().all()
    found = [row.to_contract() for row in rows]
    if len(found) < limit:
        known = {row.name for row in rows}
        for street in address_nlp.suggest(query, limit=limit):
            if street.name in known:
                continue
            row = (await db.execute(select(Street).where(Street.name_norm == street.norm, Street.name == street.name).limit(1))).scalars().first()
            if row is not None:
                found.append(row.to_contract())
                known.add(row.name)
            if len(found) >= limit:
                break
    return found[:limit]


# ─── Журнал ученика-112 (спека 009, US1: FR-006, FR-007; US5: совпадения) ─────────────────────────

_OPERATOR_PREFIX = "Опер."
_ARM_NUMBER = re.compile(r"АРМ\s*(\d+)", re.IGNORECASE)
PHONE_TAIL_DIGITS = 10  # телефоны сравниваются по последним 10 цифрам: «+7 (916) 126-34-71» = «916-126-34-71»
STREET_KEY_MIN = 3  # короче трёх букв — не ключ совпадения по адресу (ввод «Гр» не находит всё подряд)


@dataclass(frozen=True)
class _JournalEntry:
    """Строка журнала и то, по чему она совпадает с вызовом: телефоны карточки и её адрес."""

    card_id: str
    row: dict[str, Any]
    phones: tuple[str, ...]
    address: str


def _yes_no(flag: Any) -> str:
    return "Да" if flag else "Нет"


def _phone_tail(value: str) -> str:
    digits = _DIGITS.sub("", value or "")
    return digits[-PHONE_TAIL_DIGITS:] if len(digits) >= PHONE_TAIL_DIGITS else ""


def _street_key(text: str) -> str:
    key = address_nlp.normalize_street(text or "")
    return key if len(key) >= STREET_KEY_MIN else ""


def _norm_text(text: str) -> str:
    return (text or "").lower().replace("ё", "е")


def _sort_ms(value: str) -> int:
    """«Дата ↓»: ISO-метка → миллисекунды; пустая или битая метка уходит в конец списка."""
    try:
        return parse_iso_ms(value)
    except ValueError:
        return 0


def _journal_order(entry: _JournalEntry) -> tuple[int, str]:
    return (-_sort_ms(str(entry.row["created_at"])), entry.card_id)


def _fixture_entry(doc: dict[str, Any], titles: dict[str, str], linked_ids: set[str]) -> _JournalEntry:
    """Фон журнала: UI-фикстура ПОВ-112 (`ArmCardFixture`) — учебные карточки, общие для всех обучающихся."""
    registered = str(doc.get("registeredBy") or "")
    arm = _ARM_NUMBER.search(registered)
    what = doc.get("what") or {}
    address = doc.get("address") or {}
    phones = doc.get("phones") or {}
    status = str(doc.get("cardStatus") or "")
    card_id = str(doc["id"])
    address_text = str(address.get("formal") or address.get("descriptive") or "")
    row: dict[str, Any] = {
        "card_id": card_id,
        "number": str(doc.get("number") or ""),
        "created_at": str(doc.get("createdAt") or ""),
        "operator": registered.split(",")[0].strip().removeprefix(_OPERATOR_PREFIX).strip(),
        "arm": arm.group(1) if arm else "",
        "what_happened": str(what.get("finalType") or ""),
        "injured": _yes_no((what.get("casualties") or {}).get("injured")),
        "status": titles.get(status, status),
        "address": address_text,
        "description": str(doc.get("description") or ""),
        "linked": card_id in linked_ids,
        "chs": bool((doc.get("emergency") or {}).get("chs")),
        "checked": status == "checked",
        "is_own": False,
    }
    if isinstance(doc.get("lockedBy"), dict):
        row["locked_by"] = doc["lockedBy"]
    return _JournalEntry(card_id, row, (str(phones.get("aon") or ""), str(phones.get("provided") or "")), address_text)


def _own_entry(card: IncidentCard, draft: dict[str, Any], titles: dict[str, str], linked_ids: set[str], operator: str, arm: str) -> _JournalEntry:
    """Собственная карточка ученика режима 112 (отправленная попытка): строка с пометкой «isOwn»."""
    extra = card.extra or {}
    status = str(extra.get("cardStatus") or "")
    row: dict[str, Any] = {
        "card_id": card.id,
        "number": str(card.ticket_no),
        "created_at": str(extra.get("registeredAt") or ""),
        "operator": operator,
        "arm": arm,
        "what_happened": str(extra.get("finalType") or ""),
        "injured": _yes_no(card.victims),
        "status": titles.get(status, status),
        "address": card.address,
        "description": card.summary,
        "linked": card.id in linked_ids or bool(draft.get("links")),
        "chs": bool((draft.get("emergency") or {}).get("chs")),
        "checked": False,
        "is_own": True,
    }
    return _JournalEntry(card.id, row, (str((card.caller or {}).get("phone") or ""),), card.address)


def _queued_entry(attempt: Attempt, operator: str, arm: str) -> _JournalEntry:
    """Вызов текущей попытки в состоянии ringing (окно закрыто «×» или ещё не показано): без содержания билета — номер и время."""
    row: dict[str, Any] = {
        "card_id": attempt.card_id,
        "number": str(attempt.incident_number or 0),
        "created_at": attempt.opened_at,
        "operator": operator,
        "arm": arm,
        "what_happened": "",
        "injured": "",
        "status": "",
        "address": "",
        "description": "",
        "linked": False,
        "chs": False,
        "checked": False,
        "is_own": True,
        "queued": True,
    }
    return _JournalEntry(attempt.card_id, row, (), "")


async def _student_marks(db: AsyncSession, student_id: str) -> tuple[str, str]:
    """Оператор и АРМ ученика для его строк журнала: у учебной учётки нет номера оператора — короткое ФИО и номер АРМ."""
    user = await db.get(User, student_id)
    if user is None:
        return "", ""
    name = training_profile.short_name(user.full_name) if user.full_name.strip() else ""
    return name, str(user.arm_number)


async def _journal_entries(db: AsyncSession, student_id: str, assignment_id: str | None = None) -> list[_JournalEntry]:
    """Строки журнала ученика (FR-007): фон, его карточки режима 112 и, если задан `assignment_id`, вызовы в очереди.

    Членство — то же правило, что у `in_student_journal`: любая фикстура фона и карточка режима 112 с `created_by_student_id`.
    """
    titles = {str(s.get("status")): str(s.get("title")) for s in (await read_reference(db)).get("cardStatuses", [])}
    operator, arm = await _student_marks(db, student_id)
    own = (
        await db.execute(
            select(IncidentCard)
            .where(IncidentCard.mode_origin == MODE, IncidentCard.created_by_student_id == student_id)
            .order_by(IncidentCard.id)
        )
    ).scalars().all()
    source_ids = [card.source_attempt_id for card in own if card.source_attempt_id]
    attempts = (await db.execute(select(Attempt).where(Attempt.id.in_(source_ids)))).scalars().all() if source_ids else []
    snapshots = {attempt.id: dict(attempt.card_snapshot or {}) for attempt in attempts}
    own_drafts = {card.id: snapshots.get(card.source_attempt_id or "", {}) for card in own}
    linked_ids = {str(link.get("cardId")) for draft in own_drafts.values() for link in draft.get("links") or [] if link.get("cardId")}
    fixtures = (await db.execute(select(ArmCardFixture).order_by(ArmCardFixture.seq, ArmCardFixture.id))).scalars().all()
    entries = [_fixture_entry(fixture.to_contract(), titles, linked_ids) for fixture in fixtures]
    entries += [_own_entry(card, own_drafts[card.id], titles, linked_ids, operator, arm) for card in own]
    if assignment_id is not None:
        ringing = (
            await db.execute(
                select(Attempt)
                .join(AssignmentAttempt, AssignmentAttempt.attempt_id == Attempt.id)
                .where(
                    AssignmentAttempt.assignment_id == assignment_id,
                    Attempt.student_id == student_id,
                    Attempt.mode == MODE,
                    Attempt.state == "ringing",
                )
            )
        ).scalars().all()
        entries += [_queued_entry(attempt, operator, arm) for attempt in ringing]
    return entries


async def journal(db: AsyncSession, assignment_id: str, viewer: Viewer) -> dict[str, Any]:
    """GET /operator112/journal?assignmentId= (FR-006, FR-007): обучающийся с профилем 112; чужое задание → 404."""
    if not viewer.is_student:
        raise forbidden("Журнал ученика-112 доступен обучающемуся")
    student = await db.get(User, viewer.user_id)
    if student is not None and not training_profile.allows(student, MODE):
        raise forbidden(training_profile.blocked_message(student, MODE))
    assignment = await db.get(Assignment, assignment_id)
    if assignment is None or viewer.user_id not in (assignment.student_ids or []):
        raise not_found(f"Задание «{assignment_id}» не найдено")
    entries = sorted(await _journal_entries(db, viewer.user_id, assignment_id), key=_journal_order)
    response = Journal112Response(rows=[Journal112Row.model_validate(entry.row) for entry in entries], total=len(entries))
    return response.dump()


async def matches(db: AsyncSession, attempt_id: str, viewer: Viewer) -> dict[str, Any]:
    """GET …/matches (US5, FR-024): карточки журнала ученика с тем же АОН или адресом, что у вызова; чужая попытка → 403.

    Адрес — введённая улица (`fieldChanged address.street`), без неё — улица из адреса билета (GET без тела).
    """
    attempt, _, _ = await require_attempt(db, attempt_id, viewer)
    aon = _phone_tail(attempt.aon or "")
    entered = _last_payload(list(attempt.events or []), "fieldChanged", "value", field="address.street")
    ticket = await db.get(IncidentCard, attempt.card_id)
    street = _street_key(str(entered or "")) or _street_key(address_nlp.extract_street_query(ticket.address if ticket else ""))
    found: list[dict[str, Any]] = []
    for entry in sorted(await _journal_entries(db, attempt.student_id), key=_journal_order):
        by_aon = bool(aon) and aon in {_phone_tail(phone) for phone in entry.phones}
        by_street = bool(street) and street in _norm_text(entry.address)
        if (by_aon or by_street) and await in_student_journal(db, attempt.student_id, entry.card_id):
            found.append(Journal112Row.model_validate(entry.row).dump())
    return {"matches": found}
