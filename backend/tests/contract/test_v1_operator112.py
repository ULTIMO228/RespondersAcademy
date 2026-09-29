"""T086: контракт `/api/v1` — таблицы «Билеты и аудио» и «Режим специалиста-112» (contracts/v1-endpoints.md).

Независимый тест US3: задание `operator112` из 2 билетов → `POST /operator112/attempts` → `answer` → события →
`notification-list` по опросной карте → `submit` → `evaluation` с `fieldDiff`; повторное прослушивание считается;
аудио недоступно (TTS_ENABLED=0 в тестах) → расшифровка с пометкой `emergency`; экзамен — билет и запись один раз.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app import ai_gateway
from app.db.session import get_sessionmaker
from app.models.assignment import AssignmentAttempt
from app.models.audit import AuditLog
from app.models.card import IncidentCard
from app.models.scenario import Scenario
from app.models.session import Attempt, Evaluation
from app.models.ticket_audio import TicketAudio
from app.schemas.admin import resolve_audit_type
from app.services.time import now_iso
from ml.generate import validator
from tests.conftest import login_as

TRAINING = "asg-001"  # c-010 (пожар в жилом доме), c-050 (СМП) — ivanov, petrova
EXAM = "asg-002"  # c-071, c-090; порог 70


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _restore_db(app) -> AsyncIterator[None]:
    """Модуль создаёт билеты, карточки курсантов, попытки и записи — после него БД сессии возвращается к сиду (как test_demo_path)."""
    yield
    async with get_sessionmaker()() as db:
        attempt_ids = list((await db.execute(select(Attempt.id).where(Attempt.mode == "operator112"))).scalars().all())
        await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.attempt_id.in_(attempt_ids)))
        await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.mode_origin.in_(("operator112", "manual"))))
        await db.execute(delete(TicketAudio))
        await db.commit()


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        yield http


def _draft_for_c010(**overrides: Any) -> dict[str, Any]:
    draft: dict[str, Any] = {
        "applicant": {"name": "Сидорова Анна Викторовна", "status": "очевидец"},
        "phones": {"aon": "+7 (916) 126-34-71", "provided": "+7 (916) 126-34-71", "onSite": ""},
        "address": {"formal": "Россия, Москва, улица Грина, дом неизвестен, библиотека № 19", "street": "ул. Грина", "house": "", "source": "directory", "descriptive": "в доме библиотека № 19"},
        "what": {"pollAnswers": "Пожар, горит балкон и окна на 13 этаже", "signs": ["жилой дом", "балкон", "открытое пламя"], "finalType": "", "classifierCode": "1050201", "casualties": {"injured": False, "ambulanceRefused": False, "blocked": False}},
        "description": "Со слов заявителя: горит балкон и два окна на 13-м этаже, открытое пламя, наблюдают с улицы. Дом 14 этажей, газифицирован.",
        "emergency": {"chs": False, "chp": False},
        "notificationList": [],
    }
    draft.update(overrides)
    return draft


async def test_tickets_list_and_audio_fallback(v1: AsyncClient):
    assert (await v1.get("/tickets")).status_code == 401
    await login_as(v1, "student")
    tickets = await v1.get("/tickets", params={"group": "пожар в жилом доме"})
    assert tickets.status_code == 200, tickets.text
    items = tickets.json()
    assert items and all(t["group"] == "пожар в жилом доме" for t in items)
    assert {"id", "ticketNo", "summary", "address", "caller", "expectedServices", "expectedTags", "difficulty", "approved"} <= set(items[0])
    assert (await v1.get("/tickets", params={"q": "c-010"})).json()[0]["id"] == "c-010"
    # Записи ещё нет — pending/emergency; студент не может запросить генерацию.
    audio = await v1.get("/tickets/c-050/audio")
    assert audio.status_code == 200 and audio.json()["cardId"] == "c-050" and audio.json()["emergency"] is True
    assert (await v1.post("/tickets/c-050/audio", json={"voice": "female"})).status_code == 403
    assert (await v1.get("/tickets/c-999/audio")).status_code == 404

    await login_as(v1, "teacher")
    requested = await v1.post("/tickets/c-050/audio", json={"voice": "female"})
    assert requested.status_code == 202, requested.text
    body = requested.json()
    assert body["voice"] == "female" and body["status"] in ("pending", "failed")
    assert "Соколова Вера Ивановна" in body["transcript"] and "Твардовского" in body["transcript"] and "судороги" in body["transcript"]
    # TTS_ENABLED=0: синтез не выполняется → failed + расшифровка с пометкой «аварийный режим» (T085).
    status = await v1.get("/tickets/c-050/audio")
    assert status.json()["status"] == "failed" and status.json()["emergency"] is True and status.json()["transcript"] == body["transcript"]
    assert (await v1.get("/tickets/c-050/audio/file")).status_code == 404
    assert (await v1.post("/tickets/c-050/audio", json={"voice": "loud"})).status_code == 400


async def test_ready_applicant_audio_is_playable_from_recordings(v1: AsyncClient, tmp_path: Path):
    wav = b"RIFFtest-applicant-audio"
    path = tmp_path / "applicant.wav"
    path.write_bytes(wav)
    async with get_sessionmaker()() as db:
        row = await db.get(TicketAudio, "c-050")
        previous = None if row is None else (row.path, row.status, row.duration_ms, row.generated_at)
        if row is None:
            row = TicketAudio(card_id="c-050", transcript="Заявитель", voice="female")
            db.add(row)
        row.path = str(path)
        row.status = "ready"
        row.duration_ms = 2100
        row.generated_at = now_iso()
        await db.commit()
    try:
        await login_as(v1, "teacher")
        listed = await v1.get("/cards/c-050/recordings")
        assert listed.status_code == 200, listed.text
        recording = next(item for item in listed.json() if item["id"] == "ticket-c-050")
        assert recording["title"] == "Голос заявителя" and recording["duration"] == "00:02"
        assert recording["audioUrl"] == "/api/v1/tickets/c-050/audio/file"
        played = await v1.get("http://test" + recording["audioUrl"])
        assert played.status_code == 200 and played.content == wav
        assert played.headers["content-disposition"].startswith("inline;")
        await login_as(v1, "student")
        assert all(item["id"] != "ticket-c-050" for item in (await v1.get("/cards/c-050/recordings")).json())
        assert (await v1.get("http://test" + recording["audioUrl"])).status_code == 403
    finally:
        async with get_sessionmaker()() as db:
            row = await db.get(TicketAudio, "c-050")
            if previous is None:
                await db.delete(row)
            else:
                row.path, row.status, row.duration_ms, row.generated_at = previous
            await db.commit()


async def test_ticket_create_by_teacher(v1: AsyncClient):
    await login_as(v1, "student")
    assert (await v1.post("/tickets", json={})).status_code == 403
    await login_as(v1, "teacher")
    bad = await v1.post("/tickets", json={"group": "Нет такой группы", "summary": "x", "address": "y", "caller": {"phone": "1"}})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "validationFailed"
    created = await v1.post("/tickets", json={"group": "Дерево", "summary": "Упало дерево на припаркованную машину, пострадавших нет", "address": "Москва, Чертановская улица, 58", "caller": {"name": "Иванов Пётр", "phone": "916-000-11-22", "status": "очевидец"}, "difficulty": 2})
    assert created.status_code == 201, created.text
    ticket = created.json()
    assert ticket["id"].startswith("c-") and ticket["group"] == "Дерево" and ticket["difficulty"] == 2 and ticket["approved"] is False
    assert ticket["expectedServices"] and ticket["expectedTags"], ticket  # эталон достроен по классификатору
    assert "grammarErrors" in ticket
    async with get_sessionmaker()() as db:
        audit = (await db.execute(select(AuditLog).where(AuditLog.action == "ticket.create", AuditLog.card_id == ticket["id"]))).scalar_one()
        assert audit.role == "teacher" and audit.user_id == ticket["createdBy"]
        assert resolve_audit_type(audit.action) == "content"
    assert (await v1.get("/tickets", params={"source": "manual"})).json()[-1]["id"] == ticket["id"]
    validated = await v1.post(f"/tickets/{ticket['id']}/validate")
    assert validated.status_code == 200, validated.text
    assert [c["id"] for c in validated.json()["checks"]] == list(validator.CHECK_IDS)
    saved = (await v1.get("/tickets", params={"q": ticket["id"]})).json()[0]
    assert saved["validation"] == validated.json() and saved["approved"] is False


async def test_ticket_validation_access_and_persistence(v1, monkeypatch):
    assert (await v1.post("/tickets/c-010/validate")).status_code == 401
    await login_as(v1, "student")
    assert (await v1.post("/tickets/c-010/validate")).status_code == 403
    await login_as(v1, "teacher")
    assert (await v1.post("/tickets/c-999/validate")).status_code == 404
    snapshots = []
    async with get_sessionmaker()() as db:
        card = await db.get(IncidentCard, "c-010")
        old_extra = card.extra
        scenarios = (await db.execute(select(Scenario))).scalars().all()
        for row in scenarios:
            if "c-010" in row.card_ids and not row.deleted:
                snapshots.append((row.id, row.validation_report, row.validation_status))
    assert snapshots
    reports = []
    def validate(ticket, existing, *, groups):
        assert ticket["id"] == "c-010" and existing and ticket["group"] in groups
        report = validator.ValidationReport([validator.Check(key, key != "grammar", "Проверка", needsReview=key == "category") for key in validator.CHECK_IDS])
        reports.append(report.to_contract())
        return report
    monkeypatch.setattr(validator, "validate", validate)
    try:
        for role in ("teacher", "admin"):
            await login_as(v1, role)
            response = await v1.post("/tickets/c-010/validate")
            assert response.status_code == 200, response.text
            assert response.json() == reports[-1]
        ticket = (await v1.get("/tickets", params={"q": "c-010"})).json()[0]
        assert ticket["validation"] == reports[-1]
        async with get_sessionmaker()() as db:
            assert (await db.get(IncidentCard, "c-010")).extra["validation"] == reports[-1]
            for key, old_report, status in snapshots:
                row = await db.get(Scenario, key)
                assert row.validation_status == status
                assert row.validation_report["tickets"]["c-010"] == reports[-1]
                for other, report in (old_report or {}).get("tickets", {}).items():
                    if other != "c-010":
                        assert row.validation_report["tickets"][other] == report
    finally:
        async with get_sessionmaker()() as db:
            (await db.get(IncidentCard, "c-010")).extra = old_extra
            for key, report, _ in snapshots:
                (await db.get(Scenario, key)).validation_report = report
            await db.commit()


async def test_streets_suggest(v1: AsyncClient):
    await login_as(v1, "student")
    assert (await v1.get("/streets", params={"q": "ду"})).status_code == 400
    found = await v1.get("/streets", params={"q": "Дубин", "limit": 5})
    assert found.status_code == 200 and found.json() and all({"id", "name", "type"} <= set(s) for s in found.json())
    assert any("Дубининская" in s["name"] for s in found.json())
    assert len(found.json()) <= 5
    fuzzy = await v1.get("/streets", params={"q": "ул. Дубнинская"})
    assert any("Дубнинская" in s["name"] for s in fuzzy.json())


async def test_operator112_full_cycle(v1: AsyncClient):
    assert (await v1.post("/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-010"})).status_code == 401
    await login_as(v1, "student")
    assert (await v1.post("/operator112/attempts", json={"assignmentId": "asg-404", "cardId": "c-010"})).status_code == 404
    assert (await v1.post("/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-001"})).status_code == 400
    assert (await v1.post("/operator112/attempts", json={"cardId": "c-010"})).status_code == 400

    created = await v1.post("/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-010"})
    assert created.status_code == 201, created.text
    attempt = created.json()
    assert {"id", "cardId", "aon", "incidentNumber", "createdAt", "state", "hints", "audio"} <= set(attempt)
    assert attempt["state"] == "ringing" and attempt["aon"] == "+7 (916) 126-34-71" and attempt["incidentNumber"] > 881412
    assert attempt["hints"]["enabled"] is True and attempt["hints"]["idleSec"] == 20 and len(attempt["hints"]["steps"]) >= 6
    assert attempt["audio"]["emergency"] is True and "Грина" in attempt["audio"]["transcript"]  # аварийный режим: расшифровка
    attempt_id = attempt["id"]
    # Повторный запрос в тренировке возвращает ту же открытую попытку (200).
    again = await v1.post("/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-010"})
    assert again.status_code == 200 and again.json()["id"] == attempt_id

    # События до ответа — 409; список оповещения без опросной карты пуст.
    early = await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "replay"})
    assert early.status_code == 409 and early.json()["error"]["code"] == "invalidTransition"
    answered = await v1.post(f"/operator112/attempts/{attempt_id}/answer")
    assert answered.status_code == 200 and answered.json()["state"] == "answered" and answered.json()["answeredAt"]
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).json()["answeredAt"] == answered.json()["answeredAt"]  # идемпотентно

    # События: «было/стало», прослушивания считаются, подсказки фиксируются.
    first = await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "fieldChanged", "payload": {"field": "applicant.name", "value": "Сидоров"}})
    assert first.status_code == 201 and first.json()["type"] == "fieldChanged" and first.json()["at"] and "before" not in first.json()
    second = await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "fieldChanged", "payload": {"field": "applicant.name", "value": "Сидорова"}})
    assert second.json()["before"] == "Сидоров"
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "replay"})).status_code == 201
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "replay"})).status_code == 201
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "hintShown", "payload": {"stage": "address"}})).status_code == 201
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "dance"})).status_code == 400
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "fieldChanged", "payload": {}})).status_code == 400
    signs = await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "signSelected", "payload": {"signs": ["Происшествие 101", "Дом", "балкон", "открытое пламя"]}})
    assert signs.status_code == 201

    # Список оповещения по опросной карте (FR-015): итоговый тип ЕКП, службы auto; вручную добавить можно, удалить нельзя.
    listed = await v1.get(f"/operator112/attempts/{attempt_id}/notification-list")
    assert listed.status_code == 200, listed.text
    notification = listed.json()
    assert notification["finalType"] == "пожар: балкон" and notification["classifierCode"] == "1050201"
    auto_ids = [s["serviceId"] for s in notification["services"]]
    assert "svc-101" in auto_ids and all(s["addedBy"] == "auto" for s in notification["services"])
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "serviceAdded", "payload": {"serviceId": "svc-mgts"}})).status_code == 201
    manual = (await v1.get(f"/operator112/attempts/{attempt_id}/notification-list")).json()
    assert [s for s in manual["services"] if s["serviceId"] == "svc-mgts"][0]["addedBy"] == "manual"
    preview = await v1.get(f"/operator112/attempts/{attempt_id}/notification-list", params={"classifierCode": "13020201"})
    assert preview.json()["finalType"] == "Запах бытового газа в квартире" and "svc-104" in [s["serviceId"] for s in preview.json()["services"]]

    # Оценка до отправки — 404 evaluationPending; отправка пустой карточки — 400.
    pending = await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")
    assert pending.status_code == 404 and pending.json()["error"]["code"] == "evaluationPending"
    assert (await v1.get(f"/attempts/{attempt_id}/evaluation")).status_code == 404  # compat-эндпоинт не запускает оценщик ДДС
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/submit", json={})).status_code == 400

    submitted = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010())
    assert submitted.status_code == 200, submitted.text
    result = submitted.json()
    assert result["attempt"]["state"] == "submitted" and result["attempt"]["completedAt"] and result["attempt"]["replays"] == 2 and result["attempt"]["hintsShown"] == 1
    assert result["evaluationId"] == attempt_id
    card = result["card"]
    assert card["id"].startswith("c-") and card["createdByStudentId"] == "u-005" and card["sourceCardId"] == "c-010" and card["cardStatus"] == "registered"
    assert card["group"] == "пожар в жилом доме" and card["expectedServices"] and "svc-mgts" not in card["expectedServices"] and "МГТС" in card["expectedServices"]
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010())).status_code == 409

    evaluation = await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")
    assert evaluation.status_code == 200, evaluation.text
    data = evaluation.json()
    assert {"timeScore", "correctnessScore", "grammarScore", "semanticScore", "totalScore", "grammarErrors", "errors", "aiComment", "fieldDiff"} <= set(data)
    assert data["mode"] == "operator112" and data["assessorVersion"].startswith("operator112-") and data["aiComment"].startswith("ИИ-оценка:")
    assert {d["field"] for d in data["fieldDiff"]} >= {"applicant.name", "address", "what.finalType", "what.signs", "description", "notificationList"}
    assert all(e["message"].count(" — ") >= 1 and e.get("ruleId") for e in data["errors"])
    assert next(d for d in data["fieldDiff"] if d["field"] == "what.finalType")["ok"] is True
    assert data["totalScore"] >= 60, data
    # Та же оценка доступна через совместимый `GET /attempts/{id}/evaluation` и `/api/mock` (студент видит свою).
    assert (await v1.get(f"/attempts/{attempt_id}/evaluation")).json()["totalScore"] == data["totalScore"]
    assert "passed" not in data  # тренировка — без «сдал / не сдал»

    # Чужая попытка для другого студента — 403; преподаватель видит.
    await login_as(v1, "student2")
    assert (await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")).status_code == 403
    await login_as(v1, "teacher")
    assert (await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")).status_code == 200
    generated = await v1.get("/tickets", params={"source": "operator112"})
    assert any(t["id"] == card["id"] for t in generated.json())


async def test_operator112_exam_rules(v1: AsyncClient):
    await login_as(v1, "student2")
    created = await v1.post("/operator112/attempts", json={"assignmentId": EXAM, "cardId": "c-071"})
    assert created.status_code == 201, created.text
    attempt = created.json()
    assert attempt["hints"]["enabled"] is False
    attempt_id = attempt["id"]
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200
    # Экзамен: одно прослушивание, подсказки отключены.
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "replay"})).status_code == 201
    second = await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "replay"})
    assert second.status_code == 409 and second.json()["error"]["code"] == "conflict"
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/events", json={"type": "hintShown"})).status_code == 409
    weak = {"applicant": {"name": "", "status": ""}, "address": {"formal": "Москва, ул. Ленина, 1", "source": "manual"}, "what": {"signs": ["Драка"], "classifierCode": "15060202", "casualties": {"injured": False}}, "description": "Что-то случилось", "notificationList": []}
    submitted = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=weak)
    assert submitted.status_code == 200, submitted.text
    evaluation = (await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")).json()
    assert evaluation["passed"] is False and evaluation["totalScore"] < 70
    assert {"wrongFinalType", "missingSign"} & {e["type"] for e in evaluation["errors"]}
    # Экзамен: повтор по билету → 409.
    repeat = await v1.post("/operator112/attempts", json={"assignmentId": EXAM, "cardId": "c-071"})
    assert repeat.status_code == 409


async def test_operator112_teacher_creates_for_student_and_gateway_script(v1: AsyncClient):
    class ScriptGateway(ai_gateway.LocalAiGateway):
        def call_script(self, ticket, context):
            return f"Здравствуйте, это {ticket['caller']['name']}, у нас {ticket['summary']} по адресу {ticket['address']}. Голос {context['voice']}."

    ai_gateway.set_gateway(ScriptGateway())
    try:
        await login_as(v1, "teacher")
        missing = await v1.post("/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-050"})
        assert missing.status_code == 400  # преподавателю нужен studentId
        wrong = await v1.post("/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-050", "studentId": "u-008"})
        assert wrong.status_code == 403
        created = await v1.post("/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-050", "studentId": "u-006"})
        assert created.status_code in (200, 201), created.text
        assert created.json()["studentId"] == "u-006"
        regenerated = await v1.post("/tickets/c-050/audio", json={})
        assert regenerated.status_code == 202 and regenerated.json()["transcript"].startswith("Здравствуйте, это Соколова")
    finally:
        ai_gateway.set_gateway(None)


async def test_compat_progress_rejects_operator_attempt(v1: AsyncClient):
    await login_as(v1, "student")
    created = await v1.post("/operator112/attempts", json={"assignmentId": TRAINING, "cardId": "c-050"})
    assert created.status_code in (200, 201), created.text
    rejected = await v1.post(f"/attempts/{created.json()['id']}/progress", json={"enteredText": {"comment": "x"}})
    assert rejected.status_code == 409 and rejected.json()["error"]["code"] == "invalidTransition"
