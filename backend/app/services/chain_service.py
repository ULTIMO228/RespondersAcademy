"""Transfer a submitted 112 card to a matching DDS learner and retain its source etalon."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import IncidentCard
from app.models.session import Attempt, TrainingSession
from app.models.user import User
from app.services.time import now_iso


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


def etalon_from_source(card: IncidentCard, original: IncidentCard) -> dict:
    """DDS acceptance depends on the original ticket, never the learner's selected type."""
    expected = list(original.expected_services or [])
    correct = any(_matches(service, selected) for service in expected for selected in card.expected_services or [])
    if correct:
        return {"expectedActions": [f"openCard:{card.id}", "status:accepted"], "cards": {card.id: {"expectedDecision": "accepted"}}}
    target = expected[0] if expected else "профильную службу"
    return {
        "expectedActions": [f"openCard:{card.id}", "status:notAccepted"],
        "cards": {card.id: {"expectedDecision": "notAccepted", "expectedTransferTo": target,
                            "expectedCommentPhrases": ["не профильное", f"передано в {target}"]}},
    }


async def issue_submitted_card(db: AsyncSession, card: IncidentCard, source: Attempt) -> None:
    """Выдаёт сохранённую 112-карточку в идущие занятия ДДС с пулом studentCreated/mixed.

    Задания «цепочка A → B» (assignment chain) выведены 20.10.2026 (spec/007 Clarifications): в задания карточка не уходит.
    """
    original = await db.get(IncidentCard, source.card_id)
    if original is None:
        return
    card.extra = {**(card.extra or {}), "chainEtalon": etalon_from_source(card, original), "sourceAttemptId": source.id}
    sessions = list((await db.execute(select(TrainingSession).where(TrainingSession.state == "running"))).scalars().all())
    eligible_sessions = [s for s in sessions if s.card_source in ("studentCreated", "mixed") and s.training_mode == "dds"
                         and not (s.mode or "").startswith("assignment:")]
    users = {u.id: u for u in (await db.execute(select(User).where(User.role == "student", User.is_active.is_(True)))).scalars().all()}
    for session in eligible_sessions:
        recipients = [sid for sid in session.student_ids or [] if sid != source.student_id and sid in users
                      and any(_matches(users[sid].service, service) for service in card.expected_services or [])]
        for recipient in recipients:
            if any(item.get("cardId") == card.id and item.get("studentId") == recipient for item in session.card_flow or []):
                continue
            session.card_flow = [*(session.card_flow or []), {"cardId": card.id, "studentId": recipient, "issuedAt": now_iso(),
                                                           "level": 1, "issuedBy": "chain", "studentCreated": True}]
    await db.flush()
