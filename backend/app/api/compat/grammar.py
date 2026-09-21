"""POST /grammar-check — принудительная проверка грамматики через ИИ-шлюз (R2 symspell + R3 адреса для адресных полей)."""

from __future__ import annotations

import asyncio
import re
from typing import Any

from fastapi import APIRouter, Request

from app.ai_gateway import get_gateway
from app.api.compat.auth import read_body
from app.schemas.scenarios import GrammarCheckRequest, ai_response, parse_body
from ml.nlp import address as address_nlp
from ml.nlp.grammar import DEFAULT_FIELD

router = APIRouter()

ADDRESS_FIELD = re.compile(r"address|addr|street|адрес|улиц", re.IGNORECASE)


def address_lookalike(text: str, field: str) -> list[dict[str, str]]:
    """Похожая улица справочника (85 ≤ ratio < 100) — как ошибка `spelling` с подсказкой из справочника."""
    if not text.strip() or not address_nlp.load_streets():
        return []
    match = address_nlp.match(text)
    if not match.lookalike or match.street is None:
        return []
    return [{"field": field, "fragment": match.query, "wrong": match.query, "expected": match.street.name, "type": "spelling"}]


@router.post("/grammar-check")
async def post_grammar_check(request: Request) -> dict[str, Any]:
    body: GrammarCheckRequest = parse_body(GrammarCheckRequest, await read_body(request))
    field = body.field.strip() if isinstance(body.field, str) and body.field.strip() else DEFAULT_FIELD
    errors = await asyncio.to_thread(get_gateway().check_grammar, body.text, field)
    if ADDRESS_FIELD.search(field):
        # Адресное поле: синтаксические правила текста («ул. …» со строчной) не применимы, зато проверяется справочник улиц.
        errors = [*(e for e in errors if e.get("type") != "syntax"), *address_lookalike(body.text, field)]
    return ai_response(errors)
