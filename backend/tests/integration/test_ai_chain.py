"""Интеграционный переход A→B: студентская карточка остаётся источником входа ДДС."""

from __future__ import annotations

import hashlib
from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

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
from tests.conftest import login_as


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def cleanup_ai_chain() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        source_ids = list(
            (
                await db.execute(
                    select(SanitizedTicket.source_ticket_id).where(SanitizedTicket.source_ticket_id.like("t009-chain-%"))
                )
            ).scalars().all()
        )
        versions = (
            await db.execute(select(ScenarioVersion).where(ScenarioVersion.source_ticket_id.like("t009-chain-%")))
        ).scalars().all()
        scenario_ids = list({item.scenario_id for item in versions})
        card_ids = [item.card_snapshot.get("id") for item in versions if item.card_snapshot.get("id")]
        attempt_ids = list(
            (
                await db.execute(
                    select(Attempt.id).where(
                        Attempt.id.in_(
                            select(AssignmentAttempt.attempt_id).join(Assignment, Assignment.id == AssignmentAttempt.assignment_id).where(
                                Assignment.title.like("T009 chain%")
                            )
                        )
                    )
                )
            ).scalars().all()
        )
        assignment_ids = list(
            (await db.execute(select(Assignment.id).where(Assignment.title.like("T009 chain%")))).scalars().all()
        )
        session_ids = list(
            (
                await db.execute(
                    select(Attempt.session_id).where(Attempt.id.in_(attempt_ids))
                )
            ).scalars().all()
        ) if attempt_ids else []
        connection = await db.connection()
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
        if source_ids:
            await db.execute(delete(SanitizedTicket).where(SanitizedTicket.source_ticket_id.in_(source_ids)))
        await db.execute(delete(AIRequest).where(AIRequest.request_id.like("t009-chain-%")))
        audit_filter = [AuditLog.details.like("%t009-chain-source%")]
        if card_ids:
            audit_filter.append(AuditLog.card_id.in_(card_ids))
        from sqlalchemy import or_

        await db.execute(delete(AuditLog).where(or_(*audit_filter)))
        await connection.run_sync(install_ai_scenario_guards)
        await db.commit()


async def test_цепочка_ждёт_подтверждения_и_переносит_сохранённую_карточку(v1: AsyncClient) -> None:
    source_id = "t009-chain-source"
    sanitized_text = "Сильный ветер повалил дерево на проезжую часть, пострадавших нет"
    async with get_sessionmaker()() as db:
        db.add(
            SanitizedTicket(
                source_ticket_id=source_id,
                situation_no=1,
                sanitized_text=sanitized_text,
                pii_check="passed",
                reviewer_id="u-002",
                reviewed_at="2026-09-24T10:00:00+00:00",
                source_hash=hashlib.sha256(sanitized_text.encode()).hexdigest(),
                approved=True,
            )
        )
        await db.commit()

    await login_as(v1, "teacher")
    created = await v1.post(
        "/ai/scenarios/drafts",
        json={
            "mode": "operator112",
            "sourceTicketId": source_id,
            "category": "Дерево",
            "count": 1,
            "requestId": "t009-chain-create",
        },
    )
    assert created.status_code == 201, created.text
    operator_version = created.json()[0]
    scenario_id = operator_version["scenarioId"]
    original_card_id = operator_version["cardSnapshot"]["id"]

    approved = await v1.post(
        f"/ai/scenarios/{scenario_id}/approve",
        json={"version": operator_version["version"], "requestId": "t009-chain-approve-source"},
    )
    assert approved.status_code == 200, approved.text

    assignment = await v1.post(
        "/assignments",
        json={
            "studentIds": ["u-005"],
            "trainingMode": "chain",
            "format": "training",
            "cardIds": [original_card_id],
            "scenarioVersions": [{"scenarioId": scenario_id, "version": operator_version["version"], "cardId": original_card_id}],
            "params": {},
            "title": "T009 chain проверка сохранённой карточки",
        },
    )
    assert assignment.status_code == 201, assignment.text
    assignment_id = assignment.json()["id"]

    await login_as(v1, "student")
    started_a = await v1.post(f"/assignments/{assignment_id}/start")
    assert started_a.status_code == 200, started_a.text
    attempt_a = started_a.json()["attempt"]
    attempt_id = attempt_a["id"]
    assert attempt_a["state"] == "ringing"
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200

    source_fields = operator_version["cardSnapshot"]["fields"]
    submitted = await v1.post(
        f"/operator112/attempts/{attempt_id}/submit",
        json={
            "applicant": {"name": "Учебный заявитель", "status": "очевидец"},
            "phones": {"provided": "0000000000"},
            "address": {"formal": source_fields["address"], "source": "directory"},
            "what": {"finalType": source_fields["group"], "classifierCode": source_fields["classifierCode"]},
            "description": "Сильный ветер повалил дерево на проезжую часть",
        },
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json().get("chainReview") is not None, submitted.json()
    student_card = submitted.json()["card"]
    assert student_card["sourceCardId"] == original_card_id
    async with get_sessionmaker()() as db:
        chain_versions = (
            await db.execute(select(ScenarioVersion).where(ScenarioVersion.source_attempt_id == attempt_id))
        ).scalars().all()
        assert [(row.mode, row.approval) for row in chain_versions] == [("dds", "pending_review")]

    waiting = await v1.post(f"/assignments/{assignment_id}/start")
    assert waiting.status_code == 409
    assert "подтверждения преподавателя" in waiting.json()["error"]["message"].lower()

    await login_as(v1, "teacher")
    detail = await v1.get(f"/assignments/{assignment_id}")
    assert detail.status_code == 200, detail.text
    review = detail.json()["progress"][0].get("chainReview")
    assert review is not None, detail.json().get("progress")
    assert review["scenarioId"] == scenario_id and review["version"] == 2
    versions = await v1.get(f"/ai/scenarios/{scenario_id}/versions")
    assert versions.status_code == 200, versions.text
    dds_version = next(row for row in versions.json() if row["version"] == 2)
    assert dds_version["approval"] == "pending_review"
    assert dds_version["sourceKind"] == "student_card"
    assert dds_version["sourceAttemptId"] == attempt_id
    assert dds_version["sourceCardId"] == student_card["id"]
    assert dds_version["sourceCardVersion"] == 1
    assert dds_version["cardSnapshot"]["id"] == student_card["id"]
    assert dds_version["cardSnapshot"]["fields"] == student_card
    assert dds_version["cardSnapshot"]["fields"]["summary"] != source_fields["summary"]

    accepted = await v1.post(
        f"/ai/scenarios/{scenario_id}/approve",
        json={"version": 2, "requestId": "t009-chain-approve-dds"},
    )
    assert accepted.status_code == 200, accepted.text
    await login_as(v1, "student")
    started_b = await v1.post(f"/assignments/{assignment_id}/start")
    assert started_b.status_code == 200, started_b.text
    dds_attempt_id = started_b.json()["attempt"]["attempt"]["id"]

    async with get_sessionmaker()() as db:
        dds_attempt = await db.get(Attempt, dds_attempt_id)
        assert dds_attempt is not None
        assert dds_attempt.mode == "dds"
        assert dds_attempt.card_id == student_card["id"]
