"""Разбор этапа группы (T032): типовые ошибки, студенты, пример, цепочка на синтетических попытках."""

from __future__ import annotations

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
from app.services.error_map_service import stage_detail
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


async def populate(
    maker: async_sessionmaker[AsyncSession],
    attempts: list[list[dict]],
    *,
    group: str = GROUP,
    offset: int = 0,
    days_ago: dict[int, float] | None = None,
) -> None:
    """По одной попытке на обучающегося; `attempts[i]` — элементы `Evaluation.errors` i-й попытки."""
    async with maker() as db:
        for position, errors in enumerate(attempts):
            index = position + offset
            student = f"u-{index}"
            db.add(
                User(
                    id=student, login=student, password_hash="x", full_name=f"Имя {index}",
                    role="student", arm_number=1, group=group,
                )
            )
            when = _iso((days_ago or {}).get(index, 1))
            db.add(Attempt(id=f"a-{index}", session_id=f"s-{index}", card_id="c-1", student_id=student, mode="dds", opened_at=when))
            db.add(
                Evaluation(
                    attempt_id=f"a-{index}", time_score=0, correctness_score=0, grammar_score=0, semantic_score=0,
                    total_score=0, generated_at=when, errors=errors,
                )
            )
        await db.commit()


def err(rule: str, severity: str | None = None) -> dict:
    return {"ruleId": rule, **({"severity": severity} if severity else {})}


async def detail(maker, stage: str = "statuses", group: str = GROUP, mode: str = "dds"):
    async with maker() as db:
        return await stage_detail(db, ADMIN, group, stage, mode, "all")  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_at_most_three_errors_sorted_by_students_then_severity(maker):
    attempts = (
        [[err("v1", "minor")]] * 3  # v1: 3 обучающихся
        + [[err("v3", "major"), err("v4", "critical")]] * 2  # v3, v4: по 2 обучающихся
        + [[err("v5", "minor")]]  # v5: 1
    )
    await populate(maker, attempts)
    result = await detail(maker)
    assert [item.rule_id for item in result.typical_errors] == ["v1", "v4", "v3"]
    assert [item.student_count for item in result.typical_errors] == [3, 2, 2]
    assert result.level.stage_id == "statuses"
    assert result.stage.id == "statuses"
    assert result.explanation is not None and result.explanation.source == "template"


@pytest.mark.asyncio
async def test_severity_is_the_heaviest_met_and_falls_back_to_rule(maker):
    await populate(maker, [[err("v1", "minor")], [err("v1", "critical")], [{"ruleId": "v3"}]])
    result = await detail(maker)
    by_rule = {item.rule_id: item for item in result.typical_errors}
    assert by_rule["v1"].severity == "critical"
    assert by_rule["v3"].severity in {"critical", "major", "minor"}


@pytest.mark.asyncio
async def test_students_only_from_own_group_and_sorted(maker):
    await populate(maker, [[err("v1")], [err("v1")]])
    await populate(maker, [[err("v1")]], group="G2", offset=10)
    result = await detail(maker)
    (item,) = result.typical_errors
    assert item.student_count == 2
    assert [s.name for s in item.students] == ["Имя 0", "Имя 1"]
    assert {s.id for s in item.students} == {"u-0", "u-1"}


@pytest.mark.asyncio
async def test_example_is_latest_attempt_of_group_with_this_error(maker):
    await populate(maker, [[err("v1")], [err("v1")], [err("v3")]], days_ago={0: 5, 1: 2, 2: 0.1})
    await populate(maker, [[err("v1")]], group="G2", offset=10, days_ago={10: 0.01})
    result = await detail(maker)
    by_rule = {item.rule_id: item for item in result.typical_errors}
    assert by_rule["v1"].example_attempt_id == "a-1"
    assert by_rule["v1"].example_session_id == "s-1"
    assert by_rule["v3"].example_attempt_id == "a-2"


@pytest.mark.asyncio
async def test_chain_is_outgoing_only(maker):
    await populate(maker, [[err("v1")]])
    result = await detail(maker, stage="decision")
    assert [(link.from_, link.to) for link in result.chain] == [("decision", "services"), ("decision", "route")]
    closing = await detail(maker, stage="closing")
    assert closing.chain == []
    dumped = result.dump()
    assert dumped["chain"][0]["from"] == "decision"
    assert "articleId" not in dumped["stage"]
    assert dumped["explanation"] is None  # одна попытка — «мало данных», пояснять нечего


@pytest.mark.asyncio
async def test_unknown_stage_is_404_other_is_allowed(maker):
    await populate(maker, [[err("v1")]])
    with pytest.raises(ApiError) as caught:
        await detail(maker, stage="nope")
    assert caught.value.status == 404
    with pytest.raises(ApiError):
        await detail(maker, stage="applicant")  # этап другого режима
    other = await detail(maker, stage="other")
    assert other.typical_errors == []


@pytest.mark.asyncio
async def test_stage_without_errors_has_empty_list(maker):
    await populate(maker, [[err("v1")]] * 6)
    result = await detail(maker, stage="address")
    assert result.typical_errors == []
    assert result.level.attempts_with_error == 0
    assert result.level.level == "rare"


@pytest.mark.asyncio
async def test_unknown_group_is_404(maker):
    with pytest.raises(ApiError) as caught:
        await detail(maker, group="nope")
    assert caught.value.status == 404
