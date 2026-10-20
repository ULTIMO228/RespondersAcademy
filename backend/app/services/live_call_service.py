"""Локальный разговор по очереди: WAV → распознавание → ответ → WAV. Один backend worker."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any
from uuid import UUID
from weakref import WeakValueDictionary

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import ApiError, conflict, forbidden, not_found, validation_failed
from app.config import get_settings
from app.models.card import IncidentCard
from app.models.session import Attempt
from app.services.live_caller_provider import FACT_KEYS, get_provider
from app.services.operator112_service import require_attempt
from app.services.time import now_iso, parse_iso_ms

_locks: WeakValueDictionary[str, asyncio.Lock] = WeakValueDictionary()


def lock_for(attempt_id: str) -> asyncio.Lock:
    lock = _locks.get(attempt_id)
    if lock is None:
        lock = asyncio.Lock()
        _locks[attempt_id] = lock
    return lock


def current(attempt: Attempt) -> dict[str, Any] | None:
    return next((dict(call) for call in reversed(attempt.calls or []) if call.get("kind") == "liveCaller"), None)


def public(call: dict[str, Any] | None) -> dict[str, Any]:
    if call is None:
        return {"status": "idle", "transcript": []}
    return {key: call[key] for key in ("id", "status", "startedAt", "endedAt", "transcript", "maxDurationSec") if key in call}


def audio_path(attempt_id: str, turn_id: str) -> Path:
    return get_settings().var_dir / "live-calls" / attempt_id / f"{turn_id}.wav"


async def save(db: AsyncSession, attempt: Attempt, call: dict[str, Any]) -> None:
    await db.refresh(attempt, ["calls"])
    attempt.calls = [*filter(lambda row: row.get("id") != call["id"], attempt.calls or []), dict(call)]
    await db.commit()


async def read(db: AsyncSession, attempt_id: str, viewer: Viewer) -> dict[str, Any]:
    attempt, _, _ = await require_attempt(db, attempt_id, viewer)
    return public(current(attempt))


async def facts_for(db: AsyncSession, attempt: Attempt) -> dict[str, Any]:
    card = await db.get(IncidentCard, attempt.card_id)
    if card is None:
        raise not_found("Билет не найден")
    ticket = attempt.card_snapshot or card.to_contract()
    return {key: ticket[key] for key in FACT_KEYS if key in ticket}


async def writable(db: AsyncSession, attempt_id: str, viewer: Viewer) -> Attempt:
    attempt, link, assignment = await require_attempt(db, attempt_id, viewer)
    if not viewer.is_student or attempt.student_id != viewer.user_id:
        raise forbidden("Разговаривать может только обучающийся в своей попытке")
    # Решение владельца 2026-10-20 (спека 009, R6): живой заявитель — и в тренировке, и в экзамене.
    if not assignment or assignment.state != "active" or not link or link.state == "notCompleted":
        raise conflict("Живой разговор доступен в активном задании")
    if attempt.state != "answered":
        raise conflict("Сначала примите вызов; завершённую попытку открыть нельзя")
    if not get_settings().live_calls_enabled:
        raise ApiError(503, "internal", "Включите LIVE_CALLS_ENABLED на сервере")
    return attempt


async def start(db: AsyncSession, attempt_id: str, viewer: Viewer) -> dict[str, Any]:
    async with lock_for(attempt_id):
        attempt = await writable(db, attempt_id, viewer)
        existing = current(attempt)
        if existing:
            return public(existing)
        facts = await facts_for(db, attempt)
        provider = get_provider()
        await asyncio.to_thread(provider.ready)
        first = "Здравствуйте. " + str(facts.get("summary") or "Мне нужна помощь.")
        await asyncio.to_thread(provider.synthesize, first, audio_path(attempt.id, "intro"))
        call = {"id": f"live-{attempt.id}", "kind": "liveCaller", "status": "active",
                "startedAt": now_iso(), "maxDurationSec": get_settings().live_call_max_sec,
                "transcript": [{"speaker": "caller", "text": first, "at": now_iso(), "turnId": "intro"}]}
        await save(db, attempt, call)
        return public(call)


async def turn(db: AsyncSession, attempt_id: str, viewer: Viewer, turn_id: str, audio: bytes) -> dict[str, Any]:
    try:
        if str(UUID(turn_id)) != turn_id:
            raise ValueError("non-canonical UUID")
    except ValueError as exc:
        raise validation_failed("Некорректный идентификатор реплики") from exc
    async with lock_for(attempt_id):
        attempt = await writable(db, attempt_id, viewer)
        call = current(attempt)
        if not call or call["status"] != "active":
            raise conflict("Разговор не начат или уже завершён")
        if any(line.get("turnId") == turn_id and line["speaker"] == "caller" for line in call["transcript"]):
            return public(call)
        elapsed = (parse_iso_ms(now_iso()) or 0) - (parse_iso_ms(call["startedAt"]) or 0)
        if elapsed > call["maxDurationSec"] * 1000:
            call.update(status="ended", endedAt=now_iso())
            await save(db, attempt, call)
            raise conflict("Время разговора истекло")
        if len(call["transcript"]) >= 41:
            raise conflict("Достигнут лимит реплик; завершите разговор")
        provider = get_provider()
        try:
            text = await asyncio.to_thread(provider.transcribe, audio)
        except ValueError as exc:
            raise validation_failed(str(exc)) from exc
        if not text.strip():
            raise validation_failed("Речь не распознана. Запишите реплику ещё раз")
        user_line = {"speaker": "dispatcher", "text": text, "at": now_iso(), "turnId": turn_id}
        history = [*call["transcript"], user_line]
        reply = await asyncio.to_thread(provider.reply, await facts_for(db, attempt), history)
        await asyncio.to_thread(provider.synthesize, reply, audio_path(attempt.id, turn_id))
        call["transcript"] = [*history, {"speaker": "caller", "text": reply, "at": now_iso(), "turnId": turn_id}]
        await save(db, attempt, call)
        return public(call)


async def finish(db: AsyncSession, attempt_id: str, viewer: Viewer) -> dict[str, Any]:
    async with lock_for(attempt_id):
        attempt, _, _ = await require_attempt(db, attempt_id, viewer)
        call = current(attempt)
        if call and call["status"] != "ended":
            call.update(status="ended", endedAt=now_iso())
            await save(db, attempt, call)
        return public(call)


async def audio(db: AsyncSession, attempt_id: str, viewer: Viewer, turn_id: str) -> Path:
    attempt, _, _ = await require_attempt(db, attempt_id, viewer)
    call = current(attempt)
    if not call or not any(line.get("turnId") == turn_id and line["speaker"] == "caller" for line in call["transcript"]):
        raise not_found("Аудиореплика не найдена")
    path = audio_path(attempt.id, turn_id)
    if not path.is_file():
        raise not_found("Файл аудиореплики не найден")
    return path
