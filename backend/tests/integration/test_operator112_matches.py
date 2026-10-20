"""Спека 009, T053/T054: «Есть карточка с заявителем по этому номеру» — `GET /api/v1/operator112/attempts/{id}/matches`.

Совпадение — по АОН (последние 10 цифр телефона) или по улице, введённой в адресе (fieldChanged `address.street`); без неё —
улица адреса билета. Среди карточек журнала ученика (FR-007): карточки другого обучающегося не возвращаются. Чужая попытка → 403,
пара — своя попытка → 200.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation
from tests.conftest import login_as
from tests.contract.test_v1_operator112 import _draft_for_c010

TITLE = "009 T053 совпадения"
IVANOV, PETROVA = "u-005", "u-006"
TICKET = "c-010"  # АОН +7 (916) 126-34-71, улица «ул. Грина»
OTHER_TICKET = "c-050"  # АОН +7 (916) 320-12-83, улица «ул. Твардовского» — ни с чем в журнале не совпадает
BACKGROUND_CARD = "card-881412"  # фон журнала: «Чертановская улица, 58»


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


async def _assignment(v1: AsyncClient) -> str:
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"studentIds": [IVANOV, PETROVA], "trainingMode": "operator112", "format": "training", "cardIds": [TICKET, OTHER_TICKET], "title": TITLE})
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def _start(v1: AsyncClient, assignment_id: str, card_id: str, role: str = "student") -> str:
    await login_as(v1, role)
    created = await v1.post("/operator112/attempts", json={"assignmentId": assignment_id, "cardId": card_id})
    assert created.status_code in (200, 201), created.text
    attempt_id = created.json()["id"]
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200
    return attempt_id


async def _submit_own(v1: AsyncClient, assignment_id: str, role: str) -> str:
    """Отправленная карточка по билету c-010 (тот же АОН у любого ученика): id `incident_cards`."""
    attempt_id = await _start(v1, assignment_id, TICKET, role)
    submitted = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010())
    assert submitted.status_code == 200, submitted.text
    async with get_sessionmaker()() as db:
        return (await db.execute(select(IncidentCard.id).where(IncidentCard.source_attempt_id == attempt_id))).scalar_one()


async def _matches(v1: AsyncClient, attempt_id: str, role: str = "student") -> Response:
    await login_as(v1, role)
    return await v1.get(f"/operator112/attempts/{attempt_id}/matches")


def _ids(response: Response) -> list[str]:
    return [row["cardId"] for row in response.json()["matches"]]


async def test_совпадение_по_АОН_с_собственной_карточкой(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    own = await _submit_own(v1, assignment_id, "student")
    attempt_id = await _start(v1, assignment_id, TICKET)  # повторный звонок того же заявителя

    response = await _matches(v1, attempt_id)
    assert response.status_code == 200, response.text
    found = {row["cardId"]: row for row in response.json()["matches"]}
    assert own in found and found[own]["isOwn"] is True
    assert "queued" not in found[own]

    other = await _start(v1, assignment_id, OTHER_TICKET)  # другой заявитель: АОН и улица не совпадают
    assert (await _matches(v1, other)).json() == {"matches": []}


async def test_совпадение_по_введённой_улице(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    attempt_id = await _start(v1, assignment_id, TICKET)
    assert BACKGROUND_CARD not in _ids(await _matches(v1, attempt_id))

    await login_as(v1, "student")
    typed = await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "fieldChanged", "payload": {"field": "address.street", "value": "ул. Чертановская"}})
    assert typed.status_code == 201, typed.text
    assert BACKGROUND_CARD in _ids(await _matches(v1, attempt_id))


async def test_карточка_другого_ученика_не_попадает(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    own = await _submit_own(v1, assignment_id, "student")
    foreign = await _submit_own(v1, assignment_id, "student2")  # тот же АОН, но карточка Петровой
    attempt_id = await _start(v1, assignment_id, TICKET)

    ids = _ids(await _matches(v1, attempt_id))
    assert own in ids
    assert foreign not in ids


async def test_чужая_попытка_403_пара_своя_200(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    foreign_attempt = await _start(v1, assignment_id, TICKET, "student2")
    own_attempt = await _start(v1, assignment_id, TICKET, "student")

    refused = await _matches(v1, foreign_attempt)
    assert refused.status_code == 403, refused.text
    assert (await _matches(v1, own_attempt)).status_code == 200
