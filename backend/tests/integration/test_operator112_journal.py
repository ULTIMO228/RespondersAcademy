"""Спека 009, T010/T011: журнал «Поиск происшествий» ученика-112 — `GET /api/v1/operator112/journal?assignmentId=`.

Строки: фон задания (фикстуры ПОВ-112), собственные карточки режима 112 ученика и вызов в очереди (`queued`, состояние
ringing). Карточки других обучающихся не попадают (FR-007). Каждый отказ (400/403/404) — с парным запросом, который даёт 200.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation
from app.models.user import User
from tests.conftest import login_as
from tests.contract.test_v1_operator112 import _draft_for_c010

TITLE = "009 T010 журнал"
IVANOV, PETROVA = "u-005", "u-006"
BACKGROUND_CARD = "card-881412"  # фон журнала: spec/000-фронт/mocks/fixtures/arm-cards.json
ROW_KEYS = {"cardId", "number", "createdAt", "operator", "arm", "whatHappened", "injured", "status", "address", "description", "linked", "chs", "checked", "isOwn"}


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


async def _assignment(v1: AsyncClient, student_ids: list[str] | None = None) -> str:
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"studentIds": student_ids or [IVANOV, PETROVA], "trainingMode": "operator112", "format": "training", "cardIds": ["c-010"], "title": TITLE})
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def _journal(v1: AsyncClient, assignment_id: str, role: str = "student") -> Response:
    await login_as(v1, role)
    return await v1.get("/operator112/journal", params={"assignmentId": assignment_id})


async def _start(v1: AsyncClient, assignment_id: str, role: str = "student") -> str:
    """Поступление вызова c-010 (состояние ringing)."""
    await login_as(v1, role)
    created = await v1.post("/operator112/attempts", json={"assignmentId": assignment_id, "cardId": "c-010"})
    assert created.status_code in (200, 201), created.text
    return created.json()["id"]


async def _own_card(v1: AsyncClient, assignment_id: str, role: str) -> str:
    """Принятый и отправленный вызов: id созданной `incident_cards` (собственная карточка ученика)."""
    attempt_id = await _start(v1, assignment_id, role)
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200
    submitted = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010())
    assert submitted.status_code == 200, submitted.text
    async with get_sessionmaker()() as db:
        return (await db.execute(select(IncidentCard.id).where(IncidentCard.source_attempt_id == attempt_id))).scalar_one()


def _rows(response: Response) -> list[dict[str, Any]]:
    return response.json()["rows"]


async def test_журнал_фон_поля_и_сортировка_дата_вниз(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    response = await _journal(v1, assignment_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == len(body["rows"]) > 0
    assert BACKGROUND_CARD in {row["cardId"] for row in body["rows"]}
    for row in body["rows"]:
        assert ROW_KEYS <= set(row), set(row) - ROW_KEYS
        assert row["isOwn"] is False and "queued" not in row
    dates = [datetime.fromisoformat(row["createdAt"]) for row in body["rows"]]
    assert dates == sorted(dates, reverse=True)


async def test_профиль_без_112_403_пара_ivanov_200(v1: AsyncClient):
    assignment_id = await _assignment(v1)  # задание 112 создаётся до перевода учётки: иначе назначение откажет
    async with get_sessionmaker()() as db:
        (await db.get(User, PETROVA)).training_profile = "dds"
        await db.commit()
    try:
        refused = await _journal(v1, assignment_id, "student2")
        assert refused.status_code == 403, refused.text
        assert (await _journal(v1, assignment_id)).status_code == 200
    finally:
        async with get_sessionmaker()() as db:
            (await db.get(User, PETROVA)).training_profile = None
            await db.commit()


async def test_чужое_задание_404_пара_своё_200(v1: AsyncClient):
    assignment_id = await _assignment(v1, [PETROVA])
    refused = await _journal(v1, assignment_id)
    assert refused.status_code == 404, refused.text
    assert refused.json()["error"]["code"] == "notFound"
    assert (await _journal(v1, assignment_id, "student2")).status_code == 200


async def test_не_ученик_403_пара_ученик_200(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    assert (await _journal(v1, assignment_id, "teacher")).status_code == 403
    assert (await _journal(v1, assignment_id)).status_code == 200


async def test_без_assignmentId_400_пара_с_параметром_200(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    await login_as(v1, "student")
    refused = await v1.get("/operator112/journal")
    assert refused.status_code == 400, refused.text
    assert refused.json()["error"]["code"] == "validationFailed"
    assert (await _journal(v1, assignment_id)).status_code == 200


async def test_карточки_других_учеников_не_попадают(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    own_ivanov = await _own_card(v1, assignment_id, "student")
    own_petrova = await _own_card(v1, assignment_id, "student2")

    ivanov_rows = {row["cardId"]: row for row in _rows(await _journal(v1, assignment_id))}
    assert own_ivanov in ivanov_rows and ivanov_rows[own_ivanov]["isOwn"] is True
    assert own_petrova not in ivanov_rows

    petrova_rows = {row["cardId"]: row for row in _rows(await _journal(v1, assignment_id, "student2"))}
    assert own_petrova in petrova_rows and petrova_rows[own_petrova]["isOwn"] is True
    assert own_ivanov not in petrova_rows
    assert ivanov_rows[own_ivanov]["status"] == "Зарегистрирована"


async def test_вызов_в_очереди_строка_queued(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    attempt_id = await _start(v1, assignment_id)

    rows = _rows(await _journal(v1, assignment_id))
    queued = [row for row in rows if row.get("queued") is True]
    assert len(queued) == 1 and queued[0]["cardId"] == "c-010" and queued[0]["isOwn"] is True
    assert rows[0] is queued[0], "вызов поступил позже всех карточек — строка сверху"
    assert queued[0]["address"] == "" and queued[0]["description"] == "" and queued[0]["whatHappened"] == ""

    assert (await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "callHidden", "payload": {}})).status_code == 201
    assert any(row.get("queued") for row in _rows(await _journal(v1, assignment_id)))

    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200
    assert not any(row.get("queued") for row in _rows(await _journal(v1, assignment_id)))
    assert not any(row.get("queued") for row in _rows(await _journal(v1, assignment_id, "student2")))
