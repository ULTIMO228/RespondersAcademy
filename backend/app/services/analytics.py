"""История и аналитика по оценённым попыткам; одна область данных для лобби и преподавателя."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assignment import Assignment, AssignmentAttempt
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation, TeacherOverride, TrainingSession


async def rows(db: AsyncSession, student_id: str | None = None) -> list[dict[str, Any]]:
    query = select(Attempt, Evaluation).join(Evaluation, Evaluation.attempt_id == Attempt.id)
    if student_id:
        query = query.where(Attempt.student_id == student_id)
    pairs = (await db.execute(query)).all()
    if not pairs:
        return []
    card_ids = {attempt.card_id for attempt, _ in pairs}
    session_ids = {attempt.session_id for attempt, _ in pairs}
    attempt_ids = {attempt.id for attempt, _ in pairs}
    cards = {r.id: r for r in (await db.execute(select(IncidentCard).where(IncidentCard.id.in_(card_ids)))).scalars()}
    sessions = {r.id: r for r in (await db.execute(select(TrainingSession).where(TrainingSession.id.in_(session_ids)))).scalars()}
    links = {r.attempt_id: r for r in (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.attempt_id.in_(attempt_ids)))).scalars()}
    assignments = {r.id: r for r in (await db.execute(select(Assignment).where(Assignment.id.in_({r.assignment_id for r in links.values()})))).scalars()} if links else {}
    overrides = {}
    for override in (await db.execute(select(TeacherOverride).where(TeacherOverride.attempt_id.in_(attempt_ids)).order_by(TeacherOverride.at))).scalars():
        overrides[override.attempt_id] = override
    result = []
    for attempt, evaluation in pairs:
        card = cards.get(attempt.card_id)
        session = sessions.get(attempt.session_id)
        link = links.get(attempt.id)
        assignment = assignments.get(link.assignment_id) if link else None
        score = overrides[attempt.id].score if attempt.id in overrides else evaluation.total_score
        result.append({
            "attemptId": attempt.id, "studentId": attempt.student_id, "mode": attempt.mode,
            "format": assignment.format if assignment else (session.format if session else "training"),
            "cardId": attempt.card_id, "title": card.summary if card else attempt.card_id,
            "group": card.group if card else "", "score": score, "at": evaluation.generated_at,
            "passed": evaluation.passed, "reactionMs": attempt.primary_reaction_ms,
            "processingMs": attempt.full_processing_ms, "components": evaluation.components or {},
            "errors": list(evaluation.errors or []), "replays": link.replays if link else 0,
            "hintsShown": link.hints_shown if link else 0,
        })
    return sorted(result, key=lambda item: (item["at"], item["attemptId"]), reverse=True)


def _stats(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {"count": len(items), "averageScore": round(sum(item["score"] for item in items) / len(items), 1) if items else 0,
            "averageReactionMs": round(sum(item["reactionMs"] for item in items) / len(items)) if items else 0,
            "averageProcessingMs": round(sum(item["processingMs"] for item in items) / len(items)) if items else 0,
            "replays": sum(item["replays"] for item in items), "hintsShown": sum(item["hintsShown"] for item in items)}


def summarize(items: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = list(reversed(items))
    errors = Counter(str(error.get("type") or error.get("ruleId") or "unknown") for item in items for error in item["errors"])
    by_mode = {mode: _stats([item for item in items if item["mode"] == mode]) for mode in ("dds", "operator112")}
    grouped: dict[str, dict[str, Any]] = {}
    for field in ("group", "mode", "format"):
        buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for item in items:
            buckets[item[field]].append(item)
        grouped[field] = {key: _stats(value) for key, value in sorted(buckets.items())}
    return {
        "byMode": by_mode, "reactionMs": _stats(items)["averageReactionMs"],
        "topErrors": [{"type": kind, "count": count} for kind, count in sorted(errors.items(), key=lambda pair: (-pair[1], pair[0]))[:3]],
        "dynamics": {"labels": [item["at"][:10] for item in ordered], "values": [item["score"] for item in ordered]},
        "byGroup": grouped["group"], "byFormat": grouped["format"],
    }
