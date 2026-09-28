"""Поведение новых SQLAlchemy-моделей общего AI-контура."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # импорт регистрирует таблицы в Base.metadata
from app.db.base import Base
from app.models.ai_assessment import (
    AssessmentJob,
    ErrorRecord,
    EvaluationRevision,
    install_ai_assessment_guards,
)
from app.models.ai_scenario import EtalonVersion, SanitizedTicket, ScenarioVersion, install_ai_scenario_guards


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


def _scenario_version(*, approval: str, approved_by: str | None = None) -> ScenarioVersion:
    return ScenarioVersion(
        scenario_id="scenario-ai-1",
        version=1,
        mode="dds",
        source_ticket_id="ticket-1",
        created_by="teacher-1",
        source_situation_no=1,
        source_kind="ticket",
        source_hash="a" * 64,
        validation="passed",
        approval=approval,
        card_snapshot={"id": "card-1", "fields": {"description": "Синтетическое описание"}},
        etalon_version="etalon-1",
        rule_source_ids=["rule-1"],
        approved_by=approved_by,
    )


def _error_record(record_id: str) -> ErrorRecord:
    return ErrorRecord(
        id=record_id,
        attempt_id="attempt-1",
        mode="dds",
        rule_id="address-match",
        type="wrongAddress",
        severity="major",
        evidence_key="address:card-1",
        observed="Лесная улица, 2",
        expected="Лесная улица, 12",
        source_ref="etalon:address",
        detector="rule",
        etalon_version="etalon-1",
        created_at="2026-09-23T12:00:00Z",
    )


def test_новые_таблицы_зарегистрированы_в_metadata() -> None:
    expected = {
        "ai_scenario_versions",
        "ai_scenario_requests",
        "ai_etalon_versions",
        "ai_draft_field_decisions",
        "ai_sanitized_tickets",
        "ai_assessment_jobs",
        "ai_evaluation_revisions",
        "ai_semantic_reviews",
        "ai_error_records",
    }

    assert expected.issubset(Base.metadata.tables)


@pytest.mark.asyncio
async def test_разрешает_повтор_терминальной_задачи_но_не_две_активные(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            AssessmentJob(attempt_id="attempt-1", base_revision=1, state="completed", queued_at="t1"),
            AssessmentJob(attempt_id="attempt-1", base_revision=1, state="queued", queued_at="t2"),
        ]
    )
    await db_session.flush()
    db_session.add(AssessmentJob(attempt_id="attempt-1", base_revision=1, state="running", queued_at="t3"))

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_не_дублирует_ошибку_для_одного_доказательства(db_session: AsyncSession) -> None:
    db_session.add(_error_record("error-1"))
    await db_session.flush()
    db_session.add(_error_record("error-2"))

    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_неизвестный_totalScore_нельзя_сохранить(db_session: AsyncSession) -> None:
    row = EvaluationRevision(
        attempt_id="attempt-1",
        revision=1,
        mode="dds",
        status="pending",
        available_axes=["timeScore"],
        axes={"timeScore": 80, "correctnessScore": None, "grammarScore": None, "semanticScore": None},
        total_score=80,
        errors=[],
        etalon_version="etalon-1",
        assessor_version="assessor-1",
        model_release_id=None,
        created_at="2026-09-23T12:00:00Z",
    )
    db_session.add(row)

    with pytest.raises(ValueError, match="pending/review_required"):
        await db_session.flush()


@pytest.mark.asyncio
async def test_сценарий_можно_утвердить_один_раз_после_чего_он_неизменяем(db_session: AsyncSession) -> None:
    row = _scenario_version(approval="pending_review")
    db_session.add(row)
    await db_session.flush()

    row.card_snapshot = {"id": "card-1", "fields": {"description": "Исправленный текст"}}
    row.approval = "approved"
    row.approved_by = "teacher-1"
    await db_session.flush()
    assert row.available_for_training is True
    stored_snapshot = (
        await db_session.execute(
            select(ScenarioVersion.card_snapshot).where(ScenarioVersion.scenario_id == row.scenario_id)
        )
    ).scalar_one()
    assert stored_snapshot["fields"]["description"] == "Исправленный текст"

    with pytest.raises(TypeError, match="неизменяем"):
        row.card_snapshot["fields"]["description"] = "Подмена"

    row.teacher_comment = "Попытка изменить утверждённый снимок"
    with pytest.raises(ValueError, match="неизменяема"):
        await db_session.flush()


@pytest.mark.asyncio
async def test_db_trigger_запрещает_core_update_утверждённого_сценария(db_session: AsyncSession) -> None:
    row = _scenario_version(approval="approved", approved_by="teacher-1")
    db_session.add(row)
    await db_session.flush()

    with pytest.raises(IntegrityError):
        await db_session.execute(
            update(ScenarioVersion)
            .where(ScenarioVersion.scenario_id == row.scenario_id)
            .values(teacher_comment="bulk update")
        )


@pytest.mark.asyncio
async def test_db_trigger_запрещает_удаление_утверждённого_сценария(db_session: AsyncSession) -> None:
    row = _scenario_version(approval="approved", approved_by="teacher-1")
    db_session.add(row)
    await db_session.flush()

    with pytest.raises(IntegrityError):
        await db_session.execute(delete(ScenarioVersion).where(ScenarioVersion.scenario_id == row.scenario_id))


async def _approved_etalon(db_session: AsyncSession) -> EtalonVersion:
    etalon = EtalonVersion(
        id="etalon-guard-1",
        scenario_id="scenario-ai-1",
        mode="dds",
        expected_fields={"group": "Дерево"},
        expected_actions=[{"action": "status:accepted", "sourceRef": ["rule-1"]}],
        semantic_facts=[],
        rule_source_ids=["rule-1"],
        classifier_version="classifier-1",
        created_at="2026-09-24T10:00:00Z",
    )
    version = _scenario_version(approval="approved", approved_by="teacher-1")
    version.etalon_version = etalon.id
    db_session.add(etalon)
    await db_session.flush()
    db_session.add(version)
    await db_session.flush()
    return etalon


@pytest.mark.asyncio
async def test_db_trigger_запрещает_изменение_эталона_утверждённой_версии(db_session: AsyncSession) -> None:
    etalon = await _approved_etalon(db_session)

    with pytest.raises(IntegrityError):
        await db_session.execute(
            update(EtalonVersion).where(EtalonVersion.id == etalon.id).values(classifier_version="stale")
        )


@pytest.mark.asyncio
async def test_db_trigger_запрещает_удаление_эталона_утверждённой_версии(db_session: AsyncSession) -> None:
    etalon = await _approved_etalon(db_session)

    with pytest.raises(IntegrityError):
        await db_session.execute(delete(EtalonVersion).where(EtalonVersion.id == etalon.id))


@pytest.mark.asyncio
async def test_ревизия_оценки_неизменяема_после_создания(db_session: AsyncSession) -> None:
    row = EvaluationRevision(
        attempt_id="attempt-1",
        revision=1,
        mode="dds",
        status="preliminary",
        available_axes=["timeScore"],
        axes={"timeScore": 80, "correctnessScore": None, "grammarScore": None, "semanticScore": None},
        total_score=80,
        errors=[],
        etalon_version="etalon-1",
        assessor_version="assessor-1",
        model_release_id=None,
        created_at="2026-09-23T12:00:00Z",
    )
    db_session.add(row)
    await db_session.flush()
    row.total_score = 70

    with pytest.raises(ValueError, match="Ревизия оценки неизменяема"):
        await db_session.flush()


@pytest.mark.asyncio
async def test_db_trigger_запрещает_core_update_ревизии_оценки(db_session: AsyncSession) -> None:
    row = EvaluationRevision(
        attempt_id="attempt-1",
        revision=1,
        mode="dds",
        status="preliminary",
        available_axes=["timeScore"],
        axes={"timeScore": 80, "correctnessScore": None, "grammarScore": None, "semanticScore": None},
        total_score=80,
        errors=[],
        etalon_version="etalon-1",
        assessor_version="assessor-1",
        model_release_id=None,
        created_at="2026-09-23T12:00:00Z",
    )
    db_session.add(row)
    await db_session.flush()

    with pytest.raises(IntegrityError):
        await db_session.execute(
            update(EvaluationRevision)
            .where(EvaluationRevision.attempt_id == row.attempt_id)
            .values(total_score=70)
        )


@pytest.mark.asyncio
async def test_db_trigger_отклоняет_core_insert_с_неопределённой_осью(db_session: AsyncSession) -> None:
    statement = insert(EvaluationRevision).values(
        attempt_id="attempt-core",
        revision=1,
        mode="dds",
        status="preliminary",
        available_axes=["timeScore"],
        axes={"timeScore": None, "correctnessScore": None, "grammarScore": None, "semanticScore": None},
        total_score=80,
        errors=[],
        etalon_version="etalon-1",
        assessor_version="assessor-1",
        model_release_id=None,
        teacher_override=None,
        created_at="2026-09-23T12:00:00Z",
    )

    with pytest.raises(IntegrityError):
        await db_session.execute(statement)


@pytest.mark.asyncio
async def test_db_trigger_отклоняет_core_insert_с_лишней_осью(db_session: AsyncSession) -> None:
    statement = insert(EvaluationRevision).values(
        attempt_id="attempt-core-extra",
        revision=1,
        mode="dds",
        status="preliminary",
        available_axes=["timeScore"],
        axes={
            "timeScore": 80,
            "correctnessScore": None,
            "grammarScore": None,
            "semanticScore": None,
            "extraScore": 10,
        },
        total_score=80,
        errors=[],
        etalon_version="etalon-1",
        assessor_version="assessor-1",
        model_release_id=None,
        teacher_override=None,
        created_at="2026-09-23T12:00:00Z",
    )

    with pytest.raises(IntegrityError):
        await db_session.execute(statement)


@pytest.mark.asyncio
async def test_db_trigger_запрещает_удаление_ревизии_оценки(db_session: AsyncSession) -> None:
    row = EvaluationRevision(
        attempt_id="attempt-1",
        revision=1,
        mode="dds",
        status="preliminary",
        available_axes=["timeScore"],
        axes={"timeScore": 80, "correctnessScore": None, "grammarScore": None, "semanticScore": None},
        total_score=80,
        errors=[],
        etalon_version="etalon-1",
        assessor_version="assessor-1",
        model_release_id=None,
        created_at="2026-09-23T12:00:00Z",
    )
    db_session.add(row)
    await db_session.flush()

    with pytest.raises(IntegrityError):
        await db_session.execute(
            delete(EvaluationRevision).where(EvaluationRevision.attempt_id == row.attempt_id)
        )


@pytest.mark.asyncio
async def test_installer_добавляет_триггеры_в_уже_существующую_sqlite_базу(db_session: AsyncSession) -> None:
    await db_session.flush()
    connection = await db_session.connection()
    await connection.exec_driver_sql("DROP TRIGGER trg_ai_scenario_no_update_approved")
    await connection.exec_driver_sql("DROP TRIGGER trg_ai_evaluation_revision_no_update")

    await connection.run_sync(install_ai_scenario_guards)
    await connection.run_sync(install_ai_assessment_guards)

    row = _scenario_version(approval="approved", approved_by="teacher-1")
    db_session.add(row)
    await db_session.flush()
    with pytest.raises(IntegrityError):
        await db_session.execute(
            update(ScenarioVersion)
            .where(ScenarioVersion.scenario_id == row.scenario_id)
            .values(teacher_comment="stale write")
        )


@pytest.mark.asyncio
async def test_реестр_не_принимает_непроверенный_или_неодобренный_источник(db_session: AsyncSession) -> None:
    db_session.add(
        SanitizedTicket(
            source_ticket_id="ticket-1",
            situation_no=1,
            sanitized_text="Только синтетические сведения",
            pii_check="failed",
            reviewer_id="reviewer-1",
            reviewed_at="2026-09-23T12:00:00Z",
            source_hash="b" * 64,
            approved=False,
        )
    )

    with pytest.raises(IntegrityError):
        await db_session.flush()
