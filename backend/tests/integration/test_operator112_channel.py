"""Спека 009, T031 (FR-010, US6; US5 — repeatOf): канал поступления и поля билета отдаются в OperatorAttempt.

Поля берутся из билета (`IncidentCard.extra`, сид из spec/000-фронт/mocks/cards.json): c-066 — СМС с текстом, c-001 — звонок
(канал call по умолчанию, текста нет), c-093 — повторный вызов с `repeatOf`. Проверяется и ответ на создание попытки, и
восстановление принятой попытки через `POST /assignments/{id}/start`. Пара каждому СМС-проверку — звонок в той же попытке.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation
from tests.conftest import login_as

TITLE = "009 T031 канал"
IVANOV = "u-005"
SMS_CARD = "c-066"
SMS_TEXT = "Знакомый хочет повеситься, закрылся в квартире и не открывает. Белозерская, 11Б, кв. 5, подъезд 1, 2 этаж. Срочно приезжайте."
CALL_CARD = "c-001"
REPEAT_CARD = "c-093"
REPEAT_OF = "card-36814851"


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def cleanup() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        ids = list((await db.execute(select(Assignment.id).where(Assignment.title == TITLE))).scalars().all())
        if not ids:
            return
        attempt_ids = list((await db.execute(select(AssignmentAttempt.attempt_id).where(AssignmentAttempt.assignment_id.in_(ids)))).scalars().all())
        await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id.in_(ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.source_attempt_id.in_(attempt_ids)))
        await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        await db.execute(delete(AssignmentScenarioVersion).where(AssignmentScenarioVersion.assignment_id.in_(ids)))
        await db.execute(delete(AssignmentStudent).where(AssignmentStudent.assignment_id.in_(ids)))
        await db.execute(delete(Assignment).where(Assignment.id.in_(ids)))
        await db.commit()


async def _assignment(v1: AsyncClient, card_ids: list[str]) -> str:
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"studentIds": [IVANOV], "trainingMode": "operator112", "format": "training", "cardIds": card_ids, "title": TITLE})
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def _attempt(v1: AsyncClient, assignment_id: str, card_id: str) -> dict:
    await login_as(v1, "student")
    created = await v1.post("/operator112/attempts", json={"assignmentId": assignment_id, "cardId": card_id})
    assert created.status_code in (200, 201), created.text
    return created.json()


async def test_sms_ticket_attempt_carries_channel_and_text(v1: AsyncClient):
    assignment_id = await _assignment(v1, [SMS_CARD, CALL_CARD])
    attempt = await _attempt(v1, assignment_id, SMS_CARD)
    assert attempt["channel"] == "sms"
    assert attempt["smsText"] == SMS_TEXT
    assert "repeatOf" not in attempt

    answered = await v1.post(f"/operator112/attempts/{attempt['id']}/answer")
    assert answered.status_code == 200, answered.text
    assert answered.json()["channel"] == "sms"
    assert answered.json()["smsText"] == SMS_TEXT


async def test_call_ticket_attempt_defaults_to_call_without_text(v1: AsyncClient):
    assignment_id = await _assignment(v1, [SMS_CARD, CALL_CARD])
    attempt = await _attempt(v1, assignment_id, CALL_CARD)
    assert attempt["channel"] == "call"
    assert "smsText" not in attempt
    assert "repeatOf" not in attempt


async def test_repeat_ticket_attempt_carries_repeat_of(v1: AsyncClient):
    assignment_id = await _assignment(v1, [REPEAT_CARD])
    attempt = await _attempt(v1, assignment_id, REPEAT_CARD)
    assert attempt["channel"] == "call"
    assert attempt["repeatOf"] == REPEAT_OF


async def test_restored_sms_attempt_keeps_channel_and_text(v1: AsyncClient):
    assignment_id = await _assignment(v1, [SMS_CARD])
    created = await _attempt(v1, assignment_id, SMS_CARD)
    await login_as(v1, "student")
    restored = await v1.post(f"/assignments/{assignment_id}/start")
    assert restored.status_code == 200, restored.text
    attempt = restored.json()["attempt"]
    assert attempt["id"] == created["id"]
    assert attempt["channel"] == "sms"
    assert attempt["smsText"] == SMS_TEXT
