"""Спека 002, T031: фикстура `scripts/seed_chain_demo.py` даёт рабочую цепочку A → B «с нуля» (рецепт test_ai_chain через HTTP)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, or_, select

from app.db.session import get_sessionmaker
from app.models.ai_scenario import (
    AIRequest,
    DraftFieldDecision,
    EtalonVersion,
    SanitizedTicket,
    ScenarioVersion,
    install_ai_scenario_guards,
)
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.audit import AuditLog
from app.models.card import IncidentCard
from app.models.scenario import Scenario
from app.models.session import Attempt, Evaluation, TrainingSession
from scripts.seed_chain_demo import DEMO_TITLE, SOURCE_TICKET_ID, WORK_MESSAGE_INTERVALS_SEC, seed_chain_demo
from tests.conftest import login_as


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def cleanup_demo() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        versions = (await db.execute(select(ScenarioVersion).where(ScenarioVersion.source_ticket_id == SOURCE_TICKET_ID))).scalars().all()
        scenario_ids = list({item.scenario_id for item in versions})
        card_ids = [item.card_snapshot.get("id") for item in versions if item.card_snapshot.get("id")]
        assignment_ids = list((await db.execute(select(Assignment.id).where(Assignment.title == DEMO_TITLE))).scalars().all())
        attempt_ids = list((await db.execute(select(AssignmentAttempt.attempt_id).where(AssignmentAttempt.assignment_id.in_(assignment_ids)))).scalars().all()) if assignment_ids else []
        session_ids = list((await db.execute(select(Attempt.session_id).where(Attempt.id.in_(attempt_ids)))).scalars().all()) if attempt_ids else []
        connection = await db.connection()
        # Защитные триггеры неизменяемости не дают удалить утверждённые версии — снимаем на время очистки и возвращаем.
        await connection.exec_driver_sql("DROP TRIGGER IF EXISTS trg_ai_scenario_no_update_approved")
        await connection.exec_driver_sql("DROP TRIGGER IF EXISTS trg_ai_scenario_no_delete_approved")
        if attempt_ids:
            await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
            await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.attempt_id.in_(attempt_ids)))
            await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        if assignment_ids:
            await db.execute(delete(AssignmentScenarioVersion).where(AssignmentScenarioVersion.assignment_id.in_(assignment_ids)))
            await db.execute(delete(AssignmentStudent).where(AssignmentStudent.assignment_id.in_(assignment_ids)))
            await db.execute(delete(Assignment).where(Assignment.id.in_(assignment_ids)))
        if session_ids:
            await db.execute(delete(TrainingSession).where(TrainingSession.id.in_(set(session_ids))))
        if scenario_ids:
            await db.execute(delete(DraftFieldDecision).where(DraftFieldDecision.scenario_id.in_(scenario_ids)))
            await db.execute(delete(ScenarioVersion).where(ScenarioVersion.scenario_id.in_(scenario_ids)))
            await db.execute(delete(EtalonVersion).where(EtalonVersion.scenario_id.in_(scenario_ids)))
            await db.execute(delete(Scenario).where(Scenario.id.in_(scenario_ids)))
        if card_ids:
            await db.execute(delete(IncidentCard).where(IncidentCard.id.in_(card_ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.mode_origin.in_(("operator112", "manual"))))
        await db.execute(delete(SanitizedTicket).where(SanitizedTicket.source_ticket_id == SOURCE_TICKET_ID))
        await db.execute(delete(AIRequest).where(AIRequest.request_id.like("demo-chain-%")))
        conditions = [AuditLog.details.like(f"%{SOURCE_TICKET_ID}%")]
        if card_ids:
            conditions.append(AuditLog.card_id.in_(card_ids))
        await db.execute(delete(AuditLog).where(or_(*conditions)))
        await connection.run_sync(install_ai_scenario_guards)
        await db.commit()


async def test_fixture_is_idempotent_and_creates_chain_assignment_for_ivanov(v1: AsyncClient):
    first = await seed_chain_demo()
    assert first["status"] == "created" and first["assignmentId"].startswith("asg-")
    second = await seed_chain_demo()
    assert second == {"assignmentId": first["assignmentId"], "address": first["address"], "status": "exists"}
    assert first["address"]
    await login_as(v1, "student")
    listing = (await v1.get("/assignments")).json()
    demo = next(item for item in listing if item["id"] == first["assignmentId"])
    assert demo["trainingMode"] == "chain" and demo["format"] == "training" and demo["title"] == DEMO_TITLE
    assert demo["params"]["workMessagesEnabled"] is True
    assert demo["params"]["workMessageIntervalsSec"] == WORK_MESSAGE_INTERVALS_SEC


async def test_fixture_chain_runs_operator112_then_waits_for_teacher_then_opens_dds(v1: AsyncClient):
    """Рецепт test_ai_chain через HTTP: start → попытка 112; submit → 409 до подтверждения; approve → попытка ДДС по сохранённой карточке."""
    seeded = await seed_chain_demo()
    assignment_id, scenario_id = seeded["assignmentId"], seeded["scenarioId"]
    await login_as(v1, "teacher")
    source_fields = (await v1.get(f"/ai/scenarios/{scenario_id}/versions")).json()[0]["cardSnapshot"]["fields"]
    await login_as(v1, "student")
    started = await v1.post(f"/assignments/{assignment_id}/start")
    assert started.status_code == 200, started.text
    attempt = started.json()["attempt"]
    assert attempt["state"] == "ringing" and attempt["cardId"] == seeded["cardId"]
    assert (await v1.post(f"/operator112/attempts/{attempt['id']}/answer")).status_code == 200
    submitted = await v1.post(
        f"/operator112/attempts/{attempt['id']}/submit",
        json={
            "applicant": {"name": "Учебный заявитель", "status": "очевидец"},
            "phones": {"provided": "0000000000"},
            "address": {"formal": source_fields["address"], "source": "directory"},
            "what": {"finalType": source_fields["group"], "classifierCode": source_fields["classifierCode"]},
            "description": "Сильный ветер повалил дерево на проезжую часть",
        },
    )
    assert submitted.status_code == 200, submitted.text
    review = submitted.json()["chainReview"]
    saved_card_id = submitted.json()["card"]["id"]
    assert review == {"scenarioId": scenario_id, "version": 2, "cardId": saved_card_id}

    waiting = await v1.post(f"/assignments/{assignment_id}/start")
    assert waiting.status_code == 409
    assert "подтверждения преподавателя" in waiting.json()["error"]["message"].lower()

    await login_as(v1, "teacher")
    approved = await v1.post(f"/ai/scenarios/{scenario_id}/approve", json={"version": review["version"], "requestId": "demo-chain-approve-dds"})
    assert approved.status_code == 200, approved.text

    await login_as(v1, "student")
    dds = await v1.post(f"/assignments/{assignment_id}/start")
    assert dds.status_code == 200, dds.text
    dds_attempt = dds.json()["attempt"]
    assert dds_attempt["attempt"]["cardId"] == saved_card_id and dds_attempt["created"] is True
