"""Спека 005: «Справочник доступен» в задании и серверный замок справочника во время попытки.

Изолированная in-memory база, как в `test_error_map_group.py`; задания и попытки создаются напрямую.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.kb import KbArticle
from app.models.session import Attempt
from app.models.user import User
from app.schemas.v1.assignments import AssignmentCreateRequest
from app.services.security import build_auth_session, hash_password
from app.services.time import MOSCOW, to_moscow_iso

LOCKED = "Справочник недоступен в этом задании"
OWNERS = {"exam": "s-exam", "training": "s-train", "allowed_exam": "s-open", "timed": "s-timed", "done": "s-done",
          "free": "s-free", "teacher": "t-ref"}


def _user(uid: str, role: str) -> User:
    return User(id=uid, login=uid, password_hash=hash_password("ref-112"), full_name=uid, role=role, arm_number=500,
                is_active=True, group="РЕФ")


def _assignment(aid: str, student: str, fmt: str, params: dict[str, Any]) -> Assignment:
    return Assignment(id=aid, teacher_id="t-ref", student_ids=[student], training_mode="dds", format=fmt, card_ids=["c-001"],
                      params=params, state="active", created_at="2026-10-19T10:00:00+03:00", title=aid)


def _link(aid: str, student: str, attempt_id: str, state: str) -> AssignmentAttempt:
    return AssignmentAttempt(assignment_id=aid, student_id=student, card_id="c-001", attempt_id=attempt_id, state=state)


def _rows(now: datetime) -> list[Any]:
    long_ago = to_moscow_iso(now - timedelta(hours=2))
    rows: list[Any] = [_user(uid, "teacher" if key == "teacher" else "student") for key, uid in OWNERS.items()]
    rows.append(KbArticle(id="kb-1", group="Пожар", title="Пожар на балконе", sections={
        "signs": ["дым"], "notification": ["101"], "clarify": [], "ddsDecision": [], "typicalErrors": []}))
    # Экзамен без ключа (старое задание) → по умолчанию закрыт; попытка открыта.
    rows += [_assignment("asg-ex", "s-exam", "exam", {}), _link("asg-ex", "s-exam", "att-ex", "answered")]
    # Тренировка без ключа → открыт.
    rows += [_assignment("asg-tr", "s-train", "training", {}), _link("asg-tr", "s-train", "att-tr", "answered")]
    # Экзамен, где преподаватель разрешил справочник.
    rows += [_assignment("asg-op", "s-open", "exam", {"referenceAllowed": True}), _link("asg-op", "s-open", "att-op", "ringing")]
    # Экзамен с лимитом 60 с, попытка открыта 2 часа назад — время вышло, замок снимается.
    rows += [_assignment("asg-tm", "s-timed", "exam", {"referenceAllowed": False, "timeLimitSec": 60}),
             _link("asg-tm", "s-timed", "att-tm", "answered"),
             Attempt(id="att-tm", session_id="ses-ref", card_id="c-001", student_id="s-timed", mode="dds", opened_at=long_ago)]
    # Экзамен с запретом, но билет уже отправлен.
    rows += [_assignment("asg-dn", "s-done", "exam", {"referenceAllowed": False}), _link("asg-dn", "s-done", "att-dn", "submitted")]
    return rows


@pytest_asyncio.fixture
async def tokens(app) -> AsyncIterator[dict[str, str]]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool,
                                 connect_args={"check_same_thread": False})
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    issued: dict[str, str] = {}
    async with maker() as db:
        db.add_all(_rows(datetime.now(MOSCOW)))
        await db.flush()
        for key, uid in OWNERS.items():
            user = await db.get(User, uid)
            assert user is not None
            issued[key] = str((await build_auth_session(db, user))["token"])
        await db.commit()

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    try:
        yield issued
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


async def _get(app, path: str, token: str):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.get(path, headers={"Authorization": f"Bearer {token}"})


async def test_exam_attempt_locks_reference_on_server(app, tokens):
    access = (await _get(app, "/me/reference-access", tokens["exam"])).json()
    assert access == {"allowed": False, "assignmentId": "asg-ex", "message": LOCKED}
    for path in ("/kb/articles", "/kb/articles/kb-1"):
        response = await _get(app, path, tokens["exam"])
        assert response.status_code == 403
        assert response.json()["error"] == {"code": "forbidden", "message": LOCKED}


@pytest.mark.parametrize("who", ["training", "allowed_exam", "timed", "done", "free", "teacher"])
async def test_reference_open_without_lock(app, tokens, who):
    assert (await _get(app, "/me/reference-access", tokens[who])).json() == {"allowed": True}
    response = await _get(app, "/kb/articles", tokens[who])
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == ["kb-1"]


def _request(fmt: str, params: dict[str, Any]) -> AssignmentCreateRequest:
    return AssignmentCreateRequest.model_validate(
        {"studentIds": ["s-1"], "trainingMode": "dds", "format": fmt, "cardIds": ["c-001"], "params": params})


@pytest.mark.parametrize(("fmt", "params", "expected"), [
    ("training", {}, True),
    ("exam", {}, False),
    ("training", {"referenceAllowed": False}, False),
    ("exam", {"referenceAllowed": True}, True),
])
def test_reference_allowed_default_and_explicit(fmt, params, expected):
    assert _request(fmt, params).params["referenceAllowed"] is expected


def test_reference_allowed_must_be_boolean():
    with pytest.raises(ValidationError, match="Справочник доступен"):
        _request("training", {"referenceAllowed": "да"})
