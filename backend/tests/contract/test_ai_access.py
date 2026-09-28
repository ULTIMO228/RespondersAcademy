"""Контрактные проверки серверной авторизации новых AI-ресурсов."""

from __future__ import annotations

import json
import secrets
from collections.abc import AsyncIterator, Awaitable, Callable
from urllib.parse import quote

import pytest
import pytest_asyncio
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # импорт регистрирует таблицы в Base.metadata
from app.api.deps import Viewer, viewer_from_request
from app.api.errors import ApiError
from app.api.v1.ai_access import require_attempt_access, require_scenario_access, require_session_access
from app.db.base import Base
from app.models.ai_scenario import ScenarioVersion
from app.models.assignment import Assignment, AssignmentScenarioVersion, AssignmentStudent
from app.models.scenario import Scenario
from app.models.session import Attempt, TrainingSession
from app.services.security import issue_token


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add_all(
            [
                Scenario(
                    id="scenario-ai-1",
                    title="Синтетический сценарий",
                    level="beginner",
                    difficulty=1,
                    source="template",
                    validation_status="approved",
                    card_ids=["card-ai-1"],
                    doc={},
                    updated_by=None,
                ),
                TrainingSession(
                    id="session-ai-1",
                    teacher_id="teacher-1",
                    student_ids=["student-1"],
                    scenario_ids=["scenario-ai-1"],
                    started_at="2026-09-23T12:00:00+00:00",
                ),
                TrainingSession(
                    id="session-ai-2",
                    teacher_id="teacher-2",
                    student_ids=["student-2"],
                    # Legacy mock sessions can contain caller-supplied identities and must not grant AI access.
                    scenario_ids=["scenario-ai-1"],
                    started_at="2026-09-23T12:00:00+00:00",
                ),
                Assignment(
                    id="assignment-ai-1",
                    teacher_id="teacher-1",
                    student_ids=["student-1"],
                    training_mode="dds",
                    format="training",
                    card_ids=["card-ai-1"],
                    params={},
                    state="active",
                    created_at="2026-09-23T12:00:00+00:00",
                ),
                Assignment(
                    id="assignment-ai-2",
                    teacher_id="teacher-1",
                    student_ids=["student-2"],
                    training_mode="operator112",
                    format="training",
                    card_ids=["card-ai-1"],
                    params={},
                    state="active",
                    created_at="2026-09-23T12:00:00+00:00",
                ),
                AssignmentStudent(assignment_id="assignment-ai-1", student_id="student-1"),
                AssignmentStudent(assignment_id="assignment-ai-2", student_id="student-2"),
                AssignmentScenarioVersion(
                    assignment_id="assignment-ai-1",
                    scenario_id="scenario-ai-1",
                    version=1,
                    card_id="card-ai-1",
                    mode="dds",
                ),
                Attempt(
                    id="attempt-dds-1",
                    session_id="session-ai-1",
                    card_id="card-ai-1",
                    student_id="student-1",
                    mode="dds",
                    opened_at="2026-09-23T12:00:00+00:00",
                ),
                Attempt(
                    id="attempt-op-1",
                    session_id="session-ai-1",
                    card_id="card-ai-1",
                    student_id="student-1",
                    mode="operator112",
                    opened_at="2026-09-23T12:00:00+00:00",
                ),
                ScenarioVersion(
                    scenario_id="scenario-ai-1",
                    version=1,
                    mode="dds",
                    source_ticket_id="ticket-ai-1",
                    created_by="teacher-1",
                    source_situation_no=1,
                    source_kind="ticket",
                    source_hash="a" * 64,
                    validation="passed",
                    approval="approved",
                    card_snapshot={"id": "card-ai-1", "fields": {}},
                    etalon_version="etalon-ai-1",
                    rule_source_ids=["rule-ai-1"],
                    approved_by="teacher-1",
                ),
                ScenarioVersion(
                    scenario_id="scenario-ai-1",
                    version=2,
                    mode="operator112",
                    source_ticket_id="ticket-ai-1",
                    created_by="teacher-1",
                    source_situation_no=1,
                    source_kind="ticket",
                    source_hash="b" * 64,
                    validation="pending",
                    approval="draft",
                    card_snapshot={"id": "card-ai-1", "fields": {}},
                    etalon_version="etalon-ai-2",
                    rule_source_ids=["rule-ai-1"],
                ),
            ]
        )
        await session.commit()
        yield session
    await engine.dispose()


def _viewer_request(user_id: str, role: str, *, cookie_role: str | None = None) -> Request:
    token = issue_token(user_id, role, secrets.token_urlsafe(32))
    raw_session = json.dumps(
        {"userId": user_id, "role": cookie_role or role, "token": token},
        ensure_ascii=False,
    )
    cookie = f"arm112_session={quote(raw_session, safe='')}".encode()
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/api/v1/ai/access-test",
        "raw_path": b"/api/v1/ai/access-test",
        "query_string": b"",
        "headers": [(b"cookie", cookie)],
        "server": ("test", 80),
        "client": ("test", 1),
    }
    return Request(scope)


def _signed_viewer(user_id: str, role: str, *, cookie_role: str | None = None) -> Viewer:
    viewer = viewer_from_request(_viewer_request(user_id, role, cookie_role=cookie_role))
    assert viewer is not None
    return viewer


@pytest.mark.parametrize("attempt_id", ["attempt-dds-1", "attempt-op-1"], ids=["dds", "operator112"])
@pytest.mark.asyncio
async def test_без_подписанной_сессии_возвращает_401(attempt_id: str, db_session: AsyncSession) -> None:
    with pytest.raises(ApiError) as error:
        await require_attempt_access(db_session, attempt_id, None)

    assert error.value.status == 401
    assert error.value.code == "unauthorized"


@pytest.mark.parametrize("attempt_id", ["attempt-dds-1", "attempt-op-1"], ids=["dds", "operator112"])
@pytest.mark.asyncio
async def test_попытка_доступна_владельцу_и_закрыта_от_другого_курсанта(
    attempt_id: str, db_session: AsyncSession
) -> None:
    owner = _signed_viewer("student-1", "student")
    outsider = _signed_viewer("student-2", "student")

    allowed = await require_attempt_access(db_session, attempt_id, owner)
    with pytest.raises(ApiError) as error:
        await require_attempt_access(db_session, attempt_id, outsider)

    assert allowed.id == attempt_id
    assert error.value.status == 403


@pytest.mark.asyncio
async def test_преподаватель_видит_только_свою_попытку_и_занятие(db_session: AsyncSession) -> None:
    owner = _signed_viewer("teacher-1", "teacher")
    outsider = _signed_viewer("teacher-2", "teacher")

    allowed = await require_attempt_access(db_session, "attempt-dds-1", owner)
    with pytest.raises(ApiError) as error:
        await require_attempt_access(db_session, "attempt-dds-1", outsider)

    assert allowed.session_id == "session-ai-1"
    assert error.value.status == 403


@pytest.mark.asyncio
async def test_legacy_участник_не_получает_доступ_к_занятию_по_умолчанию(db_session: AsyncSession) -> None:
    student = _signed_viewer("student-2", "student")

    with pytest.raises(ApiError) as error:
        await require_session_access(db_session, "session-ai-2", student)

    assert error.value.status == 403


@pytest.mark.parametrize(
    ("access", "resource_id"),
    [
        (require_attempt_access, "missing-attempt"),
        (require_session_access, "missing-session"),
        (require_scenario_access, "missing-scenario"),
    ],
    ids=["attempt", "session", "scenario"],
)
@pytest.mark.asyncio
async def test_отсутствующие_ресурсы_возвращают_404(
    access: Callable[[AsyncSession, str, Viewer | None], Awaitable[object]],
    resource_id: str,
    db_session: AsyncSession,
) -> None:
    teacher = _signed_viewer("teacher-1", "teacher")

    with pytest.raises(ApiError) as error:
        await access(db_session, resource_id, teacher)

    assert error.value.status == 404


@pytest.mark.asyncio
async def test_сценарий_доступен_автору_и_курсанту_своего_задания(db_session: AsyncSession) -> None:
    author = _signed_viewer("teacher-1", "teacher")
    other_teacher = _signed_viewer("teacher-2", "teacher")
    assigned_student = _signed_viewer("student-1", "student")
    other_student = _signed_viewer("student-2", "student")

    assert (await require_scenario_access(db_session, "scenario-ai-1", author)).id == "scenario-ai-1"
    assert (await require_scenario_access(db_session, "scenario-ai-1", assigned_student, version=1)).id == "scenario-ai-1"
    with pytest.raises(ApiError) as teacher_error:
        await require_scenario_access(db_session, "scenario-ai-1", other_teacher)
    with pytest.raises(ApiError) as student_error:
        await require_scenario_access(db_session, "scenario-ai-1", other_student, version=1)

    assert teacher_error.value.status == 403
    assert student_error.value.status == 403


@pytest.mark.asyncio
async def test_сценарий_другого_режима_не_разрешает_доступ_по_назначению(db_session: AsyncSession) -> None:
    operator_student = _signed_viewer("student-2", "student")

    with pytest.raises(ApiError) as error:
        await require_scenario_access(db_session, "scenario-ai-1", operator_student, version=2)

    assert error.value.status == 403


@pytest.mark.asyncio
async def test_роль_берётся_из_подписанного_токена_а_не_из_cookie_или_teacherId(db_session: AsyncSession) -> None:
    # Несогласованные cookie и подписанный токен отвергаются целиком.
    viewer = viewer_from_request(_viewer_request("student-2", "student", cookie_role="teacher"))

    assert viewer is None
    with pytest.raises(ApiError) as error:
        await require_attempt_access(db_session, "attempt-dds-1", viewer)

    assert error.value.status == 401
