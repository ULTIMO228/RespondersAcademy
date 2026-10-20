"""T034 (фича 007, US2): исходы вызова режима 112 — «Нет контакта», «Срыв звонка» и перевод вызова.

«Нет контакта» и «Срыв звонка» — события попытки: пишутся в аудит (`card.noContact` / `card.callDropped`) и попадают
в входные данные оценщика `ml/assess/operator112.py` (компонент `activity`, `callOutcomes`). Перевод вызова — T041 (второй
эшелон), пока не реализован: тест помечен `xfail(strict=True)` и не подгоняется под код.

Отказы (403/409) стоят рядом с парными запросами, которые обязаны вернуть 201/200.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import AssignmentAttempt
from app.models.audit import AuditLog
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation
from app.models.ticket_audio import TicketAudio

TRAINING = "asg-001"  # ivanov (u-005) — владелец попытки; билет c-010; преподаватель u-002
OWNER = {"login": "ivanov", "password": "student112"}
TEACHER = {"login": "morozova", "password": "teacher112"}
OWNER_ID = "u-005"

DRAFT: dict[str, Any] = {
    "notificationConfirmed": True,
    "applicant": {"name": "Сидорова Анна Викторовна", "status": "очевидец"},
    "phones": {"aon": "+7 (916) 126-34-71", "provided": "+7 (916) 126-34-71", "onSite": ""},
    "address": {"formal": "Россия, Москва, улица Грина, дом неизвестен, библиотека № 19", "street": "ул. Грина", "house": "", "source": "directory", "descriptive": "в доме библиотека № 19"},
    "what": {"pollAnswers": "Пожар, горит балкон и окна на 13 этаже", "signs": ["жилой дом", "балкон", "открытое пламя"], "finalType": "", "classifierCode": "1050201", "casualties": {"injured": False, "ambulanceRefused": False, "blocked": False}},
    "description": "Со слов заявителя: горит балкон и два окна на 13-м этаже, открытое пламя, наблюдают с улицы.",
    "emergency": {"chs": False, "chp": False},
    "notificationList": [],
}


@pytest_asyncio.fixture
async def http(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def _restore_state() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        attempt_ids = list((await db.execute(select(Attempt.id).where(Attempt.mode == "operator112"))).scalars().all())
        if attempt_ids:
            await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
            await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.attempt_id.in_(attempt_ids)))
            await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.mode_origin == "operator112"))
        await db.execute(delete(TicketAudio))
        await db.commit()


async def _login(http: AsyncClient, creds: dict[str, str]) -> None:
    response = await http.post("/api/mock/auth/login", json={"login": creds["login"], "password": creds["password"]})
    assert response.status_code == 200, response.text


async def _create_attempt(http: AsyncClient) -> str:
    await _login(http, OWNER)
    created = await http.post("/api/v1/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-010"})
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def _post_event(http: AsyncClient, attempt_id: str, event_type: str) -> Any:
    return await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": event_type})


async def _audit_rows(action: str, attempt_id: str) -> list[AuditLog]:
    async with get_sessionmaker()() as db:
        rows = (await db.execute(select(AuditLog).where(AuditLog.action == action, AuditLog.details == f"Попытка 112 {attempt_id}: {action.removeprefix('card.')}"))).scalars().all()
        return list(rows)


async def test_call_outcomes_are_recorded_and_audited_before_submit(http: AsyncClient):
    attempt_id = await _create_attempt(http)

    # Отказ: преподаватель не отмечает исходы вызова за обучающегося — 403.
    await _login(http, TEACHER)
    teacher = await _post_event(http, attempt_id, "noContact")
    assert teacher.status_code == 403, teacher.text
    assert teacher.json()["error"]["code"] == "forbidden"

    # Пара: тот же запрос владельца попытки — 201; вызов из «Поступил» переходит в «Ответ» (состояние answered).
    await _login(http, OWNER)
    no_contact = await _post_event(http, attempt_id, "noContact")
    assert no_contact.status_code == 201, no_contact.text
    assert no_contact.json()["type"] == "noContact"
    async with get_sessionmaker()() as db:
        assert (await db.get(Attempt, attempt_id)).state == "answered"
    audit = await _audit_rows("card.noContact", attempt_id)
    assert len(audit) == 1 and audit[0].user_id == OWNER_ID and audit[0].role == "student" and audit[0].card_id == "c-010"

    dropped = await _post_event(http, attempt_id, "callDropped")
    assert dropped.status_code == 201, dropped.text
    assert len(await _audit_rows("card.callDropped", attempt_id)) == 1

    # После отправки карточки исходы уже не принимаются.
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=DRAFT)).status_code == 200
    late = await _post_event(http, attempt_id, "noContact")
    assert late.status_code == 409, late.text
    assert late.json()["error"]["code"] == "invalidTransition"


@pytest.mark.parametrize(
    ("outcome", "expected_outcomes", "expected_card_status"),
    [("noContact", ["noContact"], "completed"), ("callDropped", ["callDropped"], "completed"), (None, [], "registered")],
)
async def test_call_outcome_reaches_assessment_input(http: AsyncClient, outcome: str | None, expected_outcomes: list[str], expected_card_status: str):
    attempt_id = await _create_attempt(http)
    if outcome is None:
        # Пара без исхода: обычный ответ на вызов — 200 и отсутствие исходов в оценке.
        assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/answer")).status_code == 200
    else:
        assert (await _post_event(http, attempt_id, outcome)).status_code == 201

    submitted = await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=DRAFT)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["card"]["cardStatus"] == expected_card_status

    async with get_sessionmaker()() as db:
        evaluation = (await db.execute(select(Evaluation).where(Evaluation.attempt_id == attempt_id))).scalar_one()
    activity = evaluation.components["components"]["activity"]
    assert activity["details"]["callOutcomes"] == expected_outcomes
    assert activity["details"]["applicable"] is False  # исходы учитываются как информация, без штрафа по умолчанию


@pytest.mark.xfail(
    strict=True,
    reason="T041 не сделано: тип события transfer отсутствует в EventType (backend/app/schemas/v1/operator112.py:19), сервер отвечает 400 validationFailed",
)
async def test_call_transfer_is_recorded_as_event(http: AsyncClient):
    attempt_id = await _create_attempt(http)
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/answer")).status_code == 200
    transferred = await http.post(
        f"/api/v1/operator112/attempts/{attempt_id}/events",
        json={"type": "transfer", "payload": {"target": "service", "serviceId": "svc-103", "hold": True}},
    )
    assert transferred.status_code == 201, transferred.text
    async with get_sessionmaker()() as db:
        events = (await db.get(Attempt, attempt_id)).events or []
    assert any(event.get("type") == "transfer" for event in events)
