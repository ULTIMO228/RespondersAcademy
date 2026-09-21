"""Разговорная реплика заявителя из билета (FR-012): текст аудиозаписи обращения для режима A.

Детерминированный шаблонный путь: приветствие по статусу заявителя → фабула своими словами → адрес → уточнения
по группе (пострадавшие, отказ от СМП, газ, другой регион) → ФИО и телефон. Все факты билета (`summary`, `address`,
`caller`, `victims`) попадают в текст дословно или в разговорной форме — оценщик режима A сверяет описание
именно с ними. Голос (`voice`): по полу заявителя из ФИО/самоназвания («мама», «сама» → female), иначе по чётности
номера билета. Точка расширения команды ИИ-агентов — `AiGateway.call_script(ticket, context)`; при `None` — этот шаблон.
"""

from __future__ import annotations

import re
from typing import Any

MALE, FEMALE = "male", "female"
VOICES = (MALE, FEMALE, "auto")
FEMALE_WORDS = ("мама", "сама", "жена", "дочь", "бабушка", "сестра", "соседка", "женщина", "девушка")
MALE_WORDS = ("папа", "сам", "муж", "сын", "дедушка", "брат", "сосед", "мужчина")
UNKNOWN_NAMES = ("не указан", "не указано", "неизвестно", "аноним", "")
FEMALE_SUFFIXES = ("ова", "ева", "ина", "ая", "ская", "цкая", "евна", "овна", "ична", "инична")
STATUS_INTRO = {
    "очевидец": "Я тут рядом, вижу всё своими глазами.",
    "пострадавший": "Мне нужна помощь, я сам пострадал.",
    "родственник": "Это с моим родственником случилось.",
    "знакомый": "Это с моим знакомым.",
    "участник": "Я сам в этом участвую.",
    "ребенок": "Я ребёнок, мне страшно.",
    "ребёнок": "Я ребёнок, мне страшно.",
}
GROUP_TAILS: tuple[tuple[str, str], ...] = (
    ("газ", "Газ чувствуется сильно, окна я открыл. Пожалуйста, побыстрее."),
    ("пожар", "Дым идёт, огонь видно. Приезжайте скорее!"),
    ("дтп", "Машины стоят на проезжей части, движение затруднено."),
    ("дорожно", "Машины стоят на проезжей части, движение затруднено."),
    ("медицин", "Человеку плохо, помогите, пожалуйста, побыстрее."),
    ("драка", "Там люди дерутся, кто-то может пострадать."),
    ("кража", "Всё случилось только что, они ещё могут быть рядом."),
    ("дерев", "Дерево лежит, пройти нельзя."),
    ("вода", "Вода прибывает, нужно перекрыть."),
    ("лифт", "Люди в лифте, они не могут выйти."),
    ("животн", "Животное агрессивное, люди боятся подойти."),
    ("пропал", "Телефон не отвечает, мы очень волнуемся."),
)
_SENTENCE_END = re.compile(r"[.!?]$")


def _sentence(text: str) -> str:
    text = " ".join(str(text or "").split()).strip()
    if not text:
        return ""
    return text if _SENTENCE_END.search(text) else text + "."


def guess_voice(name: str, ticket_no: int | None = None) -> str:
    """Пол заявителя по ФИО/самоназванию; неизвестно — по чётности номера билета (детерминировано)."""
    words = [w.lower().replace("ё", "е") for w in str(name or "").split()]
    if any(w in FEMALE_WORDS for w in words):
        return FEMALE
    if any(w in MALE_WORDS for w in words):
        return MALE
    if words and " ".join(words) not in UNKNOWN_NAMES:
        # Фамилия и отчество: «Иванова … Ивановна» → female; «Иванов … Иванович» → male.
        if any(w.endswith(FEMALE_SUFFIXES) for w in words):
            return FEMALE
        if any(w.endswith(("ов", "ев", "ин", "ий", "ой", "ич")) for w in words):
            return MALE
    return FEMALE if (int(ticket_no or 0) % 2 == 1) else MALE


def resolve_voice(requested: str | None, ticket: dict[str, Any]) -> str:
    if requested in (MALE, FEMALE):
        return requested
    caller = ticket.get("caller") if isinstance(ticket.get("caller"), dict) else {}
    return guess_voice(str(caller.get("name") or ""), ticket.get("ticketNo"))


def _self_intro(name: str, status: str) -> str:
    clean = str(name or "").strip()
    if clean.lower() in UNKNOWN_NAMES:
        return "Представляться не буду."
    if clean.lower() in (*FEMALE_WORDS, *MALE_WORDS):
        return f"Я {clean}, звоню за него." if status == "родственник" else f"Я {clean}."
    return f"Меня зовут {clean}."


def _victims_clause(ticket: dict[str, Any]) -> str:
    victims = ticket.get("victims") if isinstance(ticket.get("victims"), dict) else None
    parts: list[str] = []
    if victims and int(victims.get("count") or 0) > 0:
        count = int(victims["count"])
        note = str(victims.get("note") or "").strip()
        who = "один человек пострадал" if count == 1 else f"пострадавших {count}"
        parts.append(_sentence(f"Есть пострадавшие: {who}" + (f", {note}" if note else "")))
    elif victims is not None or "пострадавших нет" in str(ticket.get("summary") or "").lower():
        parts.append("Пострадавших нет.")
    if ticket.get("noAmbulance"):
        parts.append("Скорая не нужна, от медицинской помощи отказываемся.")
    if ticket.get("crossRegion"):
        parts.append("Это не в Москве, я звоню из другого региона.")
    return " ".join(parts)


def _group_tail(group: str) -> str:
    key = str(group or "").lower()
    return next((tail for marker, tail in GROUP_TAILS if marker in key), "Скажите, что делать, я на связи.")


def build_script(ticket: dict[str, Any]) -> str:
    """Реплика заявителя: все факты билета разговорным языком; детерминирована по билету."""
    caller = ticket.get("caller") if isinstance(ticket.get("caller"), dict) else {}
    status = str(caller.get("status") or "").strip().lower()
    name = str(caller.get("name") or "").strip()
    phone = str(caller.get("phone") or "").strip()
    address = str(ticket.get("addressRefined") or ticket.get("address") or "").strip()
    parts = [
        "Алло, здравствуйте! Это служба сто двенадцать?",
        STATUS_INTRO.get(status, ""),
        _sentence(str(ticket.get("summary") or "")),
        _sentence(f"Адрес: {address}") if address else "",
        _victims_clause(ticket),
        _group_tail(str(ticket.get("group") or "")),
        _self_intro(name, status),
        _sentence(f"Мой телефон: {phone}") if phone else "",
    ]
    return " ".join(p for p in parts if p)


def build(ticket: dict[str, Any], voice: str | None = None) -> dict[str, str]:
    """{ transcript, voice } для записи билета (transcript сохраняется в ticket_audio)."""
    return {"transcript": build_script(ticket), "voice": resolve_voice(voice, ticket)}
