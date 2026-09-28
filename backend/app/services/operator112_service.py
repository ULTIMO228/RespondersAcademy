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
from app.services import ticket_audio_service
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


async def contract_of(db: AsyncSession, attempt: Attempt, link: AssignmentAttempt | None, assignment: Assignment | None) -> dict[str, Any]:
    audio = await db.get(TicketAudio, attempt.card_id)
    return attempt.to_operator_contract(
        replays=link.replays if link else 0,
        hints_shown=link.hints_shown if link else 0,
        hints=hints_of(assignment),
        assignment_id=link.assignment_id if link else None,
        audio=ticket_audio_service.audio_contract(audio, attempt.card_id),
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
    if attempt.state == "ringing":
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
    return {
        "signs": [str(s) for s in signs if str(s).strip()],
        "classifierCode": str(_last_payload(events, "fieldChanged", "value", field="what.classifierCode") or ""),
        "finalType": str(_last_payload(events, "fieldChanged", "value", field="what.finalType") or ""),
        "flags": flags,
        "manual": [{"serviceId": str((e.get("payload") or {}).get("serviceId") or "")} for e in events if e.get("type") == "serviceAdded"],
    }


async def notification_list(db: AsyncSession, attempt_id: str, viewer: Viewer, *, signs: list[str] | None = None, classifier_code: str | None = None) -> dict[str, Any]:
    attempt, _, _ = await require_attempt(db, attempt_id, viewer)
    state = draft_from_events(list(attempt.events or []))
    reference = await read_reference(db)
    entries = await classifier_entries(db)
    result = nl.build(entries, reference, signs=signs or state["signs"], classifier_code=classifier_code or state["classifierCode"], final_type=state["finalType"], flags=state["flags"], manual=state["manual"])
    return result.to_contract()


def _fill_notification_list(draft: dict[str, Any], entries: list[dict[str, Any]], reference: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    """Список оповещения карточки: переданный фронтом либо автоматический по опросной карте + ручные из событий."""
    what = draft.get("what") or {}
    state = draft_from_events(events)
    manual = [*state["manual"], *[{"serviceId": n.get("serviceId")} for n in draft.get("notificationList") or [] if n.get("addedBy") == "manual"]]
    result = nl.build(entries, reference, signs=what.get("signs") or state["signs"], classifier_code=what.get("classifierCode") or state["classifierCode"], final_type=what.get("finalType") or state["finalType"], flags=[*assessor.draft_flags(draft), *state["flags"]], manual=manual)
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

    await issue_submitted_card(db, card, attempt, assignment)
    contract = attempt.to_operator_contract(replays=link.replays if link else 0, hints_shown=link.hints_shown if link else 0)
    params = dict((assignment.params if assignment else None) or {})
    weights = params.get("weights") if isinstance(params.get("weights"), dict) else None
    result = await asyncio.to_thread(assessor.assess, contract, ticket.to_contract(), entries, reference, weights=weights, params=params)
    passed: bool | None = None
    threshold = params.get("passThreshold")
    if assignment is not None and assignment.format == "exam" and isinstance(threshold, (int, float)):
        passed = round(100 * result.total) >= threshold
    evaluation = adapter.to_evaluation(result, passed=passed)
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


async def evaluation(db: AsyncSession, attempt_id: str, viewer: Viewer) -> dict[str, Any]:
    attempt, _, _ = await require_attempt(db, attempt_id, viewer)
    data = await evaluation_contract(db, attempt.id)
    if data is None:
        raise evaluation_pending("Оценка появится после отправки карточки")
    return data


# ─── Аудио и улицы ────────────────────────────────────────────────────────────────────────────────


async def audio_access(db: AsyncSession, card_id: str, viewer: Viewer) -> AssignmentAttempt | None:
    """Доступ к файлу записи: S — только в рамках своей попытки по билету; экзамен — один запрос (счётчик replays)."""
    if not viewer.is_student:
        return None
    rows = (await db.execute(select(Attempt).where(Attempt.card_id == card_id, Attempt.student_id == viewer.user_id, Attempt.mode == MODE).order_by(Attempt.opened_at.desc(), Attempt.id.desc()))).scalars().all()
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
