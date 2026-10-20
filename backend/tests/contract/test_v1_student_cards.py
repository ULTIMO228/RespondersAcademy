"""Фича 011: банк карточек обучающихся-112 и их подача в задание ДДС преподавателем."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation, TrainingSession
from app.services import evaluation_service
from app.services.time import now_iso
from tests.conftest import login_as, token_for
from tests.contract.test_response_shapes import assert_shape

OWN_CARD = "c-s011a"  # автор u-005, группа ДДС-01 (morozova)
FOREIGN_CARD = "c-s011b"  # автор u-015, группа ДДС-02 (kovalev)
TITLE = "S011"


def _student_card(card_id: str, author: str, services: list[str]) -> IncidentCard:
    return IncidentCard(
        id=card_id, ticket_no=10, situation_no=1, group="пожар в жилом доме",
        summary="Горит квартира на третьем этаже", address="Москва, ул. Дубнинская, 2",
        caller={"name": "Сидоров", "phone": "916-000-00-00", "status": "очевидец"},
        expected_services=services, expected_tags=[], created_by_student_id=author,
        mode_origin="operator112", source_attempt_id=None,
        extra={"sourceCardId": "c-010", "registeredAt": "2026-10-20T10:00:00.000Z", "cardStatus": "registered"},
    )


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def student_cards() -> AsyncIterator[None]:
    async with get_sessionmaker()() as db:
        db.add_all([_student_card(OWN_CARD, "u-005", ["101", "104"]), _student_card(FOREIGN_CARD, "u-015", ["Мосводоканал"])])
        await db.commit()
    yield
    async with get_sessionmaker()() as db:
        ids = [row.id for row in (await db.execute(Assignment.__table__.select().where(Assignment.title.like(f"{TITLE}%")))).all()]
        if ids:
            attempt_ids = [row.attempt_id for row in (await db.execute(AssignmentAttempt.__table__.select().where(AssignmentAttempt.assignment_id.in_(ids)))).all()]
            session_ids = [row.session_id for row in (await db.execute(Attempt.__table__.select().where(Attempt.id.in_(attempt_ids)))).all()]
            await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
            await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id.in_(ids)))
            await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
            await db.execute(delete(TrainingSession).where(TrainingSession.id.in_(session_ids)))
            await db.execute(delete(AssignmentScenarioVersion).where(AssignmentScenarioVersion.assignment_id.in_(ids)))
            await db.execute(delete(AssignmentStudent).where(AssignmentStudent.assignment_id.in_(ids)))
            await db.execute(delete(Assignment).where(Assignment.id.in_(ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.id.in_([OWN_CARD, FOREIGN_CARD])))
        await db.commit()


# ─── T001: банк карточек ──────────────────────────────────────────────────────────────────────────


async def test_bank_requires_session_and_teacher_role(v1: AsyncClient):
    assert (await v1.get("/student-cards")).status_code == 401
    await login_as(v1, "student")
    assert (await v1.get("/student-cards")).status_code == 403
    await login_as(v1, "teacher")
    assert (await v1.get("/student-cards")).status_code == 200


async def test_teacher_sees_only_cards_of_own_groups(v1: AsyncClient):
    await login_as(v1, "teacher")
    ids = [item["id"] for item in (await v1.get("/student-cards")).json()]
    assert OWN_CARD in ids and FOREIGN_CARD not in ids
    v1.cookies.clear()
    v1.headers["Authorization"] = f"Bearer {await token_for('u-003')}"
    ids = [item["id"] for item in (await v1.get("/student-cards")).json()]
    assert FOREIGN_CARD in ids and OWN_CARD not in ids


async def test_admin_sees_all_cards(v1: AsyncClient):
    await login_as(v1, "admin")
    ids = [item["id"] for item in (await v1.get("/student-cards")).json()]
    assert {OWN_CARD, FOREIGN_CARD} <= set(ids)


async def test_bank_item_shape_and_proposed_etalon(v1: AsyncClient):
    await login_as(v1, "admin")
    items = {item["id"]: item for item in (await v1.get("/student-cards")).json()}
    assert_shape(list(items.values()), "StudentCard", "list", "/student-cards")
    own = items[OWN_CARD]
    assert own["authorId"] == "u-005" and own["authorName"] and own["authorGroup"] == "ДДС-01"
    assert own["sourceCardId"] == "c-010" and own["registeredAt"] == "2026-10-20T10:00:00.000Z"
    assert own["selectedServices"] == ["101", "104"]
    assert own["ticketServices"] == ["101 (главная)", "104 (дом газифицирован)", "102"]
    assert own["proposed"] == {"cardId": OWN_CARD, "expectedDecision": "accepted"}
    foreign = items[FOREIGN_CARD]
    # Обучающийся-112 оповестил не ту службу → для ДДС предлагается «Не принята» с передачей в службу билета.
    assert foreign["proposed"] == {"cardId": FOREIGN_CARD, "expectedDecision": "notAccepted", "expectedTransferTo": "101 (главная)"}
    assert not any(item.get("mode") == "seed" for item in items.values())
    assert "c-010" not in items


# ─── T002: карточки обучающихся в задании ДДС ─────────────────────────────────────────────────────


def dds_payload(**updates):
    body = {
        "studentIds": ["u-006"], "trainingMode": "dds", "format": "training", "cardIds": ["c-010", OWN_CARD],
        "studentCards": [{"cardId": OWN_CARD, "expectedDecision": "notAccepted", "expectedTransferTo": "Служба 101"}],
        "params": {}, "title": f"{TITLE} смешанный",
    }
    body.update(updates)
    return body


async def test_dds_assignment_accepts_student_card_with_confirmed_etalon(v1: AsyncClient):
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json=dds_payload())
    assert created.status_code == 201, created.text
    assert created.json()["cardIds"] == ["c-010", OWN_CARD]
    assert created.json()["params"]["studentCards"] == [{"cardId": OWN_CARD, "expectedDecision": "notAccepted", "expectedTransferTo": "Служба 101"}]
    only_students = await v1.post("/assignments", json=dds_payload(cardIds=[OWN_CARD], title=f"{TITLE} только карточки"))
    assert only_students.status_code == 201, only_students.text


async def test_student_card_rules_are_validated(v1: AsyncClient):
    await login_as(v1, "teacher")
    no_etalon = await v1.post("/assignments", json=dds_payload(studentCards=[]))
    assert no_etalon.status_code == 400 and "эталон" in no_etalon.json()["error"]["message"].lower()
    extra = await v1.post("/assignments", json=dds_payload(cardIds=["c-010"]))
    assert extra.status_code == 400
    no_target = await v1.post("/assignments", json=dds_payload(studentCards=[{"cardId": OWN_CARD, "expectedDecision": "notAccepted"}]))
    assert no_target.status_code == 400
    bad_decision = await v1.post("/assignments", json=dds_payload(studentCards=[{"cardId": OWN_CARD, "expectedDecision": "workDone"}]))
    assert bad_decision.status_code == 400
    in_112 = await v1.post("/assignments", json=dds_payload(trainingMode="operator112", studentIds=["u-005"]))
    assert in_112.status_code == 400
    forged = await v1.post("/assignments", json=dds_payload(cardIds=["c-010"], studentCards=[],
                                                          params={"studentCards": [{"cardId": "c-010", "expectedDecision": "notAccepted"}]}))
    assert forged.status_code == 201 and "studentCards" not in forged.json()["params"]
    # Парный запрос: те же данные, но корректные, проходят.
    assert (await v1.post("/assignments", json=dds_payload())).status_code == 201


async def test_foreign_student_card_is_forbidden(v1: AsyncClient):
    await login_as(v1, "teacher")
    foreign = await v1.post("/assignments", json=dds_payload(
        cardIds=[FOREIGN_CARD], studentCards=[{"cardId": FOREIGN_CARD, "expectedDecision": "accepted"}]))
    assert foreign.status_code == 403
    own = await v1.post("/assignments", json=dds_payload(
        cardIds=[OWN_CARD], studentCards=[{"cardId": OWN_CARD, "expectedDecision": "accepted"}]))
    assert own.status_code == 201


# ─── T003: оценка по эталону преподавателя ────────────────────────────────────────────────────────


async def test_attempt_is_evaluated_by_teacher_confirmed_etalon(v1: AsyncClient, monkeypatch):
    captured: dict = {}

    class Gateway:
        @staticmethod
        def evaluate_attempt(attempt, scenario, *args, **kwargs):
            captured["etalon"] = scenario["etalon"]
            return {"timeScore": 80, "correctnessScore": 0, "grammarScore": 80, "semanticScore": 80, "totalScore": 50,
                    "grammarErrors": [], "errors": [], "aiComment": "Тестовая оценка", "assessorVersion": "test-1.0",
                    "mode": "dds", "components": {}, "warnings": []}

    monkeypatch.setattr(evaluation_service, "get_gateway", lambda: Gateway())
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json=dds_payload(cardIds=[OWN_CARD]))
    assert created.status_code == 201, created.text
    await login_as(v1, "student2")
    started = await v1.post(f"/assignments/{created.json()['id']}/start")
    assert started.status_code == 200, started.text
    attempt = started.json()["attempt"]["attempt"]
    assert attempt["cardId"] == OWN_CARD
    completed = await v1.post(f"/attempts/{attempt['id']}/progress", json={"completedAt": now_iso()})
    assert completed.status_code == 200, completed.text
    assert (await v1.get(f"/attempts/{attempt['id']}/evaluation")).status_code == 200
    card_etalon = captured["etalon"]["cards"][OWN_CARD]
    # Система предлагала «Принята», преподаватель подтвердил «Не принята» — оценка идёт по решению преподавателя.
    assert card_etalon["expectedDecision"] == "notAccepted"
    assert card_etalon["expectedTransferTo"] == "Служба 101"
    assert captured["etalon"]["expectedActions"] == [f"openCard:{OWN_CARD}", "status:notAccepted"]
