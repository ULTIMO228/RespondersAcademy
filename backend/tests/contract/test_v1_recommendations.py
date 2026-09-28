"""US7: рекомендации, доступ к профилям и адаптивная выдача через API."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.recommendation import Recommendation, StudentRating
from app.models.session import Attempt, Evaluation
from tests.conftest import login_as

TEST_IDS = [f"att-98{index}" for index in range(6)]
ADAPTIVE_IDS = [f"att-97{index}" for index in range(3)]


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture
async def gas_history() -> AsyncIterator[None]:
    async with get_sessionmaker()() as db:
        for index, attempt_id in enumerate(TEST_IDS):
            db.add(Attempt(id=attempt_id, session_id="ses-phase14", card_id="c-093", student_id="u-006",
                           mode="dds" if index % 2 else "operator112", opened_at="2026-09-28T12:00:00+03:00",
                           primary_reaction_ms=40_000, statuses=[], services_called=[], completed_at="2026-09-28T12:03:00+03:00",
                           full_processing_ms=180_000, entered_text={}, calls=[], seq=index))
            db.add(Evaluation(attempt_id=attempt_id, assessor_version="phase14-test", time_score=20,
                              correctness_score=20, grammar_score=20, semantic_score=20, total_score=25,
                              grammar_errors=[], errors=[{"type": "wrongType", "ruleId": "ekp-v046"}],
                              ai_comment="", components={}, generated_at="2026-09-28T12:03:00+03:00",
                              mode="dds" if index % 2 else "operator112"))
        await db.commit()
    yield
    async with get_sessionmaker()() as db:
        await db.execute(delete(Recommendation).where(Recommendation.student_id == "u-006"))
        await db.execute(delete(StudentRating).where(StudentRating.student_id == "u-006"))
        await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(TEST_IDS)))
        await db.execute(delete(Attempt).where(Attempt.id.in_(TEST_IDS)))
        await db.commit()


async def test_recommendations_and_role_isolation(v1: AsyncClient, gas_history):
    assert (await v1.get("/me/recommendations")).status_code == 401
    await login_as(v1, "student2")
    response = await v1.get("/me/recommendations?limit=10")
    assert response.status_code == 200, response.text
    items = response.json()
    assert items and all(set(item["reason"]) == {"errorType", "count", "ruleId"} for item in items)
    assert any(item["kind"] == "category" and "запах газа" in item["targetId"].casefold() for item in items[:3])
    assert any(item["kind"] == "article" and "запах газа" in item["title"].casefold() for item in items)
    assert (await v1.get("/me/recommendations?limit=0")).status_code == 400
    article = next(item for item in items if item["kind"] == "article")
    assert (await v1.post(f"/me/recommendations/{article['id']}/accept")).json()["acceptedAt"]
    await login_as(v1, "student")
    assert (await v1.post(f"/me/recommendations/{article['id']}/accept")).status_code == 403
    assert (await v1.get("/teacher/students/u-006/profile")).status_code == 403
    await login_as(v1, "teacher")
    profile = (await v1.get("/teacher/students/u-006/profile")).json()
    assert set(profile["ratings"]) == {"dds", "operator112"}
    assert profile["typicalErrors"]["dds"]
    insights = (await v1.get("/teacher/groups/ДДС-01/insights")).json()
    assert insights["suggestedGroup"] and insights["insights"]


async def test_adaptive_assignment_selects_harder_card(v1: AsyncClient):
    async with get_sessionmaker()() as db:
        db.add(Assignment(id="asg-970", teacher_id="u-002", student_ids=["u-006"], training_mode="operator112",
                          format="training", card_ids=["c-004", "c-022", "c-007"], params={"adaptive": True},
                          state="active", created_at="2026-09-28T12:00:00+03:00", title="Phase14 adaptive"))
        for index, attempt_id in enumerate(ADAPTIVE_IDS):
            db.add(Attempt(id=attempt_id, session_id="ses-phase14-adaptive", card_id="c-004", student_id="u-006",
                           mode="operator112", opened_at="2026-09-28T12:00:00+03:00", primary_reaction_ms=10_000,
                           statuses=[], services_called=[], completed_at="2026-09-28T12:02:00+03:00",
                           full_processing_ms=120_000, entered_text={}, calls=[], seq=index, state="submitted"))
            db.add(Evaluation(attempt_id=attempt_id, assessor_version="phase14-test", time_score=90,
                              correctness_score=90, grammar_score=90, semantic_score=90, total_score=90,
                              grammar_errors=[], errors=[], ai_comment="", components={},
                              generated_at="2026-09-28T12:02:00+03:00", mode="operator112"))
            db.add(AssignmentAttempt(assignment_id="asg-970", student_id="u-006", card_id="c-004",
                                     attempt_id=attempt_id, state="submitted"))
        await db.commit()
    created_id = None
    try:
        await login_as(v1, "student2")
        response = await v1.post("/assignments/asg-970/start")
        assert response.status_code == 200, response.text
        attempt = response.json()["attempt"]
        created_id = attempt["id"]
        assert attempt["cardId"] == "c-007"
    finally:
        async with get_sessionmaker()() as db:
            ids = [*ADAPTIVE_IDS, *([created_id] if created_id else [])]
            await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id == "asg-970"))
            await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(ids)))
            await db.execute(delete(Attempt).where(Attempt.id.in_(ids)))
            await db.execute(delete(Assignment).where(Assignment.id == "asg-970"))
            await db.execute(delete(StudentRating).where(StudentRating.student_id == "u-006"))
            await db.commit()
