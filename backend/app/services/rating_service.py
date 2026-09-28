"""Идемпотентная синхронизация рейтинга по сохранённым оценкам обоих режимов."""

from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.card import IncidentCard
from app.models.recommendation import StudentRating
from app.models.scenario import Scenario
from app.models.session import Attempt, Evaluation, TeacherOverride
from ml.insights import rating as elo


async def sync(db: AsyncSession, student_id: str, mode: str) -> StudentRating:
    row = await db.get(StudentRating, (student_id, mode))
    if row is None:
        row = StudentRating(student_id=student_id, mode=mode, rating=elo.BASE_RATING, history=[], weak_groups={})
        db.add(row)
        await db.flush()
    done = {item["attemptId"] for item in row.history or []}
    attempts = (await db.execute(select(Attempt, Evaluation).join(Evaluation, Evaluation.attempt_id == Attempt.id)
                                 .where(Attempt.student_id == student_id, Attempt.mode == mode)
                                 .order_by(Evaluation.generated_at, Attempt.id))).all()
    if not attempts:
        return row
    cards = {card.id: card for card in (await db.execute(select(IncidentCard).where(IncidentCard.id.in_({a.card_id for a, _ in attempts})))).scalars()}
    scenarios = (await db.execute(select(Scenario).where(Scenario.deleted.is_(False)))).scalars().all()
    overrides: dict[str, TeacherOverride] = {}
    for item in (await db.execute(select(TeacherOverride).where(TeacherOverride.attempt_id.in_({a.id for a, _ in attempts}))
                                  .order_by(TeacherOverride.at, TeacherOverride.id))).scalars():
        overrides[item.attempt_id] = item
    history = list(row.history or [])
    for attempt, evaluation in attempts:
        if attempt.id in done:
            continue
        card = cards.get(attempt.card_id)
        level = max((s.difficulty for s in scenarios if attempt.card_id in (s.card_ids or [])),
                    default=int((card.extra or {}).get("difficulty") or 1) if card else 1)
        score = overrides[attempt.id].score if attempt.id in overrides else evaluation.total_score
        challenge = elo.card_difficulty(card, level)
        row.rating = elo.update(row.rating, challenge, score,
                                elo.norm_factor(attempt.primary_reaction_ms, attempt.full_processing_ms))
        history.append({"attemptId": attempt.id, "at": evaluation.generated_at, "score": score,
                        "group": card.group if card else "", "mode": mode,
                        "errors": list(evaluation.errors or []), "rating": row.rating})
    row.history = history
    counts = Counter(item["group"] for item in history for _ in item["errors"] if item["group"])
    row.weak_groups = dict(counts)
    await db.flush()
    return row


async def ratings(db: AsyncSession, student_id: str) -> dict[str, float]:
    return {mode: (await sync(db, student_id, mode)).rating for mode in ("dds", "operator112")}
