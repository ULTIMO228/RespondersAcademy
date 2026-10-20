"""Спека 017: рейтинг обучающихся и полная статистика ученика — HTTP-тесты на изолированной базе.

Схема фикстуры — как в `test_error_map_group.py`: собственная in-memory SQLite через `dependency_overrides[get_db]`,
настоящие сессии. Ожидаемые числа посчитаны вручную. Нормативы: реакция 30 000 мс, отработка 180 000 мс.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # регистрация таблиц в Base.metadata
from app.db.base import Base
from app.db.session import get_db
from app.models.session import Attempt, Evaluation, TeacherOverride
from app.models.user import User
from app.services.security import build_auth_session, hash_password
from app.services.time import MOSCOW, to_moscow_iso

PASSWORD_HASH = hash_password("rating-112")
GROUP = "РЕЙТ-1"
GROUP_B = "РЕЙТ-2"
OTHER = "РЕЙТ-ЧУЖ"
TOKEN_OWNERS = {"teacher": "u-r-t1", "foreign": "u-r-t2", "nogroups": "u-r-t3", "admin": "u-r-adm", "student": "s-r-1"}

# (попытка, ученик, режим, дней назад, балл, реакция мс, отработка мс)
ATTEMPTS: tuple[tuple[str, str, str, int, int, int, int], ...] = (
    ("r-01", "s-r-1", "dds", 1, 90, 20_000, 120_000),
    ("r-02", "s-r-1", "dds", 2, 80, 40_000, 120_000),   # реакция вне норматива
    ("r-03", "s-r-1", "operator112", 3, 70, 10_000, 200_000),  # отработка вне норматива
    ("r-04", "s-r-1", "dds", 60, 10, 25_000, 100_000),  # только в периоде «all»
    ("r-05", "s-r-2", "dds", 1, 50, 30_000, 180_000),   # ровно норматив — в нормативе
    ("r-06", "s-r-2", "dds", 2, 60, 0, 0),              # время не измерено
    ("r-07", "s-o-1", "dds", 1, 99, 1_000, 1_000),
)


def _user(uid: str, role: str, *, group: str | None = None, assigned: list[str] | None = None) -> User:
    return User(id=uid, login=uid, password_hash=PASSWORD_HASH, full_name=f"ФИО {uid}", role=role, arm_number=400,
                is_active=True, group=group, assigned_groups=assigned)


def _rows(now: datetime) -> list[Any]:
    rows: list[Any] = [
        _user("u-r-t1", "teacher", assigned=[GROUP, GROUP_B]),
        _user("u-r-t2", "teacher", assigned=[OTHER]),
        _user("u-r-t3", "teacher"),
        _user("u-r-adm", "admin"),
        _user("s-r-1", "student", group=GROUP),
        _user("s-r-2", "student", group=GROUP),
        _user("s-r-3", "student", group=GROUP),  # без попыток
        _user("s-b-1", "student", group=GROUP_B),
        _user("s-o-1", "student", group=OTHER),
    ]
    for attempt_id, student, mode, days, score, reaction, processing in ATTEMPTS:
        stamp = to_moscow_iso(now - timedelta(days=days))
        rows.append(Attempt(id=attempt_id, session_id="ses-r", card_id="c-001", student_id=student, mode=mode,
                            opened_at=stamp, primary_reaction_ms=reaction, full_processing_ms=processing))
        rows.append(Evaluation(attempt_id=attempt_id, time_score=0, correctness_score=0, grammar_score=0,
                               semantic_score=0, total_score=score, errors=[], generated_at=stamp))
    # Правка преподавателя: r-02 80 → 100 (итоговая оценка — за преподавателем).
    rows.append(TeacherOverride(attempt_id="r-02", teacher_id="u-r-t1", score=100, comment="пересмотр",
                                at=to_moscow_iso(now), previous_score=80))
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
        for key, uid in TOKEN_OWNERS.items():
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


async def _get(app, path: str, token: str | None, params: dict[str, str] | None = None) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.get(path, headers=headers, params=params)


def _row(body: dict[str, Any], student_id: str) -> dict[str, Any]:
    return next(row for row in body["rows"] if row["studentId"] == student_id)


async def test_rating_of_own_group_counts_by_hand(app, tokens):
    response = await _get(app, "/teacher/rating", tokens["teacher"], {"groupId": GROUP})
    assert response.status_code == 200
    body = response.json()
    assert [g["groupId"] for g in body["groups"]] == [GROUP, GROUP_B]
    assert body["norms"] == {"reactionMs": 30_000, "processingMs": 180_000}
    assert [row["studentId"] for row in body["rows"]] == ["s-r-1", "s-r-2", "s-r-3"]
    first = _row(body, "s-r-1")
    # 90, 100 (правка), 70, 10 → 67.5; реакция (20+40+10+25)/4 = 23 750; отработка (120+120+200+100)/4 = 135 000
    assert first["attempts"] == 4
    assert first["averageScore"] == 67.5
    assert first["averageReactionMs"] == 23_750
    assert first["averageProcessingMs"] == 135_000
    assert first["withinNormsShare"] == 0.5  # r-01 и r-04 в обоих нормативах
    assert first["enoughData"] is True
    assert isinstance(first["ratingDds"], int) and isinstance(first["ratingOperator112"], int)
    second = _row(body, "s-r-2")
    assert second["attempts"] == 2 and second["enoughData"] is False
    assert second["averageReactionMs"] == 30_000  # попытка без времени не входит в среднее
    assert second["withinNormsShare"] == 0.5
    empty = _row(body, "s-r-3")
    assert empty["attempts"] == 0
    assert empty["averageScore"] is None and empty["withinNormsShare"] is None


async def test_period_and_mode_filters(app, tokens):
    body = (await _get(app, "/teacher/rating", tokens["teacher"], {"groupId": GROUP, "period": "2w", "mode": "dds"})).json()
    first = _row(body, "s-r-1")
    assert first["attempts"] == 2 and first["averageScore"] == 95.0
    assert body["mode"] == "dds" and body["period"] == "2w"


async def test_default_group_is_first_accessible(app, tokens):
    body = (await _get(app, "/teacher/rating", tokens["teacher"])).json()
    assert body["groupId"] == GROUP


async def test_bad_filter_is_rejected(app, tokens):
    assert (await _get(app, "/teacher/rating", tokens["teacher"], {"mode": "x"})).status_code == 400


async def test_teacher_without_groups_gets_empty_list(app, tokens):
    body = (await _get(app, "/teacher/rating", tokens["nogroups"])).json()
    assert body["groups"] == [] and body["groupId"] is None and body["rows"] == []


@pytest.mark.parametrize(("who", "status"), [("foreign", 403), ("student", 403), ("admin", 200), (None, 401)])
async def test_rating_access(app, tokens, who, status):
    token = tokens[who] if who else None
    assert (await _get(app, "/teacher/rating", token, {"groupId": GROUP})).status_code == status


async def test_missing_group_is_404(app, tokens):
    assert (await _get(app, "/teacher/rating", tokens["teacher"], {"groupId": "НЕТ"})).status_code == 404


async def test_student_stats_full_profile(app, tokens):
    response = await _get(app, "/teacher/students/s-r-1/stats", tokens["teacher"])
    assert response.status_code == 200
    body = response.json()
    assert body["fullName"] == "ФИО s-r-1" and body["groupId"] == GROUP
    assert body["summary"]["averageScore"] == 67.5
    assert body["byMode"]["operator112"]["attempts"] == 1
    assert body["byMode"]["dds"]["attempts"] == 3
    assert [p["attemptId"] for p in body["dynamics"]] == ["r-04", "r-03", "r-02", "r-01"]
    assert [a["attemptId"] for a in body["attempts"]] == ["r-01", "r-02", "r-03", "r-04"]
    assert body["attempts"][1]["score"] == 100


@pytest.mark.parametrize(("who", "status"), [("foreign", 403), ("student", 403), ("admin", 200), (None, 401)])
async def test_stats_access(app, tokens, who, status):
    token = tokens[who] if who else None
    assert (await _get(app, "/teacher/students/s-r-1/stats", token)).status_code == status


@pytest.mark.parametrize(("who", "status"), [("teacher", 200), ("foreign", 403), ("student", 403), ("admin", 200), (None, 401)])
async def test_profile_requires_assigned_group(app, tokens, who, status):
    token = tokens[who] if who else None
    assert (await _get(app, "/teacher/students/s-r-1/profile", token)).status_code == status
