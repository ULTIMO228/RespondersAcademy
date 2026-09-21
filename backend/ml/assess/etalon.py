"""Разбор эталона сценария (Scenario.etalon) для карточки попытки.

Волна A: `expectedActions` («openCard:c-001», «status:accepted», «call:101», «transfer:region»),
`keyPhrases`. Расширения (необязательные, фронт игнорирует): `expectedDecision` (accepted | notAccepted),
`expectedTransferTo` (кому передано при «Не принята»), `expectedCommentPhrases` (что должно быть в
комментарии к отказу), `trap` (duplicate | foreignTerritory | operatorMistake | crossRegion), `reportChecklist`
(пункты доклада точке C), `expectedFacts` (факты, которые должны быть в тексте).

Расширения могут задаваться и на уровне карточки: `etalon.cards[cardId] = {…те же ключи…}`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

OPEN_CARD = "openCard"
STATUS = "status"
CALL = "call"
TRANSFER = "transfer"

PRIMARY_STATUSES = ("accepted", "notAccepted")
PROGRESS_STATUSES = ("responseStarted", "arrived", "workInProgress")
CLOSING_STATUSES = ("workDone", "workRefused")
COMMENT_REQUIRED = ("notAccepted", "workRefused")

TRAP_TITLES = {
    "duplicate": "дубль карточки",
    "foreignTerritory": "чужая территория",
    "operatorMistake": "ошибка классификации оператора 112",
    "crossRegion": "происшествие в другом регионе",
}


def parse_action(action: str) -> tuple[str, str]:
    kind, sep, target = action.partition(":")
    return (kind, target) if sep else (action, "")


def card_segment(expected_actions: list[str], card_id: str) -> list[str]:
    """Часть эталона одной карточки: от «openCard:<id>» до следующего openCard; нет сегмента — []."""
    marker = f"{OPEN_CARD}:{card_id}"
    if marker not in expected_actions:
        return []
    start = expected_actions.index(marker)
    rest = expected_actions[start + 1 :]
    segment: list[str] = []
    for action in rest:
        if action.startswith(f"{OPEN_CARD}:"):
            break
        segment.append(action)
    return segment


@dataclass
class CardEtalon:
    card_id: str
    actions: list[str]  # сегмент без openCard
    expected_decision: str  # accepted | notAccepted
    expected_calls: list[str]  # номера точки C в порядке эталона
    expected_transfer_region: bool
    expected_statuses: list[str]  # статусы после первичного решения в порядке эталона
    expected_transfer_to: str | None = None
    expected_comment_phrases: list[str] = field(default_factory=list)
    key_phrases: list[str] = field(default_factory=list)
    trap: str | None = None
    report_checklist: list[str] = field(default_factory=list)
    expected_facts: list[str] = field(default_factory=list)
    explicit: bool = True  # False — сегмента карточки в эталоне нет, взят весь эталон

    @property
    def trap_title(self) -> str:
        return TRAP_TITLES.get(self.trap or "", self.trap or "")


def resolve_card_etalon(etalon: dict[str, Any], card_id: str) -> CardEtalon:
    expected_actions = [a for a in (etalon.get("expectedActions") or []) if isinstance(a, str)]
    segment = card_segment(expected_actions, card_id)
    explicit = bool(segment)
    if not segment:
        segment = [a for a in expected_actions if not a.startswith(f"{OPEN_CARD}:")]
    per_card = ((etalon.get("cards") or {}).get(card_id) or {}) if isinstance(etalon.get("cards"), dict) else {}

    def pick(key: str, default: Any) -> Any:
        if key in per_card:
            return per_card[key]
        return etalon.get(key, default)

    statuses = [t for k, t in map(parse_action, segment) if k == STATUS]
    calls = [t for k, t in map(parse_action, segment) if k == CALL]
    transfer_region = any(k == TRANSFER and t == "region" for k, t in map(parse_action, segment))
    decision = pick("expectedDecision", None)
    if decision not in PRIMARY_STATUSES:
        decision = next((s for s in statuses if s in PRIMARY_STATUSES), "accepted")
    progress = [s for s in statuses if s not in PRIMARY_STATUSES]
    if decision == "notAccepted":
        # Ожидается отказ (ловушка): звонки службам, перевод и ход работ из общего эталона не требуются.
        calls, transfer_region, progress = [], False, []
    return CardEtalon(
        card_id=card_id,
        actions=segment,
        expected_decision=decision,
        expected_calls=calls,
        expected_transfer_region=transfer_region,
        expected_statuses=progress,
        expected_transfer_to=pick("expectedTransferTo", None) if isinstance(pick("expectedTransferTo", None), str) else None,
        expected_comment_phrases=[p for p in (pick("expectedCommentPhrases", []) or []) if isinstance(p, str)],
        key_phrases=[p for p in (pick("keyPhrases", []) or []) if isinstance(p, str)],
        trap=pick("trap", None) if isinstance(pick("trap", None), str) else None,
        report_checklist=[p for p in (pick("reportChecklist", []) or []) if isinstance(p, str)],
        expected_facts=[p for p in (pick("expectedFacts", []) or []) if isinstance(p, str)],
        explicit=explicit,
    )


def status_title(reference: dict[str, Any], status: str) -> str:
    for row in reference.get("ddsStatuses") or []:
        if row.get("status") == status:
            return str(row.get("title") or status)
    return {"accepted": "Принята", "notAccepted": "Не принята", "responseStarted": "Начало реагирования", "arrived": "Прибытие", "workInProgress": "Проведение работ", "workDone": "Работы завершены", "workRefused": "Отказ от выполнения работ"}.get(status, status)


def number_title(reference: dict[str, Any], number: str) -> str:
    for row in reference.get("internalNumbers") or []:
        if str(row.get("number")) == number:
            return f"{number} ({row.get('title')})"
    return number
