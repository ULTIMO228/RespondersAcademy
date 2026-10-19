"""Карта группы (T022): вывод (headline), список этапов и уровней на синтетических попытках."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.api.deps import Viewer
from app.db.base import Base
from app.models.session import Attempt, Evaluation
from app.models.user import User
from app.services.error_map_service import group_map
from app.services.time import MOSCOW, to_moscow_iso

ADMIN = Viewer(user_id="adm", role="admin")
GROUP = "G1"


def _iso(days_ago: float = 1) -> str:
    return to_moscow_iso(datetime.now(MOSCOW) - timedelta(days=days_ago))


@pytest_asyncio.fixture
async def maker():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def populate(maker: async_sessionmaker[AsyncSession], attempts: list[list[str]], mode: str = "dds") -> None:
    """По одной попытке на обучающегося; `attempts[i]` — ruleId ошибок i-й попытки (пустой ruleId → без ruleId)."""
    async with maker() as db:
        for index, rules in enumerate(attempts):
            student = f"u-{index}"
            db.add(
                User(
                    id=student, login=student, password_hash="x", full_name=student,
                    role="student", arm_number=1, group=GROUP,
                )
            )
            db.add(
                Attempt(
                    id=f"a-{index}", session_id="s-1", card_id="c-1", student_id=student, mode=mode, opened_at=_iso()
                )
            )
            db.add(
                Evaluation(
                    attempt_id=f"a-{index}", time_score=0, correctness_score=0, grammar_score=0, semantic_score=0,
                    total_score=0, generated_at=_iso(),
                    errors=[{"ruleId": rule} if rule else {"type": "timeLimit"} for rule in rules],
                )
            )
        await db.commit()


async def build(maker: async_sessionmaker[AsyncSession], mode: str = "dds"):
    async with maker() as db:
        return await group_map(db, ADMIN, GROUP, mode, "all")  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_two_problem_stages_are_named(maker):
    # 10 попыток: «Тип происшествия» — 5 из 10, «Статусы реагирования» — 4 из 10, «Адрес» — 3 из 10 (граница «иногда»)
    attempts = [["v2"]] * 5 + [["v1"]] * 4 + [["a1"]]
    attempts[0] = ["v2", "a1"]
    attempts[1] = ["v2", "a1"]
    await populate(maker, attempts)
    response = await build(maker)
    assert response.attempts == 10
    assert response.headline.kind == "problems"
    assert response.headline.stage_ids == ["decision", "statuses"]
    assert response.headline.text == "Главные проблемы группы: Тип происшествия и Статусы реагирования"
    levels = {item.stage_id: item for item in response.levels}
    assert levels["address"].level == "sometimes"
    assert levels["address"].affected_students == 3
    assert levels["decision"].comparison is None


@pytest.mark.asyncio
async def test_single_problem_uses_singular(maker):
    await populate(maker, [["a1"]] * 4 + [[]] * 6)
    response = await build(maker)
    assert response.headline.text == "Главная проблема группы: Адрес"


@pytest.mark.asyncio
async def test_no_problems_is_clean(maker):
    await populate(maker, [["a1"]] * 2 + [[]] * 8)
    response = await build(maker)
    assert response.headline.kind == "clean"
    assert response.headline.stage_ids == []
    assert response.headline.text == "Критичных проблем нет"


@pytest.mark.asyncio
async def test_more_than_three_problems_keeps_three(maker):
    # пять этапов с долей 100%: порядок схемы при равенстве — intake, address, decision
    await populate(maker, [["t1", "a1", "v2", "f1", "d1"]] * 6)
    response = await build(maker)
    assert response.headline.stage_ids == ["intake", "address", "decision"]
    assert response.headline.text.count(",") == 1


@pytest.mark.asyncio
async def test_too_few_attempts_is_no_data(maker):
    await populate(maker, [["a1"]] * 4)
    response = await build(maker)
    assert response.headline.kind == "noData"
    assert response.headline.text == "Данных пока мало: нужно не менее 5 оценённых попыток"
    assert {item.level for item in response.levels} == {"noData"}
    assert all(item.share is None for item in response.levels)
    assert response.attempts == 4


@pytest.mark.asyncio
async def test_other_hidden_without_errors_shown_with_errors(maker):
    await populate(maker, [["a1"]] * 6)
    response = await build(maker)
    assert "other" not in [stage.id for stage in response.stages]
    assert "other" not in [item.stage_id for item in response.levels]


@pytest.mark.asyncio
async def test_other_shown_but_not_in_headline(maker):
    await populate(maker, [[""]] * 6)  # ошибка без ruleId (лимит времени) → «Прочее»
    response = await build(maker)
    assert response.stages[-1].id == "other"
    other = next(item for item in response.levels if item.stage_id == "other")
    assert other.level == "often"
    assert response.headline.kind == "clean"
    assert "other" not in response.headline.stage_ids


@pytest.mark.asyncio
async def test_other_mode_attempts_are_ignored(maker):
    await populate(maker, [["a1"]] * 6, mode="operator112")
    response = await build(maker)
    assert response.attempts == 0
    assert response.headline.kind == "noData"
