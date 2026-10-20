"""Банк карточек, сохранённых обучающимися-112, и проверка их подачи в задание ДДС (фича 011).

Обучающийся-ДДС получает карточку обучающегося-112 только через задание преподавателя: преподаватель отбирает
карточку из банка и подтверждает эталон (спека 011, решения D1–D3). Банк преподавателя — карточки обучающихся
его групп (`User.assigned_groups`), администратору доступны все.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import forbidden, validation_failed
from app.models.card import IncidentCard
from app.models.user import User
from app.services.chain_service import proposed_decision

STUDENT_ORIGIN = "operator112"


def _require_manager(viewer: Viewer) -> None:
    if viewer.role not in ("teacher", "admin"):
        raise forbidden("Банк карточек обучающихся доступен преподавателю и администратору")


async def _student_cards(db: AsyncSession) -> list[IncidentCard]:
    statement = select(IncidentCard).where(IncidentCard.created_by_student_id.is_not(None), IncidentCard.mode_origin == STUDENT_ORIGIN)
    return list((await db.execute(statement)).scalars().all())


async def _visible_authors(db: AsyncSession, viewer: Viewer, author_ids: set[str]) -> dict[str, User]:
    authors = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()}
    if viewer.role == "admin":
        return authors
    teacher = await db.get(User, viewer.user_id)
    groups = set(teacher.assigned_groups or []) if teacher is not None else set()
    return {uid: user for uid, user in authors.items() if user.group and user.group in groups}


def _registered_at(card: IncidentCard) -> str:
    return str((card.extra or {}).get("registeredAt") or "")


async def list_bank(db: AsyncSession, viewer: Viewer) -> list[dict[str, Any]]:
    """GET /student-cards: карточки обучающихся-112 банка преподавателя, новые сверху, с предложенным эталоном."""
    _require_manager(viewer)
    cards = await _student_cards(db)
    authors = await _visible_authors(db, viewer, {card.created_by_student_id or "" for card in cards})
    visible = [card for card in cards if card.created_by_student_id in authors]
    source_ids = {str((card.extra or {}).get("sourceCardId") or "") for card in visible}
    sources = {c.id: c for c in (await db.execute(select(IncidentCard).where(IncidentCard.id.in_(source_ids)))).scalars().all()}
    items = []
    for card in sorted(visible, key=lambda c: (_registered_at(c), c.id), reverse=True):
        author = authors[card.created_by_student_id or ""]
        source = sources.get(str((card.extra or {}).get("sourceCardId") or ""))
        proposal = proposed_decision(card, source) if source is not None else {"cardId": card.id, "expectedDecision": "accepted"}
        item: dict[str, Any] = {
            "id": card.id, "group": card.group, "summary": card.summary, "address": card.address,
            "authorId": author.id, "authorName": author.full_name, "authorGroup": author.group,
            "registeredAt": _registered_at(card) or None, "sourceCardId": source.id if source is not None else None,
            "selectedServices": list(card.expected_services or []),
            "ticketServices": list(source.expected_services or []) if source is not None else [],
            "proposed": proposal,
        }
        items.append({key: value for key, value in item.items() if value is not None})
    return items


async def check_assignment_cards(db: AsyncSession, viewer: Viewer, training_mode: str, card_ids: list[str],
                                 etalons: list[dict[str, Any]]) -> set[str]:
    """Правила §5.2 спеки 011; возвращает id карточек обучающихся среди `card_ids`."""
    rows = (await db.execute(select(IncidentCard).where(IncidentCard.id.in_(card_ids)))).scalars().all()
    student_ids = {row.id for row in rows if row.created_by_student_id and row.mode_origin == STUDENT_ORIGIN}
    confirmed = [item["cardId"] for item in etalons]
    if not student_ids and not confirmed:
        return student_ids
    if training_mode != "dds":
        raise validation_failed("Карточки обучающихся-112 можно включать только в задание режима ДДС")
    if len(confirmed) != len(set(confirmed)) or set(confirmed) != student_ids:
        raise validation_failed("У каждой карточки обучающегося-112 в задании должен быть ровно один подтверждённый эталон")
    authors = await _visible_authors(db, viewer, {row.created_by_student_id or "" for row in rows if row.id in student_ids})
    if any(row.created_by_student_id not in authors for row in rows if row.id in student_ids):
        raise forbidden("Карточка обучающегося-112 не из ваших групп")
    return student_ids
