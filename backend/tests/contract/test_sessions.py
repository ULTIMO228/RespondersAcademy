"""Контракт US1: занятия, лента, попытки, действия по карточке — шаги scripts/e2e-student.sh."""

from __future__ import annotations

import datetime as dt

from tests.conftest import login_as

TEACHER_ID = "u-002"
SCENARIO_ID = "s-005"


def _now(offset_seconds: int = 0) -> str:
    moment = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))) + dt.timedelta(seconds=offset_seconds)
    return moment.isoformat(timespec="seconds")


async def test_student_journey(client):
    session = await login_as(client, "student")
    student_id = session["userId"]

    created = await client.post("/sessions", json={"teacherId": TEACHER_ID, "studentIds": [student_id], "scenarioIds": [SCENARIO_ID], "mode": "practice", "cardSource": "generated"})
    assert created.status_code == 201 and created.json()["state"] == "configured", created.text
    session_id = created.json()["id"]
    assert session_id.startswith("ses-")

    started = await client.post(f"/sessions/{session_id}/start")
    assert started.status_code == 200 and started.json()["state"] == "running"
    assert started.json()["cardFlow"] and started.json()["finishedAt"] is None
    again = await client.post(f"/sessions/{session_id}/start")
    assert again.status_code == 409 and again.json()["error"]["code"] == "invalidTransition"

    feed = await client.get(f"/sessions/{session_id}/feed")
    assert feed.status_code == 200
    issued = [e for e in feed.json()["events"] if e["kind"] == "cardIssued" and e["studentId"] == student_id]
    assert issued, feed.text
    card_id, issued_at = issued[0]["cardId"], issued[0]["at"]

    opened = await client.post(f"/cards/{card_id}/attempt", json={"studentId": student_id, "issuedAt": issued_at})
    assert opened.status_code == 201 and opened.json()["created"] is True, opened.text
    attempt = opened.json()["attempt"]
    assert attempt["completedAt"] == "" and attempt["calls"] == [] and attempt["enteredText"] == {}
    attempt_id = attempt["id"]
    reopened = await client.post(f"/cards/{card_id}/attempt", json={"studentId": student_id, "issuedAt": issued_at})
    assert reopened.status_code == 200 and reopened.json()["created"] is False and reopened.json()["attempt"]["id"] == attempt_id

    late = await client.post("/cards/c-015/attempt", json={"studentId": student_id, "issuedAt": _now(-45)})
    assert late.status_code == 201 and late.json()["attempt"]["primaryReactionMs"] > 30000

    missing_comment = await client.post(f"/cards/{card_id}/status", json={"ddsStatus": "notAccepted"})
    assert missing_comment.status_code == 400 and missing_comment.json()["error"]["code"] == "validationFailed"
    for status in ("accepted", "responseStarted", "arrived", "workInProgress", "workDone"):
        posted = await client.post(f"/cards/{card_id}/status", json={"ddsStatus": status})
        assert posted.status_code == 200 and posted.json()["ddsStatus"] == status, posted.text
        assert posted.json()["id"].startswith("st-")
        progress = await client.post(f"/attempts/{attempt_id}/progress", json={"status": {"ddsStatus": status, "at": posted.json()["at"]}})
        assert progress.status_code == 200 and progress.json()["statuses"][-1]["ddsStatus"] == status
        if status == "accepted":
            wrong = await client.post(f"/cards/{card_id}/status", json={"ddsStatus": "arrived"})
            assert wrong.status_code == 409 and wrong.json()["error"]["code"] == "invalidTransition"
    closed = await client.get(f"/cards/{card_id}")
    assert len(closed.json()["runtime"]["statusEvents"]) == 5

    done = await client.post(f"/attempts/{attempt_id}/progress", json={"enteredText": {"dispatcherAction": "Наряд направлен"}, "completedAt": _now()})
    assert done.status_code == 200 and done.json()["fullProcessingMs"] >= 0 and done.json()["completedAt"]

    mine = await client.get("/sessions", params={"studentId": student_id})
    assert mine.status_code == 200
    found = [e for s in mine.json() for e in s["cardEvents"] if e["id"] == attempt_id]
    assert found and all(s["studentIds"] == [student_id] for s in mine.json())

    alien = await client.get("/sessions", params={"studentId": "u-006"})
    assert alien.status_code == 403 and alien.json()["error"]["code"] == "forbidden"
    alien_feed = await client.get(f"/sessions/{session_id}/feed", params={"studentId": "u-006"})
    assert alien_feed.status_code == 403
    client.cookies.clear()


async def test_session_validation_and_feed_access(client):
    bad = await client.post("/sessions", json={"teacherId": "u-005", "studentIds": ["u-005"], "scenarioIds": [SCENARIO_ID], "mode": "practice", "cardSource": "generated"})
    assert bad.status_code == 400
    unapproved = await client.post("/sessions", json={"teacherId": TEACHER_ID, "studentIds": ["u-005"], "scenarioIds": ["s-999"], "mode": "practice", "cardSource": "generated"})
    assert unapproved.status_code == 400
    plan = {"categories": [], "issueOrder": "manual", "hints": True, "timeNorms": {"primaryReactionSec": 30, "fullProcessingSec": 180}, "maxGrammarErrors": 1, "paceSec": 60, "conveyor": False}
    created = await client.post("/sessions", json={"teacherId": TEACHER_ID, "studentIds": ["u-005", "u-006"], "scenarioIds": ["s-001"], "mode": "follow", "cardSource": "generated", "plan": plan})
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]
    control = await client.get(f"/sessions/{session_id}/control")
    assert control.json()["plan"]["paceSec"] == 60 and control.json()["paused"] is False
    started = await client.post(f"/sessions/{session_id}/start")
    flow = started.json()["cardFlow"]
    # После загрузки PROFILE_MAPPING_SEED билет s-001 не входит в профили этих курсантов.
    assert flow == []
    paused = await client.post(f"/sessions/{session_id}/control", json={"action": "pause"})
    assert paused.json()["paused"] is True and paused.json()["pendingCount"] >= 0
    resumed = await client.post(f"/sessions/{session_id}/control", json={"action": "resume"})
    assert resumed.json()["paused"] is False and resumed.json()["session"]["cardFlow"] == []
    issued = await client.post(f"/sessions/{session_id}/control", json={"action": "issue", "studentId": "u-005", "cardId": "c-002"})
    assert len(issued.json()["session"]["cardFlow"]) == 1
    assert (await client.post(f"/sessions/{session_id}/control", json={"action": "fly"})).status_code == 400
    bad_feed = await client.get(f"/sessions/{session_id}/feed", params={"since": "garbage"})
    assert bad_feed.status_code == 400
    assert (await client.get("/sessions/ses-none/feed")).status_code == 404
    await login_as(client, "teacher")
    own = await client.get(f"/sessions/{session_id}/feed")
    assert own.status_code == 200
    client.cookies.clear()
    stopped = await client.post(f"/sessions/{session_id}/stop")
    assert stopped.json()["state"] == "finished" and stopped.json()["finishedAt"]
    assert (await client.post(f"/sessions/{session_id}/control", json={"action": "report"})).json()["session"]["state"] == "reported"
    anonymous = await client.get("/sessions", params={"studentId": "u-005"})
    assert anonymous.status_code == 401


async def test_card_actions(client):
    card = "card-881412"
    links = await client.post(f"/cards/{card}/links")
    assert links.status_code == 200 and links.json() == {"cardId": card, "chain": []}
    dup = await client.post("/cards/c-002/links")
    assert dup.status_code == 200 and dup.json()["chain"] and dup.json()["chain"][0]["role"] == "main"
    unconfirmed = await client.post(f"/cards/{card}/worklines", json={"service": "ЖКХ", "calledTo": "ОДС", "person": "Иванов", "message": "принято"})
    assert unconfirmed.status_code == 400
    workline = await client.post(f"/cards/{card}/worklines", json={"service": "ЖКХ", "calledTo": "ОДС", "person": "Иванов", "message": "принято", "confirmed": True})
    assert workline.status_code == 201 and workline.json()["id"].startswith("wl-") and workline.json()["operator"] == "оп. 1"
    reminder = await client.post(f"/cards/{card}/reminders", json={"text": "перезвонить", "remindAt": "2026-09-21T12:00:00+03:00"})
    assert reminder.status_code == 201 and reminder.json()["id"].startswith("rem-")
    assert (await client.post(f"/cards/{card}/reminders", json={"text": "x", "remindAt": "later"})).status_code == 400
    sms = await client.post(f"/cards/{card}/sms", json={"text": "Выезжаем"})
    assert sms.status_code == 201 and sms.json()["direction"] == "outgoing" and sms.json()["phone"]
    listed = await client.get(f"/cards/{card}/sms")
    assert listed.status_code == 200 and listed.json()[-1]["id"] == sms.json()["id"]
    assert (await client.get(f"/cards/{card}/recordings")).json() == []
    assert (await client.post("/cards/nope/status", json={"ddsStatus": "accepted"})).status_code == 404
    details = await client.get(f"/cards/{card}")
    assert len(details.json()["runtime"]["workLines"]) == 1 and len(details.json()["runtime"]["reminders"]) == 1
