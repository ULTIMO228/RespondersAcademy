"""Спека 002, T013 (исследование R4): применяет ли `submit` лимит времени экзамена сам, без чтения задания.

`params.timeLimitSec` действует на попытку от `openedAt` и применяется лениво — в `assignment_service._expire`, который
вызывается только при чтении/старте/завершении задания. Тест фиксирует фактическое поведение бэкенда, от которого зависит
клиент режима 112: перед передачей карточки при нулевом остатке он обязан запросить `GET /assignments/{id}`.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

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

TITLE = "T013 лимит экзамена"


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


async def _expired_exam_attempt(v1: AsyncClient) -> tuple[str, str]:
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"studentIds": ["u-005"], "trainingMode": "operator112", "format": "exam", "cardIds": ["c-010"], "params": {"passThreshold": 70, "timeLimitSec": 60}, "title": TITLE})
    assert created.status_code == 201, created.text
    assignment_id = created.json()["id"]
    await login_as(v1, "student")
    attempt_id = (await v1.post(f"/assignments/{assignment_id}/start")).json()["attempt"]["id"]
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200
    async with get_sessionmaker()() as db:  # лимит 60 с давно исчерпан
        attempt = await db.get(Attempt, attempt_id)
        attempt.opened_at = ms_to_iso(parse_iso_ms(now_iso()) - 10 * 60 * 1000)
        await db.commit()
    return assignment_id, attempt_id


async def test_submit_after_limit_without_reading_assignment_is_accepted_by_backend(v1: AsyncClient):
    """Найдено (2026-09-29): submit сам лимит НЕ применяет — карточка принимается и оценивается штатно."""
    assignment_id, attempt_id = await _expired_exam_attempt(v1)
    submitted = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010())
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["attempt"]["state"] == "submitted"
    evaluation = await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")
    assert evaluation.status_code == 200
    assert not any(error.get("type") == "timeLimit" for error in evaluation.json()["errors"])
    progress = (await v1.get(f"/assignments/{assignment_id}")).json()["progress"][0]
    assert progress["state"] == "submitted", "истечение уже не применяется: ссылка передана до чтения задания"


async def test_reading_assignment_before_submit_applies_limit_and_closes_attempt(v1: AsyncClient):
    """Поэтому клиент при нулевом остатке сначала читает задание: попытка закрывается с оценкой 0, submit → 409."""
    assignment_id, attempt_id = await _expired_exam_attempt(v1)
    progress = (await v1.get(f"/assignments/{assignment_id}")).json()["progress"][0]
    assert progress["state"] == "notCompleted" and progress["score"] == 0 and progress["passed"] is False
    submitted = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010())
    assert submitted.status_code == 409, submitted.text
    assert "уже отправлена" in submitted.json()["error"]["message"]
    evaluation = await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")
    assert any(error.get("type") == "timeLimit" for error in evaluation.json()["errors"])
