"""Phase 15: submitted 112 card reaches a matching DDS profile with the source-ticket etalon."""

from __future__ import annotations

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.card import IncidentCard
from app.models.session import Attempt, TrainingSession
from app.services.chain_service import issue_submitted_card
from app.services.time import now_iso
from tests.conftest import login_as


async def test_chain_routes_wrong_type_and_records_missing_recipient(app):
    async with get_sessionmaker()() as db:
        original = IncidentCard(id="c-990", ticket_no=990, situation_no=1, group="Водоснабжение",
                                summary="Прорыв трубы, запах газа", address="Москва, Дубнинская, 2",
                                caller={"name": "Иванов"}, expected_services=["Мосводоканал"], expected_tags=[], mode_origin="seed")
        source = Attempt(id="a-990", session_id="chain-source", card_id=original.id, student_id="u-005",
                         mode="operator112", opened_at=now_iso(), primary_reaction_ms=0, statuses=[],
                         services_called=[], full_processing_ms=0, entered_text={}, calls=[], seq=0)
        card = IncidentCard(id="c-991", ticket_no=990, situation_no=1, group="Газ",
                            summary="Запах газа", address=original.address, caller={"name": "Иванов"},
                            expected_services=["104"], expected_tags=[], created_by_student_id="u-005",
                            mode_origin="operator112", source_attempt_id=source.id, extra={"sourceCardId": original.id})
        assignment = Assignment(id="asg-990", teacher_id="u-002", student_ids=["u-005", "u-009"],
                                training_mode="chain", format="training", card_ids=[original.id],
                                params={}, state="active", created_at=now_iso(), title="Phase 15 chain")
        db.add_all([original, source, card, assignment])
        await db.flush()
        try:
            await issue_submitted_card(db, card, source, assignment)
            await db.flush()
            session = (await db.execute(select(TrainingSession).where(TrainingSession.mode == "assignment:asg-990"))).scalar_one()
            assert session.card_flow[0]["studentId"] == "u-009"
            assert session.card_flow[0]["issuedBy"] == "chain" and session.card_flow[0]["studentCreated"] is True
            linked = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.assignment_id == assignment.id))).scalar_one()
            assert linked.student_id == "u-009" and linked.card_id == card.id
            assert (await db.get(Attempt, linked.attempt_id)).mode == "dds"
            etalon = card.extra["chainEtalon"]["cards"][card.id]
            assert etalon["expectedDecision"] == "notAccepted"
            assert etalon["expectedTransferTo"] == "Мосводоканал"
            assert card.extra["sourceAttemptId"] == source.id
            assignment.student_ids = ["u-005"]
            another = IncidentCard(id="c-992", ticket_no=990, situation_no=1, group="Газ", summary="Запах газа",
                                   address=original.address, caller={"name": "Иванов"}, expected_services=["104"],
                                   expected_tags=[], created_by_student_id="u-005", mode_origin="operator112",
                                   source_attempt_id=source.id)
            db.add(another)
            await db.flush()
            await issue_submitted_card(db, another, source, assignment)
            assert assignment.params["noRecipient"][0]["cardId"] == another.id
        finally:
            await db.rollback()


async def test_teacher_can_issue_source_based_trap(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock") as client:
        await login_as(client, "teacher")
        created = await client.post("/sessions", json={"teacherId": "u-002", "studentIds": ["u-005"],
                                                      "scenarioIds": ["s-001"], "mode": "practice", "cardSource": "generated"})
        assert created.status_code == 201, created.text
        session_id = created.json()["id"]
        trap_id = None
        try:
            started = await client.post(f"/sessions/{session_id}/start")
            assert started.status_code == 200, started.text
            issued = await client.post(f"/sessions/{session_id}/control", json={"action": "issue", "studentId": "u-005",
                                                                                       "cardId": "c-010", "trapType": "addressTypo"})
            assert issued.status_code == 200, issued.text
            item = issued.json()["session"]["cardFlow"][-1]
            trap_id = item["cardId"]
            assert item["issuedBy"] == "trap" and item["trap"] == "addressTypo"
            async with get_sessionmaker()() as db:
                card = await db.get(IncidentCard, trap_id)
                assert card.extra["baseCardId"] == "c-010"
                assert card.extra["chainEtalon"]["cards"][trap_id]["expectedDecision"] == "notAccepted"
        finally:
            async with get_sessionmaker()() as db:
                if trap_id:
                    await db.delete(await db.get(IncidentCard, trap_id))
                await db.delete(await db.get(TrainingSession, session_id))
                await db.commit()
