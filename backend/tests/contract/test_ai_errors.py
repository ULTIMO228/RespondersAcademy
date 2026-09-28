"""Контрактные HTTP-тесты реестра ошибок и агрегатов (T027, T030)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.db.session import get_sessionmaker
from app.models.ai_assessment import ErrorRecord
from app.models.card import IncidentCard
from app.models.scenario import Scenario
from app.models.session import Attempt, TrainingSession
from tests.conftest import login_as


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


async def _cleanup_errors_db():
    async with get_sessionmaker()() as db:
        await db.execute(delete(ErrorRecord).where(ErrorRecord.attempt_id.like("%t027%")))
        await db.execute(delete(Attempt).where(Attempt.id.like("%t027%")))
        await db.execute(delete(TrainingSession).where(TrainingSession.id.like("%t027%")))
        await db.execute(delete(Scenario).where(Scenario.id.like("%t027%")))
        await db.execute(delete(IncidentCard).where(IncidentCard.id.like("%t027%")))
        await db.commit()


@pytest_asyncio.fixture(autouse=True)
async def cleanup_ai_errors_fixtures() -> AsyncIterator[None]:
    await _cleanup_errors_db()
    yield
    await _cleanup_errors_db()


async def _seed_test_error_session(db, session_id: str = "session-t027", teacher_id: str = "u-002", student_id: str = "u-005"):
    session = TrainingSession(
        id=session_id,
        state="running",
        teacher_id=teacher_id,
        scenario_ids=["scen-t027"],
        student_ids=[student_id, "u-006"],
        started_at="2026-09-27T10:00:00Z",
    )
    db.add(session)

    card = IncidentCard(
        id="card-t027",
        ticket_no=1,
        situation_no=1,
        group="Пожар",
        summary="Тестовая карточка",
        address="Тверская",
        caller={"name": "Иванов"},
        expected_services=["101"],
    )
    db.add(card)

    scenario = Scenario(
        id="scen-t027",
        title="Сценарий с ошибками",
        level="beginner",
        difficulty=1,
        source="template",
        validation_status="passed",
        card_ids=["card-t027"],
        doc={"id": "scen-t027", "title": "Сценарий с ошибками", "etalon": {"primaryStatus": "Принята"}},
    )
    db.add(scenario)

    att1 = Attempt(
        id="att-t027-1",
        session_id=session_id,
        card_id="card-t027",
        student_id=student_id,
        mode="dds",
        seq=1,
        opened_at="2026-09-27T10:00:00Z",
        primary_reaction_ms=45000,
        full_processing_ms=190000,
        completed_at="2026-09-27T10:05:00Z",
    )
    db.add(att1)

    # Ошибки первой попытки
    err1 = ErrorRecord(
        id="err-t027-1",
        attempt_id="att-t027-1",
        mode="dds",
        rule_id="v1",
        type="noPrimaryStatus",
        severity="critical",
        evidence_key="rule:v1",
        field_path="statuses",
        observed="Статус реагирования не выставлен",
        expected="Принята",
        source_ref="памятка ОКР",
        detector="rule",
        etalon_version="scen-t027",
        assessor_version="1.0",
        fixed=False,
        created_at="2026-09-27T10:05:00Z",
    )
    err2 = ErrorRecord(
        id="err-t027-2",
        attempt_id="att-t027-1",
        mode="dds",
        rule_id="t1",
        type="timeReactionExceeded",
        severity="major",
        evidence_key="timing:primary",
        observed="Превышен норматив первичной реакции: 45 с",
        expected="30 с",
        source_ref="Q&A нормативы",
        detector="rule",
        etalon_version="scen-t027",
        assessor_version="1.0",
        fixed=False,
        created_at="2026-09-27T10:05:00Z",
    )
    db.add(err1)
    db.add(err2)

    # Вторая попытка другого студента u-006
    att2 = Attempt(
        id="att-t027-2",
        session_id=session_id,
        card_id="card-t027",
        student_id="u-006",
        mode="operator112",
        seq=1,
        opened_at="2026-09-27T10:01:00Z",
        primary_reaction_ms=25000,
        full_processing_ms=120000,
        completed_at="2026-09-27T10:06:00Z",
    )
    db.add(att2)

    err3 = ErrorRecord(
        id="err-t027-3",
        attempt_id="att-t027-2",
        mode="operator112",
        rule_id="op-f0",
        type="wrongFinalType",
        severity="critical",
        evidence_key="field:what.finalType",
        field_path="what.finalType",
        observed="Итоговый тип не определён",
        expected="Пожар",
        source_ref="памятка АРМ-112",
        detector="rule",
        etalon_version="scen-t027",
        assessor_version="1.0",
        fixed=False,
        created_at="2026-09-27T10:06:00Z",
    )
    db.add(err3)
    await db.commit()


@pytest.mark.asyncio
async def test_get_session_errors_rbac(v1):
    """GET /api/v1/ai/sessions/{id}/errors: строгая ролевая изоляция (T027, T030)."""
    async with get_sessionmaker()() as db:
        await _seed_test_error_session(db, session_id="session-t027", teacher_id="u-002", student_id="u-005")

    # 1. 401 Unauthorized без куки
    resp = await v1.get("/ai/sessions/session-t027/errors")
    assert resp.status_code == 401

    # 2. 403 Forbidden курсанту
    await login_as(v1, "student")  # u-005
    resp = await v1.get("/ai/sessions/session-t027/errors")
    assert resp.status_code == 403

    # 3. 200 OK преподавателю сессии
    await login_as(v1, "teacher")  # u-002
    resp = await v1.get("/ai/sessions/session-t027/errors")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) == 3
    assert data["total"] == 3

    # 4. Фильтры mode, studentId, severity
    resp_mode = await v1.get("/ai/sessions/session-t027/errors?mode=dds")
    assert resp_mode.status_code == 200
    assert len(resp_mode.json()["items"]) == 2

    resp_student = await v1.get("/ai/sessions/session-t027/errors?studentId=u-006")
    assert resp_student.status_code == 200
    assert len(resp_student.json()["items"]) == 1
    assert resp_student.json()["items"][0]["ruleId"] == "op-f0"

    resp_sev = await v1.get("/ai/sessions/session-t027/errors?severity=major")
    assert resp_sev.status_code == 200
    assert len(resp_sev.json()["items"]) == 1
    assert resp_sev.json()["items"][0]["ruleId"] == "t1"


@pytest.mark.asyncio
async def test_get_session_error_summary_contract(v1):
    """GET /api/v1/ai/sessions/{id}/error-summary: сводка частот и ID записей (T027, T030)."""
    async with get_sessionmaker()() as db:
        await _seed_test_error_session(db, session_id="session-t027", teacher_id="u-002", student_id="u-005")

    await login_as(v1, "teacher")
    resp = await v1.get("/ai/sessions/session-t027/error-summary")
    assert resp.status_code == 200
    data = resp.json()

    assert data["sessionId"] == "session-t027"
    assert data["totalErrors"] == 3
    assert data["byType"] == {
        "noPrimaryStatus": 1,
        "timeReactionExceeded": 1,
        "wrongFinalType": 1,
    }
    assert data["byMode"] == {"operator112": 1, "dds": 2}
    assert data["bySeverity"] == {"critical": 2, "major": 1, "minor": 0}
    assert data["byStudent"] == {"u-005": 2, "u-006": 1}
    assert set(data["errorRecordIds"]) == {"err-t027-1", "err-t027-2", "err-t027-3"}


@pytest.mark.asyncio
async def test_get_my_errors_isolation(v1):
    """GET /api/v1/ai/me/errors: курсант получает только свои ошибки, изолированные от других (T027, T030)."""
    async with get_sessionmaker()() as db:
        await _seed_test_error_session(db, session_id="session-t027", teacher_id="u-002", student_id="u-005")

    # 1. 401 без входа
    resp = await v1.get("/ai/me/errors")
    assert resp.status_code == 401

    # 2. Вход под student (u-005)
    await login_as(v1, "student")
    resp = await v1.get("/ai/me/errors")
    assert resp.status_code == 200
    data = resp.json()

    assert data["studentId"] == "u-005"
    assert data["totalErrors"] == 2
    assert len(data["attempts"]) == 1
    attempt_errs = data["attempts"][0]
    assert attempt_errs["attemptId"] == "att-t027-1"
    assert len(attempt_errs["errors"]) == 2
    # Никаких ошибок студента u-006
    assert all(e["id"] != "err-t027-3" for e in attempt_errs["errors"])
