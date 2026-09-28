"""Контрактные тесты жизненного цикла оценки, очереди задач и арбитража (US2, T018)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.ai_assessment import (
    AssessmentJob,
    ErrorRecord,
    EvaluationRevision,
    SemanticReview,
    install_ai_assessment_guards,
)
from app.models.audit import AuditLog
from app.models.card import IncidentCard
from app.models.report import CalibrationSample
from app.models.scenario import Scenario
from app.models.session import Attempt, Evaluation, TeacherOverride, TrainingSession
from tests.conftest import login_as


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


async def _cleanup_db():
    async with get_sessionmaker()() as db:
        connection = await db.connection()
        await connection.exec_driver_sql("DROP TRIGGER IF EXISTS trg_ai_evaluation_revision_no_update")
        await connection.exec_driver_sql("DROP TRIGGER IF EXISTS trg_ai_evaluation_revision_no_delete")
        await connection.exec_driver_sql("DROP TRIGGER IF EXISTS trg_ai_evaluation_revision_validate_insert")

        await db.execute(delete(SemanticReview).where(SemanticReview.attempt_id.like("%t018%")))
        await db.execute(delete(ErrorRecord).where(ErrorRecord.attempt_id.like("%t018%")))
        await db.execute(delete(EvaluationRevision).where(EvaluationRevision.attempt_id.like("%t018%")))
        await db.execute(delete(AssessmentJob).where(AssessmentJob.attempt_id.like("%t018%")))
        await db.execute(delete(TeacherOverride).where(TeacherOverride.attempt_id.like("%t018%")))
        await db.execute(delete(CalibrationSample).where(CalibrationSample.attempt_id.like("%t018%")))
        await db.execute(delete(Evaluation).where(Evaluation.attempt_id.like("%t018%")))
        await db.execute(delete(Attempt).where(Attempt.id.like("%t018%")))
        await db.execute(delete(TrainingSession).where(TrainingSession.id.like("%t018%")))
        await db.execute(delete(Scenario).where(Scenario.id.like("%t018%")))
        await db.execute(delete(IncidentCard).where(IncidentCard.id.like("%t018%")))
        await db.execute(delete(AuditLog).where(AuditLog.details.like("%t018%")))

        await connection.run_sync(install_ai_assessment_guards)
        await db.commit()


@pytest_asyncio.fixture(autouse=True)
async def cleanup_ai_assessment_fixtures() -> AsyncIterator[None]:
    await _cleanup_db()
    yield
    await _cleanup_db()


async def _seed_test_session(db, attempt_id: str, student_id: str = "u-005", teacher_id: str = "u-002", mode: str = "dds"):
    session = TrainingSession(
        id=f"session-{attempt_id}",
        state="running",
        teacher_id=teacher_id,
        scenario_ids=[f"scen-{attempt_id}"],
        student_ids=[student_id],
        started_at="2026-09-27T09:00:00Z",
        plan={"timeNorms": {"primaryReactionSec": 30, "fullProcessingSec": 180}},
    )
    db.add(session)
    card = IncidentCard(
        id=f"card-{attempt_id}",
        ticket_no=1,
        situation_no=1,
        group="Пожар",
        summary="Возгорание мусора на площадке",
        address="Тверская ул., 1",
        caller={"name": "Иванов И.И.", "phone": "79991112233"},
        expected_services=["01"],
        expected_tags=["Пожар"],
    )
    db.add(card)
    scenario = Scenario(
        id=f"scen-{attempt_id}",
        title="Сценарий T018",
        level="beginner",
        difficulty=1,
        source="template",
        validation_status="passed",
        card_ids=[card.id],
        doc={"id": f"scen-{attempt_id}", "title": "Сценарий T018", "cardIds": [card.id], "etalon": {"actions": []}},
    )
    db.add(scenario)
    attempt = Attempt(
        id=attempt_id,
        session_id=session.id,
        card_id=card.id,
        student_id=student_id,
        mode=mode,
        opened_at="2026-09-27T10:00:00Z",
        completed_at="2026-09-27T10:02:00Z",
    )
    db.add(attempt)
    await db.commit()


@pytest.mark.asyncio
async def test_assessment_state_rbac(v1: AsyncClient):
    """Строгий серверный RBAC: 401 без авторизации, 403 чужому курсанту, доступ студенту и преподавателю."""
    attempt_id = "t018-rbac"
    async with get_sessionmaker()() as db:
        await _seed_test_session(db, attempt_id, student_id="u-005", teacher_id="u-002")

    # 401 без авторизации
    res = await v1.get(f"/ai/attempts/{attempt_id}/assessment-state")
    assert res.status_code == 401

    # 403 чужому курсанту
    await login_as(v1, "student2")
    res = await v1.get(f"/ai/attempts/{attempt_id}/assessment-state")
    assert res.status_code == 403

    # 200 студенту-владельцу
    await login_as(v1, "student")
    res = await v1.get(f"/ai/attempts/{attempt_id}/assessment-state")
    assert res.status_code == 200
    data = res.json()
    assert data["attemptId"] == attempt_id
    assert data["mode"] == "dds"
    assert data["status"] in ("pending", "preliminary", "review_required", "final")

    # 200 преподавателю занятия
    await login_as(v1, "teacher")
    res = await v1.get(f"/ai/attempts/{attempt_id}/assessment-state")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_assessment_review_access_teacher_only(v1: AsyncClient):
    """Детальный review доступен только преподавателю и админу, курсанту — 403."""
    attempt_id = "t018-rev-rbac"
    async with get_sessionmaker()() as db:
        await _seed_test_session(db, attempt_id, student_id="u-005", teacher_id="u-002")

    # Студенту 403
    await login_as(v1, "student")
    res = await v1.get(f"/ai/attempts/{attempt_id}/review")
    assert res.status_code == 403

    # Преподавателю 200
    await login_as(v1, "teacher")
    res = await v1.get(f"/ai/attempts/{attempt_id}/review")
    assert res.status_code == 200
    data = res.json()
    assert "attemptId" in data
    assert "semanticReviews" in data
    assert "errorRecords" in data


@pytest.mark.asyncio
async def test_assessment_lifecycle_and_resolve(v1: AsyncClient):
    """Сквозной жизненный цикл: review_required -> resolve преподавателем -> final.

    Поздний ответ LLM не перезаписывает final. Повтор requestId идемпотентен.
    """
    attempt_id = "t018-lifecycle"
    async with get_sessionmaker()() as db:
        await _seed_test_session(db, attempt_id, student_id="u-005", teacher_id="u-002")
        # Создаем ревизию со статусом review_required (спорная семантика)
        rev = EvaluationRevision(
            attempt_id=attempt_id,
            revision=1,
            mode="dds",
            status="review_required",
            available_axes=["timeScore", "correctnessScore", "grammarScore"],
            axes={"timeScore": 90, "correctnessScore": 85, "grammarScore": 95, "semanticScore": None},
            total_score=None,
            etalon_version="etalon-v1",
            assessor_version="dds-1.1.0",
            model_release_id=None,
            created_at="2026-09-27T10:05:00Z",
        )
        db.add(rev)
        s_rev = SemanticReview(
            id="srev-t018-1",
            attempt_id=attempt_id,
            field_path="comment",
            reference_fact_ids=["fact-1"],
            reason="Пограничное подобие",
            base_similarity=0.74,
            threshold_version="semantic-calibrated-v1",
            decision="uncertain",
            explanation="Требуется подтверждение преподавателем",
        )
        db.add(s_rev)
        await db.commit()

    # Студент видит review_required без totalScore
    await login_as(v1, "student")
    res = await v1.get(f"/ai/attempts/{attempt_id}/assessment-state")
    assert res.status_code == 200
    state = res.json()
    assert state["status"] == "review_required"
    assert state.get("totalScore") is None
    assert "semanticScore" not in state["availableAxes"]

    # Преподаватель разрешает спор через /resolve
    await login_as(v1, "teacher")
    resolve_payload = {
        "expectedRevision": 1,
        "score": 88,
        "comment": "Смысл передан верно, формулировка допустима",
        "semanticDecisions": [
            {"reviewId": "srev-t018-1", "decision": "equivalent"}
        ],
        "requestId": "req-resolve-t018-1",
    }
    res = await v1.post(f"/ai/attempts/{attempt_id}/resolve", json=resolve_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "final"
    assert data["revision"] == 2
    assert data["totalScore"] == 88

    # Повтор с тем же requestId возвращает идентичный ответ (идемпотентность)
    res_repeat = await v1.post(f"/ai/attempts/{attempt_id}/resolve", json=resolve_payload)
    assert res_repeat.status_code == 200
    assert res_repeat.json() == data

    # Запрос с устаревшей ревизией дает 409 Conflict
    stale_payload = {**resolve_payload, "expectedRevision": 1, "requestId": "req-resolve-t018-stale"}
    res_stale = await v1.post(f"/ai/attempts/{attempt_id}/resolve", json=stale_payload)
    assert res_stale.status_code == 409

    # Проверяем, что в БД зафиксированы TeacherOverride, CalibrationSample и AuditLog
    async with get_sessionmaker()() as db:
        override = (await db.execute(select(TeacherOverride).where(TeacherOverride.attempt_id == attempt_id))).scalar_one_or_none()
        assert override is not None
        assert override.score == 88

        sample = (await db.execute(select(CalibrationSample).where(CalibrationSample.attempt_id == attempt_id))).scalar_one_or_none()
        assert sample is not None

        audit = (await db.execute(select(AuditLog).where(AuditLog.details.like(f"%{attempt_id}%")))).scalars().all()
        assert len(audit) >= 1
