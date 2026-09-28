"""Schedule and deliver DDS response updates after a card is accepted."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import validation_failed
from app.db.ids import PREFIX, next_id
from app.models.card import IncidentCard
from app.models.session import Attempt, TrainingSession
from app.models.work_message import WorkMessage
from app.services.time import is_iso, ms_to_iso, now_iso, parse_iso_ms

KINDS = ("departed", "arrived", "started", "done")
STATUSES = ("responseStarted", "arrived", "workInProgress", "workDone")
DEFAULT_INTERVALS_SEC = (20, 50, 90, 150)
STATUS_WINDOW_SEC = 30


def intervals_for(group: str, params: dict) -> tuple[int, ...]:
    """Resolve category-specific offsets in seconds from the accepted status."""
    by_group = params.get("workMessageIntervalsByGroup") or {}
    offsets = by_group.get(group) if isinstance(by_group, dict) else None
    if offsets is None:
        offsets = params.get("workMessageIntervalsSec", DEFAULT_INTERVALS_SEC)
    if not isinstance(offsets, list | tuple) or len(offsets) != len(KINDS) or any(
        isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in offsets
    ) or list(offsets) != sorted(set(offsets)):
        raise validation_failed("Интервалы сообщений о ходе работ должны быть четырьмя возрастающими секундами")
    return tuple(offsets)


async def schedule_on_accept(db: AsyncSession, attempt: Attempt, accepted_at: str) -> None:
    session = await db.get(TrainingSession, attempt.session_id)
    params = (session.plan or {}) if session else {}
    if not params.get("workMessagesEnabled"):
        return
    existing = (await db.execute(select(WorkMessage.id).where(WorkMessage.attempt_id == attempt.id))).first()
    if existing:
        return
    card = await db.get(IncidentCard, attempt.card_id)
    offsets = intervals_for(card.group if card else "", params)
    start = parse_iso_ms(accepted_at)
    for kind, status, seconds in zip(KINDS, STATUSES, offsets, strict=True):
        db.add(WorkMessage(id=await next_id(db, PREFIX["workMessage"], WorkMessage.id), attempt_id=attempt.id,
                           kind=kind, at=ms_to_iso(start + seconds * 1000), expected_status=status))
        await db.flush()


async def due_messages(db: AsyncSession, attempt_id: str, since: str | None = None, at: str | None = None) -> list[WorkMessage]:
    if since is not None and not is_iso(since):
        raise validation_failed("Параметр since должен быть датой ISO 8601")
    cutoff = at or now_iso()
    rows = (await db.execute(select(WorkMessage).where(WorkMessage.attempt_id == attempt_id).order_by(WorkMessage.at, WorkMessage.id))).scalars().all()
    return [row for row in rows if parse_iso_ms(row.at) <= parse_iso_ms(cutoff)
            and (since is None or parse_iso_ms(row.at) > parse_iso_ms(since))]
