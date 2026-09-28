"""Эталонные факты для четырёх полей смыслового разбора (детерминированно из карточки билета).

Идентификатор факта: `fact:{sourceTicketId}:{situationNo}:{d|a|r|c}{n}`, где буква — поле
(d — description, a — dispatcherAction, r — serviceReport, c — refusalComment). Факты не выдумываются моделью:
Haiku получает готовый список и пишет по нему текст обучающегося, а истинная метка задаётся планом.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

FIELDS = ("description", "dispatcherAction", "serviceReport", "refusalComment")
FIELD_LETTER = {"description": "d", "dispatcherAction": "a", "serviceReport": "r", "refusalComment": "c"}
FIELD_MODE = {"description": "operator112", "dispatcherAction": "dds", "serviceReport": "dds", "refusalComment": "dds"}
MAX_FACTS = 4

REGION_GENITIVE = {
    "Московской": "Московской области", "Волгоградской": "Волгоградской области", "Рязанской": "Рязанской области",
    "Тульской": "Тульской области", "Тверской": "Тверской области", "Владимирской": "Владимирской области",
}
TRANSFER = re.compile(r"перевод вызова в ЦУС (?P<reg>\w+) обл\.")
MIN_CLAUSE = 14


def _fact(ticket_id: str, situation_no: int, field: str, index: int, text: str) -> dict[str, str]:
    return {"id": f"fact:{ticket_id}:{situation_no}:{FIELD_LETTER[field]}{index}", "text": text.strip()}


def _split_outside_parens(text: str) -> list[str]:
    """Режет по «. », «; » и «, » только вне скобок: «(куртка и джинсы, ботинки)» остаётся одной частью."""
    parts: list[str] = []
    depth = 0
    start = 0
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif depth == 0 and ch in ".;," and text[i + 1 : i + 2] in (" ", ""):
            parts.append(text[start:i])
            start = i + 1
        i += 1
    parts.append(text[start:])
    return [p.strip() for p in parts if p.strip()]


def clauses(summary: str) -> list[str]:
    """Режет фабулу на смысловые части; слишком короткие обрывки склеивает с предыдущей."""
    raw = _split_outside_parens(summary.strip().rstrip("."))
    merged: list[str] = []
    for part in raw:
        if merged and (len(part) < MIN_CLAUSE or len(merged[-1]) < MIN_CLAUSE):
            merged[-1] = f"{merged[-1]}, {part}"
        else:
            merged.append(part)
    while len(merged) > MAX_FACTS:
        tail = merged.pop()
        merged[-1] = f"{merged[-1]}, {tail}"
    return merged


def service_phrase(service: str) -> str | None:
    """Служба из `expectedServices` → формулировка направленного действия; None — служба не даёт факта."""
    match = TRANSFER.search(service)
    if match:
        return f"вызов переведён в ЦУС {REGION_GENITIVE.get(match.group('reg'), match.group('reg') + ' области')}"
    if service.startswith("101"):
        return "направлен расчёт МЧС (101)" if "региона" not in service else "направлены силы МЧС региона (101)"
    if service.startswith("102"):
        return "направлен наряд полиции (102)" if "региона" not in service else "направлен наряд полиции региона (102)"
    if service.startswith("103"):
        if "констатация" in service:
            return "вызвана бригада для констатации смерти (103)"
        return "направлена бригада СМП (103)"
    if service == "СМП региона":
        return "направлена бригада СМП региона"
    if service.startswith("104") or service == "МОСГАЗ":
        return "информация передана в аварийную газовую службу (104)"
    if service == "МГПСС":
        return "направлены спасатели МГПСС"
    return f"информация передана: {service}"


def card_number(ticket_id: str, situation_no: int) -> str:
    digest = hashlib.sha256(f"card-number|{ticket_id}|{situation_no}".encode()).digest()
    return f"{2000 + int.from_bytes(digest[:2], 'big') % 7000}"


def description_facts(card: dict[str, Any], summary: str, ticket_id: str) -> list[dict[str, str]]:
    return [_fact(ticket_id, card["situationNo"], "description", i + 1, c) for i, c in enumerate(clauses(summary))]


def action_facts(card: dict[str, Any], ticket_id: str) -> list[dict[str, str]]:
    phrases: list[str] = []
    for service in card["expectedServices"]:
        phrase = service_phrase(service)
        if phrase and phrase not in phrases:
            phrases.append(phrase)
    texts = ["сообщение принято", *phrases[: MAX_FACTS - 1]]
    return [_fact(ticket_id, card["situationNo"], "dispatcherAction", i + 1, t) for i, t in enumerate(texts)]


def report_facts(card: dict[str, Any], summary: str, address: str, ticket_id: str) -> list[dict[str, str]]:
    first = clauses(summary)[0]
    victims = card.get("victims")
    victims_text = (
        f"пострадавших: {victims['count']} ({victims['note']})" if victims else "пострадавших нет или не сообщено"
    )
    texts = [
        f"адрес: {address}",
        f"суть происшествия: {first}",
        victims_text,
        f"номер карточки: {card_number(ticket_id, card['situationNo'])}",
    ]
    return [_fact(ticket_id, card["situationNo"], "serviceReport", i + 1, t) for i, t in enumerate(texts)]


def refusal_facts(card: dict[str, Any], ticket_id: str) -> list[dict[str, str]] | None:
    """Факты комментария к «Не принята»; только для перевода в другой регион и дублей, иначе None."""
    transfer = next((m for s in card["expectedServices"] if (m := TRANSFER.search(s))), None)
    if transfer:
        region = REGION_GENITIVE.get(transfer.group("reg"), transfer.group("reg") + " области")
        texts = [f"причина: вызов из другого региона ({region})", f"кому передано: ЦУС {region}"]
    elif card.get("duplicateOf"):
        texts = [f"причина: дубль карточки {card['duplicateOf']}", "кому передано: информация принята по основной карточке"]
    else:
        return None
    return [_fact(ticket_id, card["situationNo"], "refusalComment", i + 1, t) for i, t in enumerate(texts)]
