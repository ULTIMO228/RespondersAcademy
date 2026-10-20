"""T020 / T017 (фича 019): матрица «специализация × зона» и парный 200 к каждому 403.

Зона 112 — весь роутер `/api/v1/operator112/*` (включая `/streets`). Зона ДДС — компат-маршруты попыток и звонков по карточке
(`/cards/{id}/attempt`, `/attempts/{id}/progress`, `/cards/{id}/calls`). Задание — `POST /api/v1/assignments/{id}/start`
проверяет режим задания и обучающегося. Анонимные пути вне объёма (D4) и не проверяются.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import AsyncIterator
from typing import Any

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentStudent
from app.models.audit import AuditLog
from app.models.card import CardRuntime, IncidentCard
from app.models.session import Attempt, Evaluation, TrainingSession
from app.models.ticket_audio import TicketAudio
from app.models.user import User
from app.services import attempts as attempts_service
from app.services.time import now_iso

SPEC_MESSAGE = "Недоступно для вашей специализации"
PROFILE_112_MESSAGE = "Задание режима 112 недоступно для учётной записи диспетчера ДДС"
BOTH = {"login": "petrova", "password": "student112", "id": "u-006"}  # обе специализации
ONLY_112_IVANOV = {"login": "ivanov", "password": "student112", "id": "u-005"}  # чистый специалист-112 (spec/008)
DDS_ONLY = {"login": "sidorova", "password": "student112", "id": "u-007"}
ONE_112 = {"login": "alekseeva", "password": "student112", "id": "u-016"}
TEACHER = {"login": "morozova", "password": "teacher112"}
TRAINING_112 = "asg-001"  # ivanov, petrova; карточки c-010, c-050

CREATED_ATTEMPTS: list[str] = []

DRAFT = {
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
async def _restore_zone_state() -> AsyncIterator[None]:
    CREATED_ATTEMPTS.clear()
    yield
    async with get_sessionmaker()() as db:
        attempt_ids = set(CREATED_ATTEMPTS) | set((await db.execute(select(Attempt.id).where(Attempt.mode == "operator112"))).scalars().all())
        if attempt_ids:
            await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
            await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.attempt_id.in_(attempt_ids)))
            await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.mode_origin == "operator112"))
        await db.execute(delete(TicketAudio))
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id.like("asg-t007-%")))
        await db.execute(delete(AssignmentStudent).where(AssignmentStudent.assignment_id.like("asg-t007-%")))
        await db.execute(delete(Assignment).where(Assignment.id.like("asg-t007-%")))
        await db.commit()


async def _login(http: AsyncClient, creds: dict[str, str]) -> dict[str, Any]:
    response = await http.post("/api/mock/auth/login", json={"login": creds["login"], "password": creds["password"]})
    assert response.status_code == 200, response.text
    return response.json()


def _assert_zone_denied(response: Any) -> None:
    assert response.status_code == 403, response.text
    assert response.json()["error"]["message"] == SPEC_MESSAGE, response.text


def _assert_profile_denied(response: Any) -> None:
    """Задание чужого режима (spec/008): 403 с профильным текстом вместо общего текста зоны."""
    assert response.status_code == 403, response.text
    assert response.json()["error"]["message"] == PROFILE_112_MESSAGE, response.text


def _now(offset_seconds: int = 0) -> str:
    moment = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))) + dt.timedelta(seconds=offset_seconds)
    return moment.isoformat(timespec="seconds")


async def test_112_zone_refuses_dds_only_student_on_every_route(http: AsyncClient):
    await _login(http, DDS_ONLY)
    for response in (
        await http.post("/api/v1/operator112/attempts", json={"assignmentId": TRAINING_112, "cardId": "c-010"}),
        await http.post("/api/v1/operator112/attempts/att-none/answer"),
        await http.post("/api/v1/operator112/attempts/att-none/events", json={"type": "replay", "payload": {}}),
        await http.get("/api/v1/operator112/attempts/att-none/notification-list"),
        await http.post("/api/v1/operator112/attempts/att-none/submit", json=DRAFT),
        await http.get("/api/v1/operator112/attempts/att-none/evaluation"),
        await http.get("/api/v1/streets", params={"q": "Ленин"}),
    ):
        _assert_zone_denied(response)


async def test_112_zone_opens_for_student_with_112_specialization(http: AsyncClient):
    """Пара к отказам выше: тот же набор маршрутов обучающемуся с обеими специализациями — 200/201."""
    await _login(http, BOTH)
    created = await http.post("/api/v1/operator112/attempts", json={"assignmentId": TRAINING_112, "cardId": "c-010"})
    assert created.status_code == 201, created.text
    attempt_id = created.json()["id"]
    CREATED_ATTEMPTS.append(attempt_id)
    assert (await http.post("/api/v1/operator112/attempts", json={"assignmentId": TRAINING_112, "cardId": "c-010"})).status_code == 200
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/answer")).status_code == 200
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "replay", "payload": {}})).status_code == 201
    assert (await http.get(f"/api/v1/operator112/attempts/{attempt_id}/notification-list")).status_code == 200
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=DRAFT)).status_code == 200
    assert (await http.get(f"/api/v1/operator112/attempts/{attempt_id}/evaluation")).status_code == 200
    assert (await http.get("/api/v1/streets", params={"q": "Ленин"})).status_code == 200


async def test_started_112_attempt_remains_available_after_specialization_removed(http: AsyncClient):
    await _login(http, BOTH)
    created = await http.post("/api/v1/operator112/attempts", json={"assignmentId": TRAINING_112, "cardId": "c-010"})
    assert created.status_code == 201, created.text
    attempt_id = created.json()["id"]
    CREATED_ATTEMPTS.append(attempt_id)
    async with get_sessionmaker()() as db:
        user = await db.get(User, BOTH["id"])
        assert user is not None
        original = list(user.specializations or [])
        user.specializations = ["dds"]
        await db.commit()
    try:
        assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/answer")).status_code == 200
        assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json={"type": "fieldChanged", "payload": {"field": "description", "value": "Принят вызов"}})).status_code == 201
        assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/submit", json=DRAFT)).status_code == 200
        assert (await http.get(f"/api/v1/operator112/attempts/{attempt_id}/evaluation")).status_code == 200
        denied = await http.post("/api/v1/operator112/attempts", json={"assignmentId": TRAINING_112, "cardId": "c-010"})
        _assert_zone_denied(denied)
    finally:
        async with get_sessionmaker()() as db:
            user = await db.get(User, BOTH["id"])
            assert user is not None
            user.specializations = original
            await db.commit()


async def test_dds_card_attempt_refuses_112_only_student_and_teacher_target(http: AsyncClient):
    await _login(http, ONE_112)
    _assert_zone_denied(await http.post("/api/mock/cards/c-010/attempt", json={"studentId": "u-016"}))
    await _login(http, TEACHER)
    _assert_zone_denied(await http.post("/api/mock/cards/c-010/attempt", json={"studentId": "u-016"}))  # целевой обучающийся
    opened = await http.post("/api/mock/cards/c-010/attempt", json={"studentId": "u-007"})  # пара: учитель открывает ДДС-обучающемуся
    assert opened.status_code in (200, 201), opened.text
    CREATED_ATTEMPTS.append(opened.json()["attempt"]["id"])
    await _login(http, DDS_ONLY)
    assert (await http.post("/api/mock/cards/c-010/attempt", json={"studentId": "u-007"})).status_code == 200


async def test_dds_progress_and_calls_require_dds_specialization(http: AsyncClient):
    await _login(http, DDS_ONLY)
    opened = await http.post("/api/mock/cards/c-010/attempt", json={"studentId": "u-007"})
    assert opened.status_code in (200, 201), opened.text
    attempt_id = opened.json()["attempt"]["id"]
    CREATED_ATTEMPTS.append(attempt_id)
    progressed = await http.post(f"/api/mock/attempts/{attempt_id}/progress", json={"enteredText": {"dispatcherAction": "Направлена СМП"}})
    assert progressed.status_code == 200, progressed.text
    call = {"studentId": "u-007", "toNumber": "301", "startedAt": _now(-40), "endedAt": _now(-20), "transcript": [{"speaker": "ai", "text": "Слушаю вас", "at": _now(-30)}]}
    assert (await http.post("/api/mock/cards/c-010/calls", json=call)).status_code == 201

    # Старые данные: ДДС-попытка обучающегося, у которого осталась только специализация 112 (открыта сервисом до фичи 019).
    async with get_sessionmaker()() as db:
        old, _ = await attempts_service.open_attempt(db, "c-010", {"studentId": "u-016"})
        await db.commit()
    old_id = old["attempt"]["id"]
    CREATED_ATTEMPTS.append(old_id)
    await _login(http, ONE_112)
    _assert_zone_denied(await http.post(f"/api/mock/attempts/{old_id}/progress", json={"enteredText": {"dispatcherAction": "чужая правка"}}))
    _assert_zone_denied(await http.post("/api/mock/cards/c-010/calls", json={**call, "studentId": "u-016"}))


async def test_card_links_and_sms_reads_follow_card_specialization(http: AsyncClient):
    async with get_sessionmaker()() as db:
        db.add(IncidentCard(id="c-997", ticket_no=997, situation_no=1, group="Газ", summary="Запах газа",
                            address="Москва", caller={"phone": "70000000000"}, expected_services=[], expected_tags=[],
                            mode_origin="operator112"))
        await db.commit()
    await _login(http, DDS_ONLY)
    _assert_zone_denied(await http.post("/api/mock/cards/c-997/links"))
    _assert_zone_denied(await http.get("/api/mock/cards/c-997/sms"))
    await _login(http, ONE_112)
    assert (await http.post("/api/mock/cards/c-997/links")).status_code == 200
    assert (await http.get("/api/mock/cards/c-997/sms")).status_code == 200


async def test_assignment_start_checks_the_mode_of_the_assignment(http: AsyncClient):
    async with get_sessionmaker()() as db:
        for assignment_id, mode in (("asg-t007-old112", "operator112"), ("asg-t007-chain", "chain")):
            db.add(Assignment(id=assignment_id, teacher_id="u-002", student_ids=["u-016" if mode == "chain" else "u-007"], training_mode=mode,
                              format="training", card_ids=["c-010"], params={}, state="active", created_at=now_iso(), title=f"T007 {mode}"))
            db.add(AssignmentStudent(assignment_id=assignment_id, student_id="u-016" if mode == "chain" else "u-007"))
        await db.commit()
    # 112-задание, назначенное ДДС-обучающемуся (старые данные): отказ с профильным текстом spec/008 и записью аудита
    await _login(http, DDS_ONLY)
    _assert_profile_denied(await http.post("/api/v1/assignments/asg-t007-old112/start"))
    async with get_sessionmaker()() as db:
        audited = (await db.execute(select(AuditLog).where(AuditLog.action == "access.denied.specialization",
                                                            AuditLog.user_id == "u-007"))).scalars().all()
    assert any("старт задания" in row.details for row in audited)
    # цепочка выведена (spec/007 SASHA): старое задание только для просмотра — 409 раньше проверки зоны
    await _login(http, ONE_112)
    assert (await http.post("/api/v1/assignments/asg-t007-chain/start")).status_code == 409
    # пара: учитель запускает 112-задание за обучающегося с 112 — 200
    await _login(http, TEACHER)
    _assert_profile_denied(await http.post("/api/v1/assignments/asg-t007-old112/start", json={"studentId": "u-007"}))
    started = await http.post(f"/api/v1/assignments/{TRAINING_112}/start", json={"studentId": "u-005"})
    assert started.status_code == 200, started.text
    CREATED_ATTEMPTS.append(started.json()["attempt"]["id"])


async def test_session_and_roster_expose_specializations(http: AsyncClient):
    await _login(http, BOTH)
    assert (await http.get("/api/mock/auth/session")).json()["specializations"] == ["operator112", "dds"]
    await _login(http, ONLY_112_IVANOV)
    assert (await http.get("/api/mock/auth/session")).json()["specializations"] == ["operator112"]
    await _login(http, DDS_ONLY)
    assert (await http.get("/api/mock/auth/session")).json()["specializations"] == ["dds"]
    await _login(http, TEACHER)
    assert "specializations" not in (await http.get("/api/mock/auth/session")).json()
    roster = {row["id"]: row for row in (await http.get("/api/mock/users", params={"role": "student"})).json()}
    assert roster["u-016"]["specializations"] == ["operator112"]
    assert roster["u-005"]["specializations"] == ["operator112"]
    assert roster["u-006"]["specializations"] == ["operator112", "dds"]
    assert roster["u-010"]["specializations"] == ["dds"]


async def test_denials_are_audited_without_call_texts(http: AsyncClient):
    await _login(http, DDS_ONLY)
    _assert_zone_denied(await http.get("/api/v1/streets", params={"q": "Ленин"}))
    async with get_sessionmaker()() as db:
        rows = (await db.execute(select(AuditLog).where(AuditLog.action == "access.denied.specialization", AuditLog.user_id == "u-007"))).scalars().all()
    assert rows and all("Ленин" not in row.details for row in rows)
    await _login(http, BOTH)
    assert (await http.get("/api/v1/streets", params={"q": "Ленин"})).status_code == 200


async def test_compat_attempt_takes_the_zone_of_the_session_mode(http: AsyncClient):
    """Сессия режима 112 (`trainingMode=operator112`): компат-маршрут открывает попытку режима 112 — зона 112, а не ДДС."""
    issued = _now(-60)
    session_id = "ses-t007-112"
    async with get_sessionmaker()() as db:
        db.add(TrainingSession(id=session_id, teacher_id="u-002", student_ids=["u-006", "u-007"], scenario_ids=[], mode="practice",
                               card_source="generated", card_flow=[{"cardId": "c-010", "studentId": "u-007", "issuedAt": issued},
                                                                  {"cardId": "c-010", "studentId": "u-006", "issuedAt": issued}],
                               state="running", started_at=now_iso(), plan=None, paused_at=None, parked=[], training_mode="operator112",
                               format="training", exam=None))
        await db.commit()
    attempt_id: str | None = None
    try:
        await _login(http, DDS_ONLY)
        _assert_zone_denied(await http.post("/api/mock/cards/c-010/attempt", json={"studentId": "u-007", "issuedAt": issued}))
        await _login(http, BOTH)
        opened = await http.post("/api/mock/cards/c-010/attempt", json={"studentId": "u-006", "issuedAt": issued})
        assert opened.status_code == 201, opened.text
        attempt_id = opened.json()["attempt"]["id"]
        async with get_sessionmaker()() as db:
            assert (await db.get(Attempt, attempt_id)).mode == "operator112"
    finally:
        async with get_sessionmaker()() as db:
            if attempt_id is not None:
                await db.execute(delete(Attempt).where(Attempt.id == attempt_id))
            await db.execute(delete(TrainingSession).where(TrainingSession.id == session_id))
            await db.commit()


async def test_dds_fields_are_read_only_but_dds_status_remains_writable(http: AsyncClient):
    card_id = "c-997"
    async with get_sessionmaker()() as db:
        db.add(IncidentCard(id=card_id, ticket_no=999007, situation_no=1, group="Тест", summary="", address="",
                            caller={}, expected_services=[], expected_tags=[], mode_origin="seed"))
        await db.commit()
    try:
        await _login(http, ONE_112)
        _assert_zone_denied(await http.post(f"/api/mock/cards/{card_id}/status", json={"ddsStatus": "accepted"}))
        await _login(http, DDS_ONLY)
        body = {"text": "Перезвонить", "remindAt": "2026-10-20T14:00:00+03:00"}
        _assert_zone_denied(await http.post(f"/api/mock/cards/{card_id}/reminders", json=body))
        _assert_zone_denied(await http.post(f"/api/mock/cards/{card_id}/sms", json={"text": "На место выехали"}))
        status = await http.post(f"/api/mock/cards/{card_id}/status", json={"ddsStatus": "accepted"})
        assert status.status_code == 200, status.text
        line = await http.post(f"/api/mock/cards/{card_id}/worklines", json={"confirmed": True, "service": "ДДС", "calledTo": "101", "person": "Оператор", "message": "Принято"})
        assert line.status_code == 201, line.text
    finally:
        async with get_sessionmaker()() as db:
            await db.execute(delete(CardRuntime).where(CardRuntime.card_id == card_id))
            await db.execute(delete(IncidentCard).where(IncidentCard.id == card_id))
            await db.commit()


async def test_112_field_write_on_existing_attempt_is_refused_for_dds_student(http: AsyncClient):
    """T043: запись полей 112 (`fieldChanged`) в чужую попытку 112 от обучающегося только с ДДС → 403; владелец попытки → 201."""
    await _login(http, BOTH)
    created = await http.post("/api/v1/operator112/attempts", json={"assignmentId": TRAINING_112, "cardId": "c-010"})
    assert created.status_code == 201, created.text
    attempt_id = created.json()["id"]
    CREATED_ATTEMPTS.append(attempt_id)
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/answer")).status_code == 200
    field = {"type": "fieldChanged", "payload": {"field": "address.formal", "value": "Москва, улица Грина"}}
    await _login(http, DDS_ONLY)
    _assert_zone_denied(await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json=field))
    await _login(http, BOTH)  # пара: владелец попытки с специализацией 112 пишет поле — 201
    assert (await http.post(f"/api/v1/operator112/attempts/{attempt_id}/events", json=field)).status_code == 201


async def test_112_card_notes_and_sms_are_open_for_112_pair_and_refused_for_dds_student(http: AsyncClient):
    """T043: «Напоминание» и SMS по карточке — от ДДС-обучающегося 403; пара — обучающийся со специализацией 112 получает 201."""
    card_id = "c-996"
    async with get_sessionmaker()() as db:
        db.add(IncidentCard(id=card_id, ticket_no=996007, situation_no=1, group="Тест", summary="", address="",
                            caller={}, expected_services=[], expected_tags=[], mode_origin="seed"))
        await db.commit()
    reminder = {"text": "Перезвонить", "remindAt": "2026-10-20T14:00:00+03:00"}
    try:
        await _login(http, DDS_ONLY)
        _assert_zone_denied(await http.post(f"/api/mock/cards/{card_id}/reminders", json=reminder))
        _assert_zone_denied(await http.post(f"/api/mock/cards/{card_id}/sms", json={"text": "На место выехали"}))
        await _login(http, ONE_112)
        created_reminder = await http.post(f"/api/mock/cards/{card_id}/reminders", json=reminder)
        assert created_reminder.status_code == 201, created_reminder.text
        created_sms = await http.post(f"/api/mock/cards/{card_id}/sms", json={"text": "На место выехали"})
        assert created_sms.status_code == 201, created_sms.text
    finally:
        async with get_sessionmaker()() as db:
            await db.execute(delete(CardRuntime).where(CardRuntime.card_id == card_id))
            await db.execute(delete(IncidentCard).where(IncidentCard.id == card_id))
            await db.commit()
