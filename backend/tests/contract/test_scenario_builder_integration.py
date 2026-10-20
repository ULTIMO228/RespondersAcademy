"""Интеграция конструктора сценариев 112: черновик → проверка → публикация → прохождение обучающимся."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.ai_scenario import ScenarioRunRecord
from app.models.assignment import Assignment, AssignmentScenarioVersion, AssignmentStudent
from app.models.audit import AuditLog
from app.models.user import User
from tests.conftest import login_as
from tests.contract.test_ai_scenarios import (  # noqa: F401  (фикстуры и помощники модуля сценариев)
    cleanup_ai_scenario_contracts,
    manual_body,
    seed_source,
)

GRAPH: dict[str, Any] = {
    "schemaVersion": "scenario-graph/1",
    "start": "capture",
    "nodes": [
        {"id": "capture", "type": "action", "action": "captureCaller", "next": "route"},
        {
            "id": "route",
            "type": "condition",
            "branches": [{"name": "urgent", "when": {"fact": "urgency", "op": "eq", "value": "high"}, "next": "notify"}],
            "else": {"name": "routine", "next": "done"},
        },
        {"id": "notify", "type": "action", "action": "notify:103", "next": "done"},
        {"id": "done", "type": "end", "outcome": "completed"},
    ],
}


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def cleanup_runs_and_permissions() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        ids = (await db.execute(select(Assignment.id).where(Assignment.title.like("t009-%")))).scalars().all()
        if ids:
            await db.execute(delete(AssignmentScenarioVersion).where(AssignmentScenarioVersion.assignment_id.in_(ids)))
            await db.execute(delete(AssignmentStudent).where(AssignmentStudent.assignment_id.in_(ids)))
            await db.execute(delete(Assignment).where(Assignment.id.in_(ids)))
        await db.execute(delete(ScenarioRunRecord))
        for user in (await db.execute(select(User).where(User.permissions.is_not(None)))).scalars().all():
            user.permissions = None
        await db.execute(delete(AuditLog).where(AuditLog.action.like("ai.scenario.%")))
        await db.commit()


async def user_id(login: str) -> str:
    async with get_sessionmaker()() as db:
        return (await db.execute(select(User.id).where(User.login == login))).scalar_one()


async def grant(v1: AsyncClient, login: str, permissions: list[str]) -> None:
    await login_as(v1, "admin")
    response = await v1.put(f"/admin/users/{await user_id(login)}/permissions", json={"permissions": permissions})
    assert response.status_code == 200, response.text


def graph_body(source_id: str, request_id: str, **updates: object) -> dict[str, object]:
    return manual_body(source_id, request_id, graph=GRAPH, **updates)


async def create_draft(v1: AsyncClient, source_id: str, tag: str) -> str:
    await seed_source(source_id)
    await login_as(v1, "teacher")
    created = await v1.post("/ai/scenarios", json=graph_body(source_id, f"t009-{tag}-create"))
    assert created.status_code == 201, created.text
    assert created.json()["graph"]["start"] == "capture"
    return created.json()["scenarioId"]



async def test_граф_валидируется_при_создании_и_изменении(v1: AsyncClient) -> None:
    source_id = "t009-builder-graph"
    await seed_source(source_id)
    await login_as(v1, "teacher")
    broken = {**GRAPH, "nodes": [*GRAPH["nodes"][:-1], {"id": "done", "type": "end", "outcome": ""}]}
    response = await v1.post("/ai/scenarios", json=manual_body(source_id, "t009-builder-bad", graph=broken))
    assert response.status_code == 400 and "Граф сценария некорректен" in response.text
    ok = await v1.post("/ai/scenarios", json=graph_body(source_id, "t009-builder-ok"))
    assert ok.status_code == 201, ok.text
    scenario_id = ok.json()["scenarioId"]

    bad_revise = await v1.post(
        f"/ai/scenarios/{scenario_id}/revise",
        json={"baseVersion": 1, "graph": {**GRAPH, "start": "ghost"}, "requestId": "t009-builder-rev-bad"},
    )
    assert bad_revise.status_code == 400
    empty = await v1.post(
        f"/ai/scenarios/{scenario_id}/revise", json={"baseVersion": 1, "requestId": "t009-builder-rev-empty"}
    )
    assert empty.status_code == 400
    new_graph = {**GRAPH, "nodes": [dict(n, outcome="finished") if n["type"] == "end" else n for n in GRAPH["nodes"]]}
    revised = await v1.post(
        f"/ai/scenarios/{scenario_id}/revise",
        json={"baseVersion": 1, "graph": new_graph, "comment": "Новый исход", "requestId": "t009-builder-rev-ok"},
    )
    assert revised.status_code == 201, revised.text
    assert revised.json()["version"] == 2 and revised.json()["graph"]["nodes"][-1]["outcome"] == "finished"
    first = await v1.get(f"/ai/scenarios/{scenario_id}/versions/1")
    assert first.json()["graph"]["nodes"][-1]["outcome"] == "completed"

    plain = await v1.post(
        f"/ai/scenarios/{scenario_id}/revise",
        json={
            "baseVersion": 2,
            "acceptedFields": [{"fieldPath": "summary", "decision": "edited", "value": "Дерево перекрыло проезд"}],
            "requestId": "t009-builder-rev-fields",
        },
    )
    assert plain.status_code == 201, plain.text
    assert plain.json()["graph"] == revised.json()["graph"]  # граф переходит в следующую версию


async def test_преподаватель_без_права_эксперта_не_проверяет_и_не_публикует(v1: AsyncClient) -> None:
    scenario_id = await create_draft(v1, "t009-builder-noperm", "noperm")
    body = {"version": 1, "requestId": "t009-noperm-submit"}
    submitted = await v1.post(f"/ai/scenarios/{scenario_id}/submit", json=body)
    assert submitted.status_code == 200 and submitted.json()["approval"] == "pending_review"

    review = {"version": 1, "decision": "accept", "requestId": "t009-noperm-review"}
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/review", json=review)).status_code == 403
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={**body, "requestId": "t009-noperm-pub"})).status_code == 403
    # старый approve для версии с графом закрыт: публикует только эксперт
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/approve", json={**body, "requestId": "t009-noperm-appr"})).status_code == 409
    await login_as(v1, "student")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/submit", json=body)).status_code == 403
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/review", json=review)).status_code == 403
    v1.cookies.clear()
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json=body)).status_code == 401


async def test_права_эксперта_выдаёт_только_администратор(v1: AsyncClient) -> None:
    target = await user_id("morozova")
    payload = {"permissions": ["scenario.review"]}
    await login_as(v1, "teacher")
    assert (await v1.put(f"/admin/users/{target}/permissions", json=payload)).status_code == 403
    await login_as(v1, "admin")
    assert (await v1.put(f"/admin/users/{target}/permissions", json=payload)).status_code == 200
    assert (await v1.get(f"/admin/users/{target}/permissions")).json() == {"userId": target, "permissions": ["scenario.review"]}
    assert (await v1.put(f"/admin/users/{target}/permissions", json={"permissions": ["scenario.delete"]})).status_code == 400
    student = await user_id("ivanov")
    assert (await v1.put(f"/admin/users/{student}/permissions", json=payload)).status_code == 400
    assert (await v1.put("/admin/users/u-nope/permissions", json=payload)).status_code == 404


async def test_эксперт_проверяет_и_публикует_а_шаги_идут_по_порядку(v1: AsyncClient) -> None:
    scenario_id = await create_draft(v1, "t009-builder-flow", "flow")
    sub = {"version": 1, "requestId": "t009-flow-submit"}
    # публиковать черновик нельзя, даже эксперту
    await grant(v1, "morozova", ["scenario.review", "scenario.publish"])
    await login_as(v1, "admin")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={"version": 1, "requestId": "t009-flow-early"})).status_code == 409
    await login_as(v1, "teacher")
    # автор-эксперт не проверяет собственную версию (четыре глаза), сначала отправка
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/submit", json=sub)).status_code == 200
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={**sub, "requestId": "t009-flow-again"})).status_code == 409
    own = await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "accept", "requestId": "t009-flow-own"})
    assert own.status_code == 403

    # эксперт-администратор: публикация без проверки — 409, после проверки — 200
    await login_as(v1, "admin")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={"version": 1, "requestId": "t009-flow-noreview"})).status_code == 409
    queue = await v1.get("/ai/scenarios", params={"approval": "pending_review"})
    assert [row["scenarioId"] for row in queue.json()] == [scenario_id]
    reviewed = await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "accept", "comment": "Маршруты верны", "requestId": "t009-flow-review"})
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["reviewedBy"] and reviewed.json()["approval"] == "pending_review"
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "accept", "requestId": "t009-flow-review2"})).status_code == 409
    published = await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={"version": 1, "requestId": "t009-flow-publish"})
    assert published.status_code == 200, published.text
    assert published.json()["approval"] == "approved" and published.json()["approvedBy"]
    # версия неизменяема: правка опубликованной базы — 409; повтор публикации — 409
    revise = await v1.post(f"/ai/scenarios/{scenario_id}/revise", json={"baseVersion": 1, "graph": GRAPH, "requestId": "t009-flow-rev"})
    assert revise.status_code == 409
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={"version": 1, "requestId": "t009-flow-pub2"})).status_code == 409


async def test_эксперт_без_publish_проверяет_но_не_публикует_и_отклонённая_версия_не_публикуется(v1: AsyncClient) -> None:
    scenario_id = await create_draft(v1, "t009-builder-expert", "expert")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={"version": 1, "requestId": "t009-exp-submit"})).status_code == 200
    await grant(v1, "morozova", ["scenario.review"])  # автор-преподаватель получает право, но он автор
    await login_as(v1, "admin")
    assert (await v1.put(f"/admin/users/{await user_id('egorov')}/permissions", json={"permissions": []})).status_code == 200
    reject_no_comment = await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "reject", "requestId": "t009-exp-r0"})
    assert reject_no_comment.status_code == 400
    rejected = await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "reject", "comment": "Нет ветки отказа", "requestId": "t009-exp-r1"})
    assert rejected.status_code == 200 and rejected.json()["approval"] == "rejected"
    assert rejected.json()["reviewComment"] == "Нет ветки отказа"
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={"version": 1, "requestId": "t009-exp-pub"})).status_code == 409
    # автор исправляет: новая версия-черновик проходит весь путь заново
    await login_as(v1, "teacher")
    fixed = await v1.post(f"/ai/scenarios/{scenario_id}/revise", json={"baseVersion": 1, "graph": GRAPH, "comment": "Исправлено", "requestId": "t009-exp-fix"})
    assert fixed.status_code == 201 and fixed.json()["approval"] == "draft" and fixed.json()["version"] == 2


async def prepare_published(v1: AsyncClient, tag: str, *, assign: bool) -> str:
    scenario_id = await create_draft(v1, f"t009-builder-{tag}", tag)
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={"version": 1, "requestId": f"t009-{tag}-s"})).status_code == 200
    await login_as(v1, "admin")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "accept", "requestId": f"t009-{tag}-r"})).status_code == 200
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={"version": 1, "requestId": f"t009-{tag}-p"})).status_code == 200
    if assign:
        card_id = (await v1.get(f"/ai/scenarios/{scenario_id}/versions/1")).json()["cardSnapshot"]["id"]
        await login_as(v1, "teacher")
        created = await v1.post(
            "/assignments",
            json={
                "trainingMode": "operator112",
                "format": "training",
                "studentIds": [await user_id("ivanov")],
                "cardIds": [card_id],
                "scenarioVersions": [{"scenarioId": scenario_id, "version": 1, "cardId": card_id}],
                "title": f"t009-{tag}",
            },
        )
        assert created.status_code == 201, created.text
    return scenario_id


async def test_обучающийся_проходит_только_опубликованную_назначенную_версию(v1: AsyncClient) -> None:
    scenario_id = await prepare_published(v1, "run", assign=True)
    path = f"/ai/scenarios/{scenario_id}/versions/1/runs"

    await login_as(v1, "student2")  # другой обучающийся: версия ему не назначена
    assert (await v1.post(path)).status_code == 403
    await login_as(v1, "teacher")
    assert (await v1.post(path)).status_code == 403  # проходит обучающийся
    v1.cookies.clear()
    assert (await v1.post(path)).status_code == 401

    await login_as(v1, "student")
    started = await v1.post(path)
    assert started.status_code == 201, started.text
    run = started.json()
    assert run["status"] == "waiting" and run["steps"] == 1
    assert "events" not in run and "facts" not in run  # маршруты и факты студенту не раскрываются
    run_id = run["runId"]

    wrong = await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "notify:103"})
    assert wrong.status_code == 409 and "captureCaller" not in wrong.text  # ожидаемое действие не раскрывается
    bad_fact = await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "captureCaller", "facts": {"x": {"a": 1}}})
    assert bad_fact.status_code == 400
    step = await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "captureCaller", "facts": {"urgency": "high"}})
    assert step.status_code == 200 and step.json()["status"] == "waiting"
    done = await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "notify:103"})
    assert done.status_code == 200 and done.json()["status"] == "completed" and done.json()["outcome"] == "completed"
    assert (await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "notify:103"})).status_code == 409
    assert (await v1.post(f"/ai/scenario-runs/{run_id}/finish")).status_code == 409

    await login_as(v1, "student2")
    assert (await v1.get(f"/ai/scenario-runs/{run_id}")).status_code == 403
    await login_as(v1, "student")
    assert (await v1.get(f"/ai/scenario-runs/{run_id}")).json()["status"] == "completed"
    await login_as(v1, "teacher")  # автор видит журнал событий
    staff = (await v1.get(f"/ai/scenario-runs/{run_id}")).json()
    assert [event["kind"] for event in staff["events"]] == ["started", "action", "branch", "action", "ended"]
    assert [e["data"].get("branch") for e in staff["events"] if e["kind"] == "branch"] == ["urgent"]
    await login_as(v1, "student")
    assert (await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "x"})).status_code == 409


async def test_обучающемуся_недоступны_черновики_неназначенные_и_версии_без_графа(v1: AsyncClient) -> None:
    draft_id = await create_draft(v1, "t009-builder-student-draft", "sd")
    await login_as(v1, "student")
    assert (await v1.post(f"/ai/scenarios/{draft_id}/versions/1/runs")).status_code == 403
    assert (await v1.get(f"/ai/scenarios/{draft_id}/versions/1")).status_code == 403
    assert (await v1.get("/ai/scenarios")).status_code == 403

    unassigned = await prepare_published(v1, "unassigned", assign=False)
    await login_as(v1, "student")
    assert (await v1.post(f"/ai/scenarios/{unassigned}/versions/1/runs")).status_code == 403

    # завершить прогон может только его владелец
    assigned = await prepare_published(v1, "finish", assign=True)
    await login_as(v1, "student")
    run_id = (await v1.post(f"/ai/scenarios/{assigned}/versions/1/runs")).json()["runId"]
    await login_as(v1, "student2")
    assert (await v1.post(f"/ai/scenario-runs/{run_id}/finish")).status_code == 403
    await login_as(v1, "student")
    finished = await v1.post(f"/ai/scenario-runs/{run_id}/finish")
    assert finished.status_code == 200 and finished.json()["status"] == "aborted"


async def test_обычный_сценарий_без_графа_утверждается_как_раньше(v1: AsyncClient) -> None:
    source_id = "t009-builder-legacy"
    await seed_source(source_id)
    await login_as(v1, "teacher")
    created = await v1.post("/ai/scenarios", json=manual_body(source_id, "t009-legacy-create"))
    scenario_id = created.json()["scenarioId"]
    assert "graph" not in created.json()
    approved = await v1.post(f"/ai/scenarios/{scenario_id}/approve", json={"version": 1, "requestId": "t009-legacy-approve"})
    assert approved.status_code == 200 and approved.json()["approval"] == "approved"
    # без графа прохождение недоступно, даже если версия утверждена и назначена
    card_id = approved.json()["cardSnapshot"]["id"]
    assignment = await v1.post(
        "/assignments",
        json={"trainingMode": "operator112", "format": "training", "studentIds": [await user_id("ivanov")],
              "cardIds": [card_id], "scenarioVersions": [{"scenarioId": scenario_id, "version": 1, "cardId": card_id}], "title": "t009-legacy"},
    )
    assert assignment.status_code == 201, assignment.text
    await login_as(v1, "student")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).status_code == 409


async def test_право_review_и_publish_проверяется_отдельно_от_авторства(v1: AsyncClient) -> None:
    source_id = "t009-builder-perm-split"
    await seed_source(source_id)
    await login_as(v1, "admin")  # автор — администратор, поэтому преподаватель не автор версии
    created = await v1.post("/ai/scenarios", json=graph_body(source_id, "t009-split-create"))
    scenario_id = created.json()["scenarioId"]
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={"version": 1, "requestId": "t009-split-submit"})).status_code == 200
    review = {"version": 1, "decision": "accept", "requestId": "t009-split-review"}
    publish = {"version": 1, "requestId": "t009-split-publish"}

    await login_as(v1, "teacher")
    assert (await v1.get(f"/ai/scenarios/{scenario_id}/versions/1")).status_code == 403  # без прав чужой сценарий не виден
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/review", json=review)).status_code == 403
    await grant(v1, "morozova", ["scenario.publish"])
    await login_as(v1, "teacher")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/review", json=review)).status_code == 403  # publish не заменяет review
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json=publish)).status_code == 409  # прав хватает, нет проверки
    await grant(v1, "morozova", ["scenario.review"])
    await login_as(v1, "teacher")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/review", json=review)).status_code == 200
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={**publish, "requestId": "t009-split-p2"})).status_code == 403  # review не заменяет publish
    await grant(v1, "morozova", ["scenario.review", "scenario.publish"])
    await login_as(v1, "teacher")
    published = await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={**publish, "requestId": "t009-split-p3"})
    assert published.status_code == 200 and published.json()["approval"] == "approved"
