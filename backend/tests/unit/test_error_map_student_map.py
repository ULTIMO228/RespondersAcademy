"""Карта и разбор обучающегося (T040): пороги, сравнение с группой, изоляция данных на синтетических попытках."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.api.deps import Viewer
from app.api.errors import ApiError
from app.db.base import Base
from app.models.session import Attempt, Evaluation
from app.models.user import User
from app.services.error_map_service import student_map, student_stage_detail
from app.services.time import MOSCOW, to_moscow_iso

ADMIN = Viewer(user_id="adm", role="admin")
GROUP = "G1"
TARGET = "u-target"
STAGE = "statuses"
ERROR = [{"ruleId": "v1"}]


@pytest_asyncio.fixture
async def maker():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def add_student(maker: async_sessionmaker[AsyncSession], student: str, name: str, group: str | None = GROUP) -> None:
    async with maker() as db:
        db.add(
            User(
                id=student, login=student, password_hash="x", full_name=name,
                role="student", arm_number=1, group=group,
            )
        )
        await db.commit()


async def add_attempts(
    maker: async_sessionmaker[AsyncSession], student: str, total: int, with_error: int, *, mode: str = "dds"
) -> None:
    """`total` оценённых попыток, у первых `with_error` — ошибка правила v1 (этап «Статусы»)."""
    async with maker() as db:
        for number in range(total):
            attempt_id = f"a-{student}-{mode}-{number}"
            when = to_moscow_iso(datetime.now(MOSCOW) - timedelta(days=1, minutes=number))
            db.add(
                Attempt(
                    id=attempt_id, session_id=f"s-{attempt_id}", card_id="c-1", student_id=student, mode=mode, opened_at=when
                )
            )
            db.add(
                Evaluation(
                    attempt_id=attempt_id, time_score=0, correctness_score=0, grammar_score=0, semantic_score=0,
                    total_score=0, generated_at=when, errors=ERROR if number < with_error else [],
                )
            )
        await db.commit()


async def scenario(maker, own: tuple[int, int], others: tuple[int, int]) -> None:
    """Целевой обучающийся (`own` = попыток, с ошибкой) и один сокурсник; доля группы включает обоих."""
    await add_student(maker, TARGET, "Целевой Иван")
    await add_student(maker, "u-other", "Чужой Пётр")
    await add_attempts(maker, TARGET, *own)
    await add_attempts(maker, "u-other", *others)


async def level(maker, stage: str = STAGE):
    async with maker() as db:
        result = await student_map(db, ADMIN, TARGET, "dds", "all")
    return result, next(item for item in result.levels if item.stage_id == stage)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("own", "others", "expected"),
    [
        ((10, 4), (10, 2), "same"),  # 40% против 30%: ровно +10 п.п.
        ((10, 2), (10, 4), "same"),  # 20% против 30%: ровно −10 п.п.
        ((10, 4), (10, 1), "worse"),  # 40% против 25%: +15
        ((10, 2), (10, 5), "better"),  # 20% против 35%: −15
    ],
)
async def test_comparison_band_boundaries(maker, own, others, expected):
    await scenario(maker, own, others)
    _, item = await level(maker)
    assert item.comparison == expected


@pytest.mark.asyncio
async def test_student_below_threshold_is_no_data_without_comparison(maker):
    await scenario(maker, (2, 2), (10, 5))
    result, item = await level(maker)
    assert item.level == "noData"
    assert item.share is None
    assert item.comparison is None
    assert result.headline.kind == "noData"
    assert "3" in result.headline.text
    assert all("comparison" not in row for row in result.dump()["levels"])


@pytest.mark.asyncio
async def test_group_without_data_gives_no_comparison(maker):
    await add_student(maker, TARGET, "Целевой Иван")
    await add_attempts(maker, TARGET, 3, 3)  # у группы всего 3 попытки < 5
    result, item = await level(maker)
    assert item.level == "often"
    assert item.comparison is None
    assert "comparison" not in next(row for row in result.dump()["levels"] if row["stageId"] == STAGE)


@pytest.mark.asyncio
async def test_scope_headline_and_isolation(maker):
    await scenario(maker, (10, 4), (10, 2))
    await add_student(maker, "u-g2", "Посторонний Олег", group="G2")
    await add_attempts(maker, "u-g2", 10, 10)
    result, item = await level(maker)
    assert result.scope.kind == "student"
    assert result.scope.student_id == TARGET
    assert result.scope.group_id == GROUP
    assert result.scope.title == "Целевой Иван"
    assert result.attempts == 10  # только свои попытки
    assert item.attempts == 10
    assert item.affected_students == 1
    assert result.headline.kind == "problems"
    assert result.headline.text.startswith("Главная проблема обучающегося: ")
    dumped = json.dumps(result.dump(), ensure_ascii=False)
    for foreign in ("Чужой Пётр", "Посторонний Олег", "u-other", "u-g2"):
        assert foreign not in dumped


@pytest.mark.asyncio
async def test_other_mode_attempts_are_ignored(maker):
    await scenario(maker, (10, 4), (10, 2))
    await add_attempts(maker, TARGET, 5, 5, mode="operator112")
    result, _ = await level(maker)
    assert result.attempts == 10


@pytest.mark.asyncio
async def test_stage_detail_is_about_one_person_with_comparison(maker):
    await scenario(maker, (10, 4), (10, 1))
    await add_student(maker, "u-third", "Третий Сидор")
    await add_attempts(maker, "u-third", 5, 1)
    async with maker() as db:
        detail = await student_stage_detail(db, ADMIN, TARGET, STAGE, "dds", "all")
    assert detail.explanation is not None and detail.explanation.source == "template"
    assert detail.level.comparison == "worse"
    (item,) = detail.typical_errors
    assert item.rule_id == "v1"
    assert item.student_count == 1
    assert [(s.id, s.name) for s in item.students] == [(TARGET, "Целевой Иван")]
    assert item.example_attempt_id is not None
    assert item.example_attempt_id.startswith(f"a-{TARGET}-")
    assert "Третий Сидор" not in json.dumps(detail.dump(), ensure_ascii=False)


@pytest.mark.asyncio
async def test_unknown_stage_and_student_are_404(maker):
    await scenario(maker, (10, 4), (10, 2))
    async with maker() as db:
        with pytest.raises(ApiError) as stage_error:
            await student_stage_detail(db, ADMIN, TARGET, "nope", "dds", "all")
        with pytest.raises(ApiError) as student_error:
            await student_map(db, ADMIN, "u-missing", "dds", "all")
    assert stage_error.value.status == 404
    assert student_error.value.status == 404
