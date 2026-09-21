"""Софтфон учебного контура B→C (T065) — порт `src/shared/api/mock/calls.ts`:
`POST /calls/reply` — реплика ИИ-абонента точки C; `POST /cards/{id}/calls` — завершённый вызов в попытку курсанта.

Реплики: сначала `ai_gateway.call_reply` (зона команды ИИ-агентов), при `None` — детерминированный
`ml.insights.call_responder` (решение 2026-09-21). Запись вызова дополняет `PhoneCall` расширением `report` —
сверкой доклада с фактами карточки для компонента оценки `report`; попытку создаёт открытие карточки (T2.3-01).
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import get_gateway
from app.api.compat.auth import read_body
from app.api.deps import Viewer, assert_own_attempt, get_viewer
from app.api.errors import not_found
from app.db.ids import PREFIX, format_id, max_suffix
from app.db.session import get_db
from app.models.session import Attempt
from app.schemas.calls import CallReplyRequest, CardCallRequest
from app.schemas.scenarios import ai_response, parse_body
from app.services.attempts import find_student_attempt
from app.services.cards import require_card
from app.services.reference import read_reference
from ml.insights import call_responder

router = APIRouter()

NUMBER_NOT_FOUND = "Абонент не найден"


def _require_number(reference: dict[str, Any], to_number: str) -> dict[str, Any]:
    entry = call_responder.find_number(reference, to_number)
    if entry is None:
        raise not_found(NUMBER_NOT_FOUND)
    return entry


def _reply(entry: dict[str, Any], turn: str, text: str, reference: dict[str, Any]) -> dict[str, Any]:
    context = {"number": entry, "text": text, "reference": reference}
    external = get_gateway().call_reply(str(entry.get("number", "")), turn, context)
    if isinstance(external, dict) and isinstance(external.get("text"), str) and external["text"].strip():
        fallback = call_responder.reply(entry, turn, text)
        return {"text": external["text"], "voice": external.get("voice") if external.get("voice") in call_responder.VOICES else fallback.voice, "speakerTitle": str(external.get("speakerTitle") or fallback.speaker_title)}
    return call_responder.reply(entry, turn, text).to_contract()


@router.post("/calls/reply")
async def post_call_reply(request: Request, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    body: CallReplyRequest = parse_body(CallReplyRequest, await read_body(request))
    reference = await read_reference(db)
    entry = _require_number(reference, body.to_number)
    return ai_response(await asyncio.to_thread(_reply, entry, body.turn, body.text, reference))


async def _next_call_id(db: AsyncSession) -> str:
    rows = (await db.execute(select(Attempt.calls))).scalars().all()
    ids = [str(call.get("id", "")) for calls in rows for call in (calls or []) if isinstance(call, dict)]
    return format_id(PREFIX["call"], max_suffix(ids, PREFIX["call"]) + 1)


@router.post("/cards/{card_id}/calls")
async def post_card_call(card_id: str, request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> JSONResponse:
    resolved = await require_card(db, card_id)
    body: CardCallRequest = parse_body(CardCallRequest, await read_body(request))
    assert_own_attempt(viewer, body.student_id)
    reference = await read_reference(db)
    _require_number(reference, body.to_number)
    found = await find_student_attempt(db, card_id, body.student_id)
    if found is None:
        raise not_found(f"Попытка по карточке «{card_id}» не открыта — вызов не записан")
    session, attempt = found
    transcript = [line.dump() for line in body.transcript]
    call: dict[str, Any] = {
        "id": await _next_call_id(db),
        "fromUserId": body.student_id,
        "toNumber": body.to_number,
        "startedAt": body.started_at,
        "endedAt": body.ended_at,
        "transcript": transcript,
    }
    card = attempt.card_snapshot or resolved.card
    report = await asyncio.to_thread(call_responder.check_report, transcript, card, statuses=list(attempt.statuses or []), reference=reference)
    if report is not None:
        call["report"] = report.to_contract()
    attempt.calls = [*(attempt.calls or []), call]  # servicesCalled не трогаем — как в моке; оценщик объединяет calls и servicesCalled
    await db.commit()
    return JSONResponse(status_code=201, content={"sessionId": session.id, "attemptId": attempt.id, "call": call})
