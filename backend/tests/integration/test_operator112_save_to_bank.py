"""Переход 112 → ДДС после вывода цепочки (замена test_ai_chain / test_seed_chain_demo).

Цепочка A → B выведена (test_chain_retired.py); источник входа ДДС теперь — банк карточек обучающихся-112 (фича 011).
Проверяется сквозной путь через HTTP: «Сохранить» без подтверждения оповещения (фича 007) карточку не создаёт и в банк
её не кладёт; после подтверждения карточка ученика появляется в `GET /student-cards` с билетом-источником.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import AssignmentAttempt
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation
from tests.conftest import login_as
from tests.contract.test_v1_operator112 import TRAINING, _draft_for_c010


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        yield http


@pytest_asyncio.fixture(autouse=True)
async def _cleanup() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        attempt_ids = list((await db.execute(select(Attempt.id).where(Attempt.mode == "operator112"))).scalars().all())
        await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.attempt_id.in_(attempt_ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.source_attempt_id.in_(attempt_ids)))
        await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        await db.commit()


async def test_карточка_112_попадает_в_банк_ддс_только_после_подтверждения_оповещения(v1: AsyncClient) -> None:
    await login_as(v1, "student")
    created = await v1.post("/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-010"})
    assert created.status_code in (200, 201), created.text
    attempt_id = created.json()["id"]
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200

    refused = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010(notificationConfirmed=False))
    assert refused.status_code == 409 and "Подтвердите список оповещения" in refused.json()["error"]["message"]
    async with get_sessionmaker()() as db:
        assert (await db.execute(select(IncidentCard).where(IncidentCard.source_attempt_id == attempt_id))).first() is None

    # Парный запрос: то же тело с подтверждением сохраняется.
    saved = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010())
    assert saved.status_code == 200, saved.text
    card = saved.json()["card"]
    assert card["cardStatus"] == "registered" and card["sourceCardId"] == "c-010"

    await login_as(v1, "admin")
    bank = await v1.get("/student-cards")
    assert bank.status_code == 200, bank.text
    item = next((row for row in bank.json() if row["id"] == card["id"]), None)
    assert item is not None, "сохранённая карточка ученика-112 должна попасть в банк ДДС"
    assert item["authorId"] == "u-005" and item["sourceCardId"] == "c-010"
