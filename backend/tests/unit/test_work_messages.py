"""Timed DDS updates: category offsets, due filtering, ownership, and status basis."""

from __future__ import annotations

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.session import Attempt, TrainingSession
from app.models.work_message import WorkMessage
from app.services.attempts import record_progress
from app.services.time import ms_to_iso, now_iso, parse_iso_ms
from app.services.work_messages import due_messages, intervals_for, schedule_on_accept
from ml.assess.components import statuses
from ml.assess.types import AssessContext
from tests.conftest import login_as


def test_intervals_are_category_specific_and_ordered():
    params = {"workMessageIntervalsSec": [10, 20, 30, 40],
              "workMessageIntervalsByGroup": {"Газ": [1, 2, 3, 4]}}
    assert intervals_for("Газ", params) == (1, 2, 3, 4)
    assert intervals_for("Пожар", params) == (10, 20, 30, 40)


async def test_schedule_due_and_api_ownership(app):
    start = ms_to_iso(parse_iso_ms(now_iso()) - 10_000)
    async with get_sessionmaker()() as db:
        session = TrainingSession(id="ses-990", teacher_id="u-002", student_ids=["u-005"], scenario_ids=[],
                                  mode="practice", card_source="generated", card_flow=[], state="running",
                                  started_at=start, plan={"workMessagesEnabled": True, "workMessageIntervalsSec": [1, 2, 3, 4]},
                                  parked=[], training_mode="dds", format="training")
        attempt = Attempt(id="att-990", session_id=session.id, card_id="c-010", student_id="u-005", mode="dds",
                          opened_at=start, primary_reaction_ms=0, statuses=[], services_called=[],
                          full_processing_ms=0, entered_text={}, calls=[], seq=0)
        db.add_all([session, attempt])
        await db.flush()
        try:
            await record_progress(db, attempt.id, {"status": {"ddsStatus": "accepted", "at": start}})
            await schedule_on_accept(db, attempt, start)
            rows = (await db.execute(select(WorkMessage).where(WorkMessage.attempt_id == attempt.id))).scalars().all()
            assert len(rows) == 4
            assert [row.expected_status for row in rows] == ["responseStarted", "arrived", "workInProgress", "workDone"]
            assert len(await due_messages(db, attempt.id, start)) == 4
            since = ms_to_iso(parse_iso_ms(start) + 2_000)
            assert len(await due_messages(db, attempt.id, since)) == 2
            await db.commit()
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
                await login_as(client, "student")
                response = await client.get(f"/attempts/{attempt.id}/work-messages")
                assert response.status_code == 200 and len(response.json()) == 4
                await login_as(client, "student2")
                assert (await client.get(f"/attempts/{attempt.id}/work-messages")).status_code == 403
        finally:
            await db.rollback()
            async with get_sessionmaker()() as cleanup:
                for row in (await cleanup.execute(select(WorkMessage).where(WorkMessage.attempt_id == attempt.id))).scalars().all():
                    await cleanup.delete(row)
                await cleanup.delete(await cleanup.get(Attempt, attempt.id))
                await cleanup.delete(await cleanup.get(TrainingSession, session.id))
                await cleanup.commit()


def test_status_without_information_is_scored():
    base = "2026-01-01T12:00:00+03:00"
    early = ms_to_iso(parse_iso_ms(base) - 1_000)
    ctx = AssessContext(
        attempt={"cardId": "c-010", "statuses": [{"ddsStatus": "accepted", "at": early},
                                                  {"ddsStatus": "responseStarted", "at": early}],
                 "workMessages": [{"expectedStatus": "responseStarted", "at": base}]},
        scenario={"etalon": {"expectedActions": ["openCard:c-010", "status:accepted", "status:responseStarted"]}},
        card=None,
    )
    result = statuses.run(ctx)
    assert any(error.type == "statusWithoutBasis" for error in result.errors)
    assert result.score == 0
