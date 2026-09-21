"""Карточки обоих пространств id (card-* фикстуры, c-NNN учебные), детали и рантайм-мутации."""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import not_found
from app.models.card import ArmCardFixture, CardRuntime, IncidentCard
from app.models.classifier import ClassifierEntry
from app.services.fixture_map import FixtureResolver

TRAINING_CARD_ID = re.compile(r"^c-\d{3}$")
FIXTURE_CARD_ID = re.compile(r"^card-")

_resolver_cache: dict[str, FixtureResolver] = {}


def reset_cache() -> None:
    _resolver_cache.clear()


@dataclass
class ResolvedCard:
    kind: str  # "fixture" | "training"
    card: dict[str, Any]


async def find_card(db: AsyncSession, card_id: str) -> ResolvedCard | None:
    if TRAINING_CARD_ID.match(card_id):
        row = await db.get(IncidentCard, card_id)
        return ResolvedCard("training", row.to_contract()) if row else None
    if FIXTURE_CARD_ID.match(card_id):
        row = await db.get(ArmCardFixture, card_id)
        return ResolvedCard("fixture", row.to_contract()) if row else None
    return None


async def require_card(db: AsyncSession, card_id: str) -> ResolvedCard:
    resolved = await find_card(db, card_id)
    if resolved is None:
        raise not_found(f"Карточка «{card_id}» не найдена")
    return resolved


async def list_fixtures(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (await db.execute(select(ArmCardFixture).order_by(ArmCardFixture.seq, ArmCardFixture.id))).scalars().all()
    return [row.to_contract() for row in rows]


async def list_training_cards(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (await db.execute(select(IncidentCard).order_by(IncidentCard.id))).scalars().all()
    return [row.to_contract() for row in rows]


async def get_fixture_resolver(db: AsyncSession) -> FixtureResolver:
    if "resolver" not in _resolver_cache:
        fixtures = await list_fixtures(db)
        entries = (await db.execute(select(ClassifierEntry))).scalars().all()
        classifier = {row.code: {"code": row.code, "group": row.group, "mainService": row.main_service} for row in entries}
        _resolver_cache["resolver"] = FixtureResolver(fixtures, classifier)
    return _resolver_cache["resolver"]


def empty_runtime() -> dict[str, Any]:
    return {"statusEvents": [], "workLines": [], "reminders": [], "sms": []}


async def read_runtime(db: AsyncSession, card_id: str) -> dict[str, Any]:
    row = await db.get(CardRuntime, card_id)
    return copy.deepcopy(row.to_contract()) if row else empty_runtime()


async def ensure_runtime(db: AsyncSession, card_id: str) -> CardRuntime:
    row = await db.get(CardRuntime, card_id)
    if row is None:
        row = CardRuntime(card_id=card_id, status_events=[], work_lines=[], reminders=[], sms=[])
        db.add(row)
        await db.flush()
    return row


async def card_details(db: AsyncSession, card_id: str) -> dict[str, Any]:
    resolved = await require_card(db, card_id)
    runtime = await read_runtime(db, card_id)
    if resolved.kind == "fixture":
        return {"kind": "fixture", "card": resolved.card, "runtime": runtime}
    resolver = await get_fixture_resolver(db)
    return {"kind": "training", "card": resolved.card, "resolvedFixtureId": resolver.resolve_id(resolved.card["group"]), "runtime": runtime}
