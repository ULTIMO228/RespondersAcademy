"""Эталон ДДС для карточки, сохранённой обучающимся-112 (по исходному билету).

Фича 011 (D4): сохранённая карточка сама обучающимся-ДДС не выдаётся — её подаёт преподаватель через задание
режима ДДС (банк `student_card_service`). Задания «цепочка A → B» выведены 20.10.2026 (spec/007 Clarifications).
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import IncidentCard
from app.models.session import Attempt


def _norm(value: str) -> str:
    return value.casefold().replace("ё", "е").replace("«", "").replace("»", "").strip()


def _matches(profile: str | None, service: str) -> bool:
    profile_name, service_name = _norm(profile or ""), _norm(service)
    if not profile_name or not service_name:
        return False
    if "мосгаз" in profile_name and ("мосгаз" in service_name or service_name == "104" or "104" in service_name):
        return True
    if "мосводоканал" in profile_name and "мосводоканал" in service_name:
        return True
    return profile_name in service_name or service_name in profile_name


def proposed_decision(card: IncidentCard, original: IncidentCard) -> dict:
    """Предложение эталона ДДС (фича 011): службы обучающегося-112 совпали с билетом → «Принята», иначе «Не принята»."""
    expected = list(original.expected_services or [])
    correct = any(_matches(service, selected) for service in expected for selected in card.expected_services or [])
    if correct:
        return {"cardId": card.id, "expectedDecision": "accepted"}
    return {"cardId": card.id, "expectedDecision": "notAccepted", "expectedTransferTo": expected[0] if expected else "профильную службу"}


def etalon_for_decision(card_id: str, decision: str, transfer_to: str | None = None) -> dict:
    """Эталон попытки ДДС по одной карточке: первичный статус и, для «Не принята», кому передано."""
    if decision == "accepted":
        return {"expectedActions": [f"openCard:{card_id}", "status:accepted"], "cards": {card_id: {"expectedDecision": "accepted"}}}
    return {
        "expectedActions": [f"openCard:{card_id}", "status:notAccepted"],
        "cards": {card_id: {"expectedDecision": "notAccepted", "expectedTransferTo": transfer_to,
                            "expectedCommentPhrases": ["не профильное", f"передано в {transfer_to}"]}},
    }


def etalon_from_source(card: IncidentCard, original: IncidentCard) -> dict:
    """DDS acceptance depends on the original ticket, never the learner's selected type."""
    proposal = proposed_decision(card, original)
    return etalon_for_decision(card.id, proposal["expectedDecision"], proposal.get("expectedTransferTo"))


async def issue_submitted_card(db: AsyncSession, card: IncidentCard, source: Attempt) -> None:
    """Готовит автоэталон сохранённой 112-карточки; в идущие занятия ДДС карточка сама не попадает (фича 011, D4)."""
    original = await db.get(IncidentCard, source.card_id)
    if original is None:
        return
    card.extra = {**(card.extra or {}), "chainEtalon": etalon_from_source(card, original), "sourceAttemptId": source.id}
    await db.flush()
