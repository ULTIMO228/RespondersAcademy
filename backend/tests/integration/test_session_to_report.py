"""T050: «мастер → start → attempt → statuses → progress complete → stop → control report → GET /reports →
POST evaluation override → POST feedback»: балл отчёта пересчитан, аудит содержит evaluation.override,
generatedAt стабилен при повторе."""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.audit import AuditLog
from app.models.report import CalibrationSample
from app.models.session import Attempt
from tests.conftest import login_as

TEACHER_ID = "u-002"
SCENARIO_ID = "s-005"


def _now(offset_seconds: int = 0) -> str:
    moment = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))) + dt.timedelta(seconds=offset_seconds)
    return moment.isoformat(timespec="seconds")


@pytest.mark.asyncio
async def test_session_to_report_flow(client):
    student = await login_as(client, "student2")
    student_id = student["userId"]
    client.cookies.clear()

    created = await client.post("/sessions", json={"teacherId": TEACHER_ID, "studentIds": [student_id], "scenarioIds": [SCENARIO_ID], "mode": "practice", "cardSource": "generated"})
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]
    started = await client.post(f"/sessions/{session_id}/start")
    assert started.status_code == 200
    flow = [i for i in started.json()["cardFlow"] if i["studentId"] == student_id]
    async with get_sessionmaker()() as db:
        attempted_cards = set((await db.execute(select(Attempt.card_id).where(Attempt.student_id == student_id))).scalars().all())
    # card_runtime общий на карточку; старая попытка этого курсанта вернулась бы как created: false.
    for item in flow:
        details = await client.get(f"/cards/{item['cardId']}")
        if item["cardId"] not in attempted_cards and not details.json()["runtime"]["statusEvents"]:
            card_id, issued_at = item["cardId"], item["issuedAt"]
            break
    else:
        pytest.fail("нет свободной карточки в потоке занятия")

    # Отчёта у незавершённого занятия нет.
    empty = await client.get("/reports", params={"sessionId": session_id})
    assert empty.status_code == 200 and empty.json() == {"reports": [], "groupReport": None}

    opened = await client.post(f"/cards/{card_id}/attempt", json={"studentId": student_id, "issuedAt": issued_at})
    assert opened.status_code == 201, opened.text
    assert opened.json()["sessionId"] == session_id and opened.json()["created"] is True
    attempt_id = opened.json()["attempt"]["id"]
    for status in ("accepted", "responseStarted", "arrived", "workInProgress", "workDone"):
        posted = await client.post(f"/cards/{card_id}/status", json={"ddsStatus": status})
        assert posted.status_code == 200, posted.text
        progress = await client.post(f"/attempts/{attempt_id}/progress", json={"status": {"ddsStatus": status, "at": posted.json()["at"], "comment": "Бригада выехала" if status == "responseStarted" else None}})
        assert progress.status_code == 200, progress.text
    done = await client.post(f"/attempts/{attempt_id}/progress", json={"enteredText": {"dispatcherAction": "Сообщение пренято, расчёт направлен", "outfitNumber": "5"}, "completedAt": _now(5)})
    assert done.status_code == 200, done.text
    # Завершение ставит оценку синхронно: она уже в попытке и в ленте.
    evaluation = done.json()["evaluation"]
    assert evaluation["aiComment"].startswith("ИИ-оценка:")
    assert any(e["wrong"] == "пренято" for e in evaluation["grammarErrors"])
    feed = await client.get(f"/sessions/{session_id}/feed", params={"at": _now(10)})  # окно (since, at] — завершение в +5 с
    assert any(e["kind"] == "aiEvaluation" and e["attemptId"] == attempt_id for e in feed.json()["events"])
    fetched = await client.get(f"/attempts/{attempt_id}/evaluation")
    assert fetched.status_code == 200 and fetched.json()["totalScore"] == evaluation["totalScore"]

    stopped = await client.post(f"/sessions/{session_id}/stop")
    assert stopped.status_code == 200 and stopped.json()["state"] == "finished"
    await login_as(client, "teacher")
    reported = await client.post(f"/sessions/{session_id}/control", json={"action": "report"})
    assert reported.status_code == 200 and reported.json()["session"]["state"] == "reported"

    reports = await client.get("/reports", params={"sessionId": session_id})
    assert reports.status_code == 200, reports.text
    body = reports.json()
    assert len(body["reports"]) == 1
    report = body["reports"][0]
    assert report["id"] == f"rep-{session_id[4:]}-{student_id}"
    assert report["score"] == evaluation["totalScore"]
    assert report["charts"]["dynamics"] == {"labels": [attempt_id], "scores": [evaluation["totalScore"]]}
    assert [m["stage"] for m in report["timeMetrics"]] == ["Первичная реакция", "Полная отработка"]
    assert all(e["cardId"] == card_id for e in report["grammarErrors"] + report["errors"])
    group = body["groupReport"]
    assert group["id"] == f"rep-{session_id[4:]}-group" and group["reportIds"] == [report["id"]]
    assert group["groupInsights"] and group["charts"]["scoreByStudent"]["series"]["values"] == [report["score"]]
    generated_at = report["generatedAt"]

    journal = await client.get("/reports/journal", params={"teacherId": TEACHER_ID})
    row = next(r for r in journal.json()["rows"] if r["sessionId"] == session_id)
    assert row["status"] == "ready" and row["buildSec"] is not None and 0 <= row["buildSec"] <= 30

    override = await client.post(f"/attempts/{attempt_id}/evaluation", json={"teacherId": TEACHER_ID, "score": 77, "comment": "Опечатка в поле действия"})
    assert override.status_code == 200, override.text
    assert override.json()["teacherOverride"]["score"] == 77 and override.json()["teacherOverride"]["by"] == TEACHER_ID
    assert override.json()["totalScore"] == evaluation["totalScore"]

    again = await client.get("/reports", params={"sessionId": session_id})
    live = again.json()["reports"][0]
    assert live["score"] == 77 and live["charts"]["dynamics"]["scores"] == [77]
    assert live["generatedAt"] == generated_at

    feedback = await client.post("/reports/feedback", json={"reportId": report["id"], "teacherId": TEACHER_ID, "text": "Следить за орфографией", "recommendations": ["Повторить регламент"]})
    assert feedback.status_code == 201
    final = await client.get("/reports", params={"sessionId": session_id})
    assert final.json()["reports"][0]["teacherFeedback"]["text"] == "Следить за орфографией"
    assert final.json()["reports"][0]["generatedAt"] == generated_at

    async with get_sessionmaker()() as db:
        audit = (await db.execute(select(AuditLog).where(AuditLog.action == "evaluation.override"))).scalars().all()
        assert any(attempt_id in a.details and f"было {evaluation['totalScore']} → стало 77" in a.details for a in audit)
        samples = (await db.execute(select(CalibrationSample).where(CalibrationSample.attempt_id == attempt_id))).scalars().all()
        assert samples and samples[0].source == "override" and samples[0].payload["score"] == 77

    # Обучаемый видит свой отчёт и обновлённую оценку, но не групповой свод.
    await login_as(client, "student2")
    mine = await client.get("/reports", params={"studentId": student_id})
    assert mine.status_code == 200 and mine.json()["groupReport"] is None
    assert any(r["id"] == report["id"] and r["score"] == 77 for r in mine.json()["reports"])
    own_eval = await client.get(f"/attempts/{attempt_id}/evaluation")
    assert own_eval.json()["teacherOverride"]["score"] == 77
    client.cookies.clear()
