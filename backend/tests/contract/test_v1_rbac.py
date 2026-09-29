"""Спека 002, T027 (FR-040): изоляция обучающихся и границы ролей в `/api/v1` — чужие попытки, сообщения служб, доклад, рекомендации, история."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation, TrainingSession
from app.models.ticket_audio import TicketAudio
from tests.conftest import login_as

TITLE = "T027 изоляция"


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def cleanup() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        ids = list((await db.execute(select(Assignment.id).where(Assignment.title.like(f"{TITLE}%")))).scalars().all())
        if not ids:
            return
        attempt_ids = list((await db.execute(select(AssignmentAttempt.attempt_id).where(AssignmentAttempt.assignment_id.in_(ids)))).scalars().all())
        session_ids = list((await db.execute(select(Attempt.session_id).where(Attempt.id.in_(attempt_ids)))).scalars().all()) if attempt_ids else []
        await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id.in_(ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.source_attempt_id.in_(attempt_ids)))
        await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        if session_ids:
            await db.execute(delete(TrainingSession).where(TrainingSession.id.in_(set(session_ids))))
        await db.execute(delete(AssignmentScenarioVersion).where(AssignmentScenarioVersion.assignment_id.in_(ids)))
        await db.execute(delete(AssignmentStudent).where(AssignmentStudent.assignment_id.in_(ids)))
        await db.execute(delete(Assignment).where(Assignment.id.in_(ids)))
        await db.execute(delete(TicketAudio))
        await db.commit()


async def _assign(v1: AsyncClient, mode: str, card_id: str, title: str) -> str:
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"studentIds": ["u-005"], "trainingMode": mode, "format": "training", "cardIds": [card_id], "params": {}, "title": f"{TITLE} {title}"})
    assert created.status_code == 201, created.text
    return created.json()["id"]


async def test_student_cannot_touch_another_students_operator_attempt(v1: AsyncClient):
    assignment_id = await _assign(v1, "operator112", "c-010", "112")
    await login_as(v1, "student")
    attempt_id = (await v1.post(f"/assignments/{assignment_id}/start")).json()["attempt"]["id"]
    await login_as(v1, "student2")  # petrova
    base = f"/operator112/attempts/{attempt_id}"
    assert (await v1.post(f"{base}/answer")).status_code == 403
    assert (await v1.post(f"{base}/events", json={"type": "replay"})).status_code == 403
    assert (await v1.get(f"{base}/notification-list")).status_code == 403
    assert (await v1.post(f"{base}/submit", json={"address": {"formal": "x"}, "description": "y"})).status_code == 403
    assert (await v1.get(f"{base}/evaluation")).status_code == 403
    assert (await v1.get(f"/assignments/{assignment_id}")).status_code == 403
    assert (await v1.post(f"/assignments/{assignment_id}/start")).status_code == 403
    v1.cookies.clear()
    assert (await v1.post(f"{base}/answer")).status_code == 401


async def test_student_cannot_read_messages_or_send_report_for_another_dds_attempt(v1: AsyncClient):
    assignment_id = await _assign(v1, "dds", "c-010", "ДДС")
    await login_as(v1, "student")
    started = await v1.post(f"/assignments/{assignment_id}/start")
    assert started.status_code == 200, started.text
    attempt_id = started.json()["attempt"]["attempt"]["id"]
    assert (await v1.get(f"/attempts/{attempt_id}/work-messages")).status_code == 200  # свои — пусто без workMessagesEnabled
    await login_as(v1, "student2")
    assert (await v1.get(f"/attempts/{attempt_id}/work-messages")).status_code == 403
    denied = await v1.post(f"/attempts/{attempt_id}/report-audio", files={"file": ("r.wav", b"RIFF", "audio/wav")})
    assert denied.status_code == 403
    v1.cookies.clear()
    assert (await v1.get(f"/attempts/{attempt_id}/work-messages")).status_code == 401


async def test_history_analytics_and_recommendations_are_own_or_student_only(v1: AsyncClient):
    await login_as(v1, "student")
    assert (await v1.get("/me/history", params={"studentId": "u-006"})).status_code == 403
    assert (await v1.get("/me/analytics", params={"studentId": "u-006"})).status_code == 403
    assert (await v1.post("/me/recommendations/rec-чужая/accept")).status_code == 404  # чужая или несуществующая — не раскрывается
    for role in ("teacher", "admin"):
        await login_as(v1, role)
        assert (await v1.get("/me/recommendations")).status_code == 403
    v1.cookies.clear()
    assert (await v1.get("/me/history")).status_code == 401
    assert (await v1.get("/me/recommendations")).status_code == 401


async def test_student_cannot_finish_or_create_assignments(v1: AsyncClient):
    assignment_id = await _assign(v1, "operator112", "c-010", "права")
    await login_as(v1, "student")
    assert (await v1.post(f"/assignments/{assignment_id}/finish")).status_code == 403
    assert (await v1.post("/assignments", json={"studentIds": ["u-005"], "trainingMode": "operator112", "format": "training", "cardIds": ["c-010"], "params": {}})).status_code == 403
