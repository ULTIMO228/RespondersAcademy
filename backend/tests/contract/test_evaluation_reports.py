"""T050: контракт строк 39–43 (docs/mock-api.md): /reports, /reports/journal, /reports/feedback, /attempts/{id}/evaluation."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import login_as

EVALUATION_FIELDS = {"timeScore", "correctnessScore", "grammarScore", "semanticScore", "totalScore", "grammarErrors", "errors", "aiComment"}
REPORT_FIELDS = {"id", "sessionId", "generatedAt", "exportFormats", "student", "timeMetrics", "grammarErrors", "errors", "score", "charts"}
JOURNAL_ROW_FIELDS = {"sessionId", "teacherId", "teacherName", "startedAt", "finishedAt", "groups", "categories", "students", "averageScore", "status", "mode", "cardSource", "generatedAt", "buildSec"}
STATIC_SESSION = "ses-2026-09-16-01"


@pytest.mark.asyncio
async def test_get_evaluation_seeded(client: AsyncClient):
    response = await client.get("/attempts/att-01/evaluation")
    assert response.status_code == 200
    body = response.json()
    assert EVALUATION_FIELDS <= set(body)
    assert body["totalScore"] == 98
    assert 0 <= body["timeScore"] <= 100


@pytest.mark.asyncio
async def test_get_evaluation_not_found(client: AsyncClient):
    response = await client.get("/attempts/att-999/evaluation")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "notFound"


@pytest.mark.asyncio
async def test_get_evaluation_student_isolation(client: AsyncClient):
    await login_as(client, "student")  # ivanov = u-005, попытка att-03 — курсанта u-006
    response = await client.get("/attempts/att-03/evaluation")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    own = await client.get("/attempts/att-01/evaluation")
    assert own.status_code == 200
    client.cookies.clear()


@pytest.mark.asyncio
async def test_override_validation_and_roles(client: AsyncClient):
    bad_score = await client.post("/attempts/att-02/evaluation", json={"teacherId": "u-002", "score": 101, "comment": "x"})
    assert bad_score.status_code == 400 and bad_score.json()["error"]["code"] == "validationFailed"
    no_comment = await client.post("/attempts/att-02/evaluation", json={"teacherId": "u-002", "score": 80, "comment": "  "})
    assert no_comment.status_code == 400
    wrong_role = await client.post("/attempts/att-02/evaluation", json={"teacherId": "u-005", "score": 80, "comment": "x"})
    assert wrong_role.status_code == 403
    missing = await client.post("/attempts/att-999/evaluation", json={"teacherId": "u-002", "score": 80, "comment": "x"})
    assert missing.status_code == 404
    await login_as(client, "student")
    as_student = await client.post("/attempts/att-01/evaluation", json={"teacherId": "u-002", "score": 80, "comment": "x"})
    assert as_student.status_code == 403
    client.cookies.clear()


@pytest.mark.asyncio
async def test_reports_static_session(client: AsyncClient):
    response = await client.get("/reports", params={"sessionId": STATIC_SESSION})
    assert response.status_code == 200
    body = response.json()
    assert {r["id"] for r in body["reports"]} == {"rep-2026-09-16-01-u-005", "rep-2026-09-16-01-u-006", "rep-2026-09-16-01-u-007"}
    assert all(REPORT_FIELDS <= set(r) for r in body["reports"])
    group = body["groupReport"]
    assert group["id"] == "rep-2026-09-16-group"
    assert group["reportIds"] == [r["id"] for r in body["reports"]]
    assert {"scoreByStudent", "reactionByAttempt", "errorsByCriterion"} <= set(group["charts"])
    # Балл — среднее по попыткам курсанта (98 и 95 → 96), как в reports.json.
    ivanov = next(r for r in body["reports"] if r["student"]["studentId"] == "u-005")
    assert ivanov["score"] == 96 and ivanov["charts"]["dynamics"]["scores"] == [98, 95]


@pytest.mark.asyncio
async def test_reports_requires_params_and_session_exists(client: AsyncClient):
    assert (await client.get("/reports")).status_code == 400
    assert (await client.get("/reports", params={"sessionId": "ses-none"})).status_code == 404
    assert (await client.get("/reports", params={"studentId": "u-005"})).status_code == 401


@pytest.mark.asyncio
async def test_reports_student_scope(client: AsyncClient):
    await login_as(client, "student")
    foreign = await client.get("/reports", params={"sessionId": STATIC_SESSION, "studentId": "u-006"})
    assert foreign.status_code == 403
    own = await client.get("/reports", params={"sessionId": STATIC_SESSION})
    assert own.status_code == 200
    assert [r["student"]["studentId"] for r in own.json()["reports"]] == ["u-005"]
    assert own.json()["groupReport"] is None
    journal = await client.get("/reports/journal")
    assert journal.status_code == 403
    client.cookies.clear()


@pytest.mark.asyncio
async def test_reports_journal(client: AsyncClient):
    response = await client.get("/reports/journal")
    assert response.status_code == 200
    body = response.json()
    assert {"rows", "filters"} <= set(body)
    assert {"groups", "students", "categories"} <= set(body["filters"])
    rows = {row["sessionId"]: row for row in body["rows"]}
    assert all(JOURNAL_ROW_FIELDS <= set(row) for row in body["rows"])
    static = rows[STATIC_SESSION]
    assert static["status"] == "ready" and static["buildSec"] == 22
    assert rows["ses-2026-09-17-demo"]["status"] == "draft" and rows["ses-2026-09-17-demo"]["buildSec"] is None
    filtered = await client.get("/reports/journal", params={"from": "2026-09-16", "to": "2026-09-16"})
    assert [r["sessionId"] for r in filtered.json()["rows"]] == [STATIC_SESSION]
    assert filtered.json()["filters"] == body["filters"]
    by_student = await client.get("/reports/journal", params={"studentId": "u-005"})
    assert STATIC_SESSION in {r["sessionId"] for r in by_student.json()["rows"]}


@pytest.mark.asyncio
async def test_feedback_upsert(client: AsyncClient):
    payload = {"reportId": "rep-2026-09-16-01-u-006", "teacherId": "u-002", "text": "Повторить регламент точки C", "recommendations": ["Звонок 301", ""]}
    created = await client.post("/reports/feedback", json=payload)
    assert created.status_code == 201
    body = created.json()
    assert body["reportId"] == payload["reportId"] and body["studentId"] == "u-006" and body["by"] == "u-002"
    assert body["recommendations"] == ["Звонок 301"] and body["byName"]
    again = await client.post("/reports/feedback", json={**payload, "text": "Обновлено"})
    assert again.status_code == 201 and again.json()["text"] == "Обновлено"
    reports = await client.get("/reports", params={"sessionId": STATIC_SESSION})
    petrov = next(r for r in reports.json()["reports"] if r["student"]["studentId"] == "u-006")
    assert petrov["teacherFeedback"]["text"] == "Обновлено"
    assert (await client.post("/reports/feedback", json={**payload, "reportId": "rep-none"})).status_code == 404
    assert (await client.post("/reports/feedback", json={**payload, "text": ""})).status_code == 400
