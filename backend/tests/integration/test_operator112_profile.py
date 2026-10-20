"""Профиль режима обучаемого (spec/008) через специализации (спека 021): ivanov (u-005) — чистый специалист-112.

US1 — курсант не видит и не запускает задания/занятия ДДС; US2 — преподаватель не может их назначить.
Задание и занятие ДДС «до фичи» вставляются прямо в БД: через API их теперь не создать.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.session import Attempt, Evaluation, TrainingSession
from app.models.user import User
from app.services.time import now_iso
from tests.conftest import login_as

IVANOV, PETROVA = "u-005", "u-006"
LEGACY_DDS = "asg-008-dds-old"
LEGACY_SESSION = "ses-008-dds-old"
LEGACY_ATTEMPT = "a-008-dds-old"
BLOCKED = "Задание режима ДДС недоступно для учётной записи специалиста-112"


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture
async def mock(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock") as client:
        yield client


@pytest_asyncio.fixture
async def legacy_dds(app) -> AsyncIterator[None]:
    """Задание и занятие ДДС, выданные ivanov до перевода в специалисты-112, с одной оценённой попыткой."""
    async with get_sessionmaker()() as db:
        db.add_all([
            Assignment(id=LEGACY_DDS, teacher_id="u-002", student_ids=[IVANOV], training_mode="dds", format="training",
                       card_ids=["c-010"], params={}, state="active", created_at=now_iso(), title="Старое ДДС"),
            TrainingSession(id=LEGACY_SESSION, teacher_id="u-002", student_ids=[IVANOV], scenario_ids=[],
                            mode="practice", card_source="generated", card_flow=[], state="running",
                            started_at=now_iso(), plan={}, paused_at=None, parked=[], training_mode="dds",
                            format="training"),
            Attempt(id=LEGACY_ATTEMPT, session_id=LEGACY_SESSION, card_id="c-010", student_id=IVANOV, mode="dds",
                    opened_at=now_iso(), completed_at=now_iso(), primary_reaction_ms=0, statuses=[],
                    services_called=[], full_processing_ms=0, entered_text={}, calls=[], seq=0, state="submitted"),
            AssignmentAttempt(assignment_id=LEGACY_DDS, student_id=IVANOV, card_id="c-010",
                              attempt_id=LEGACY_ATTEMPT, state="submitted"),
            Evaluation(attempt_id=LEGACY_ATTEMPT, time_score=80, correctness_score=70, grammar_score=90,
                       semantic_score=60, total_score=72, generated_at=now_iso(), mode="dds"),
        ])
        await db.commit()
    yield
    async with get_sessionmaker()() as db:
        await db.execute(delete(Evaluation).where(Evaluation.attempt_id == LEGACY_ATTEMPT))
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id == LEGACY_DDS))
        await db.execute(delete(Attempt).where(Attempt.id == LEGACY_ATTEMPT))
        await db.execute(delete(TrainingSession).where(TrainingSession.id == LEGACY_SESSION))
        await db.execute(delete(Assignment).where(Assignment.id == LEGACY_DDS))
        await db.commit()


async def test_ivanov_в_сидах_специалист_112(v1: AsyncClient) -> None:
    await login_as(v1, "student")
    me = (await v1.get("/me")).json()
    assert me["specializations"] == ["operator112"] and "trainingProfile" not in me
    assert me["service"] == "ЦОВ системы-112"
    assert me["group"] == "ДДС-01" and me["armNumber"] == 1


# --- US1: курсант-112 не видит и не запускает ДДС ---------------------------------------------------------------


async def test_курсант_112_не_видит_задание_ддс(v1: AsyncClient, legacy_dds: None) -> None:
    await login_as(v1, "student")
    rows = (await v1.get("/assignments")).json()
    assert LEGACY_DDS not in {row["id"] for row in rows}
    assert all(row["trainingMode"] != "dds" for row in rows)

    detail = await v1.get(f"/assignments/{LEGACY_DDS}")
    assert detail.status_code == 403 and BLOCKED in detail.text
    started = await v1.post(f"/assignments/{LEGACY_DDS}/start")
    assert started.status_code == 403 and BLOCKED in started.text


async def test_преподаватель_видит_историю_ддс_ivanov(v1: AsyncClient, legacy_dds: None) -> None:
    await login_as(v1, "teacher")
    detail = await v1.get(f"/assignments/{LEGACY_DDS}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["progress"][0]["score"] == 72
    refused = await v1.post(f"/assignments/{LEGACY_DDS}/start", json={"studentId": IVANOV})
    assert refused.status_code == 403 and BLOCKED in refused.text


async def test_кабинет_и_рекомендации_только_112(v1: AsyncClient, legacy_dds: None) -> None:
    await login_as(v1, "student")
    history = (await v1.get("/me/history")).json()
    assert all(item["mode"] == "operator112" for item in history["items"])
    assert LEGACY_ATTEMPT not in {item["attemptId"] for item in history["items"]}
    assert (await v1.get("/me/history", params={"mode": "dds"})).json()["items"] == []
    analytics = (await v1.get("/me/analytics")).json()
    assert analytics["byMode"]["dds"]["count"] == 0

    focus = (await v1.get("/me/focus")).json()
    assert focus["mode"] in (None, "operator112")

    items = (await v1.get("/me/recommendations")).json()
    assert not any(item["kind"] == "mode" and item["targetId"] == "dds" for item in items)


async def test_занятие_ддс_скрыто_и_не_открывается(mock: AsyncClient, legacy_dds: None) -> None:
    await login_as(mock, "student")
    sessions = (await mock.get("/sessions", params={"studentId": IVANOV})).json()
    rows = sessions if isinstance(sessions, list) else sessions.get("items", [])
    assert LEGACY_SESSION not in {row["id"] for row in rows}


# --- US2: назначить ivanov ДДС нельзя ------------------------------------------------------------------------------


async def test_назначить_ддс_специалисту_112_нельзя(v1: AsyncClient) -> None:
    await login_as(v1, "teacher")
    body = {"trainingMode": "dds", "format": "training", "cardIds": ["c-010"], "title": "008 ДДС"}
    alone = await v1.post("/assignments", json={**body, "studentIds": [IVANOV]})
    assert alone.status_code == 400
    assert "Задание режима ДДС нельзя назначить: профиль специалиста-112 — Иванов С. П." in alone.text
    mixed = await v1.post("/assignments", json={**body, "studentIds": [IVANOV, PETROVA]})
    assert mixed.status_code == 400 and "Иванов С. П." in mixed.text and "Петрова" not in mixed.text


async def test_режим_112_ivanov_и_оба_режима_у_petrova_с_двумя_специализациями(v1: AsyncClient) -> None:
    await login_as(v1, "teacher")
    for student, mode in ((IVANOV, "operator112"), (PETROVA, "operator112"), (PETROVA, "dds")):
        created = await v1.post("/assignments", json={"studentIds": [student], "trainingMode": mode,
                                                      "format": "training", "cardIds": ["c-010"], "title": "008"})
        assert created.status_code == 201, created.text


async def test_занятие_ддс_со_специалистом_112_не_создаётся(mock: AsyncClient) -> None:
    await login_as(mock, "teacher")
    body = {"teacherId": "u-002", "scenarioIds": ["s-005"], "mode": "practice", "cardSource": "generated"}
    refused = await mock.post("/sessions", json={**body, "studentIds": [IVANOV], "trainingMode": "dds"})
    assert refused.status_code == 400 and "Иванов С. П." in refused.text
    allowed = await mock.post("/sessions", json={**body, "studentIds": [IVANOV], "trainingMode": "operator112"})
    assert allowed.status_code == 201, allowed.text


async def test_профиль_читается_из_бд(app) -> None:
    async with get_sessionmaker()() as db:
        assert (await db.get(User, IVANOV)).specializations == ["operator112"]
        assert (await db.get(User, PETROVA)).specializations == ["operator112", "dds"]
