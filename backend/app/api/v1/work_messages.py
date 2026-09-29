"""DDS response updates and uploaded voice reports."""

from __future__ import annotations

import asyncio
import io
import wave
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, assert_own_attempt, require_viewer
from app.api.errors import ApiError, not_found, validation_failed
from app.config import get_settings
from app.db.ids import PREFIX, format_id, max_suffix
from app.db.session import get_db
from app.models.card import IncidentCard
from app.models.session import Attempt
from app.services.reference import read_reference
from app.services.time import now_iso
from app.services.work_messages import due_messages
from ml.insights.call_responder import check_report, find_number
from ml.speech import stt

router = APIRouter()


@router.get("/attempts/{attempt_id}/work-messages")
async def get_work_messages(attempt_id: str, request: Request, db: AsyncSession = Depends(get_db),
                            viewer: Viewer = Depends(require_viewer)) -> list[dict[str, Any]]:
    attempt = await db.get(Attempt, attempt_id)
    if attempt is None or attempt.mode != "dds":
        raise not_found(f"Попытка ДДС «{attempt_id}» не найдена")
    assert_own_attempt(viewer, attempt.student_id)
    rows = await due_messages(db, attempt.id, request.query_params.get("since"))
    return [row.to_contract() for row in rows]


async def _next_call_id(db: AsyncSession) -> str:
    rows = (await db.execute(select(Attempt.calls))).scalars().all()
    ids = [str(call.get("id") or "") for calls in rows for call in calls or [] if isinstance(call, dict)]
    return format_id(PREFIX["call"], max_suffix(ids, PREFIX["call"]) + 1)


@router.post("/attempts/{attempt_id}/report-audio", status_code=201)
async def post_report_audio(attempt_id: str, file: Annotated[UploadFile, File()], to_number: Annotated[str, Form()] = "112",
                            db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict[str, Any]:
    attempt = await db.get(Attempt, attempt_id)
    if attempt is None or attempt.mode != "dds":
        raise not_found(f"Попытка ДДС «{attempt_id}» не найдена")
    assert_own_attempt(viewer, attempt.student_id)
    data = await file.read(stt.MAX_WAV_BYTES + 1)
    if not data or len(data) > stt.MAX_WAV_BYTES:
        raise validation_failed("WAV должен быть непустым и не больше 20 МБ")
    try:
        text = await asyncio.to_thread(stt.transcribe, data)
    except ValueError as exc:
        raise validation_failed(str(exc)) from exc
    except stt.SpeechUnavailable as exc:
        raise ApiError(503, "internal", str(exc)) from exc
    if not text:
        raise validation_failed("Речь в аудиодокладе не распознана")
    card = await db.get(IncidentCard, attempt.card_id)
    if card is None:
        raise not_found(f"Карточка «{attempt.card_id}» не найдена")
    call_id = await _next_call_id(db)
    at = now_iso()
    transcript = [{"speaker": "dispatcher", "text": text, "at": at}]
    reference = await read_reference(db)
    if find_number(reference, to_number) is None:
        raise validation_failed("Номер адресата доклада не найден в справочнике")
    report = await asyncio.to_thread(check_report, transcript, attempt.card_snapshot or card.to_contract(),
                                     statuses=list(attempt.statuses or []), reference=reference)
    recording_dir = get_settings().var_dir / "recordings"
    recording_dir.mkdir(parents=True, exist_ok=True)
    recording_path = recording_dir / f"{call_id}.wav"
    recording_path.write_bytes(data)
    with wave.open(io.BytesIO(data), "rb") as sound:
        duration_ms = round(sound.getnframes() * 1000 / sound.getframerate())
    call = {"id": call_id, "fromUserId": attempt.student_id, "toNumber": to_number, "startedAt": at, "endedAt": at,
            "transcript": transcript, "recording": {"contentType": "audio/wav", "size": len(data), "durationMs": duration_ms}}
    if report is not None:
        call["report"] = report.to_contract()
    attempt.calls = [*(attempt.calls or []), call]
    await db.commit()
    return {"attemptId": attempt.id, "call": {key: value for key, value in call.items() if key != "recording"},
            "recording": {"id": call_id, "url": f"/api/v1/cards/{card.id}/recordings/{call_id}/file"}}
