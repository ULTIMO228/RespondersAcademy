"""T093: экзаменационный поток DDS, порог и принудительное завершение по времени."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.session import Attempt, Evaluation, TrainingSession
from app.services import evaluation_service
from app.services.time import ms_to_iso, now_iso, parse_iso_ms
from tests.conftest import login_as


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def cleanup_exam() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        assignments = (await db.execute(select(Assignment).where(Assignment.title.like("T093 DDS%")))).scalars().all()
        ids = [row.id for row in assignments]
        if not ids:
            return
        links = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.assignment_id.in_(ids)))).scalars().all()
        attempt_ids = [row.attempt_id for row in links]
        attempts = (await db.execute(select(Attempt).where(Attempt.id.in_(attempt_ids)))).scalars().all() if attempt_ids else []
        session_ids = list({row.session_id for row in attempts if row.session_id})
        if attempt_ids:
            await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
            await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id.in_(ids)))
            await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        if session_ids:
            await db.execute(delete(TrainingSession).where(TrainingSession.id.in_(session_ids)))
        await db.execute(delete(AssignmentScenarioVersion).where(AssignmentScenarioVersion.assignment_id.in_(ids)))
        await db.execute(delete(AssignmentStudent).where(AssignmentStudent.assignment_id.in_(ids)))
        await db.execute(delete(Assignment).where(Assignment.id.in_(ids)))
        await db.commit()


async def test_dds_exam_timeout_and_no_repeat(v1: AsyncClient):
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"studentIds": ["u-005", "u-006"], "trainingMode": "dds", "format": "exam", "cardIds": ["c-010", "c-013"], "params": {"passThreshold": 70, "timeLimitSec": 1}, "title": "T093 DDS экзамен"})
    assert created.status_code == 201, created.text
    assignment_id = created.json()["id"]
    await login_as(v1, "student")
    started = await v1.post(f"/assignments/{assignment_id}/start")
    assert started.status_code == 200, started.text
    attempt_id = started.json()["attempt"]["attempt"]["id"]
    async with get_sessionmaker()() as db:
        attempt = await db.get(Attempt, attempt_id)
        attempt.opened_at = ms_to_iso(parse_iso_ms(attempt.opened_at) - 2000)
        await db.commit()
    detail = await v1.get(f"/assignments/{assignment_id}")
    assert detail.status_code == 200
    first = detail.json()["progress"][0]
    assert first["state"] == "notCompleted" and first["score"] == 0 and first["passed"] is False
    second = await v1.post(f"/assignments/{assignment_id}/start")
    assert second.status_code == 200 and second.json()["attempt"]["attempt"]["cardId"] == "c-013"
    async with get_sessionmaker()() as db:
        link = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.attempt_id == attempt_id))).scalar_one()
        assert link.passed is False


async def test_dds_exam_score_sets_passed(v1: AsyncClient, monkeypatch):
    class Gateway:
        @staticmethod
        def evaluate_attempt(*args, **kwargs):
            return {"timeScore": 80, "correctnessScore": 80, "grammarScore": 80, "semanticScore": 80, "totalScore": 80, "grammarErrors": [], "errors": [], "aiComment": "Тестовая оценка", "assessorVersion": "test-1.0", "mode": "dds", "components": {}, "warnings": []}

    monkeypatch.setattr(evaluation_service, "get_gateway", lambda: Gateway())
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"studentIds": ["u-005"], "trainingMode": "dds", "format": "exam", "cardIds": ["c-010"], "params": {"passThreshold": 70, "timeLimitSec": 600}, "title": "T093 DDS оценка"})
    assert created.status_code == 201, created.text
    assignment_id = created.json()["id"]
    await login_as(v1, "student")
    started = await v1.post(f"/assignments/{assignment_id}/start")
    attempt_id = started.json()["attempt"]["attempt"]["id"]
    completed = await v1.post(f"/attempts/{attempt_id}/progress", json={"completedAt": now_iso()})
    assert completed.status_code == 200, completed.text
    detail = (await v1.get(f"/assignments/{assignment_id}")).json()
    assert detail["progress"] == [{"studentId": "u-005", "cardId": "c-010", "attemptId": attempt_id, "state": "submitted", "score": 80, "passed": True}]
    evaluation = await v1.get(f"/attempts/{attempt_id}/evaluation")
    assert evaluation.status_code == 200 and evaluation.json()["passed"] is True
