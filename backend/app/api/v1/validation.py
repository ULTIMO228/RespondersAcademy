"""T087: проверка билета без изменения решения преподавателя об утверждении."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, require_viewer
from app.api.v1.tickets import _require_teacher, _require_ticket
from app.db.session import get_db
from app.models.card import IncidentCard
from app.models.scenario import Scenario
from app.schemas.scenarios import ValidationReport
from app.services.reference import read_reference
from ml.generate import validator

router = APIRouter()


@router.post("/tickets/{card_id}/validate", response_model=ValidationReport, response_model_exclude_none=True)
async def validate_ticket(card_id: str, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(require_viewer)) -> dict:
    _require_teacher(viewer)
    card = await _require_ticket(db, card_id)
    cards = (await db.execute(select(IncidentCard).order_by(IncidentCard.id))).scalars().all()
    reference = await read_reference(db)
    report = await asyncio.to_thread(validator.validate, card.to_contract(), [c.to_contract() for c in cards], groups=tuple(reference.get("incidentGroups") or []))
    result = report.to_contract()
    card.extra = {**(card.extra or {}), "validation": result}
    scenarios = (await db.execute(select(Scenario).where(Scenario.deleted.is_(False)))).scalars().all()
    for scenario in scenarios:
        if card_id not in (scenario.card_ids or []):
            continue
        # Обновляем только этот билет, сохраняя отчёты остальных билетов сценария.
        tickets = dict((scenario.validation_report or {}).get("tickets") or {})
        tickets[card_id] = result
        incomplete = not set(scenario.card_ids or []).issubset(tickets)
        scenario.validation_report = {
            "version": validator.VALIDATOR_VERSION,
            "passed": not incomplete and all(r["passed"] for r in tickets.values()),
            "needsReview": incomplete or any(r["needsReview"] for r in tickets.values()),
            "checks": [{**check, "cardId": key} for key, value in tickets.items() for check in value["checks"]],
            "tickets": tickets,
        }
    await db.commit()
    return result
