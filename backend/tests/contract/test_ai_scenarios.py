"""Контракт преподавательского workflow сценариев ai-workflow/1."""

from __future__ import annotations

import hashlib
from collections.abc import AsyncIterator

import pytest
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
from app.models.audit import AuditLog
from app.models.card import IncidentCard
from app.models.scenario import Scenario
from tests.conftest import login_as


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def cleanup_ai_scenario_contracts() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        versions = (
            await db.execute(select(ScenarioVersion).where(ScenarioVersion.source_ticket_id.like("t009-%")))
        ).scalars().all()
        scenario_ids = list({item.scenario_id for item in versions})
        card_ids = [item.card_snapshot.get("id") for item in versions if item.card_snapshot.get("id")]
        connection = await db.connection()
        await connection.exec_driver_sql("DROP TRIGGER IF EXISTS trg_ai_scenario_no_update_approved")
        await connection.exec_driver_sql("DROP TRIGGER IF EXISTS trg_ai_scenario_no_delete_approved")
        if scenario_ids:
            await db.execute(delete(DraftFieldDecision).where(DraftFieldDecision.scenario_id.in_(scenario_ids)))
            await db.execute(delete(ScenarioVersion).where(ScenarioVersion.scenario_id.in_(scenario_ids)))
            await db.execute(delete(EtalonVersion).where(EtalonVersion.scenario_id.in_(scenario_ids)))
            await db.execute(delete(Scenario).where(Scenario.id.in_(scenario_ids)))
        if card_ids:
            await db.execute(delete(IncidentCard).where(IncidentCard.id.in_(card_ids)))
        await db.execute(delete(SanitizedTicket).where(SanitizedTicket.source_ticket_id.like("t009-%")))
        await db.execute(delete(AIRequest).where(AIRequest.request_id.like("t009-%")))
        if scenario_ids:
            for scenario_id in scenario_ids:
                await db.execute(delete(AuditLog).where(AuditLog.details.like(f"%{scenario_id}%")))
        await db.execute(delete(AuditLog).where(AuditLog.details.like("%t009-%")))
        await connection.run_sync(install_ai_scenario_guards)
        await db.commit()


async def seed_source(source_ticket_id: str, *, situation_no: int = 1, text: str | None = None) -> None:
    sanitized_text = text or "Сильный ветер повалил дерево на проезжую часть, пострадавших нет"
    async with get_sessionmaker()() as db:
        db.add(
            SanitizedTicket(
                source_ticket_id=source_ticket_id,
                situation_no=situation_no,
                sanitized_text=sanitized_text,
                pii_check="passed",
                reviewer_id="u-002",
                reviewed_at="2026-09-24T10:00:00+00:00",
                source_hash=hashlib.sha256(sanitized_text.encode()).hexdigest(),
                approved=True,
            )
        )
        await db.commit()


def draft_body(source_ticket_id: str, request_id: str, **updates: object) -> dict[str, object]:
    return {
        "mode": "operator112",
        "sourceTicketId": source_ticket_id,
        "category": "Дерево",
        "count": 1,
        "requestId": request_id,
        **updates,
    }


async def test_черновик_доступен_только_преподавателю_и_повтор_idempotent(v1: AsyncClient) -> None:
    source_id = "t009-idempotent-source"
    await seed_source(source_id)
    body = draft_body(source_id, "t009-idempotent-request")

    assert (await v1.post("/ai/scenarios/drafts", json=body)).status_code == 401
    await login_as(v1, "student")
    assert (await v1.post("/ai/scenarios/drafts", json=body)).status_code == 403

    await login_as(v1, "teacher")
    first = await v1.post("/ai/scenarios/drafts", json=body)
    assert first.status_code == 201, first.text
    first_versions = first.json()
    assert len(first_versions) == 1
    assert first_versions[0]["schemaVersion"] == "ai-workflow/1"
    assert first_versions[0]["approval"] == "draft"
    assert first_versions[0]["sourceTicketId"] == source_id
    assert first_versions[0]["sourceSituationNo"] == 1
    assert first_versions[0]["cardSnapshot"]["fields"]["group"] == "Дерево"

    repeated = await v1.post("/ai/scenarios/drafts", json=body)
    assert repeated.status_code == 201, repeated.text
    assert repeated.json() == first_versions
    collision = await v1.post("/ai/scenarios/drafts", json={**body, "count": 2})
    assert collision.status_code == 409

    async with get_sessionmaker()() as db:
        rows = (
            await db.execute(select(ScenarioVersion).where(ScenarioVersion.source_ticket_id == source_id))
        ).scalars().all()
        assert len(rows) == 1


async def test_неутверждённый_источник_отклоняется_до_генерации(v1: AsyncClient, monkeypatch) -> None:
    from app.services import ai_scenario_service

    def fail_if_called(*args, **kwargs):
        raise AssertionError("Генератор вызван до проверки SanitizedTicket")

    monkeypatch.setattr(ai_scenario_service, "generate_from_approved_source", fail_if_called)
    await login_as(v1, "teacher")
    response = await v1.post("/ai/scenarios/drafts", json=draft_body("t009-not-approved", "t009-no-source"))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "notFound"


async def test_частичное_решение_создаёт_новую_версию_и_устаревший_baseVersion_даёт_409(v1: AsyncClient) -> None:
    source_id = "t009-revise-source"
    await seed_source(source_id)
    await login_as(v1, "teacher")
    created = await v1.post("/ai/scenarios/drafts", json=draft_body(source_id, "t009-revise-create"))
    assert created.status_code == 201, created.text
    version_one = created.json()[0]
    scenario_id = version_one["scenarioId"]

    revised = await v1.post(
        f"/ai/scenarios/{scenario_id}/revise",
        json={
            "baseVersion": 1,
            "comment": "Уточнена фабула преподавателем",
            "acceptedFields": [
                {"fieldPath": "summary", "decision": "edited", "value": "Сильный ветер повалил дерево на проезжую часть"}
            ],
            "requestId": "t009-revise-once",
        },
    )
    assert revised.status_code == 201, revised.text
    version_two = revised.json()
    assert version_two["version"] == 2
    assert version_two["parentVersion"] == 1
    assert version_two["teacherComment"] == "Уточнена фабула преподавателем"
    assert version_two["cardSnapshot"]["fields"]["summary"] == "Сильный ветер повалил дерево на проезжую часть"
    repeated = await v1.post(
        f"/ai/scenarios/{scenario_id}/revise",
        json={
            "baseVersion": 1,
            "comment": "Уточнена фабула преподавателем",
            "acceptedFields": [
                {"fieldPath": "summary", "decision": "edited", "value": "Сильный ветер повалил дерево на проезжую часть"}
            ],
            "requestId": "t009-revise-once",
        },
    )
    assert repeated.status_code == 201
    assert repeated.json() == version_two

    stale = await v1.post(
        f"/ai/scenarios/{scenario_id}/revise",
        json={
            "baseVersion": 1,
            "comment": "Устаревшая правка",
            "acceptedFields": [{"fieldPath": "summary", "decision": "accepted"}],
            "requestId": "t009-revise-stale",
        },
    )
    assert stale.status_code == 409

    async with get_sessionmaker()() as db:
        decisions = (
            await db.execute(
                select(DraftFieldDecision).where(
                    DraftFieldDecision.scenario_id == scenario_id,
                    DraftFieldDecision.scenario_version == 2,
                )
            )
        ).scalars().all()
        assert [(item.field_path, item.decision, item.teacher_id) for item in decisions] == [
            ("summary", "edited", "u-002")
        ]


async def test_approve_публикует_только_проверенную_версию_а_student_не_читает_versions(v1: AsyncClient) -> None:
    source_id = "t009-approve-source"
    await seed_source(source_id)
    await login_as(v1, "teacher")
    created = await v1.post("/ai/scenarios/drafts", json=draft_body(source_id, "t009-approve-create"))
    assert created.status_code == 201, created.text
    version = created.json()[0]
    scenario_id = version["scenarioId"]

    approved = await v1.post(
        f"/ai/scenarios/{scenario_id}/approve",
        json={"version": version["version"], "requestId": "t009-approve-once"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["approval"] == "approved"
    assert approved.json()["approvedBy"] == "u-002"
    repeated = await v1.post(
        f"/ai/scenarios/{scenario_id}/approve",
        json={"version": version["version"], "requestId": "t009-approve-once"},
    )
    assert repeated.status_code == 200
    assert repeated.json() == approved.json()

    await login_as(v1, "student")
    assert (await v1.get(f"/ai/scenarios/{scenario_id}/versions")).status_code == 403


async def test_count_ограничен_диапазоном_один_пять(v1: AsyncClient) -> None:
    await login_as(v1, "teacher")
    for count in (0, 6):
        response = await v1.post(
            "/ai/scenarios/drafts",
            json=draft_body("t009-count-source", f"t009-count-{count}", count=count),
        )
        assert response.status_code == 400


@pytest.mark.parametrize("mode", ["operator112", "dds"])
async def test_http_auth_and_errors_both_modes(v1: AsyncClient, mode: str) -> None:
    source_id = f"t009-auth-{mode}"
    await seed_source(source_id)

    # 401 Unauthorized without session
    assert (await v1.post("/ai/scenarios/drafts", json=draft_body(source_id, f"t009-no-auth-{mode}", mode=mode))).status_code == 401
    assert (await v1.get("/ai/scenarios/s-nonexistent/versions")).status_code == 401
    assert (await v1.post("/ai/scenarios/s-nonexistent/approve", json={"version": 1, "requestId": "req-1"})).status_code == 401
    assert (await v1.post("/ai/scenarios/s-nonexistent/revise", json={"baseVersion": 1, "comment": "test", "acceptedFields": [], "requestId": "req-2"})).status_code == 401

    # 403 Forbidden for student
    await login_as(v1, "student")
    assert (await v1.post("/ai/scenarios/drafts", json=draft_body(source_id, f"t009-student-{mode}", mode=mode))).status_code == 403
    assert (await v1.get("/ai/scenarios/s-nonexistent/versions")).status_code == 403
    assert (await v1.post("/ai/scenarios/s-nonexistent/approve", json={"version": 1, "requestId": "req-1"})).status_code == 403
    assert (await v1.post("/ai/scenarios/s-nonexistent/revise", json={"baseVersion": 1, "comment": "test", "acceptedFields": [{"fieldPath": "summary", "decision": "accepted"}], "requestId": "req-2"})).status_code == 403

    # 404 Not Found for teacher with non-existent source / scenario
    await login_as(v1, "teacher")
    assert (await v1.post("/ai/scenarios/drafts", json=draft_body("t009-missing-source", f"t009-404-{mode}", mode=mode))).status_code == 404
    assert (await v1.get("/ai/scenarios/s-missing-id/versions")).status_code == 404
    assert (await v1.post("/ai/scenarios/s-missing-id/approve", json={"version": 1, "requestId": "req-3"})).status_code == 404
    assert (await v1.post("/ai/scenarios/s-missing-id/revise", json={"baseVersion": 1, "comment": "test", "acceptedFields": [{"fieldPath": "summary", "decision": "accepted"}], "requestId": "req-4"})).status_code == 404


async def test_generator_template_возвращает_провайдера_и_время(v1: AsyncClient) -> None:
    source_id = "t009-gen-template-source"
    await seed_source(source_id)
    await login_as(v1, "teacher")
    response = await v1.post("/ai/scenarios/drafts", json=draft_body(source_id, "t009-gen-template-req", generator="template"))
    assert response.status_code == 201, response.text
    generation = response.json()[0]["generation"]
    assert generation["provider"] == "template"
    assert isinstance(generation["durationMs"], int) and generation["durationMs"] >= 0


async def test_generator_ai_без_ollama_даёт_422_без_подмены_шаблоном(v1: AsyncClient, monkeypatch) -> None:
    from ml.generate import llm

    monkeypatch.setattr(llm, "configured_client", lambda: None)
    source_id = "t009-gen-ai-off-source"
    await seed_source(source_id)
    await login_as(v1, "teacher")
    response = await v1.post("/ai/scenarios/drafts", json=draft_body(source_id, "t009-gen-ai-off-req", generator="ai"))
    assert response.status_code == 422, response.text
    assert "ИИ недоступен" in response.json()["error"]["message"]


async def test_generator_неизвестное_значение_отклоняется(v1: AsyncClient) -> None:
    await login_as(v1, "teacher")
    response = await v1.post("/ai/scenarios/drafts", json=draft_body("x", "gen-bad-req", generator="gpt"))
    assert response.status_code == 400
