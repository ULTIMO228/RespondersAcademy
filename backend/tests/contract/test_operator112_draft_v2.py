"""Спека 009, T004: аддитивный контракт карточки ПОВ-112 (channel, incidents, links, outcome, полный адрес).

Старое тело карточки принимается и оценивается как раньше (FR-033, SC-004: эталон c-010 = 96 баллов при ответе на 5-й с и
отработке 60 с — `spec/009-arm-112-student/baseline.txt`). Каждому отказу 400 соответствует парный успешный запрос.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation
from app.services.time import ms_to_iso, now_iso, parse_iso_ms
from tests.conftest import login_as
from tests.contract.test_v1_operator112 import _draft_for_c010

TITLE = "009 T004 контракт карточки"
BASELINE_TOTAL = 96  # baseline.txt, прогон 1 «эталон»


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


async def _answered_attempt(v1: AsyncClient) -> str:
    """Свежая тренировка 112 на c-010 под ivanov; вызов принят на 5-й с, с ответа прошло 60 с (как в baseline.txt)."""
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"studentIds": ["u-005"], "trainingMode": "operator112", "format": "training", "cardIds": ["c-010"], "title": TITLE})
    assert created.status_code == 201, created.text
    await login_as(v1, "student")
    attempt_id = (await v1.post(f"/assignments/{created.json()['id']}/start")).json()["attempt"]["id"]
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200
    async with get_sessionmaker()() as db:
        attempt = await db.get(Attempt, attempt_id)
        now = parse_iso_ms(now_iso())
        attempt.opened_at, attempt.answered_at = ms_to_iso(now - 65_000), ms_to_iso(now - 60_000)
        await db.commit()
    return attempt_id


async def _submit(v1: AsyncClient, attempt_id: str, body: dict[str, Any]):
    return await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=body)


async def _total(v1: AsyncClient, attempt_id: str) -> int:
    evaluation = await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")
    assert evaluation.status_code == 200, evaluation.text
    return evaluation.json()["totalScore"]


async def test_старое_тело_принимается_и_оценивается_как_раньше(v1: AsyncClient):
    attempt_id = await _answered_attempt(v1)
    submitted = await _submit(v1, attempt_id, _draft_for_c010())
    assert submitted.status_code == 200, submitted.text
    assert await _total(v1, attempt_id) == BASELINE_TOTAL


async def test_вкладки_типов_без_what_оцениваются_по_первой_вкладке(v1: AsyncClient):
    draft = _draft_for_c010()
    first_tab = draft.pop("what")
    attempt_id = await _answered_attempt(v1)
    body = {**draft, "incidents": [first_tab, {"signs": ["Дым"], "classifierCode": "", "finalType": ""}]}
    submitted = await _submit(v1, attempt_id, body)
    assert submitted.status_code == 200, submitted.text
    assert await _total(v1, attempt_id) == BASELINE_TOTAL


async def test_две_главные_связи_400_одна_200(v1: AsyncClient):
    attempt_id = await _answered_attempt(v1)
    two = _draft_for_c010(links=[{"cardId": "c-010", "primary": True}, {"cardId": "c-050", "primary": True}])
    refused = await _submit(v1, attempt_id, two)
    assert refused.status_code == 400 and refused.json()["error"]["code"] == "validationFailed"
    one = _draft_for_c010(links=[{"cardId": "c-010", "primary": True}, {"cardId": "c-050", "primary": False}])
    assert (await _submit(v1, attempt_id, one)).status_code == 200


async def test_нет_контакта_и_срыв_сохраняются_без_адреса_и_типа(v1: AsyncClient):
    for outcome in ("noContact", "dropped"):
        attempt_id = await _answered_attempt(v1)
        empty = {"outcome": outcome, "applicant": {}, "phones": {"aon": "+7 (916) 126-34-71"}, "address": {}, "what": {}, "description": ""}
        submitted = await _submit(v1, attempt_id, empty)
        assert submitted.status_code == 200, submitted.text
        assert submitted.json()["attempt"]["cardSnapshot"]["outcome"] == outcome


async def test_заполненная_карточка_без_адреса_400_с_адресом_200(v1: AsyncClient):
    attempt_id = await _answered_attempt(v1)
    no_address = _draft_for_c010(outcome="filled", address={"source": "manual"})
    refused = await _submit(v1, attempt_id, no_address)
    assert refused.status_code == 400 and refused.json()["error"]["code"] == "validationFailed"
    assert (await _submit(v1, attempt_id, _draft_for_c010(outcome="filled"))).status_code == 200


async def test_адрес_любого_субъекта_и_канал_сохраняются_в_снимке(v1: AsyncClient):
    attempt_id = await _answered_attempt(v1)
    address = {"country": "Россия", "subject": "Московская область", "locality": "Химки", "object": "ТЦ «Мега»",
               "korpus": "2", "building": "1", "flat": "", "entrance": "3", "floor": "2", "code": "", "lat": 55.91, "lon": 37.4,
               "descriptive": "у главного входа", "source": "manual"}
    submitted = await _submit(v1, attempt_id, _draft_for_c010(address=address, channel="sms"))
    assert submitted.status_code == 200, submitted.text
    snapshot = submitted.json()["attempt"]["cardSnapshot"]
    assert snapshot["channel"] == "sms"
    assert snapshot["address"]["subject"] == "Московская область" and snapshot["address"]["locality"] == "Химки"
    assert snapshot["address"]["object"] == "ТЦ «Мега»" and snapshot["address"]["lat"] == 55.91
