"""US6, строки 18–30 контракта: сценарии (CRUD, валидация, генерация), учебные карточки, материалы, грамматика."""

from __future__ import annotations

import copy

from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.audit import AuditLog
from app.models.card import IncidentCard
from app.models.scenario import Scenario
from tests.conftest import login_as, token_for

TEACHER_ID = "u-002"
OTHER_TEACHER_ID = "u-003"
STUDENT_ID = "u-005"
TEMPLATE_ID = "s-032"  # шаблон, назначен в сидовые занятия
GENERATED_SEED_ID = "s-033"
CATEGORY = "пожар в жилом доме"


async def _audit_actions(action: str) -> list[AuditLog]:
    async with get_sessionmaker()() as db:
        return list((await db.execute(select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id))).scalars().all())


async def _draft_body(client) -> dict:
    source = (await client.get("/scenarios/s-001")).json()
    body = copy.deepcopy(source)
    body.pop("id")
    body.pop("validation")
    body["title"] = "Новый сценарий"
    body["source"] = "generated"
    return body


async def test_list_and_filters(client):
    client.cookies.clear()
    everything = await client.get("/scenarios")
    assert everything.status_code == 200 and len(everything.json()) >= 36
    assert everything.json()[0]["id"] == "s-001" and "validationReport" not in everything.json()[0]
    pending = (await client.get("/scenarios", params={"validationStatus": "pending"})).json()
    assert pending and all(s["validation"]["status"] == "pending" for s in pending)
    generated = (await client.get("/scenarios", params={"source": "generated"})).json()
    assert generated and all(s["source"] == "generated" for s in generated)
    easy = (await client.get("/scenarios", params=[("difficulty", "1"), ("difficulty", "2")])).json()
    assert easy and all(s["difficulty"] <= 2 for s in easy)
    gas = (await client.get("/scenarios", params={"group": "Запах газа в помещении (в доме, в квартире)"})).json()
    assert gas and all("c-093" in s["cardIds"] or "c-090" in s["cardIds"] for s in gas)
    for params in ({"validationStatus": "bogus"}, {"source": "manual"}, {"difficulty": "9"}):
        response = await client.get("/scenarios", params=params)
        assert response.status_code == 400 and response.json()["error"]["code"] == "validationFailed", params


async def test_create_get_patch_delete(client):
    client.cookies.clear()
    body = await _draft_body(client)
    assert (await client.post("/scenarios", json={**body, "title": " "})).status_code == 400
    assert (await client.post("/scenarios", json={**body, "cardIds": ["c-999"]})).status_code == 400
    assert (await client.post("/scenarios", json={**body, "difficulty": 7})).status_code == 400
    created = await client.post("/scenarios", json=body)
    assert created.status_code == 201, created.text
    scenario = created.json()
    scenario_id = scenario["id"]
    assert scenario_id.startswith("s-") and scenario["validation"] == {"status": "draft"} and scenario["title"] == "Новый сценарий"
    assert (await client.get(f"/scenarios/{scenario_id}")).json() == scenario
    assert (await client.get("/scenarios/s-999")).status_code == 404

    patched = await client.patch(f"/scenarios/{scenario_id}", json={"difficulty": 2, "timeNorms": {"primaryReactionSec": 45, "fullProcessingSec": 240}, "mode": "follow", "updatedBy": TEACHER_ID})
    assert patched.status_code == 200, patched.text
    assert patched.json()["difficulty"] == 2 and patched.json()["level"] == "beginner" and patched.json()["mode"] == "follow"
    assert patched.json()["timeNorms"] == {"primaryReactionSec": 45, "fullProcessingSec": 240}
    assert patched.json()["validation"] == {"status": "draft"}
    for bad in ({"difficulty": 7}, {"timeNorms": {"primaryReactionSec": 0, "fullProcessingSec": 180}}, {"successCriteria": {"maxGrammarErrors": -1, "requiredFields": [], "syntaxRequirements": ""}}, {"level": "expert"}, {"etalon": {"expectedActions": "x", "keyPhrases": []}}):
        response = await client.patch(f"/scenarios/{scenario_id}", json={**bad, "updatedBy": TEACHER_ID})
        assert response.status_code == 400, bad
    assert (await client.patch(f"/scenarios/{scenario_id}", json={"title": "Правка курсанта", "updatedBy": STUDENT_ID})).status_code == 400
    assert (await client.patch("/scenarios/s-999", json={"title": "x", "updatedBy": TEACHER_ID})).status_code == 404
    audit = await _audit_actions("scenario.update")
    assert audit and audit[-1].user_id == TEACHER_ID and scenario_id in audit[-1].details and "сложность 2" in audit[-1].details
    async with get_sessionmaker()() as db:
        row = await db.get(Scenario, scenario_id)
        assert len(row.history) == 1 and row.history[0]["by"] == TEACHER_ID and row.history[0]["previous"]["difficulty"] == body["difficulty"]
        assert row.updated_by == TEACHER_ID and row.level == "beginner"

    # Роли с сессией: студент → 403, чужой преподаватель → 403, администратор — можно.
    await login_as(client, "student")
    assert (await client.patch(f"/scenarios/{scenario_id}", json={"title": "x", "updatedBy": TEACHER_ID})).status_code == 403
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {await token_for(OTHER_TEACHER_ID)}"
    assert (await client.patch(f"/scenarios/{scenario_id}", json={"title": "x", "updatedBy": TEACHER_ID})).status_code == 403
    client.headers.pop("Authorization")
    await login_as(client, "admin")
    assert (await client.patch(f"/scenarios/{scenario_id}", json={"title": "Правка администратора", "updatedBy": TEACHER_ID})).status_code == 200
    client.cookies.clear()

    # Удаление: шаблон и назначенный в занятие → 409 conflict; черновик — удаляется и исчезает.
    blocked = await client.delete(f"/scenarios/{TEMPLATE_ID}", params={"deletedBy": TEACHER_ID})
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "conflict"
    assert (await client.delete(f"/scenarios/{scenario_id}")).status_code == 400
    assert (await client.delete(f"/scenarios/{scenario_id}", params={"deletedBy": STUDENT_ID})).status_code == 400
    deleted = await client.delete(f"/scenarios/{scenario_id}", params={"deletedBy": TEACHER_ID})
    assert deleted.status_code == 200 and deleted.json()["id"] == scenario_id
    assert (await client.get(f"/scenarios/{scenario_id}")).status_code == 404
    assert all(s["id"] != scenario_id for s in (await client.get("/scenarios")).json())
    assert (await client.delete(f"/scenarios/{scenario_id}", params={"deletedBy": TEACHER_ID})).status_code == 404
    audit = await _audit_actions("scenario.delete")
    assert audit and audit[-1].user_id == TEACHER_ID and scenario_id in audit[-1].details


async def test_validation_workflow(client):
    client.cookies.clear()
    created = await client.post("/scenarios", json=await _draft_body(client))
    scenario_id = created.json()["id"]

    async def validate(body: dict):
        return await client.post(f"/scenarios/{scenario_id}/validate", json=body)

    assert (await validate({"action": "approve", "reviewedBy": TEACHER_ID})).status_code == 409
    assert (await validate({"action": "submit", "reviewedBy": STUDENT_ID})).status_code == 400
    assert (await validate({"action": "publish", "reviewedBy": TEACHER_ID})).status_code == 400
    assert (await validate({"action": "submit", "reviewedBy": TEACHER_ID, "comment": 5})).status_code == 400
    submitted = await validate({"action": "submit", "reviewedBy": TEACHER_ID, "comment": "Для ДТП с утечкой 101 обязателен"})
    assert submitted.status_code == 200 and submitted.json()["validation"] == {"status": "pending", "reviewedBy": TEACHER_ID, "comment": "Для ДТП с утечкой 101 обязателен"}
    assert (await validate({"action": "approvePartial", "reviewedBy": TEACHER_ID})).status_code == 400
    partial = await validate({"action": "approvePartial", "reviewedBy": TEACHER_ID, "fields": ["etalon.expectedActions", "successCriteria"]})
    assert partial.status_code == 200 and partial.json()["validation"] == {"status": "approved", "reviewedBy": TEACHER_ID, "approvedFields": ["etalon.expectedActions", "successCriteria"]}
    again = await validate({"action": "approve", "reviewedBy": TEACHER_ID})
    assert again.status_code == 409 and again.json()["error"]["code"] == "invalidTransition"
    assert (await validate({"action": "submit", "reviewedBy": TEACHER_ID})).json()["validation"]["status"] == "pending"
    rejected = await validate({"action": "reject", "reviewedBy": TEACHER_ID, "comment": "Коррекция: уточнить эталонные действия"})
    assert rejected.status_code == 200 and rejected.json()["validation"]["status"] == "rejected"
    session = await client.post("/sessions", json={"teacherId": TEACHER_ID, "studentIds": [STUDENT_ID], "scenarioIds": [scenario_id], "mode": "practice", "cardSource": "generated"})
    assert session.status_code == 400 and "не утверждён" in session.json()["error"]["message"]
    assert (await validate({"action": "submit", "reviewedBy": TEACHER_ID})).json()["validation"]["status"] == "pending"
    approved = await validate({"action": "approve", "reviewedBy": TEACHER_ID, "comment": "Эталон проверен целиком"})
    assert approved.status_code == 200 and approved.json()["validation"] == {"status": "approved", "reviewedBy": TEACHER_ID, "comment": "Эталон проверен целиком"}
    assert any(s["id"] == scenario_id for s in (await client.get("/scenarios", params={"validationStatus": "approved"})).json())
    for action in ("submit", "approvePartial", "approve", "reject"):
        entries = await _audit_actions(f"scenario.{action}")
        assert entries and entries[-1].user_id == TEACHER_ID and scenario_id in entries[-1].details, action
    await login_as(client, "student")
    assert (await validate({"action": "submit", "reviewedBy": TEACHER_ID})).status_code == 403
    client.cookies.clear()
    assert (await client.post("/scenarios/s-999/validate", json={"action": "submit", "reviewedBy": TEACHER_ID})).status_code == 404


async def test_generate_is_idempotent_and_validated(client):
    client.cookies.clear()
    assert (await client.post("/scenarios/generate", json={"category": "  ", "requestedBy": TEACHER_ID})).status_code == 400
    assert (await client.post("/scenarios/generate", json={"category": CATEGORY, "requestedBy": STUDENT_ID})).status_code == 400
    assert (await client.post("/scenarios/generate", json={"category": "Радиация", "requestedBy": TEACHER_ID})).status_code == 400
    before_cards = len((await client.get("/training-cards")).json())
    before_scenarios = len((await client.get("/scenarios")).json())
    response = await client.post("/scenarios/generate", json={"category": CATEGORY, "requestedBy": TEACHER_ID})
    assert response.status_code == 201, response.text
    generated = response.json()
    new_ids = [s["id"] for s in generated]
    try:
        assert 2 <= len(generated) <= 3
        for scenario in generated:
            assert scenario["source"] == "generated" and scenario["validation"] == {"status": "pending"}
            assert scenario["id"].startswith("s-") and scenario["cardIds"] and all(c.startswith("c-") for c in scenario["cardIds"])
            assert scenario["etalon"]["expectedActions"][0] == f"openCard:{scenario['cardIds'][0]}"
            report = scenario["validationReport"]
            assert {c["id"] for c in report["checks"]} == {"category", "address", "requiredFields", "duplicate", "grammar", "consistency"}
            assert isinstance(report["passed"], bool) and set(report["tickets"]) == set(scenario["cardIds"])
        cards = (await client.get("/training-cards")).json()
        assert len(cards) == before_cards + len(generated) and cards[0]["id"] == "c-001"
        generated_cards = {c["id"]: c for c in cards if c["id"] in {s["cardIds"][0] for s in generated}}  # cardIds[1] — исходная карточка группы
        assert all(c["group"] == CATEGORY and c["baseCardId"].startswith("c-") for c in generated_cards.values())
        assert all(s["cardIds"][1] == generated_cards[s["cardIds"][0]]["baseCardId"] for s in generated)
        assert {c.get("trap") for c in generated_cards.values()} == {None, "foreignTerritory", "operatorMistake"}
        listed = await client.get("/scenarios", params={"source": "generated", "validationStatus": "pending"})
        assert {s["id"] for s in listed.json()} >= set(new_ids)
        # Повтор той же категории — те же сценарии, без новых карточек и сценариев.
        repeat = await client.post("/scenarios/generate", json={"category": CATEGORY, "requestedBy": TEACHER_ID})
        assert repeat.status_code == 201 and [s["id"] for s in repeat.json()] == new_ids
        assert len((await client.get("/training-cards")).json()) == before_cards + len(generated)
        assert len((await client.get("/scenarios")).json()) == before_scenarios + len(generated)
        audit = await _audit_actions("scenario.generate")
        assert len(audit) >= 2 and audit[-2].user_id == TEACHER_ID and f"{len(generated)} новых" in audit[-2].details and "0 новых" in audit[-1].details
        await login_as(client, "student")
        assert (await client.post("/scenarios/generate", json={"category": CATEGORY, "requestedBy": TEACHER_ID})).status_code == 403
    finally:
        client.cookies.clear()
        async with get_sessionmaker()() as db:
            await db.execute(delete(Scenario).where(Scenario.id.in_(new_ids)))
            await db.execute(delete(IncidentCard).where(IncidentCard.mode_origin == "generated"))
            await db.commit()


async def test_training_cards(client):
    client.cookies.clear()
    cards = (await client.get("/training-cards")).json()
    assert len(cards) >= 96 and cards[0]["id"] == "c-001"
    assert all(isinstance(c["group"], str) and c["expectedTags"] is not None for c in cards)


async def test_materials(client):
    client.cookies.clear()
    for name in ("Регламент.docx", "Билеты.pdf", "Запись.mp3"):
        response = await client.post("/materials", json={"name": name, "uploadedBy": TEACHER_ID})
        assert response.status_code == 201, response.text
    listed = (await client.get("/materials")).json()
    assert [m["format"] for m in listed[:3]] == ["MP3", "PDF", "DOCX"]
    assert listed[0]["id"].startswith("mat-") and listed[0]["uploadedBy"] == TEACHER_ID and listed[0]["sizeBytes"] == 0
    rejected = await client.post("/materials", json={"name": "Презентация.pptx", "uploadedBy": TEACHER_ID})
    assert rejected.status_code == 400 and "DOCX, PDF, MP3" in rejected.json()["error"]["message"]
    assert (await client.post("/materials", json={"name": "x.pdf", "uploadedBy": STUDENT_ID})).status_code == 400
    assert (await client.post("/materials", json={"name": "x.pdf", "sizeBytes": -1, "uploadedBy": TEACHER_ID})).status_code == 400
    assert (await client.post("/materials", json={"uploadedBy": TEACHER_ID})).status_code == 400
    sized = await client.post("/materials", json={"name": "Методика занятия.docx", "sizeBytes": 24576, "uploadedBy": TEACHER_ID})
    assert sized.status_code == 201 and sized.json()["sizeBytes"] == 24576 and sized.json()["format"] == "DOCX"
    audit = await _audit_actions("material.upload")
    assert audit and audit[-1].user_id == TEACHER_ID and "Методика занятия.docx" in audit[-1].details
    await login_as(client, "student")
    assert (await client.post("/materials", json={"name": "x.pdf", "uploadedBy": TEACHER_ID})).status_code == 403
    client.cookies.clear()


async def test_grammar_check(client):
    client.cookies.clear()
    response = await client.post("/grammar-check", json={"text": "Сообщение пренято, бригада направлена", "field": "dispatcherAction"})
    assert response.status_code == 200
    body = response.json()
    assert body["origin"] == "ai" and body["provider"] == "service"
    assert {"field": "dispatcherAction", "fragment": "Сообщение пренято", "wrong": "пренято", "expected": "принято", "type": "spelling"} in body["data"]
    assert (await client.post("/grammar-check", json={"field": "text"})).status_code == 400
    assert (await client.post("/grammar-check", json={"text": 5})).status_code == 400
    clean = await client.post("/grammar-check", json={"text": "выехал наряд"})
    assert clean.status_code == 200 and clean.json()["data"] and clean.json()["data"][0]["field"] == "text"
    lookalike = await client.post("/grammar-check", json={"text": "ул. Зверенецкая, 22", "field": "address"})
    assert lookalike.status_code == 200
    assert any(e["expected"] == "Зверинецкая улица" and e["type"] == "spelling" and e["field"] == "address" for e in lookalike.json()["data"])
    exact = await client.post("/grammar-check", json={"text": "ул. Дубининская, 12", "field": "address"})
    assert exact.json()["data"] == []
