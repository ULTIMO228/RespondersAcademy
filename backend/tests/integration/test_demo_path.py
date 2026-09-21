"""T075: демо-путь `docs/demo-script.md` через HTTP — от администратора до данных `/arm/progress`.

admin создаёт курсанта группы ДДС-02 → teacher генерирует сценарии по категории ДТП и утверждает первый →
занятие на двух обучаемых → попытки (статусы, звонок 301 с докладом, действие диспетчера с опечаткой) →
завершение, отчёт занятия → правка оценки преподавателем → обратная связь → курсант видит свой отчёт и занятие.
"""

from __future__ import annotations

import datetime as dt

from httpx import AsyncClient
from sqlalchemy import delete

from app.db.session import get_sessionmaker
from app.models.card import IncidentCard
from app.models.scenario import Scenario
from tests.conftest import cookie_value, login_as

ADMIN_ID = "u-001"
TEACHER_ID = "u-002"
GROUP = "ДДС-02"
CATEGORY = "Дорожно-транспортные происшествия с пострадавшими"
NEW_LOGIN = "demo.kursant"
NEW_ARM = 41
SEED_GENERATED = ("s-033", "s-034", "s-035", "s-036")  # сгенерированные сценарии сида остаются


def _now(offset_seconds: int = 0) -> str:
    moment = dt.datetime.now(dt.timezone(dt.timedelta(hours=3))) + dt.timedelta(seconds=offset_seconds)
    return moment.isoformat(timespec="seconds")


async def _as_user(client: AsyncClient, login: str, password: str, arm: int) -> dict:
    client.cookies.clear()
    response = await client.post("/auth/login", json={"login": login, "password": password, "armNumber": arm, "twoFactorCode": "123456"})
    assert response.status_code == 200, response.text
    client.cookies.set("arm112_session", cookie_value(response.json()))
    return response.json()


async def _work_card(client: AsyncClient, card_id: str, student_id: str, issued_at: str, *, touch_card_runtime: bool) -> dict:
    """Попытка курсанта: статусы, звонок руководителю 301 с докладом, действие диспетчера с опечаткой, закрытие."""
    opened = await client.post(f"/cards/{card_id}/attempt", json={"studentId": student_id, "issuedAt": issued_at})
    assert opened.status_code == 201, opened.text
    attempt_id = opened.json()["attempt"]["id"]
    for index, status in enumerate(("accepted", "responseStarted", "arrived", "workInProgress")):
        at = _now(index + 1)
        if touch_card_runtime:
            # Рантайм карточки общий (мок): граф статусов проверяем только у первого курсанта.
            posted = await client.post(f"/cards/{card_id}/status", json={"ddsStatus": status, "dutyNumber": "32" if status == "accepted" else None})
            assert posted.status_code == 200, posted.text
            at = posted.json()["at"]
        progress = await client.post(f"/attempts/{attempt_id}/progress", json={"status": {"ddsStatus": status, "at": at, "dutyNumber": "32" if status == "accepted" else None}})
        assert progress.status_code == 200, progress.text
    transcript = [
        {"speaker": "ai", "text": "Слушаю вас", "at": _now(5)},
        {"speaker": "dispatcher", "text": f"Карточка {card_id}, ДТП с пострадавшими, Варшавское шоссе, 120, есть пострадавшие, карточка принята, наряд направлен", "at": _now(6)},
        {"speaker": "ai", "text": "Я вас понял, информация принята", "at": _now(7)},
    ]
    call = await client.post(f"/cards/{card_id}/calls", json={"studentId": student_id, "toNumber": "301", "startedAt": _now(5), "endedAt": _now(8), "transcript": transcript})
    assert call.status_code == 201 and call.json()["attemptId"] == attempt_id, call.text
    done = await client.post(f"/attempts/{attempt_id}/progress", json={"status": {"ddsStatus": "workDone", "at": _now(9)}, "enteredText": {"dispatcherAction": "Сообщение пренято, дежурная бригада направлена на место", "outfitNumber": "32"}, "completedAt": _now(10)})
    assert done.status_code == 200 and done.json()["completedAt"], done.text
    assert done.json()["calls"][-1]["toNumber"] == "301"
    evaluation = done.json().get("evaluation")
    assert evaluation and any(e["wrong"] == "пренято" for e in evaluation["grammarErrors"]), done.json()
    return done.json()


async def test_demo_path(client: AsyncClient):
    try:
        await _demo_path(client)
    finally:
        # Сгенерированные карточки/сценарии убираем: unit-тесты поиска считают карточки сида (108/96).
        client.cookies.clear()
        async with get_sessionmaker()() as db:
            await db.execute(delete(Scenario).where(Scenario.source == "generated", Scenario.id.notin_(SEED_GENERATED)))
            await db.execute(delete(IncidentCard).where(IncidentCard.mode_origin == "generated"))
            await db.commit()


async def _demo_path(client: AsyncClient) -> None:
    # 1. Администратор создаёт курсанта группы ДДС-02.
    await login_as(client, "admin")
    created = await client.post("/admin/users", json={"adminId": ADMIN_ID, "fullName": "Демонстрационный Курсант Второй", "login": NEW_LOGIN, "password": "demo-2026", "role": "student", "armNumber": NEW_ARM, "group": GROUP, "service": "ДДС района Обручевский"})
    assert created.status_code == 201, created.text
    new_student_id = created.json()["id"]

    # 2. Преподаватель: состав группы, генерация сценариев по категории ДТП, утверждение первого.
    await login_as(client, "teacher")
    group_students = (await client.get("/users", params={"role": "student", "group": GROUP})).json()
    assert any(u["id"] == new_student_id for u in group_students) and len(group_students) >= 2
    partner_id = next(u["id"] for u in group_students if u["id"] != new_student_id)
    generated = await client.post("/scenarios/generate", json={"category": CATEGORY, "requestedBy": TEACHER_ID})
    assert generated.status_code == 201, generated.text
    scenario = generated.json()[0]
    assert scenario["source"] == "generated" and scenario["validation"]["status"] == "pending" and scenario["cardIds"]
    assert all(card["group"] == CATEGORY for card in (await client.get("/training-cards")).json() if card["id"] in scenario["cardIds"])
    approved = await client.post(f"/scenarios/{scenario['id']}/validate", json={"action": "approve", "reviewedBy": TEACHER_ID, "comment": "Эталон проверен"})
    assert approved.status_code == 200 and approved.json()["validation"]["status"] == "approved", approved.text

    # 3. Занятие на двух обучаемых по утверждённому сценарию.
    session = await client.post("/sessions", json={"teacherId": TEACHER_ID, "studentIds": [new_student_id, partner_id], "scenarioIds": [scenario["id"]], "mode": "practice", "cardSource": "generated"})
    assert session.status_code == 201, session.text
    session_id = session.json()["id"]
    started = await client.post(f"/sessions/{session_id}/start")
    assert started.status_code == 200 and started.json()["state"] == "running"
    flow = started.json()["cardFlow"]
    per_student = {sid: [i for i in flow if i["studentId"] == sid] for sid in (new_student_id, partner_id)}
    assert all(per_student.values()), flow
    assert all(i["cardId"] in scenario["cardIds"] for items in per_student.values() for i in items)

    # 4. Попытки: созданный курсант входит своей учёткой, второй — из сидов.
    await _as_user(client, NEW_LOGIN, "demo-2026", NEW_ARM)
    mine = await client.get("/sessions", params={"studentId": new_student_id})
    assert any(s["id"] == session_id and s["studentIds"] == [new_student_id] for s in mine.json())
    first = per_student[new_student_id][0]
    attempt_new = await _work_card(client, first["cardId"], new_student_id, first["issuedAt"], touch_card_runtime=True)
    client.cookies.clear()
    second = per_student[partner_id][0]
    attempt_partner = await _work_card(client, second["cardId"], partner_id, second["issuedAt"], touch_card_runtime=False)

    # 5. Преподаватель: лента, монитор, завершение и отчёт занятия.
    await login_as(client, "teacher")
    feed = await client.get(f"/sessions/{session_id}/feed", params={"at": _now(20)})
    kinds = {(e["kind"], e["studentId"]) for e in feed.json()["events"]}
    assert {("cardCompleted", new_student_id), ("aiEvaluation", partner_id)} <= kinds, kinds
    stopped = await client.post(f"/sessions/{session_id}/stop")
    assert stopped.status_code == 200 and stopped.json()["state"] == "finished"
    reported = await client.post(f"/sessions/{session_id}/control", json={"action": "report"})
    assert reported.status_code == 200 and reported.json()["session"]["state"] == "reported"
    reports = await client.get("/reports", params={"sessionId": session_id})
    assert reports.status_code == 200 and len(reports.json()["reports"]) == 2, reports.text
    by_student = {r["student"]["armNumber"]: r for r in reports.json()["reports"]}
    mine_report = by_student[NEW_ARM]
    assert mine_report["score"] == attempt_new["evaluation"]["totalScore"]
    assert any("пренято" in g["fragment"] for g in mine_report["grammarErrors"]), mine_report["grammarErrors"]
    group_report = reports.json()["groupReport"]
    assert group_report and len(group_report["reportIds"]) == 2 and group_report["groupInsights"]
    journal = await client.get("/reports/journal", params={"teacherId": TEACHER_ID})
    row = next(r for r in journal.json()["rows"] if r["sessionId"] == session_id)
    assert row["status"] == "ready" and 0 <= row["buildSec"] <= 30 and len(row["students"]) == 2

    # 6. Правка оценки и обратная связь преподавателя.
    override = await client.post(f"/attempts/{attempt_new['id']}/evaluation", json={"teacherId": TEACHER_ID, "score": 88, "comment": "Доклад полный, опечатка одна"})
    assert override.status_code == 200 and override.json()["teacherOverride"]["score"] == 88
    feedback = await client.post("/reports/feedback", json={"reportId": mine_report["id"], "teacherId": TEACHER_ID, "text": "Проверять орфографию перед закрытием карточки"})
    assert feedback.status_code == 201

    # 7. Данные /arm/progress курсанта: свой отчёт с правкой преподавателя и обратной связью, без группового свода.
    await _as_user(client, NEW_LOGIN, "demo-2026", NEW_ARM)
    progress = await client.get("/reports", params={"studentId": new_student_id})
    assert progress.status_code == 200 and progress.json()["groupReport"] is None
    own = next(r for r in progress.json()["reports"] if r["id"] == mine_report["id"])
    assert own["score"] == 88 and own["teacherFeedback"]["text"].startswith("Проверять")
    evaluation = await client.get(f"/attempts/{attempt_new['id']}/evaluation")
    assert evaluation.status_code == 200 and evaluation.json()["teacherOverride"]["score"] == 88
    foreign = await client.get(f"/attempts/{attempt_partner['id']}/evaluation")
    assert foreign.status_code == 403
    assert (await client.get("/reports", params={"sessionId": session_id})).json()["groupReport"] is None
