"""Чат разбора попытки (фича 020): `POST /api/v1/ai/chat`.

Доступ: только обучающийся-владелец попытки. Без сессии — 401; роль не `student` (в том числе администратор) — 403,
и это проверяется раньше попытки; чужая попытка — 403; несуществующая, попытка другого режима и попытка без оценки —
404 (`evaluationPending` для оценки). Ошибка формата тела — 422; сверх лимита запросов на пользователя — 429. Ответ строит
`attempt_chat.answer`: модель (`llm.complete_json`, цель `attempt_chat`) → локальная модель → шаблон; облако чата можно выключить
флагом `CHAT_CLOUD_ENABLED=false` (по умолчанию включено, T020). Чтение только: оценка не пересчитывается.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.compat.auth import read_body
from app.api.deps import Viewer, get_db, require_viewer
from app.api.errors import forbidden, unprocessable
from app.api.v1.ai_access import require_attempt_access
from app.schemas.v1.ai_chat import ChatRequest, ChatResponse
from app.services import attempt_chat

router = APIRouter(prefix="/ai", tags=["ai-chat"])


def _parse_request(body: dict[str, Any]) -> ChatRequest:
    """Тело чата разбирается отдельно от общего `parse_body`: формат ошибки — 422, как в контракте чата."""
    try:
        return ChatRequest.model_validate(body)
    except ValidationError as exc:
        first = exc.errors()[0]
        location = ".".join(str(part) for part in first.get("loc", ()))
        if first.get("type") == "missing":
            raise unprocessable(f"Заполните поле «{location}»") from exc
        raise unprocessable(f"Некорректное значение поля «{location or 'тело запроса'}»") from exc


@router.post("/chat")
async def attempt_chat_reply(
    request: Request,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(require_viewer),
) -> JSONResponse:
    if not viewer.is_student:
        raise forbidden("Чат разбора доступен только обучающемуся по собственной попытке")
    attempt_chat.rate_limiter.check(viewer.user_id)  # 429 раньше разбора тела и обращения к БД попытки
    chat = _parse_request(await read_body(request))
    attempt = await require_attempt_access(db, chat.attempt_id, viewer)
    facts = await attempt_chat.build_facts(db, attempt, chat.mode)
    history = [{"role": item.role, "content": item.content} for item in chat.history]
    result = await attempt_chat.answer(db, viewer, facts, chat.message, history)
    return JSONResponse(
        ChatResponse(reply=result.reply, source=result.source, provider=result.provider, model_name=result.model_name).dump()  # type: ignore[arg-type]
    )
