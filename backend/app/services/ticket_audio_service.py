"""Аудиозапись обращения по билету (FR-012/013, T084/T085): текст реплики → `ticket_audio` → синтез Silero в фоне.

Текст: `AiGateway.call_script(ticket, context)` (зона команды ИИ-агентов) либо шаблон `ml.generate.call_script`.
Синтез: `ml.speech.tts` в отдельном потоке с собственной сессией БД; при отсутствии модели / `TTS_ENABLED=0` запись
помечается `failed` — `GET /tickets/{id}/audio` отдаёт расшифровку с `emergency: true` (аварийный режим).
Генерация ленивая: при создании попытки режима A, по `POST /tickets/{id}/audio` и при утверждении сценария.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import get_gateway
from app.config import get_settings
from app.db.session import get_sessionmaker
from app.models.card import IncidentCard
from app.models.ticket_audio import TicketAudio
from app.services.reference import read_reference
from app.services.time import now_iso
from ml.generate import call_script
from ml.speech import tts

log = logging.getLogger("uvicorn.error")
AUDIO_SUBDIR = "audio"
DISABLED_REASON = "синтез отключён (TTS_ENABLED=0)"


def audio_dir() -> Path:
    return get_settings().var_dir / AUDIO_SUBDIR


def audio_path(card_id: str) -> Path:
    return audio_dir() / f"{card_id}.wav"


def synthesis_allowed() -> bool:
    return bool(get_settings().tts_enabled) and tts.available()


def unavailable_reason() -> str:
    if not get_settings().tts_enabled:
        return DISABLED_REASON
    return tts.unavailable_reason() or "модель TTS недоступна"


def build_transcript(ticket: dict[str, Any], voice: str, reference: dict[str, Any]) -> tuple[str, str, str]:
    """(текст, голос, источник): реплика команды ИИ через шлюз, иначе шаблон."""
    resolved_voice = call_script.resolve_voice(voice, ticket)
    external = get_gateway().call_script(ticket, {"voice": resolved_voice, "reference": reference})
    if isinstance(external, str) and external.strip():
        return external.strip(), resolved_voice, "gateway"
    return call_script.build_script(ticket), resolved_voice, "template"


async def ensure_audio(db: AsyncSession, card: IncidentCard, voice: str = "auto", *, regenerate: bool = False) -> tuple[TicketAudio, bool]:
    """Строка `ticket_audio` для билета; (строка, нужен ли синтез). Готовая запись без `regenerate` не трогается."""
    row = await db.get(TicketAudio, card.id)
    if row is not None and not regenerate and row.status in ("ready", "pending"):
        if row.status == "ready" and row.path and not Path(row.path).exists():
            row.status, row.error = "failed", "файл записи отсутствует"
            await db.flush()
        else:
            return row, row.status == "pending"
    reference = await read_reference(db)
    transcript, resolved_voice, source = build_transcript(card.to_contract(), voice, reference)
    if row is None:
        row = TicketAudio(card_id=card.id)
        db.add(row)
    row.transcript, row.voice, row.source = transcript, resolved_voice, source
    row.path, row.duration_ms, row.error = None, None, None
    row.generated_at = None
    if synthesis_allowed():
        row.status = "pending"
        await db.flush()
        return row, True
    row.status, row.error = "failed", unavailable_reason()
    await db.flush()
    return row, False


def _synthesize_sync(card_id: str, transcript: str, voice: str) -> tuple[str, int]:
    result = tts.synthesize(transcript, voice, audio_path(card_id))
    return str(result.path), result.duration_ms


async def synthesize_pending(card_ids: Iterable[str]) -> None:
    """Фоновая задача: синтез по строкам `pending` (собственная сессия БД; ошибки → `failed`, без исключений наружу)."""
    for card_id in list(card_ids):
        async with get_sessionmaker()() as db:
            row = await db.get(TicketAudio, card_id)
            if row is None or row.status != "pending":
                continue
            transcript, voice = row.transcript, row.voice
        try:
            path, duration = await asyncio.to_thread(_synthesize_sync, card_id, transcript, voice)
            error = None
        except Exception as exc:  # noqa: BLE001 — любой сбой синтеза = аварийный режим с расшифровкой
            path, duration, error = None, None, f"{type(exc).__name__}: {exc}"[:600]
            log.warning("TTS %s: %s", card_id, error)
        async with get_sessionmaker()() as db:
            row = await db.get(TicketAudio, card_id)
            if row is None:
                continue
            row.path, row.duration_ms, row.error = path, duration, error
            row.status = "ready" if path else "failed"
            row.generated_at = now_iso()
            await db.commit()


def schedule_synthesis(card_ids: list[str], background: Any | None = None) -> None:
    """Запуск синтеза: через `BackgroundTasks` запроса или задачей цикла (хук утверждения сценария)."""
    ids = [c for c in card_ids if c]
    if not ids:
        return
    if background is not None:
        background.add_task(synthesize_pending, ids)
        return
    try:
        asyncio.get_running_loop().create_task(synthesize_pending(ids))
    except RuntimeError:  # вне цикла событий (скрипты) — синхронно
        asyncio.run(synthesize_pending(ids))


async def prepare_for_cards(db: AsyncSession, card_ids: list[str], background: Any | None = None) -> list[str]:
    """Записи для карточек без готового аудио (хук утверждения сценария, T085); возвращает id, поставленные на синтез."""
    scheduled: list[str] = []
    for card_id in card_ids:
        card = await db.get(IncidentCard, card_id)
        if card is None:
            continue
        _, needs = await ensure_audio(db, card)
        if needs:
            scheduled.append(card_id)
    if scheduled:
        schedule_synthesis(scheduled, background)
    return scheduled


def audio_contract(row: TicketAudio | None, card_id: str) -> dict[str, Any]:
    if row is None:
        return {"cardId": card_id, "status": "pending", "transcript": "", "voice": "auto", "emergency": True}
    return row.to_contract()


def audio_summary(row: TicketAudio | None) -> dict[str, Any] | None:
    """Краткая форма для `Ticket.audio` списка билетов."""
    if row is None:
        return None
    data: dict[str, Any] = {"status": row.status}
    if row.duration_ms is not None:
        data["durationMs"] = row.duration_ms
    return data
