"""T093: контракт `/api/v1/assignments` и изоляция ролей."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.session import Attempt, Evaluation, TrainingSession
from tests.conftest import login_as


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def cleanup_assignments() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        rows = (await db.execute(Assignment.__table__.select().where(Assignment.title.like("T093%")))).all()
        ids = [row.id for row in rows]
        if ids:
            links = (await db.execute(AssignmentAttempt.__table__.select().where(AssignmentAttempt.assignment_id.in_(ids)))).all()
            attempt_ids = [row.attempt_id for row in links]
            if attempt_ids:
                attempts = (await db.execute(Attempt.__table__.select().where(Attempt.id.in_(attempt_ids)))).all()
                session_ids = list({row.session_id for row in attempts if row.session_id})
                await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
                await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id.in_(ids)))
                await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
                if session_ids:
                    await db.execute(delete(TrainingSession).where(TrainingSession.id.in_(session_ids)))
            await db.execute(delete(AssignmentScenarioVersion).where(AssignmentScenarioVersion.assignment_id.in_(ids)))
            await db.execute(delete(AssignmentStudent).where(AssignmentStudent.assignment_id.in_(ids)))
            await db.execute(delete(Assignment).where(Assignment.id.in_(ids)))
            await db.commit()


def fixed_payload(**updates):
    body = {"studentIds": ["u-005"], "trainingMode": "operator112", "format": "exam", "cardIds": ["c-010", "c-050"], "params": {"passThreshold": 70, "timeLimitSec": 600, "hints": {"enabled": True}}, "title": "T093 экзамен 112"}
    body.update(updates)
    return body


async def test_create_validate_and_role_isolation(v1: AsyncClient):
    assert (await v1.get("/assignments")).status_code == 401
    await login_as(v1, "student")
    assert (await v1.post("/assignments", json=fixed_payload())).status_code == 403
    await login_as(v1, "teacher")
    assert (await v1.post("/assignments", json={**fixed_payload(), "randomRule": {"count": 1}})).status_code == 400
    assert (await v1.post("/assignments", json=fixed_payload(studentIds=["u-404"]))).status_code == 400
    created = await v1.post("/assignments", json=fixed_payload())
    assert created.status_code == 201, created.text
    assignment = created.json()
    assert assignment["id"].startswith("asg-") and assignment["params"]["hints"]["enabled"] is False
    assert (await v1.get("/assignments", params={"teacherId": "u-002"})).status_code == 200
    await login_as(v1, "student2")
    assert (await v1.get(f"/assignments/{assignment['id']}")).status_code == 403
    await login_as(v1, "student")
    own = await v1.get(f"/assignments/{assignment['id']}")
    assert own.status_code == 200 and own.json()["progress"] == []
    assert (await v1.get("/assignments", params={"studentId": "u-006"})).status_code == 403


async def test_random_exam_is_fixed_at_creation(v1: AsyncClient):
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"studentIds": ["u-005"], "trainingMode": "operator112", "format": "exam", "randomRule": {"groups": ["пожар в жилом доме"], "count": 2}, "params": {"passThreshold": 70}, "title": "T093 случайный экзамен"})
    assert created.status_code == 201, created.text
    body = created.json()
    assert len(body["cardIds"]) == 2 and body["randomRule"]["count"] == 2
    assert (await v1.get(f"/assignments/{body['id']}")).json()["cardIds"] == body["cardIds"]

    training = await v1.post("/assignments", json={"studentIds": ["u-005"], "trainingMode": "operator112", "format": "training", "randomRule": {"groups": ["пожар в жилом доме"], "count": 1}, "params": {}, "title": "T093 случайная тренировка"})
    assert training.status_code == 201, training.text
    assert training.json()["cardIds"] == []  # тренировочный набор рассчитывается при start
    await login_as(v1, "student")
    denied = await v1.post("/operator112/attempts", json={"assignmentId": training.json()["id"], "cardId": "c-050"})
    assert denied.status_code == 400
    started = await v1.post(f"/assignments/{training.json()['id']}/start")
    assert started.status_code == 200 and started.json()["attempt"]["cardId"] == "c-004"


async def test_start_progress_and_finish(v1: AsyncClient):
    await login_as(v1, "teacher")
    created = (await v1.post("/assignments", json=fixed_payload())).json()
    await login_as(v1, "student")
    first = await v1.post(f"/assignments/{created['id']}/start")
    assert first.status_code == 200, first.text
    attempt = first.json()["attempt"]
    assert attempt["cardId"] == "c-010" and attempt["hints"]["enabled"] is False
    same = await v1.post(f"/assignments/{created['id']}/start")
    assert same.status_code == 200 and same.json()["attempt"]["id"] == attempt["id"]
    detail = (await v1.get(f"/assignments/{created['id']}")).json()
    assert detail["progress"][0]["state"] == "ringing"
    assert (await v1.post(f"/assignments/{created['id']}/finish")).status_code == 403
    await login_as(v1, "teacher")
    finished = await v1.post(f"/assignments/{created['id']}/finish")
    assert finished.status_code == 200 and finished.json()["state"] == "finished"
    assert (await v1.post(f"/assignments/{created['id']}/start", json={"studentId": "u-005"})).status_code == 409


async def test_assignment_and_logout_actions_are_audited(v1: AsyncClient):
    """T059: создание/выдача/завершение задания и выход попадают в журнал с пользователем и АРМ."""
    await login_as(v1, "admin")
    seen = {e["id"] for e in (await v1.get("/admin/audit", params={"perPage": 100})).json()["items"]}
    await login_as(v1, "teacher")
    created = (await v1.post("/assignments", json=fixed_payload(title="T093 аудит"))).json()
    student = await login_as(v1, "student")
    assert (await v1.post(f"/assignments/{created['id']}/start")).status_code == 200
    assert (await v1.post(f"/assignments/{created['id']}/start")).status_code == 200  # повтор возвращает открытую попытку
    assert (await v1.post("/auth/logout")).status_code == 204
    await login_as(v1, "teacher")
    assert (await v1.post(f"/assignments/{created['id']}/finish")).status_code == 200
    assert (await v1.post(f"/assignments/{created['id']}/finish")).status_code == 200  # идемпотентно, второй записи нет
    await login_as(v1, "admin")
    journal = await v1.get("/admin/audit", params={"perPage": 100})
    assert journal.status_code == 200
    fresh = [e for e in journal.json()["items"] if e["id"] not in seen]
    by_action: dict[str, list[dict]] = {}
    for entry in fresh:
        by_action.setdefault(entry["action"], []).append(entry)
    (create,) = by_action["assignment.create"]
    assert create["userId"] == "u-002" and create["operatorArm"] == 21 and created["id"] in create["details"]
    (start,) = by_action["assignment.start"]  # повторный start не выдаёт билет — записи нет
    assert start["userId"] == student["userId"] and start["role"] == "student" and "c-010" in start["details"]
    (finish,) = by_action["assignment.finish"]
    assert finish["userId"] == "u-002"
    (logout,) = by_action["auth.logout"]
    assert logout["userId"] == student["userId"] and logout["operatorArm"] == 1
    by_type = (await v1.get("/admin/audit", params={"type": "content", "perPage": 100})).json()["items"]
    assert {"assignment.create", "assignment.start", "assignment.finish"} <= {e["action"] for e in by_type}
