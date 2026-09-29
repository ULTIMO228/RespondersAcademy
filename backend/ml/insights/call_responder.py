"""Детерминированный ИИ-абонент точки C и чек-лист доклада (US10, FR-051, T064) — без LLM и сети.

Конечный автомат ответчика (`reply`): ход `answer` — снятие трубки «Слушаю вас» (как в транскриптах сидов),
ход `reply` — подтверждение приёма с вариацией по службе (`CONFIRMATIONS` по номеру из `reference.internalNumbers`,
для 301/302 — реплики сидов `sessions.json`, иначе общее «Понял, информация принята»). Голос — детерминированно
по номеру (чётный → male, нечётный → female, как в моке фронта), `speakerTitle` — название из справочника.

Чек-лист доклада (`check_report`): реплики диспетчера сверяются с фактами карточки — номер карточки, адрес,
тип происшествия, пострадавшие, принятое решение (спец. US10: «доклад без номера карточки → в оценке
"не назван номер карточки"»). Проверка лексическая по основам слов (`ml.nlp.semantic.stems`), поэтому всегда
`available=True`; результат хранится в попытке как расширение `PhoneCall.report` и используется компонентом
`ml.assess.components.report`, когда в эталоне нет явного `reportChecklist`.

Граница с командой ИИ-агентов: `AiGateway.call_reply(to_number, turn, context)` опрашивается первым; этот
модуль — фолбэк при `None` (решение 2026-09-21). `context` = `{ "number": InternalNumber, "text": str,
"reference": Reference }`; ожидаемый ответ — `CallReply { text, voice, speakerTitle }`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from ml.nlp import address as address_nlp
from ml.nlp.semantic import lexical_coverage, stems

RESPONDER_VERSION = "call-responder-1.0.0"
TURNS = ("answer", "reply")
VOICES = ("male", "female")

GREETING = "Слушаю вас"
DEFAULT_CONFIRMATION = "Понял, информация принята"
CONFIRMATIONS: dict[str, str] = {
    "101": "Понял, информация принята, расчёт выезжает",
    "102": "Понял, информация принята, наряд направлен",
    "103": "Понял, информация принята, бригада выезжает",
    "104": "Понял, информация принята, аварийная бригада выезжает",
    "112": "Понял, информация принята, реагирование на контроле",
    "301": "Я вас понял, информация принята",
    "302": "Понял, бригада выезжает",
    "303": "Понял, информация принята, инженер выезжает",
}

CHECK_IDS = ("cardNumber", "address", "type", "victims", "decision")
CHECK_LABELS = {
    "cardNumber": "номер карточки",
    "address": "адрес происшествия",
    "type": "тип происшествия",
    "victims": "сведения о пострадавших",
    "decision": "принятое решение",
}
COVERAGE_MIN = 0.5  # доля основ слов факта, которая должна прозвучать в докладе

VICTIMS_MENTION = re.compile(r"пострадав|ранен|травм|погиб|без сознани|в сознани|без пострадавших|03 не (требуется|нужн)|скорая не (требуется|нужн)|мед(ицинская)? помощь не (требуется|нужн)", re.IGNORECASE)
DECISION_MENTION = re.compile(r"принят|не принят|отказ|передан|передаю|направл|выезжа|выслан|наряд|бригад|расчёт|расчет|реагирован|перевод|переключ", re.IGNORECASE)
CARD_WORD = re.compile(r"карточк\w*\s*(?:№|номер)?\s*(\d+)", re.IGNORECASE)


@dataclass(frozen=True)
class CallReply:
    text: str
    voice: str
    speaker_title: str

    def to_contract(self) -> dict[str, str]:
        return {"text": self.text, "voice": self.voice, "speakerTitle": self.speaker_title}


@dataclass
class ReportCheck:
    id: str
    label: str
    expected: str
    found: bool

    def to_contract(self) -> dict[str, Any]:
        return {"id": self.id, "label": self.label, "expected": self.expected, "found": self.found}


@dataclass
class ReportCheckResult:
    text: str
    checks: list[ReportCheck] = field(default_factory=list)

    @property
    def missing(self) -> list[str]:
        return [check.label for check in self.checks if not check.found]

    @property
    def score(self) -> float:
        if not self.checks:
            return 1.0
        return sum(1 for check in self.checks if check.found) / len(self.checks)

    def to_contract(self) -> dict[str, Any]:
        return {"version": RESPONDER_VERSION, "text": self.text, "checks": [c.to_contract() for c in self.checks], "missing": self.missing, "score": round(self.score, 3)}


# ─── Ответчик ────────────────────────────────────────────────────────────────────────────────────


def find_number(reference: dict[str, Any], to_number: str) -> dict[str, Any] | None:
    for entry in reference.get("internalNumbers") or []:
        if isinstance(entry, dict) and str(entry.get("number", "")) == to_number:
            return entry
    return None


def voice_of(to_number: str) -> str:
    digits = re.sub(r"\D", "", to_number)
    return VOICES[int(digits) % len(VOICES)] if digits else VOICES[0]


def confirmation_for(to_number: str) -> str:
    return CONFIRMATIONS.get(to_number, DEFAULT_CONFIRMATION)


def reply(entry: dict[str, Any], turn: str, text: str = "") -> CallReply:
    """Реплика абонента `entry` (запись `internalNumbers`) на ход диспетчера; `text` — доклад для хода `reply`."""
    if turn not in TURNS:
        raise ValueError(f"Неизвестный ход абонента: {turn}")
    number = str(entry.get("number", ""))
    line = GREETING if turn == "answer" else confirmation_for(number)
    return CallReply(text=line, voice=voice_of(number), speaker_title=str(entry.get("title") or number))


# ─── Чек-лист доклада ─────────────────────────────────────────────────────────────────────────────


def dispatcher_text(transcript: list[dict[str, Any]]) -> str:
    return " . ".join(str(line.get("text")) for line in transcript if isinstance(line, dict) and line.get("speaker") == "dispatcher" and isinstance(line.get("text"), str)).strip()


def _card_numbers(card: dict[str, Any]) -> set[str]:
    numbers: set[str] = set()
    card_id = str(card.get("id") or "")
    match = re.search(r"(\d+)$", card_id)
    if match:
        numbers.update({match.group(1), match.group(1).lstrip("0") or "0"})
    ticket_no = card.get("ticketNo")
    if isinstance(ticket_no, int) and not isinstance(ticket_no, bool):
        numbers.add(str(ticket_no))
    return numbers


def _check_card_number(text: str, card: dict[str, Any]) -> ReportCheck:
    card_id = str(card.get("id") or "")
    expected = card_id or "номер карточки"
    lowered = text.lower()
    found = bool(card_id) and card_id.lower() in lowered
    if not found:
        numbers = _card_numbers(card)
        found = any(m.group(1).lstrip("0") in {n.lstrip("0") for n in numbers} for m in CARD_WORD.finditer(text))
        if not found:
            from ml.speech.tts import number_to_words

            found = any(
                re.search(rf"карточк\w*\s*(?:номер\s*)?{re.escape(number_to_words(int(number)))}\b", lowered)
                for number in numbers if number.isdigit() and int(number) <= 999_999
            )
    return ReportCheck("cardNumber", CHECK_LABELS["cardNumber"], expected, found)


def _check_address(text: str, card: dict[str, Any]) -> ReportCheck:
    address = str(card.get("addressRefined") or card.get("address") or "").strip()
    if not address:
        return ReportCheck("address", CHECK_LABELS["address"], "адрес", True)
    street = address_nlp.normalize_street(address_nlp.extract_street_query(address))
    text_stems = set(stems(text))
    street_stems = stems(street)
    found = bool(street_stems) and all(s in text_stems for s in street_stems)
    if not found:
        found = lexical_coverage(address, text) >= COVERAGE_MIN
    return ReportCheck("address", CHECK_LABELS["address"], address, found)


def _check_type(text: str, card: dict[str, Any]) -> ReportCheck:
    group = str(card.get("group") or "").strip()
    summary = str(card.get("summary") or "").strip()
    expected = group or summary
    coverage = max(lexical_coverage(group, text) if group else 0.0, lexical_coverage(summary, text) if summary else 0.0)
    return ReportCheck("type", CHECK_LABELS["type"], expected, coverage >= COVERAGE_MIN)


def _check_victims(text: str, card: dict[str, Any]) -> ReportCheck:
    victims = card.get("victims") if isinstance(card.get("victims"), dict) else None
    if victims and victims.get("count"):
        expected = f"пострадавших: {victims['count']}" + (f" ({victims['note']})" if victims.get("note") else "")
    elif card.get("noAmbulance"):
        expected = "пострадавших нет, 03 не требуется"
    else:
        expected = "пострадавших нет"
    return ReportCheck("victims", CHECK_LABELS["victims"], expected, bool(VICTIMS_MENTION.search(text)))


def _check_decision(text: str, card: dict[str, Any], statuses: list[dict[str, Any]], reference: dict[str, Any]) -> ReportCheck:
    primary = next((s for s in statuses if s.get("ddsStatus") in ("accepted", "notAccepted")), None)
    expected = "решение по карточке (принята / не принята, кому передано)"
    if primary:
        title = next((row.get("title") for row in reference.get("ddsStatuses") or [] if row.get("status") == primary.get("ddsStatus")), None)
        expected = str(title or primary.get("ddsStatus"))
    return ReportCheck("decision", CHECK_LABELS["decision"], expected, bool(DECISION_MENTION.search(text)))


def check_report(transcript: list[dict[str, Any]], card: dict[str, Any], *, statuses: list[dict[str, Any]] | None = None, reference: dict[str, Any] | None = None) -> ReportCheckResult | None:
    """Сверка доклада с фактами карточки; `None`, если в транскрипте нет реплик диспетчера."""
    text = dispatcher_text(transcript)
    if not text:
        return None
    reference = reference or {}
    checks = [
        _check_card_number(text, card),
        _check_address(text, card),
        _check_type(text, card),
        _check_victims(text, card),
        _check_decision(text, card, statuses or [], reference),
    ]
    return ReportCheckResult(text=text, checks=checks)
