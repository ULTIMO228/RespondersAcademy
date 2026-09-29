import asyncio

import pytest

from app.db.session import get_sessionmaker
from app.models.session import Attempt, Evaluation, TeacherOverride, TrainingSession
from app.services import session_engine
from app.services.session_engine import (
    build_feed,
    feed_attempts,
    order_for_student,
    pace_ms_for_student,
    project_for_student,
    schedule_for_student,
)

SESSION = {
    "id": "ses-1",
    "cardFlow": [
        {"cardId": "c-063", "studentId": "u-005", "issuedAt": "2026-09-16T10:02:00+03:00", "level": 1},
        {"cardId": "c-063", "studentId": "u-006", "issuedAt": "2026-09-16T10:02:00+03:00", "level": 1},
    ],
    "cardEvents": [
        {
            "id": "att-01",
            "cardId": "c-063",
            "studentId": "u-005",
            "openedAt": "2026-09-16T10:02:14+03:00",
            "statuses": [{"ddsStatus": "accepted", "at": "2026-09-16T10:02:31+03:00"}],
            "completedAt": "2026-09-16T10:05:12+03:00",
            "fullProcessingMs": 178000,
            "evaluation": {"totalScore": 98, "errors": [], "grammarErrors": [{"field": "x"}], "aiComment": "ок"},
        },
        {"id": "att-02", "cardId": "c-063", "studentId": "u-006", "openedAt": "2026-09-16T10:02:14+03:00", "statuses": [], "completedAt": "", "fullProcessingMs": 0},
    ],
}


def test_window_and_order():
    events = build_feed(SESSION, None, "2026-09-16T10:02:14+03:00")
    assert [e["kind"] for e in events] == ["cardIssued", "cardIssued", "cardOpened", "cardOpened"]
    assert [e["studentId"] for e in events[:2]] == ["u-005", "u-006"]
    later = build_feed(SESSION, "2026-09-16T10:02:14+03:00", "2026-09-16T10:05:12+03:00")
    assert [e["kind"] for e in later] == ["statusChanged", "cardCompleted", "aiEvaluation"]
    assert later[-1]["isAi"] is True and later[-1]["errorCount"] == 1 and later[-1]["totalScore"] == 98
    assert build_feed(SESSION, "2026-09-16T10:05:12+03:00", "2026-09-16T11:00:00+03:00") == []


@pytest.mark.asyncio
async def test_feed_projection_keeps_evaluation_and_override(seeded_db):
    async with get_sessionmaker()() as db:
        db.add(Attempt(
            id="att-feed-test", session_id="ses-feed-test", card_id="c-063", student_id="u-005",
            mode="dds", opened_at="2026-09-16T10:02:14+03:00", statuses=[], services_called=[],
            completed_at="2026-09-16T10:05:12+03:00", full_processing_ms=178000,
            entered_text={}, calls=[], seq=1,
        ))
        db.add(Evaluation(
            attempt_id="att-feed-test", assessor_version="test", time_score=80, correctness_score=80,
            grammar_score=80, semantic_score=80, total_score=80, grammar_errors=[{"field": "x"}],
            errors=[], ai_comment="ok", components={}, generated_at="2026-09-16T10:05:12+03:00", mode="dds",
        ))
        await db.flush()
        attempts = await feed_attempts(db, "ses-feed-test")
        events = build_feed({"cardFlow": [], "cardEvents": attempts}, None, "2026-09-16T10:06:00+03:00")
        assert [event["kind"] for event in events] == ["cardOpened", "cardCompleted", "aiEvaluation"]
        assert events[-1]["status"] == "preliminary" and events[-1]["errorCount"] == 1

        db.add(TeacherOverride(
            attempt_id="att-feed-test", teacher_id="u-002", score=77, comment="Проверено",
            at="2026-09-16T10:06:00+03:00",
        ))
        await db.flush()
        attempts = await feed_attempts(db, "ses-feed-test")
        events = build_feed({"cardFlow": [], "cardEvents": attempts}, None, "2026-09-16T10:06:00+03:00")
        assert events[-1]["status"] == "final" and events[-1]["totalScore"] == 80
        await db.rollback()


@pytest.mark.asyncio
async def test_parallel_feed_polls_share_reads_but_see_later_commits(seeded_db, monkeypatch):
    session_id = "ses-feed-parallel"
    async with get_sessionmaker()() as db:
        db.add(TrainingSession(
            id=session_id, teacher_id="u-002", student_ids=["u-005"], scenario_ids=[],
            mode="practice", card_source="generated", card_flow=[], state="running",
            started_at="2026-09-16T10:00:00+03:00",
        ))
        await db.commit()

    calls = {"metadata": 0, "attempts": 0}
    original_metadata = session_engine.require_session_row
    original_attempts = session_engine.feed_attempts

    async def read_metadata(*args):
        calls["metadata"] += 1
        await asyncio.sleep(0.02)
        return await original_metadata(*args)

    async def read_attempts(*args):
        calls["attempts"] += 1
        await asyncio.sleep(0.02)
        return await original_attempts(*args)

    monkeypatch.setattr(session_engine, "require_session_row", read_metadata)
    monkeypatch.setattr(session_engine, "feed_attempts", read_attempts)

    async def poll():
        async with get_sessionmaker()() as db:
            return await session_engine.session_feed(db, session_id, None, None, "2026-09-16T11:00:00+03:00", None)

    first = await asyncio.gather(*(poll() for _ in range(20)))
    assert all(result["events"] == [] for result in first)
    assert calls == {"metadata": 1, "attempts": 1}

    async with get_sessionmaker()() as db:
        db.add(Attempt(
            id="att-feed-parallel", session_id=session_id, card_id="c-063", student_id="u-005",
            opened_at="2026-09-16T10:02:00+03:00", statuses=[], services_called=[],
            entered_text={}, calls=[], seq=1,
        ))
        await db.commit()

    second = await poll()
    assert [event["kind"] for event in second["events"]] == ["cardOpened"]
    assert calls == {"metadata": 2, "attempts": 2}


def test_projection():
    projected = project_for_student(SESSION, "u-006")
    assert projected["studentIds"] == ["u-006"]
    assert [i["studentId"] for i in projected["cardFlow"]] == ["u-006"]
    assert [e["id"] for e in projected["cardEvents"]] == ["att-02"]


def test_adaptive_order_and_pace():
    cards = [{"cardId": "a", "level": 3, "group": "g"}, {"cardId": "b", "level": 1, "group": "g"}, {"cardId": "c", "level": 2, "group": "g"}]
    assert [c["cardId"] for c in order_for_student(cards, "manual", 90)] == ["a", "b", "c"]
    assert [c["cardId"] for c in order_for_student(cards, "adaptive", None)] == ["b", "c", "a"]
    assert [c["cardId"] for c in order_for_student(cards, "adaptive", 90)] == ["c", "a", "b"]
    assert [c["cardId"] for c in order_for_student(cards, "adaptive", 40)] == ["b", "b", "c", "a"]
    plan = {"paceSec": 60}
    assert pace_ms_for_student(plan, None) == 60000 and pace_ms_for_student(plan, 40) == 90000
    flow = schedule_for_student(cards[:2], "u-1", 0, 60000, False)
    assert [f["issuedAt"] for f in flow] == ["1970-01-01T03:00:00+03:00", "1970-01-01T03:01:00+03:00"]
    assert len(schedule_for_student(cards[:1], "u-1", 0, 600000, True)) == 6
