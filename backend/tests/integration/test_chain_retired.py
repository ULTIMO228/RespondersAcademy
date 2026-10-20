"""Режим «цепочка A → B» выведен 20.10.2026 (spec/007 Clarifications).

Новых заданий chain создать нельзя, старые задания и их результаты открываются только для чтения,
подтверждения этапа ДДС (student_card-версии) больше нет.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.api.errors import ApiError
from app.db.session import get_sessionmaker
from app.models.ai_scenario import ScenarioVersion
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.session import Attempt, Evaluation
from app.services.ai_scenario_review import _reject_chain_stage
from app.services.time import now_iso
from tests.conftest import login_as

LEGACY_ID = "asg-chain-old"
ATTEMPT_ID = "a-chain-old"


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture
async def legacy_chain(app) -> AsyncIterator[None]:
    """Старое задание chain, как его оставил этап A: попытка 112 передана и оценена."""
    async with get_sessionmaker()() as db:
        db.add_all([
            Assignment(id=LEGACY_ID, teacher_id="u-002", student_ids=["u-005"], training_mode="chain", format="training",
                       card_ids=["c-010"], params={}, state="active", created_at=now_iso(), title="Старая цепочка"),
            Attempt(id=ATTEMPT_ID, session_id="ses-chain-old", card_id="c-010", student_id="u-005", mode="operator112",
                    opened_at=now_iso(), completed_at=now_iso(), primary_reaction_ms=0, statuses=[], services_called=[],
                    full_processing_ms=0, entered_text={}, calls=[], seq=0, state="submitted"),
            AssignmentAttempt(assignment_id=LEGACY_ID, student_id="u-005", card_id="c-010", attempt_id=ATTEMPT_ID,
                              state="submitted"),
            Evaluation(attempt_id=ATTEMPT_ID, time_score=80, correctness_score=70, grammar_score=90, semantic_score=60,
                       total_score=72, generated_at=now_iso(), mode="operator112"),
        ])
        await db.commit()
    yield
    async with get_sessionmaker()() as db:
        await db.execute(delete(Evaluation).where(Evaluation.attempt_id == ATTEMPT_ID))
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id == LEGACY_ID))
        await db.execute(delete(Attempt).where(Attempt.id == ATTEMPT_ID))
        await db.execute(delete(Assignment).where(Assignment.id == LEGACY_ID))
        await db.commit()


async def test_создать_задание_chain_нельзя(v1: AsyncClient) -> None:
    await login_as(v1, "teacher")
    refused = await v1.post("/assignments", json={"studentIds": ["u-005"], "trainingMode": "chain", "format": "training",
                                                  "cardIds": ["c-010"], "title": "Цепочка после вывода"})
    assert refused.status_code == 400, refused.text


async def test_старое_задание_chain_открывается_на_чтение(v1: AsyncClient, legacy_chain: None) -> None:
    await login_as(v1, "teacher")
    detail = await v1.get(f"/assignments/{LEGACY_ID}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["trainingMode"] == "chain"
    assert body["progress"] == [{"studentId": "u-005", "cardId": "c-010", "attemptId": ATTEMPT_ID,
                                 "state": "submitted", "score": 72}]
    assert any(row["id"] == LEGACY_ID for row in (await v1.get("/assignments")).json())

    await login_as(v1, "student")
    assert any(row["id"] == LEGACY_ID for row in (await v1.get("/assignments")).json())
    assert (await v1.get(f"/assignments/{LEGACY_ID}")).status_code == 200
    started = await v1.post(f"/assignments/{LEGACY_ID}/start")
    assert started.status_code == 409
    assert "только для просмотра" in started.json()["error"]["message"]


def test_подтверждения_этапа_ддс_больше_нет() -> None:
    with pytest.raises(ApiError):
        _reject_chain_stage(ScenarioVersion(source_kind="student_card"))
    _reject_chain_stage(ScenarioVersion(source_kind="ticket"))
