"""Интеграция конструктора сценариев 112: черновик → проверка → публикация → прохождение обучающимся."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.orm.attributes import set_committed_value

from app.db.session import get_sessionmaker
from app.models.ai_scenario import ScenarioRunRecord, ScenarioVersion
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

    wrong = await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "notify:103", "expectedSteps": 1})
    assert wrong.status_code == 409 and "captureCaller" not in wrong.text  # ожидаемое действие не раскрывается
    bad_fact = await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "captureCaller", "expectedSteps": 1, "facts": {"x": {"a": 1}}})
    assert bad_fact.status_code == 400
    step = await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "captureCaller", "expectedSteps": 1, "facts": {"urgency": "high"}})
    assert step.status_code == 200 and step.json()["status"] == "waiting" and step.json()["steps"] == 3
    done = await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "notify:103", "expectedSteps": 3})
    assert done.status_code == 200 and done.json()["status"] == "completed" and done.json()["outcome"] == "completed"
    assert (await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "notify:103", "expectedSteps": 4})).status_code == 409
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
    assert (await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "x", "expectedSteps": 4})).status_code == 409


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


async def test_двойной_старт_возвращает_тот_же_прогон_а_не_создаёт_второй(v1: AsyncClient) -> None:
    scenario_id = await prepare_published(v1, "dbl", assign=True)
    await login_as(v1, "student")
    first = await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")
    second = await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["runId"] == second.json()["runId"]
    async with get_sessionmaker()() as db:
        assert len((await db.execute(select(ScenarioRunRecord))).scalars().all()) == 1
    # после завершения можно начать заново
    assert (await v1.post(f"/ai/scenario-runs/{first.json()['runId']}/finish")).status_code == 200
    third = await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")
    assert third.status_code == 201 and third.json()["runId"] != first.json()["runId"]


async def test_устаревшее_ожидание_шагов_даёт_409_без_изменения_прогона(v1: AsyncClient) -> None:
    scenario_id = await prepare_published(v1, "stale", assign=True)
    await login_as(v1, "student")
    run = (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).json()
    url = f"/ai/scenario-runs/{run['runId']}/actions"
    stale = await v1.post(url, json={"action": "captureCaller", "expectedSteps": run["steps"] + 5})
    assert stale.status_code == 409
    assert (await v1.get(f"/ai/scenario-runs/{run['runId']}")).json()["steps"] == run["steps"]
    ok = await v1.post(url, json={"action": "captureCaller", "expectedSteps": run["steps"]})
    assert ok.status_code == 200 and ok.json()["steps"] > run["steps"]
    assert (await v1.post(url, json={"action": "notify:103", "expectedSteps": 0})).status_code == 400


async def test_параллельные_действия_не_теряют_события(v1: AsyncClient, monkeypatch) -> None:
    import asyncio

    from app.services import scenario_runs

    scenario_id = await prepare_published(v1, "race", assign=True)
    await login_as(v1, "student")
    run_id = (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).json()["runId"]
    real = scenario_runs._published

    async def slow(*args, **kwargs):
        result = await real(*args, **kwargs)
        await asyncio.sleep(0.05)  # оба запроса успевают прочитать одну и ту же ревизию
        return result

    monkeypatch.setattr(scenario_runs, "_published", slow)
    url = f"/ai/scenario-runs/{run_id}/actions"
    responses = await asyncio.gather(
        v1.post(url, json={"action": "captureCaller", "expectedSteps": 1, "facts": {"urgency": "low"}}),
        v1.post(url, json={"action": "captureCaller", "expectedSteps": 1, "facts": {"urgency": "high"}}),
    )
    monkeypatch.undo()
    assert sorted(response.status_code for response in responses) == [200, 409], [r.text for r in responses]
    await login_as(v1, "admin")
    events = (await v1.get(f"/ai/scenario-runs/{run_id}")).json()["events"]
    assert [event["kind"] for event in events].count("action") == 1  # ровно одно действие, без потерь и дублей


async def test_завершённое_задание_закрывает_запуск_но_не_завершение(v1: AsyncClient) -> None:
    scenario_id = await prepare_published(v1, "closed", assign=True)
    await login_as(v1, "student")
    run_id = (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).json()["runId"]
    async with get_sessionmaker()() as db:
        for row in (await db.execute(select(Assignment).where(Assignment.title == "t009-closed"))).scalars().all():
            row.state = "finished"
        await db.commit()
    assert (await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "captureCaller", "expectedSteps": 1})).status_code == 403
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).status_code == 403
    assert (await v1.post(f"/ai/scenario-runs/{run_id}/finish")).status_code == 200


async def test_параллельная_правка_версии_даёт_409_а_не_500(v1: AsyncClient, monkeypatch) -> None:
    from app.services import ai_scenario_review

    scenario_id = await create_draft(v1, "t009-builder-revrace", "revrace")
    first = await v1.post(f"/ai/scenarios/{scenario_id}/revise", json={"baseVersion": 1, "graph": GRAPH, "requestId": "t009-revrace-1"})
    assert first.status_code == 201

    async def stale_latest(*args, **kwargs):
        return 1  # конкурент уже создал версию 2, а этот запрос видит старое состояние

    monkeypatch.setattr(ai_scenario_review, "_latest_version", stale_latest)
    raced = await v1.post(f"/ai/scenarios/{scenario_id}/revise", json={"baseVersion": 1, "graph": GRAPH, "requestId": "t009-revrace-2"})
    assert raced.status_code == 409, raced.text
    monkeypatch.undo()
    versions = await v1.get(f"/ai/scenarios/{scenario_id}/versions")
    assert [item["version"] for item in versions.json()] == [1, 2]


async def test_повтор_запроса_с_тем_же_requestId_возвращает_тот_же_ответ(v1: AsyncClient) -> None:
    scenario_id = await create_draft(v1, "t009-builder-replay", "replay")
    submit = {"version": 1, "requestId": "t009-replay-submit"}
    first = await v1.post(f"/ai/scenarios/{scenario_id}/submit", json=submit)
    again = await v1.post(f"/ai/scenarios/{scenario_id}/submit", json=submit)
    assert first.status_code == again.status_code == 200 and first.json() == again.json()
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={**submit, "version": 2})).status_code == 409  # тот же id, иное тело

    await login_as(v1, "admin")
    review = {"version": 1, "decision": "accept", "requestId": "t009-replay-review"}
    r1 = await v1.post(f"/ai/scenarios/{scenario_id}/review", json=review)
    r2 = await v1.post(f"/ai/scenarios/{scenario_id}/review", json=review)
    assert r1.status_code == r2.status_code == 200 and r1.json() == r2.json()
    publish = {"version": 1, "requestId": "t009-replay-publish"}
    p1 = await v1.post(f"/ai/scenarios/{scenario_id}/publish", json=publish)
    p2 = await v1.post(f"/ai/scenarios/{scenario_id}/publish", json=publish)
    assert p1.status_code == p2.status_code == 200 and p1.json() == p2.json()
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={**publish, "requestId": "t009-replay-new"})).status_code == 409
    async with get_sessionmaker()() as db:
        actions = (await db.execute(select(AuditLog.action).where(AuditLog.details.like(f"%{scenario_id}%")))).scalars().all()
    assert actions.count("ai.scenario.publish") == 1 and actions.count("ai.scenario.submit") == 1


async def test_старая_версия_не_публикуется_и_не_запускается_после_новой(v1: AsyncClient) -> None:
    scenario_id = await create_draft(v1, "t009-builder-old", "old")
    second = await v1.post(f"/ai/scenarios/{scenario_id}/revise", json={"baseVersion": 1, "graph": GRAPH, "comment": "v2", "requestId": "t009-old-rev"})
    assert second.status_code == 201
    old = {"version": 1, "requestId": "t009-old-submit"}
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/submit", json=old)).status_code == 409  # версия 1 устарела
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={"version": 2, "requestId": "t009-old-submit2"})).status_code == 200
    await login_as(v1, "admin")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "accept", "requestId": "t009-old-r1"})).status_code == 409
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 2, "decision": "accept", "requestId": "t009-old-r2"})).status_code == 200
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={"version": 1, "requestId": "t009-old-p1"})).status_code == 409
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={"version": 2, "requestId": "t009-old-p2"})).status_code == 200
    card_id = (await v1.get(f"/ai/scenarios/{scenario_id}/versions/2")).json()["cardSnapshot"]["id"]
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"trainingMode": "operator112", "format": "training", "studentIds": [await user_id("ivanov")], "cardIds": [card_id], "scenarioVersions": [{"scenarioId": scenario_id, "version": 2, "cardId": card_id}], "title": "t009-old"})
    assert created.status_code == 201, created.text
    bad = await v1.post("/assignments", json={"trainingMode": "operator112", "format": "training", "studentIds": [await user_id("ivanov")], "cardIds": [card_id], "scenarioVersions": [{"scenarioId": scenario_id, "version": 1, "cardId": card_id}], "title": "t009-old-bad"})
    assert bad.status_code == 400  # неутверждённую версию 1 назначить нельзя
    await login_as(v1, "student")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).status_code == 403
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/versions/2/runs")).status_code == 201


async def test_результат_прогона_зависит_от_фактов_и_ветки_else(v1: AsyncClient) -> None:
    scenario_id = await prepare_published(v1, "else", assign=True)
    await login_as(v1, "student")
    run_id = (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).json()["runId"]
    done = await v1.post(f"/ai/scenario-runs/{run_id}/actions", json={"action": "captureCaller", "expectedSteps": 1, "facts": {"urgency": "low"}})
    assert done.json()["status"] == "completed" and done.json()["outcome"] == "completed" and done.json()["steps"] == 3
    await login_as(v1, "admin")
    events = (await v1.get(f"/ai/scenario-runs/{run_id}")).json()["events"]
    assert [e["data"].get("branch") for e in events if e["kind"] == "branch"] == ["routine"]
    assert [e["kind"] for e in events] == ["started", "action", "branch", "ended"]
    assert events[1]["data"] == {"action": "captureCaller", "set": {"urgency": "low"}}


DOUBLE_ASK = {
    "schemaVersion": "scenario-graph/1",
    "start": "n1",
    "nodes": [
        {"id": "n1", "type": "action", "action": "askAddress", "next": "n2"},
        {"id": "n2", "type": "action", "action": "askAddress", "next": "n3"},
        {"id": "n3", "type": "end", "outcome": "completed"},
    ],
}


async def prepare_with_graph(v1: AsyncClient, tag: str, graph: dict[str, Any]) -> str:
    await seed_source(f"t009-builder-{tag}")
    await login_as(v1, "teacher")
    created = await v1.post("/ai/scenarios", json=manual_body(f"t009-builder-{tag}", f"t009-{tag}-c", graph=graph))
    assert created.status_code == 201, created.text
    scenario_id = created.json()["scenarioId"]
    await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={"version": 1, "requestId": f"t009-{tag}-s"})
    await login_as(v1, "admin")
    await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "accept", "requestId": f"t009-{tag}-r"})
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={"version": 1, "requestId": f"t009-{tag}-p"})).status_code == 200
    card_id = (await v1.get(f"/ai/scenarios/{scenario_id}/versions/1")).json()["cardSnapshot"]["id"]
    await login_as(v1, "teacher")
    assert (await v1.post("/assignments", json={"trainingMode": "operator112", "format": "training", "studentIds": [await user_id("ivanov")], "cardIds": [card_id], "scenarioVersions": [{"scenarioId": scenario_id, "version": 1, "cardId": card_id}], "title": f"t009-{tag}"})).status_code == 201
    await login_as(v1, "student")
    return scenario_id


async def test_повтор_действия_с_тем_же_ожиданием_шагов_не_продвигает_прогон_дважды(v1: AsyncClient) -> None:
    scenario_id = await prepare_with_graph(v1, "dup", DOUBLE_ASK)
    run = (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).json()
    url = f"/ai/scenario-runs/{run['runId']}/actions"
    assert (await v1.post(url, json={"action": "askAddress"})).status_code == 400  # expectedSteps обязателен
    body = {"action": "askAddress", "expectedSteps": run["steps"]}
    first = await v1.post(url, json=body)
    assert first.status_code == 200 and first.json()["status"] == "waiting"
    retry = await v1.post(url, json=body)  # повтор после таймаута клиента
    assert retry.status_code == 409
    second = await v1.post(url, json={"action": "askAddress", "expectedSteps": first.json()["steps"]})
    assert second.status_code == 200 and second.json()["status"] == "completed"


async def test_параллельный_старт_упирается_в_уникальный_индекс_и_возвращает_активный_прогон(v1: AsyncClient, monkeypatch) -> None:
    from app.services import scenario_runs

    scenario_id = await prepare_published(v1, "pstart", assign=True)
    await login_as(v1, "student")
    path = f"/ai/scenarios/{scenario_id}/versions/1/runs"
    first = await v1.post(path)
    assert first.status_code == 201
    real = scenario_runs._active_run
    calls = {"n": 0}

    async def stale_first_read(*args, **kwargs):
        calls["n"] += 1
        return None if calls["n"] == 1 else await real(*args, **kwargs)  # параллельный запрос ещё не видел прогон

    monkeypatch.setattr(scenario_runs, "_active_run", stale_first_read)
    second = await v1.post(path)
    monkeypatch.undo()
    assert second.status_code == 200 and second.json()["runId"] == first.json()["runId"], second.text
    async with get_sessionmaker()() as db:
        assert len((await db.execute(select(ScenarioRunRecord))).scalars().all()) == 1


async def test_отклонённую_или_проверяемую_версию_нельзя_утвердить_старым_approve(v1: AsyncClient) -> None:
    source_id = "t009-builder-bypass"
    await seed_source(source_id)
    await login_as(v1, "teacher")
    created = await v1.post("/ai/scenarios", json=manual_body(source_id, "t009-bypass-create"))
    scenario_id = created.json()["scenarioId"]
    approve = {"version": 1, "requestId": "t009-bypass-approve"}
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={"version": 1, "requestId": "t009-bypass-submit"})).status_code == 200
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/approve", json=approve)).status_code == 409  # на проверке
    await login_as(v1, "admin")
    rejected = await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "reject", "comment": "   ", "requestId": "t009-bypass-r0"})
    assert rejected.status_code == 400  # пробелы вместо комментария не принимаются
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "reject", "comment": "Нет", "requestId": "t009-bypass-r1"})).status_code == 200
    await login_as(v1, "teacher")
    assert (await v1.post(f"/ai/scenarios/{scenario_id}/approve", json={**approve, "requestId": "t009-bypass-approve2"})).status_code == 409  # отклонена


async def test_граф_с_нехешируемым_start_даёт_400_а_не_500(v1: AsyncClient) -> None:
    await seed_source("t009-builder-badstart")
    await login_as(v1, "teacher")
    for index, start in enumerate(([], {}, ["a"], 5, None)):
        response = await v1.post("/ai/scenarios", json=manual_body("t009-builder-badstart", f"t009-badstart-{index}", graph={**GRAPH, "start": start}))
        assert response.status_code == 400, (start, response.text)


async def test_вложенные_поля_карточки_доступны_условиям_и_не_перезаписываются_студентом(v1: AsyncClient) -> None:
    graph = {
        "schemaVersion": "scenario-graph/1",
        "start": "a",
        "nodes": [
            {"id": "a", "type": "action", "action": "ask", "next": "c"},
            {"id": "c", "type": "condition", "branches": [{"name": "witness", "when": {"fact": "caller.status", "op": "eq", "value": "очевидец"}, "next": "w"}], "else": {"name": "other", "next": "o"}},
            {"id": "w", "type": "end", "outcome": "witness"},
            {"id": "o", "type": "end", "outcome": "other"},
        ],
    }
    scenario_id = await prepare_with_graph(v1, "nested", graph)
    run = (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).json()
    url = f"/ai/scenario-runs/{run['runId']}/actions"
    forged = await v1.post(url, json={"action": "ask", "expectedSteps": run["steps"], "facts": {"caller.status": "другое"}})
    assert forged.status_code == 400  # факт карточки задан эталоном и не меняется студентом
    done = await v1.post(url, json={"action": "ask", "expectedSteps": run["steps"], "facts": {"note": "ok"}})
    assert done.json()["outcome"] == "witness"


async def test_параллельная_публикация_даёт_один_успех_и_409(v1: AsyncClient, monkeypatch) -> None:
    import asyncio

    from app.services import scenario_workflow

    scenario_id = await create_draft(v1, "t009-builder-ppub", "ppub")
    await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={"version": 1, "requestId": "t009-ppub-s"})
    await login_as(v1, "admin")
    await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "accept", "requestId": "t009-ppub-r"})
    real = scenario_workflow._load_current

    async def slow(*args, **kwargs):
        result = await real(*args, **kwargs)
        await asyncio.sleep(0.05)
        return result

    monkeypatch.setattr(scenario_workflow, "_load_current", slow)
    url = f"/ai/scenarios/{scenario_id}/publish"
    responses = await asyncio.gather(
        v1.post(url, json={"version": 1, "requestId": "t009-ppub-1"}),
        v1.post(url, json={"version": 1, "requestId": "t009-ppub-2"}),
    )
    monkeypatch.undo()
    assert sorted(r.status_code for r in responses) == [200, 409], [r.text for r in responses]


async def test_решение_эксперта_не_перезаписывается_параллельным_решением(v1: AsyncClient, monkeypatch) -> None:
    from app.services import scenario_workflow

    scenario_id = await create_draft(v1, "t009-builder-rrace", "rrace")
    await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={"version": 1, "requestId": "t009-rrace-s"})
    await login_as(v1, "admin")
    rejected = await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "reject", "comment": "Первый эксперт", "requestId": "t009-rrace-a"})
    assert rejected.status_code == 200
    real = scenario_workflow._load_current

    async def stale(db, *args, **kwargs):
        version = await real(db, *args, **kwargs)
        db.expunge(version)  # второй эксперт ещё видит «на проверке, не проверена»
        version.approval, version.reviewed_by = "pending_review", None
        return version

    monkeypatch.setattr(scenario_workflow, "_load_current", stale)
    late = await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "accept", "requestId": "t009-rrace-b"})
    monkeypatch.undo()
    assert late.status_code == 409, late.text
    row = (await v1.get(f"/ai/scenarios/{scenario_id}/versions/1")).json()
    assert row["approval"] == "rejected" and row["reviewComment"] == "Первый эксперт"


async def test_публикация_не_затирает_параллельно_изменённый_документ_сценария(v1: AsyncClient, monkeypatch) -> None:
    from app.models.scenario import Scenario
    from app.services import scenario_workflow

    scenario_id = await create_draft(v1, "t009-builder-docrace", "docrace")
    await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={"version": 1, "requestId": "t009-docrace-s"})
    await login_as(v1, "admin")
    await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "accept", "requestId": "t009-docrace-r"})
    async with get_sessionmaker()() as db:  # конкурент успел дописать документ сценария
        row = await db.get(Scenario, scenario_id)
        row.doc = {**row.doc, "competitorMark": "keep"}
        await db.commit()
    real = scenario_workflow.require_read_access

    async def stale_scenario(db, *args, **kwargs):
        scenario = await real(db, *args, **kwargs)
        stale_doc = {key: value for key, value in scenario.doc.items() if key != "competitorMark"}
        set_committed_value(scenario, "doc", stale_doc)  # устаревшая копия без отметки изменения
        return scenario

    monkeypatch.setattr(scenario_workflow, "require_read_access", stale_scenario)
    published = await v1.post(f"/ai/scenarios/{scenario_id}/publish", json={"version": 1, "requestId": "t009-docrace-p"})
    monkeypatch.undo()
    assert published.status_code == 200, published.text
    async with get_sessionmaker()() as db:
        doc = (await db.get(Scenario, scenario_id)).doc
    assert doc["competitorMark"] == "keep" and doc["validation"]["status"] == "approved"


async def test_коллизия_идентификатора_при_создании_повторяется_а_не_даёт_500(v1: AsyncClient, monkeypatch) -> None:
    from app.models.card import IncidentCard
    from app.services import ai_scenario_service

    await seed_source("t009-builder-idrace")
    await login_as(v1, "teacher")
    async with get_sessionmaker()() as db:
        existing_card = (await db.execute(select(IncidentCard.id).limit(1))).scalar_one()
    real = ai_scenario_service.next_id
    calls = {"n": 0}

    async def colliding(*args, **kwargs):
        calls["n"] += 1
        return existing_card if calls["n"] == 1 else await real(*args, **kwargs)  # параллельный запрос занял id

    monkeypatch.setattr(ai_scenario_service, "next_id", colliding)
    created = await v1.post("/ai/scenarios", json=manual_body("t009-builder-idrace", "t009-idrace-c", graph=GRAPH))
    monkeypatch.undo()
    assert created.status_code == 201, created.text
    assert created.json()["cardSnapshot"]["id"] != existing_card
    async with get_sessionmaker()() as db:
        rows = (await db.execute(select(ScenarioVersion).where(ScenarioVersion.source_ticket_id == "t009-builder-idrace"))).scalars().all()
    assert len(rows) == 1


async def test_повторное_завершение_прогона_обучающимся_идемпотентно(v1: AsyncClient) -> None:
    scenario_id = await prepare_published(v1, "fin2", assign=True)
    await login_as(v1, "student")
    run_id = (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).json()["runId"]
    first = await v1.post(f"/ai/scenario-runs/{run_id}/finish")
    again = await v1.post(f"/ai/scenario-runs/{run_id}/finish")
    assert first.status_code == again.status_code == 200 and first.json() == again.json()
    async with get_sessionmaker()() as db:
        actions = (await db.execute(select(AuditLog.action).where(AuditLog.details.like(f"%{run_id}%")))).scalars().all()
    assert actions.count("ai.scenario.run.finish") == 1
    # завершённый графом прогон по-прежнему не «завершается» повторно
    done_id = (await v1.post(f"/ai/scenarios/{scenario_id}/versions/1/runs")).json()["runId"]
    await v1.post(f"/ai/scenario-runs/{done_id}/actions", json={"action": "captureCaller", "expectedSteps": 1, "facts": {"urgency": "low"}})
    assert (await v1.post(f"/ai/scenario-runs/{done_id}/finish")).status_code == 409


async def test_принятая_проверка_не_превращается_в_отклонение_параллельным_экспертом(v1: AsyncClient, monkeypatch) -> None:
    from app.services import scenario_workflow

    scenario_id = await create_draft(v1, "t009-builder-arace", "arace")
    await v1.post(f"/ai/scenarios/{scenario_id}/submit", json={"version": 1, "requestId": "t009-arace-s"})
    await login_as(v1, "admin")
    accepted = await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "accept", "requestId": "t009-arace-a"})
    assert accepted.status_code == 200
    real = scenario_workflow._load_current

    async def stale(db, *args, **kwargs):
        version = await real(db, *args, **kwargs)
        db.expunge(version)
        version.reviewed_by = None
        return version

    monkeypatch.setattr(scenario_workflow, "_load_current", stale)
    late = await v1.post(f"/ai/scenarios/{scenario_id}/review", json={"version": 1, "decision": "reject", "comment": "Поздно", "requestId": "t009-arace-b"})
    monkeypatch.undo()
    assert late.status_code == 409, late.text
    row = (await v1.get(f"/ai/scenarios/{scenario_id}/versions/1")).json()
    assert row["approval"] == "pending_review" and row["reviewedBy"] == accepted.json()["reviewedBy"] and "reviewComment" not in row
