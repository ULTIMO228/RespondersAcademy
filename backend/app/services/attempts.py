"""Попытки курсанта (CardEvent): открытие карточки и ход отработки — порт src/shared/api/mock/attempts.ts."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import invalid_transition, not_found, validation_failed
from app.db.ids import PREFIX, next_id
from app.models.scenario import Scenario
from app.models.session import Attempt, TrainingSession
from app.services.session_engine import evaluation_contract
from app.services.time import is_iso, now_iso, parse_iso_ms


def _read_iso(value: Any, key: str) -> str:
    if not is_iso(value):
        raise validation_failed(f"Поле «{key}» должно быть датой ISO 8601")
    return str(value)


async def find_attempt(db: AsyncSession, attempt_id: str) -> Attempt | None:
    return await db.get(Attempt, attempt_id)


async def attempt_contract(db: AsyncSession, attempt: Attempt) -> dict[str, Any]:
    return attempt.to_contract(await evaluation_contract(db, attempt.id))


async def _scenario_ids_for_card(db: AsyncSession, card_id: str) -> list[str]:
    rows = (await db.execute(select(Scenario).where(Scenario.deleted.is_(False)))).scalars().all()
    return [row.id for row in rows if card_id in (row.card_ids or [])]


async def find_student_attempt(db: AsyncSession, card_id: str, student_id: str) -> tuple[TrainingSession, Attempt] | None:
    """Последняя попытка курсанта по карточке: сначала идущее занятие, затем самое позднее по startedAt."""
    sessions = list((await db.execute(select(TrainingSession))).scalars().all())
    sessions.sort(key=lambda s: (0 if s.state == "running" else 1, -parse_iso_ms(s.started_at)))
    for session in sessions:
        attempts = (await db.execute(select(Attempt).where(Attempt.session_id == session.id, Attempt.card_id == card_id, Attempt.student_id == student_id).order_by(Attempt.seq.desc(), Attempt.id.desc()))).scalars().all()
        if attempts:
            return session, attempts[0]
    return None


async def _resolve_session(db: AsyncSession, card_id: str, student_id: str) -> TrainingSession:
    sessions = list((await db.execute(select(TrainingSession))).scalars().all())
    running = [s for s in sessions if s.state == "running" and student_id in (s.student_ids or [])]
    issuer = next((s for s in running if any(i.get("cardId") == card_id and i.get("studentId") == student_id for i in (s.card_flow or []))), None)
    current = issuer or (running[0] if running else None)
    if current is not None:
        return current
    latest = sorted([s for s in sessions if student_id in (s.student_ids or [])], key=lambda s: -parse_iso_ms(s.started_at))
    session = TrainingSession(
        id=await next_id(db, PREFIX["session"], TrainingSession.id),
        teacher_id=latest[0].teacher_id if latest else "",
        student_ids=[student_id],
        scenario_ids=await _scenario_ids_for_card(db, card_id),
        mode="practice",
        card_source="generated",
        card_flow=[],
        state="running",
        started_at=now_iso(),
        finished_at=None,
        plan=None,
        paused_at=None,
        parked=[],
    )
    db.add(session)
    await db.flush()
    return session


async def _session_for_issuance(db: AsyncSession, card_id: str, student_id: str, issued_at: str) -> TrainingSession | None:
    """Exact issuance identifies a session when several running sessions contain the same card."""
    sessions = (await db.execute(select(TrainingSession).where(TrainingSession.state == "running"))).scalars().all()
    return next((session for session in sessions if any(
        item.get("cardId") == card_id and item.get("studentId") == student_id and item.get("issuedAt") == issued_at
        for item in session.card_flow or []
    )), None)


async def open_attempt(db: AsyncSession, card_id: str, body: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    student_id = body.get("studentId")
    if not isinstance(student_id, str) or not student_id.strip():
        raise validation_failed("Укажите курсанта (studentId)")
    student_id = student_id.strip()
    issued_at = _read_iso(body["issuedAt"], "issuedAt") if body.get("issuedAt") is not None else None
    session = await _session_for_issuance(db, card_id, student_id, issued_at) if issued_at else None
    if session is not None:
        attempt = (await db.execute(select(Attempt).where(
            Attempt.session_id == session.id, Attempt.card_id == card_id, Attempt.student_id == student_id,
        ).order_by(Attempt.seq.desc(), Attempt.id.desc()))).scalars().first()
        if attempt is not None:
            return {"sessionId": session.id, "attempt": await attempt_contract(db, attempt), "created": False}, False
    else:
        existing = await find_student_attempt(db, card_id, student_id)
        if existing:
            session, attempt = existing
            return {"sessionId": session.id, "attempt": await attempt_contract(db, attempt), "created": False}, False
        session = await _resolve_session(db, card_id, student_id)
    opened_at = now_iso()
    if issued_at is None:
        issued_at = next((i["issuedAt"] for i in (session.card_flow or []) if i.get("cardId") == card_id and i.get("studentId") == student_id), None)
    reaction = max(0, parse_iso_ms(opened_at) - parse_iso_ms(issued_at)) if issued_at else 0
    seq = len((await db.execute(select(Attempt.id).where(Attempt.session_id == session.id))).scalars().all())
    attempt = Attempt(
        id=await next_id(db, PREFIX["attempt"], Attempt.id),
        session_id=session.id,
        card_id=card_id,
        student_id=student_id,
        mode=session.training_mode if session.training_mode in ("dds", "operator112") else "dds",
        opened_at=opened_at,
        primary_reaction_ms=reaction,
        statuses=[],
        services_called=[],
        completed_at=None,
        full_processing_ms=0,
        entered_text={},
        calls=[],
        seq=seq,
    )
    db.add(attempt)
    extra = [sid for sid in await _scenario_ids_for_card(db, card_id) if sid not in (session.scenario_ids or [])]
    if extra:
        session.scenario_ids = [*(session.scenario_ids or []), *extra]
    await db.flush()
    return {"sessionId": session.id, "attempt": await attempt_contract(db, attempt), "created": True}, True


def _parse_mark(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or not isinstance(value.get("ddsStatus"), str) or not value["ddsStatus"].strip():
        raise validation_failed("Статус попытки: нужны ddsStatus и at")
    mark: dict[str, Any] = {"ddsStatus": value["ddsStatus"], "at": _read_iso(value.get("at"), "status.at")}
    if isinstance(value.get("comment"), str) and value["comment"].strip():
        mark["comment"] = value["comment"].strip()
    if isinstance(value.get("dutyNumber"), str) and value["dutyNumber"].strip():
        mark["dutyNumber"] = value["dutyNumber"].strip()
    return mark


async def record_progress(db: AsyncSession, attempt_id: str, body: dict[str, Any]) -> tuple[Attempt, bool]:
    """Возвращает попытку и флаг «только что завершена» (для запуска оценки)."""
    status = _parse_mark(body["status"]) if body.get("status") is not None else None
    entered = body.get("enteredText")
    if entered is not None and not (isinstance(entered, dict) and all(isinstance(v, str) for v in entered.values())):
        raise validation_failed("Поле «enteredText» должно быть объектом строк")
    completed_at = _read_iso(body["completedAt"], "completedAt") if body.get("completedAt") is not None else None
    attempt = await find_attempt(db, attempt_id)
    if attempt is None:
        raise not_found(f"Попытка «{attempt_id}» не найдена")
    if attempt.mode == "operator112":
        raise invalid_transition("Попытка режима специалиста-112 ведётся через /api/v1/operator112/attempts")
    if status:
        session = await db.get(TrainingSession, attempt.session_id)
        if session and (session.plan or {}).get("workMessagesEnabled"):
            from app.services.reference import read_reference
            from app.services.status_machine import StatusTransitionError, dds_machine

            machine = dds_machine((await read_reference(db))["ddsStatuses"])
            previous = (attempt.statuses or [])[-1]["ddsStatus"] if attempt.statuses else None
            try:
                machine.assert_transition(previous, status["ddsStatus"], status.get("comment"))
            except StatusTransitionError as exc:
                raise exc.to_api_error() from exc
            if status["ddsStatus"] == "accepted":
                from app.services.work_messages import schedule_on_accept

                await schedule_on_accept(db, attempt, status["at"])
        attempt.statuses = [*attempt.statuses, status]
    if entered:
        attempt.entered_text = {**attempt.entered_text, **entered}
    just_completed = False
    if completed_at and not attempt.completed_at:
        attempt.completed_at = completed_at
        attempt.full_processing_ms = max(0, parse_iso_ms(completed_at) - parse_iso_ms(attempt.opened_at))
        just_completed = True
    await db.flush()
    return attempt, just_completed
