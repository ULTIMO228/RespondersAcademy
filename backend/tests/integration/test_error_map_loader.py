"""Загрузчик карты ошибок (T014): фильтры группы/режима/периода/оценки и число SQL-запросов."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.models.session import Attempt, Evaluation
from app.models.user import User
from app.services.error_map_service import load_attempts
from app.services.time import MOSCOW, to_moscow_iso

NOW = datetime(2026, 10, 19, 12, 0, 0, tzinfo=MOSCOW)


def iso(days_ago: float) -> str:
    return to_moscow_iso(NOW - timedelta(days=days_ago))


def user(uid: str, group: str | None, role: str = "student") -> User:
    return User(id=uid, login=uid, password_hash="x", full_name=uid, role=role, arm_number=1, group=group)


def attempt(aid: str, student: str, mode: str = "dds") -> Attempt:
    return Attempt(id=aid, session_id="s-1", card_id="c-1", student_id=student, mode=mode, opened_at=iso(0))


def evaluation(aid: str, days_ago: float, errors: list[dict] | None = None) -> Evaluation:
    return Evaluation(
        attempt_id=aid,
        time_score=0,
        correctness_score=0,
        grammar_score=0,
        semantic_score=0,
        total_score=0,
        errors=errors or [],
        generated_at=iso(days_ago),
    )


@pytest_asyncio.fixture
async def factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False), engine
    await engine.dispose()


async def populate(maker: async_sessionmaker[AsyncSession]) -> None:
    async with maker() as db:
        db.add_all(
            [
                user("u-1", "G1"),
                user("u-2", "G1"),
                user("u-3", "G2"),
                user("t-1", "G1", role="teacher"),  # не студент, хоть и с группой
            ]
        )
        db.add_all(
            [
                attempt("a-1", "u-1"),  # свежая
                attempt("a-2", "u-1"),  # 20 дней назад
                attempt("a-3", "u-2"),  # 60 дней назад
                attempt("a-4", "u-2", mode="operator112"),  # другой режим
                attempt("a-5", "u-3"),  # чужая группа
                attempt("a-6", "u-1"),  # не оценена
                attempt("a-7", "t-1"),  # преподаватель
            ]
        )
        db.add_all(
            [
                evaluation("a-1", 1, [{"ruleId": "a1"}]),
                evaluation("a-2", 20),
                evaluation("a-3", 60, [{"ruleId": "v2"}, {"type": "timeLimit"}]),
                evaluation("a-4", 1),
                evaluation("a-5", 1),
                evaluation("a-7", 1),
            ]
        )
        await db.commit()


async def ids(maker, period: str, mode: str = "dds", group: str = "G1") -> list[str]:
    async with maker() as db:
        return sorted(a.attempt_id for a in await load_attempts(db, group, mode, period, now=NOW))


async def test_all_period_includes_only_scored_group_students_of_mode(factory):
    maker, _ = factory
    await populate(maker)
    assert await ids(maker, "all") == ["a-1", "a-2", "a-3"]
    assert await ids(maker, "all", mode="operator112") == ["a-4"]
    assert await ids(maker, "all", group="G2") == ["a-5"]
    assert await ids(maker, "all", group="нет-такой") == []


async def test_period_two_weeks_and_month(factory):
    maker, _ = factory
    await populate(maker)
    assert await ids(maker, "2w") == ["a-1"]
    assert await ids(maker, "1m") == ["a-1", "a-2"]


async def test_loaded_fields_and_errors(factory):
    maker, _ = factory
    await populate(maker)
    async with maker() as db:
        loaded = {a.attempt_id: a for a in await load_attempts(db, "G1", "dds", "all", now=NOW)}
    assert loaded["a-1"].student_id == "u-1" and loaded["a-1"].mode == "dds"
    assert loaded["a-1"].at == iso(1)
    assert list(loaded["a-1"].errors) == [{"ruleId": "a1"}]
    assert list(loaded["a-3"].errors) == [{"ruleId": "v2"}, {"type": "timeLimit"}]
    assert list(loaded["a-2"].errors) == []


async def test_unknown_period_is_rejected(factory):
    maker, _ = factory
    async with maker() as db:
        with pytest.raises(ValueError):
            await load_attempts(db, "G1", "dds", "5y", now=NOW)


async def test_query_count_does_not_grow_with_students(factory):
    maker, engine = factory
    counter = {"n": 0}

    def count(*_args):
        counter["n"] += 1

    event.listen(engine.sync_engine, "before_cursor_execute", count)

    async def measure(group: str) -> int:
        counter["n"] = 0
        async with maker() as db:
            await load_attempts(db, group, "dds", "1m", now=NOW)
        return counter["n"]

    async with maker() as db:
        db.add(user("s-0", "SMALL"))
        db.add(attempt("sa-0", "s-0"))
        db.add(evaluation("sa-0", 1))
        for i in range(30):
            db.add(user(f"b-{i}", "BIG"))
            db.add(attempt(f"ba-{i}", f"b-{i}"))
            db.add(evaluation(f"ba-{i}", 1, [{"ruleId": "a1"}]))
        await db.commit()

    small, big = await measure("SMALL"), await measure("BIG")
    assert small == big == 1
