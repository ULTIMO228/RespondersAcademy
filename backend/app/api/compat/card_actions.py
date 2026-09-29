"""Действия по карточке: статус ДДС, связи, отработки, напоминания, SMS, записи — порт card-actions.ts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, get_viewer
from app.api.errors import forbidden, unauthorized, validation_failed
from app.config import get_settings
from app.db.ids import PREFIX, format_id, max_suffix
from app.db.session import get_db
from app.models.card import CardRuntime, IncidentCard
from app.models.session import Attempt
from app.models.ticket_audio import TicketAudio
from app.services.cards import ensure_runtime, read_runtime, require_card
from app.services.reference import read_reference
from app.services.status_machine import StatusTransitionError, dds_machine
from app.services.time import is_iso, now_iso, parse_iso_ms

router = APIRouter()
DEFAULT_OPERATOR = "оп. 1"


def _optional_string(body: dict[str, Any], key: str) -> str | None:
    value = body.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise validation_failed(f"Поле «{key}» должно быть строкой")
    return value.strip() or None


def _required_string(body: dict[str, Any], key: str, label: str) -> str:
    value = _optional_string(body, key)
    if not value:
        raise validation_failed(f"Заполните поле «{label}»")
    return value


async def _next_runtime_id(db: AsyncSession, prefix: str, collection: str) -> str:
    rows = (await db.execute(select(CardRuntime))).scalars().all()
    ids = [item.get("id", "") for row in rows for item in (getattr(row, collection) or [])]
    return format_id(prefix, max_suffix(ids, prefix) + 1)


@router.post("/cards/{card_id}/status")
async def post_status(card_id: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    await require_card(db, card_id)
    body = await read_body(request)
    dds_status = body.get("ddsStatus")
    if not isinstance(dds_status, str) or not dds_status.strip():
        raise validation_failed("Выберите статус из списка доступных")
    comment = _optional_string(body, "comment")
    duty_number = _optional_string(body, "dutyNumber")
    runtime = await ensure_runtime(db, card_id)
    current = runtime.status_events[-1]["ddsStatus"] if runtime.status_events else None
    machine = dds_machine((await read_reference(db))["ddsStatuses"])
    try:
        machine.assert_transition(current, dds_status, comment)
    except StatusTransitionError as exc:
        raise exc.to_api_error() from exc
    event: dict[str, Any] = {"id": await _next_runtime_id(db, PREFIX["statusEvent"], "status_events"), "cardId": card_id, "ddsStatus": dds_status, "at": now_iso()}
    if comment:
        event["comment"] = comment
    if duty_number:
        event["dutyNumber"] = duty_number
    runtime.status_events = [*runtime.status_events, event]
    runtime.closed = machine.is_final(dds_status)
    await db.commit()
    return event


def _find_root(card: dict[str, Any], by_id: dict[str, dict[str, Any]]) -> str:
    visited: set[str] = set()
    current: dict[str, Any] | None = card
    while current and current.get("duplicateOf") and current["id"] not in visited:
        visited.add(current["id"])
        parent_id = current["duplicateOf"]
        current = by_id.get(parent_id)
        if current is None:
            return parent_id
    return current["id"] if current else card["id"]


@router.post("/cards/{card_id}/links")
async def post_links(card_id: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    resolved = await require_card(db, card_id)
    if resolved.kind == "fixture":
        return {"cardId": card_id, "chain": []}
    rows = (await db.execute(select(IncidentCard))).scalars().all()
    by_id = {row.id: row.to_contract() for row in rows}
    root_id = _find_root(resolved.card, by_id)
    subordinates = [{"cardId": cid, "role": "subordinate"} for cid, c in by_id.items() if cid != root_id and _find_root(c, by_id) == root_id]
    if not subordinates:
        return {"cardId": card_id, "chain": []}
    return {"cardId": card_id, "chain": [{"cardId": root_id, "role": "main"}, *subordinates]}


@router.post("/cards/{card_id}/worklines")
async def post_workline(card_id: str, request: Request, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    await require_card(db, card_id)
    body = await read_body(request)
    if body.get("confirmed") is not True:
        raise validation_failed("Подтвердите отработку перед сохранением")
    record = {
        "id": await _next_runtime_id(db, PREFIX["workLine"], "work_lines"),
        "cardId": card_id,
        "operator": _optional_string(body, "operator") or DEFAULT_OPERATOR,
        "at": now_iso(),
        "service": _required_string(body, "service", "Служба"),
        "calledTo": _required_string(body, "calledTo", "Куда звонили"),
        "person": _required_string(body, "person", "ФИО"),
        "message": _required_string(body, "message", "Сообщение"),
    }
    runtime = await ensure_runtime(db, card_id)
    runtime.work_lines = [*runtime.work_lines, record]
    await db.commit()
    return JSONResponse(status_code=201, content=record)


@router.post("/cards/{card_id}/reminders")
async def post_reminder(card_id: str, request: Request, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    await require_card(db, card_id)
    body = await read_body(request)
    text = _required_string(body, "text", "Текст напоминания")
    remind_at = _required_string(body, "remindAt", "Время напоминания")
    if not is_iso(remind_at):
        raise validation_failed("Некорректное время напоминания")
    reminder = {"id": await _next_runtime_id(db, PREFIX["reminder"], "reminders"), "cardId": card_id, "text": text, "remindAt": remind_at, "createdAt": now_iso()}
    runtime = await ensure_runtime(db, card_id)
    runtime.reminders = [*runtime.reminders, reminder]
    await db.commit()
    return JSONResponse(status_code=201, content=reminder)


@router.get("/cards/{card_id}/sms")
async def list_sms(card_id: str, db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    await require_card(db, card_id)
    sms = (await read_runtime(db, card_id))["sms"]
    return sorted(sms, key=lambda item: parse_iso_ms(item["at"]))


@router.post("/cards/{card_id}/sms")
async def post_sms(card_id: str, request: Request, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    resolved = await require_card(db, card_id)
    body = await read_body(request)
    text = _required_string(body, "text", "Текст SMS")
    default_phone = resolved.card["phones"]["aon"] if resolved.kind == "fixture" else (resolved.card.get("caller") or {}).get("phone", "")
    phone = _optional_string(body, "phone") or default_phone
    sms = {"id": await _next_runtime_id(db, PREFIX["sms"], "sms"), "cardId": card_id, "at": now_iso(), "direction": "outgoing", "text": text, "phone": phone}
    runtime = await ensure_runtime(db, card_id)
    runtime.sms = [*runtime.sms, sms]
    await db.commit()
    return JSONResponse(status_code=201, content=sms)


@router.get("/cards/{card_id}/recordings")
async def list_recordings(card_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> list[dict[str, Any]]:
    await require_card(db, card_id)
    attempts = (await db.execute(select(Attempt).where(Attempt.card_id == card_id))).scalars().all()
    if viewer is None:
        return []
    if viewer.is_student:
        attempts = [attempt for attempt in attempts if attempt.student_id == viewer.user_id]
    recordings = []
    for attempt in attempts:
        for call in attempt.calls or []:
            if not isinstance(call, dict) or not isinstance(call.get("recording"), dict):
                continue
            duration_ms = call["recording"].get("durationMs")
            seconds = max(0, round(duration_ms / 1000)) if isinstance(duration_ms, (int, float)) else 0
            url = f"/api/v1/cards/{card_id}/recordings/{call['id']}/file"
            path = get_settings().var_dir / "recordings" / f"{call['id']}.wav"
            recordings.append({
                "id": call["id"], "cardId": card_id, "attemptId": attempt.id,
                "at": call.get("startedAt"), "startedAt": call.get("startedAt"),
                "title": f"Доклад в {call.get('toNumber') or '112'}",
                "duration": f"{seconds // 60:02}:{seconds % 60:02}",
                "audioUrl": url if path.is_file() else None,
                "transcript": call.get("transcript") or [], "url": url,
            })
    ticket_audio = await db.get(TicketAudio, card_id)
    if ticket_audio is not None and ticket_audio.status == "ready" and ticket_audio.path and Path(ticket_audio.path).is_file():
        # Голос заявителя — часть самой учебной карточки. Показываем его
        # преподавателю и обучающемуся, если карточка открыта в активной
        # попытке (для студента), независимо от режима dds/operator112.
        student_has_active_attempt = any(
            attempt.student_id == viewer.user_id and attempt.state != "submitted"
            for attempt in attempts
        )
        if not viewer.is_student or student_has_active_attempt:
            seconds = max(0, round((ticket_audio.duration_ms or 0) / 1000))
            url = f"/api/v1/tickets/{card_id}/audio/file"
            recordings.append({
                "id": f"ticket-{card_id}", "cardId": card_id,
                "at": ticket_audio.generated_at, "startedAt": ticket_audio.generated_at,
                "title": "Голос заявителя", "duration": f"{seconds // 60:02}:{seconds % 60:02}",
                "audioUrl": url, "url": url,
            })
    return recordings


@router.get("/cards/{card_id}/recordings/{call_id}/file")
async def get_recording_file(card_id: str, call_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> FileResponse:
    await require_card(db, card_id)
    if viewer is None:
        raise unauthorized("Войдите в систему для прослушивания аудиозаписи")
    attempts = (await db.execute(select(Attempt).where(Attempt.card_id == card_id))).scalars().all()
    for attempt in attempts:
        for call in attempt.calls or []:
            if call.get("id") == call_id and isinstance(call.get("recording"), dict):
                if viewer.is_student and viewer.user_id != attempt.student_id:
                    raise forbidden("Доступна только собственная аудиозапись")
                path = get_settings().var_dir / "recordings" / f"{call_id}.wav"
                if path.is_file():
                    return FileResponse(path, media_type="audio/wav", filename=f"{call_id}.wav",
                                        content_disposition_type="inline", headers={"Cache-Control": "no-store"})
    from app.api.errors import not_found

    raise not_found("Аудиозапись доклада не найдена")
