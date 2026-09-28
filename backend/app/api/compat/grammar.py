"""POST /grammar-check — принудительная проверка ручного текста через ИИ-шлюз без LLM (R2 symspell + R3 адреса).

Вид поля решает `ml.nlp.grammar.check_field`: адресное — по справочнику улиц без синтаксических правил, иначе —
орфография и синтаксис. Сервер только возвращает замечания (`field`, `fragment`, `wrong`, `expected`, `type`) и
никогда не меняет текст. US3: при `scenarioId` замечания дополнительно привязаны к сценарию и его текущей версии
(`scenarioId`, `scenarioVersion`); без него ответ прежний.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import get_gateway
from app.api.compat.auth import read_body
from app.api.deps import Viewer, get_viewer
from app.db.session import get_db
from app.schemas.scenarios import GrammarCheckRequest, ai_response, parse_body
from app.services.scenario_service import bind_text_check
from ml.nlp.grammar import DEFAULT_FIELD

router = APIRouter()


@router.post("/grammar-check")
async def post_grammar_check(request: Request, db: AsyncSession = Depends(get_db), viewer: Viewer | None = Depends(get_viewer)) -> dict[str, Any]:
    body: GrammarCheckRequest = parse_body(GrammarCheckRequest, await read_body(request))
    field = body.field.strip() if isinstance(body.field, str) and body.field.strip() else DEFAULT_FIELD
    binding = await bind_text_check(db, body.scenario_id, body.scenario_version, viewer) if body.scenario_id else {}
    errors = await asyncio.to_thread(get_gateway().check_grammar, body.text, field)
    return ai_response([{**error, **binding} for error in errors])
