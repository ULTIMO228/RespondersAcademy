"""Спека 009, T007: новые типы событий попытки 112 (typeAdded, typeRemoved, serviceRemoved, linkAdded, linkRemoved,
linkPrimary, callHidden — data-model → OperatorEventType).

`linkAdded` принимает только карточку из журнала ученика (FR-007): фон журнала (`ArmCardFixture`) или собственная
карточка ученика режима 112. Карточка другого обучающегося или несуществующая → 400. Каждому отказу — парный успех.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation
from tests.conftest import login_as
from tests.contract.test_v1_operator112 import _draft_for_c010

TITLE = "009 T007 события"
IVANOV, PETROVA = "u-005", "u-006"
BACKGROUND_CARD = "card-881412"  # фон журнала: spec/000-фронт/mocks/fixtures/arm-cards.json


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
    created = await v1.post("/assignments", json={"studentIds": [IVANOV, PETROVA], "trainingMode": "operator112", "format": "training", "cardIds": ["c-010"], "title": TITLE})
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def _answered(v1: AsyncClient, assignment_id: str, role: str = "student") -> str:
    """Принятый вызов c-010 под учёткой `role` (student = ivanov, student2 = petrova)."""
    await login_as(v1, role)
    created = await v1.post("/operator112/attempts", json={"assignmentId": assignment_id, "cardId": "c-010"})
    assert created.status_code in (200, 201), created.text
    attempt_id = created.json()["id"]
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200
    return attempt_id


async def _own_card(v1: AsyncClient, assignment_id: str, role: str) -> str:
    """Отправленная карточка 112 ученика: id созданной `incident_cards`."""
    attempt_id = await _answered(v1, assignment_id, role)
    submitted = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010())
    assert submitted.status_code == 200, submitted.text
    async with get_sessionmaker()() as db:
        card_id = (await db.execute(select(IncidentCard.id).where(IncidentCard.source_attempt_id == attempt_id))).scalar_one()
    return card_id


async def _ringing(v1: AsyncClient, assignment_id: str) -> str:
    """Поступление вызова c-010 без ответа (состояние ringing)."""
    await login_as(v1, "student")
    created = await v1.post("/operator112/attempts", json={"assignmentId": assignment_id, "cardId": "c-010"})
    assert created.status_code in (200, 201), created.text
    assert created.json()["state"] == "ringing"
    return created.json()["id"]


async def _event(v1: AsyncClient, attempt_id: str, event_type: str, payload: dict[str, Any] | None = None):
    return await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": event_type, "payload": payload or {}})


NEW_EVENTS: list[tuple[str, dict[str, Any]]] = [
    ("typeAdded", {"finalType": "Пожар", "classifierCode": "1.1"}),
    ("typeRemoved", {"index": 1}),
    ("serviceRemoved", {"serviceId": "svc-01"}),
    ("linkAdded", {"cardId": BACKGROUND_CARD}),
    ("linkPrimary", {"cardId": BACKGROUND_CARD}),
    ("linkRemoved", {"cardId": BACKGROUND_CARD}),
    ("callHidden", {}),
]


@pytest.mark.parametrize(("event_type", "payload"), NEW_EVENTS, ids=[name for name, _ in NEW_EVENTS])
async def test_новый_тип_события_принимается(v1: AsyncClient, event_type: str, payload: dict[str, Any]):
    attempt_id = await _answered(v1, await _assignment(v1))
    response = await _event(v1, attempt_id, event_type, payload)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["type"] == event_type
    assert body["payload"] == payload


async def test_неизвестный_тип_по_прежнему_400(v1: AsyncClient):
    attempt_id = await _answered(v1, await _assignment(v1))
    refused = await _event(v1, attempt_id, "linkMoved", {"cardId": BACKGROUND_CARD})
    assert refused.status_code == 400, refused.text
    assert refused.json()["error"]["code"] == "validationFailed"
    assert (await _event(v1, attempt_id, "linkAdded", {"cardId": BACKGROUND_CARD})).status_code == 201


@pytest.mark.parametrize(
    ("event_type", "bad", "good"),
    [
        ("typeAdded", {"classifierCode": "1.1"}, {"finalType": "Пожар"}),
        ("typeRemoved", {"index": "один"}, {"index": 1}),
        ("serviceRemoved", {}, {"serviceId": "svc-01"}),
        ("linkAdded", {}, {"cardId": BACKGROUND_CARD}),
        ("linkRemoved", {"cardId": "  "}, {"cardId": BACKGROUND_CARD}),
        ("linkPrimary", {"cardId": 7}, {"cardId": BACKGROUND_CARD}),
    ],
    ids=["typeAdded", "typeRemoved", "serviceRemoved", "linkAdded", "linkRemoved", "linkPrimary"],
)
async def test_форма_payload_новых_событий(v1: AsyncClient, event_type: str, bad: dict[str, Any], good: dict[str, Any]):
    attempt_id = await _answered(v1, await _assignment(v1))
    refused = await _event(v1, attempt_id, event_type, bad)
    assert refused.status_code == 400, refused.text
    assert (await _event(v1, attempt_id, event_type, good)).status_code == 201


async def test_linkAdded_карточки_вне_журнала_400(v1: AsyncClient):
    attempt_id = await _answered(v1, await _assignment(v1))
    refused = await _event(v1, attempt_id, "linkAdded", {"cardId": "card-000000"})
    assert refused.status_code == 400, refused.text
    assert refused.json()["error"]["code"] == "validationFailed"
    assert (await _event(v1, attempt_id, "linkAdded", {"cardId": BACKGROUND_CARD})).status_code == 201


async def test_linkAdded_своей_карточки_112_201_чужой_400(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    own = await _own_card(v1, assignment_id, "student")
    foreign = await _own_card(v1, assignment_id, "student2")
    attempt_id = await _answered(v1, assignment_id, "student")
    refused = await _event(v1, attempt_id, "linkAdded", {"cardId": foreign})
    assert refused.status_code == 400, refused.text
    assert (await _event(v1, attempt_id, "linkAdded", {"cardId": own})).status_code == 201


@pytest.mark.parametrize(
    ("event_type", "payload"),
    [("fieldChanged", {"field": "applicant.name", "value": "Сидорова"}), ("signSelected", {"signs": []}), ("hintShown", {}), ("linkAdded", {"cardId": BACKGROUND_CARD})],
    ids=["fieldChanged", "signSelected", "hintShown", "linkAdded"],
)
async def test_в_ringing_кроме_callHidden_409(v1: AsyncClient, event_type: str, payload: dict[str, Any]):
    """Спека 009: до приёма вызова принимается только «callHidden» (окно закрыто «×»); прочие события — 409."""
    attempt_id = await _ringing(v1, await _assignment(v1))
    refused = await _event(v1, attempt_id, event_type, payload)
    assert refused.status_code == 409, refused.text
    assert refused.json()["error"]["code"] == "invalidTransition"
    assert (await _event(v1, attempt_id, "callHidden")).status_code == 201


async def test_callHidden_в_ringing_201_и_после_ответа_201(v1: AsyncClient):
    attempt_id = await _ringing(v1, await _assignment(v1))
    hidden = await _event(v1, attempt_id, "callHidden")
    assert hidden.status_code == 201, hidden.text
    assert hidden.json()["type"] == "callHidden"
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200
    assert (await _event(v1, attempt_id, "callHidden")).status_code == 201


async def test_событие_в_чужую_попытку_403(v1: AsyncClient):
    assignment_id = await _assignment(v1)
    foreign_attempt = await _answered(v1, assignment_id, "student2")
    own_attempt = await _answered(v1, assignment_id, "student")
    assert (await _event(v1, foreign_attempt, "callHidden")).status_code == 403
    assert (await _event(v1, own_attempt, "callHidden")).status_code == 201
