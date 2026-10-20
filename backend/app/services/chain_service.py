"""Transfer a submitted 112 card to a matching DDS learner and retain its source etalon."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.ids import PREFIX, next_id
from app.models.assignment import Assignment, AssignmentAttempt
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


async def issue_submitted_card(db: AsyncSession, card: IncidentCard, source: Attempt, assignment: Assignment | None) -> None:
    original = await db.get(IncidentCard, source.card_id)
    if original is None:
        return
    card.extra = {**(card.extra or {}), "chainEtalon": etalon_from_source(card, original), "sourceAttemptId": source.id}
    # Фича 011 (D4): в идущие занятия ДДС карточка сама не попадает — её подаёт преподаватель через задание.
    # Выдача остаётся только этапу ДДС задания «цепочка A → B» (D5).
    if assignment is None or assignment.training_mode != "chain":
        await db.flush()
        return
    sessions = list((await db.execute(select(TrainingSession).where(TrainingSession.state == "running"))).scalars().all())
    eligible_sessions: list[TrainingSession] = []
    if assignment is not None and assignment.training_mode == "chain":
        session = next((s for s in sessions if s.mode == f"assignment:{assignment.id}" and s.training_mode == "chain"), None)
        if session is None:
            session = TrainingSession(id=await next_id(db, PREFIX["session"], TrainingSession.id), teacher_id=assignment.teacher_id,
                                      student_ids=list(assignment.student_ids or []), scenario_ids=[], mode=f"assignment:{assignment.id}",
                                      card_source="studentCreated", card_flow=[], state="running", started_at=now_iso(), plan=assignment.params or {},
                                      parked=[], training_mode="chain", format=assignment.format)
            db.add(session)
            await db.flush()
        eligible_sessions.append(session)
    users = {u.id: u for u in (await db.execute(select(User).where(User.role == "student", User.is_active.is_(True)))).scalars().all()}
    delivered = False
    for session in eligible_sessions:
        recipients = [sid for sid in session.student_ids or [] if sid != source.student_id and sid in users
                      and (assignment is None or session.mode != f"assignment:{assignment.id}" or sid in (assignment.student_ids or []))
                      and any(_matches(users[sid].service, service) for service in card.expected_services or [])]
        for recipient in recipients:
            if any(item.get("cardId") == card.id and item.get("studentId") == recipient for item in session.card_flow or []):
                continue
            session.card_flow = [*(session.card_flow or []), {"cardId": card.id, "studentId": recipient, "issuedAt": now_iso(),
                                                           "level": 1, "issuedBy": "chain", "studentCreated": True}]
            if assignment is not None and session.mode == f"assignment:{assignment.id}":
                attempt = Attempt(id=await next_id(db, PREFIX["attempt"], Attempt.id), session_id=session.id, card_id=card.id,
                                  student_id=recipient, mode="dds", opened_at=now_iso(), primary_reaction_ms=0, statuses=[],
                                  services_called=[], full_processing_ms=0, entered_text={}, calls=[], seq=0)
                db.add(attempt)
                await db.flush()
                db.add(AssignmentAttempt(assignment_id=assignment.id, student_id=recipient, card_id=card.id,
                                         attempt_id=attempt.id, state="answered"))
            delivered = True
    if assignment is not None and assignment.training_mode == "chain" and not delivered:
        assignment.params = {**(assignment.params or {}), "noRecipient": [*(assignment.params or {}).get("noRecipient", []),
                                                                            {"cardId": card.id, "sourceAttemptId": source.id}]}
    await db.flush()
