"""Персональные рекомендации и групповые инсайты без внешней модели."""

from __future__ import annotations

import hashlib
from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import forbidden, not_found
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.card import IncidentCard
from app.models.kb import KbArticle
from app.models.recommendation import Recommendation
from app.models.scenario import Scenario
from app.models.user import User
from app.services import analytics, rating_service
from app.services.assignment_service import _approved_ids
from app.services.session_engine import filter_cards_for_student
from app.services.time import now_iso
from ml.insights import rating as elo
from ml.insights import recommender


def _id(student_id: str, kind: str, target_id: str) -> str:
    digest = hashlib.sha1(f"{student_id}:{kind}:{target_id}".encode()).hexdigest()[:20]
    return f"rec-{digest}"


async def generate(db: AsyncSession, student_id: str, limit: int = 10) -> list[dict[str, Any]]:
    history = await analytics.rows(db, student_id)
    if not history:
        return []
    weak = recommender.weak_categories(history, now_iso())
    if not weak:
        return []
    ratings = await rating_service.ratings(db, student_id)
    approved = await _approved_ids(db)
    cards = (await db.execute(select(IncidentCard).where(IncidentCard.id.in_(approved)))).scalars().all()
    scenarios = (await db.execute(select(Scenario).where(Scenario.deleted.is_(False)))).scalars().all()
    articles = {article.group: article for article in (await db.execute(select(KbArticle))).scalars()}
    issued = set((await db.execute(select(AssignmentAttempt.card_id).where(AssignmentAttempt.student_id == student_id))).scalars())
    completed = {item["cardId"] for item in history}
    weak_weights = {item["group"]: item["weight"] for item in weak}
    proposals: list[tuple[float, str, str, str, dict[str, Any]]] = []
    for rank, item in enumerate(weak):
        group = item["group"]
        rule_id = next((str(error.get("ruleId")) for row in history if row["group"] == group
                        for error in row["errors"] if error.get("ruleId")), "R22")
        reason = {"errorType": item["errorType"], "count": item["count"], "ruleId": rule_id}
        base = 1000 - rank * 100
        proposals.append((base, "category", group, f"Повторить: {group}", reason))
        article = articles.get(group)
        if article:
            proposals.append((base - 20, "article", article.id, article.title, reason))
        group_cards = [card for card in cards if card.group == group]
        if group_cards:
            docs = [{**card.to_contract(), "cardId": card.id} for card in group_cards]
            if item["mode"] == "dds":
                allowed = {doc["cardId"] for doc in await filter_cards_for_student(db, docs, student_id, [group], "dds")}
                group_cards = [card for card in group_cards if card.id in allowed]
            ranked = []
            for card in group_cards:
                level = max((s.difficulty for s in scenarios if card.id in (s.card_ids or [])),
                            default=int((card.extra or {}).get("difficulty") or 1))
                ranked.append({"id": card.id, "group": card.group, "difficulty": elo.card_difficulty(card, level),
                               "title": card.summary})
            ranked.sort(key=lambda card: recommender.card_priority(card, weak_weights, ratings[item["mode"]],
                                                                     issued=issued, completed=completed))
            if ranked:
                card = ranked[0]
                penalty = 200 if card["id"] in issued or card["id"] in completed else 0
                proposals.append((base - 10 - penalty, "card", card["id"], card["title"], reason))
    stronger = recommender.stronger_mode(ratings)
    if stronger and abs(ratings["dds"] - ratings["operator112"]) >= 20:
        weaker = "dds" if stronger == "operator112" else "operator112"
        proposals.append((100, "mode", weaker, f"Повторить режим {weaker}",
                          {"errorType": "modeGap", "count": 1, "ruleId": "R10"}))
    existing = {row.id: row for row in (await db.execute(select(Recommendation).where(Recommendation.student_id == student_id))).scalars()}
    ranked_rows = []
    for priority, kind, target, title, reason in proposals:
        rec_id = _id(student_id, kind, target)
        row = existing.get(rec_id)
        if row is None:
            row = Recommendation(id=rec_id, student_id=student_id, kind=kind, target_id=target,
                                 title=title, reason=reason, created_at=now_iso())
            db.add(row)
            existing[rec_id] = row
        else:
            row.title, row.reason = title, reason
        ranked_rows.append((priority - (500 if row.accepted_at else 0), row))
    await db.flush()
    ranked_rows.sort(key=lambda item: (-item[0], item[1].id))
    return [row.to_contract() for _, row in ranked_rows[:limit]]


async def accept(db: AsyncSession, student_id: str, rec_id: str) -> dict[str, Any]:
    row = await db.get(Recommendation, rec_id)
    if row is None:
        raise not_found("Рекомендация не найдена")
    if row.student_id != student_id:
        raise forbidden("Доступны только собственные рекомендации")
    if row.accepted_at is None:
        row.accepted_at = now_iso()
    await db.flush()
    return row.to_contract()


async def profile(db: AsyncSession, student_id: str) -> dict[str, Any]:
    student = await db.get(User, student_id)
    if student is None or student.role != "student":
        raise not_found("Обучающийся не найден")
    scores = await rating_service.ratings(db, student_id)
    history = await analytics.rows(db, student_id)
    typical = {}
    for mode in ("dds", "operator112"):
        errors = Counter(str(error.get("type") or "unknown") for row in history if row["mode"] == mode for error in row["errors"])
        typical[mode] = [{"type": key, "count": value} for key, value in errors.most_common(3)]
    return {"ratings": scores, "strongerMode": recommender.stronger_mode(scores),
            "typicalErrors": typical, "recommendations": await generate(db, student_id, 10)}


async def group_insights(db: AsyncSession, group_id: str, assignment_id: str | None = None) -> dict[str, Any]:
    students = (await db.execute(select(User).where(User.group == group_id, User.role == "student"))).scalars().all()
    ids = {student.id for student in students}
    if assignment_id:
        assignment = await db.get(Assignment, assignment_id)
        if assignment is None:
            raise not_found("Задание не найдено")
        ids &= set(assignment.student_ids or [])
    counts: dict[str, set[str]] = defaultdict(set)
    groups = Counter()
    for student_id in ids:
        for row in await analytics.rows(db, student_id):
            for error in row["errors"]:
                counts[str(error.get("type") or "unknown")].add(student_id)
                groups[row["group"]] += 1
    insights = [{"share": round(len(student_ids) / len(ids), 3), "errorType": error,
                 "text": f"{len(student_ids)} из {len(ids)} обучающихся: {error}"}
                for error, student_ids in sorted(counts.items(), key=lambda item: (-len(item[1]), item[0]))] if ids else []
    return {"insights": insights, "suggestedGroup": groups.most_common(1)[0][0] if groups else None}
