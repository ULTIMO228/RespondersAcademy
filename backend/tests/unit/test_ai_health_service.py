"""Фича 006, T011: здоровье модели `ai_health` (одна строка id=1) и аудит `ai.external_call` по исходам `complete_json`.

Исходы строятся напрямую (`LlmOutcome`), время подменяется параметром `now`; сеть и модель не нужны.
"""

from __future__ import annotations

import asyncio
import datetime as dt

import pytest
import pytest_asyncio
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # регистрирует таблицы в Base.metadata
from app.api.deps import Viewer
from app.db.base import Base
from app.models.ai_settings import AiHealth
from app.models.audit import AuditLog
from app.services import ai_health_service, ai_settings_service
from app.services.ai_settings_service import EffectiveAiSettings
from ml.generate import llm

KEY = "pza-health-key-5555555555-ZZZZ"
TEACHER = Viewer(user_id="u-t", role="teacher")
DAY1 = dt.datetime(2026, 10, 20, 9, 0, tzinfo=dt.UTC)
DAY2 = dt.datetime(2026, 10, 21, 9, 0, tzinfo=dt.UTC)


def _outcome(
    source: str,
    *,
    active: str = "local",
    reason: str | None = None,
    sent: bool = False,
    cloud_result: str | None = None,
    cloud_reserved: bool = False,
) -> llm.LlmOutcome:
    return llm.LlmOutcome(
        data={"text": "секретный ответ"} if source != "template" else None,
        source=source,  # type: ignore[arg-type]
        provider={"cloud": f"polza:{llm.CLOUD_MODEL}", "local": "llamacpp:m", "template": None}[source],
        reason=reason,  # type: ignore[arg-type]
        purpose="error_map_explain",
        active_source=active,  # type: ignore[arg-type]
        request_chars=42,
        cloud_result=cloud_result,
        cloud_sent=sent,
        cloud_reserved=cloud_reserved,
    )


@pytest_asyncio.fixture
async def maker():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def _record(maker, *outcomes: llm.LlmOutcome, now: dt.datetime = DAY1, viewer: Viewer | None = TEACHER) -> AiHealth:
    async with maker() as db:
        await ai_health_service.record_outcomes(db, list(outcomes), viewer, now=now)
        await db.commit()
    async with maker() as db:
        row = await db.get(AiHealth, 1)
        assert row is not None
        return row


async def _rows(maker) -> int:
    async with maker() as db:
        return (await db.execute(select(func.count()).select_from(AiHealth))).scalar_one()


async def _audit(maker) -> list[AuditLog]:
    async with maker() as db:
        return list((await db.execute(select(AuditLog).where(AuditLog.action == "ai.external_call"))).scalars().all())


def test_state_by_data_model():
    assert ai_health_service.state(None) == "ok"
    assert ai_health_service.state(AiHealth(active_source="local", served_by_last="local")) == "ok"
    assert ai_health_service.state(AiHealth(active_source="cloud", served_by_last="cloud")) == "ok"
    assert ai_health_service.state(AiHealth(active_source="cloud", served_by_last="local")) == "degraded"
    assert ai_health_service.state(AiHealth(active_source="local", served_by_last="template")) == "down"
    assert ai_health_service.state(AiHealth(active_source="cloud", served_by_last="template")) == "down"


@pytest.mark.asyncio
async def test_success_creates_single_ok_row(maker):
    row = await _record(maker, _outcome("local"))
    assert ai_health_service.state(row) == "ok"
    assert row.active_source == "local" and row.served_by_last == "local"
    assert row.last_ok_at is not None and row.last_error_reason is None
    assert row.errors_today == 0 and row.calls_today == 0 and row.day == DAY1.astimezone().date()
    assert await _rows(maker) == 1


@pytest.mark.asyncio
async def test_cloud_failure_with_local_answer_is_degraded(maker):
    row = await _record(maker, _outcome("local", active="cloud", reason="invalid_key", sent=True, cloud_result="invalid_key"))
    assert ai_health_service.state(row) == "degraded"
    assert row.last_error_reason == "invalid_key" and row.last_error_at is not None
    assert row.errors_today == 1 and row.calls_today == 1


@pytest.mark.asyncio
async def test_template_is_down(maker):
    row = await _record(maker, _outcome("template", reason="local_down"))
    assert ai_health_service.state(row) == "down" and row.last_error_reason == "local_down"


@pytest.mark.asyncio
async def test_repeated_failures_increment_counter_without_duplicates(maker):
    failure = _outcome("template", active="cloud", reason="timeout", sent=True, cloud_result="timeout")
    await _record(maker, failure, failure)
    row = await _record(maker, failure)
    assert row.errors_today == 3 and row.calls_today == 3
    assert await _rows(maker) == 1


@pytest.mark.asyncio
async def test_recovery_returns_ok(maker):
    await _record(maker, _outcome("template", reason="local_down"))
    row = await _record(maker, _outcome("local"))
    assert ai_health_service.state(row) == "ok" and row.errors_today == 1  # счётчик за сутки сохраняется


@pytest.mark.asyncio
async def test_date_change_resets_counters(maker):
    failure = _outcome("local", active="cloud", reason="network", sent=True, cloud_result="network")
    await _record(maker, failure, failure, now=DAY1)
    row = await _record(maker, _outcome("cloud", active="cloud", sent=True, cloud_result="ok"), now=DAY2)
    assert row.day == DAY2.astimezone().date() and row.errors_today == 0 and row.calls_today == 1


@pytest.mark.asyncio
async def test_rate_limited_before_sending_is_not_a_spent_call(maker):
    row = await _record(maker, _outcome("local", active="cloud", reason="daily_limit", cloud_result="daily_limit"))
    assert row.calls_today == 0 and row.errors_today == 1 and row.last_error_reason == "daily_limit"


@pytest.mark.asyncio
async def test_concurrent_cloud_reservations_never_exceed_daily_cap(maker):
    limit = 5

    reserved = await asyncio.gather(
        *(ai_health_service.reserve_cloud_call(limit, session_factory=maker, now=DAY1) for _ in range(20))
    )

    assert sum(reserved) == limit
    async with maker() as db:
        row = await db.get(AiHealth, 1)
        assert row is not None and row.calls_today == limit


@pytest.mark.asyncio
async def test_concurrent_probe_and_regular_reservations_share_daily_cap(maker):
    limit = 5
    reservations = await asyncio.gather(
        *(
            ai_health_service.reserve_cloud_call(
                limit,
                usage="probe" if index % 2 else "request",
                session_factory=maker,
                now=DAY1,
            )
            for index in range(20)
        )
    )

    assert sum(reservations) == limit
    async with maker() as db:
        row = await db.get(AiHealth, 1)
        assert row is not None and row.calls_today + row.probe_calls_today == limit


@pytest.mark.asyncio
async def test_timeout_after_reservation_does_not_count_the_call_twice(maker):
    # Резерв уже атомарно записан до отправки; timeout outcome только фиксирует ошибку/аудит.
    assert await ai_health_service.reserve_cloud_call(5, session_factory=maker, now=DAY1)
    row = await _record(
        maker,
        _outcome("template", active="cloud", reason="timeout", sent=True, cloud_result="timeout", cloud_reserved=True),
    )

    assert row.calls_today == 1 and row.errors_today == 1


@pytest.mark.asyncio
async def test_outcome_keeps_reservation_when_scope_loaded_previous_day(maker, monkeypatch):
    cloud = EffectiveAiSettings(source="cloud", origin="env", key_set=True, key_last4="ZZZZ", _env_key=SecretStr(KEY))

    async def fake_effective(db):
        return cloud

    monkeypatch.setattr(ai_settings_service, "effective", fake_effective)
    async with maker() as db:
        db.add(AiHealth(id=1, active_source="cloud", errors_today=2, calls_today=7, day=DAY1.date()))
        await db.commit()

    async with maker() as db:
        async with ai_health_service.llm_scope(db, TEACHER, now=DAY2) as ctx:
            assert ctx.calls_today == 0  # llm_scope прочитал строку за предыдущие сутки
            assert await ai_health_service.reserve_cloud_call(5, session_factory=maker, now=DAY2)
            ctx.outcomes.append(
                _outcome("template", active="cloud", reason="timeout", sent=True, cloud_result="timeout", cloud_reserved=True)
            )
        await db.commit()

    async with maker() as db:
        row = await db.get(AiHealth, 1)
        assert row is not None and row.day == DAY2.date()
        assert row.calls_today == 1 and row.errors_today == 1


@pytest.mark.asyncio
async def test_cloud_attempts_are_audited_without_texts_or_key(maker):
    await _record(
        maker,
        _outcome("cloud", active="cloud", sent=True, cloud_result="ok"),
        _outcome("local", active="cloud", reason="invalid_key", sent=True, cloud_result="invalid_key"),
    )
    entries = await _audit(maker)
    assert len(entries) == 2
    assert all(entry.user_id == "u-t" and entry.role == "teacher" for entry in entries)
    details = [entry.details for entry in entries]
    assert f"polza:{llm.CLOUD_MODEL}" in details[0] and "результат ok" in details[0] and "42 зн." in details[0]
    assert "результат invalid_key" in details[1] and "ответила локальная" in details[1]
    for text in details:
        assert ("секретный" in text) is False and (KEY in text) is False


@pytest.mark.asyncio
async def test_local_only_outcomes_are_not_audited(maker):
    await _record(maker, _outcome("local"), _outcome("template", reason="local_down"))
    assert await _audit(maker) == []


@pytest.mark.asyncio
async def test_no_outcomes_write_nothing(maker):
    async with maker() as db:
        assert await ai_health_service.record_outcomes(db, [], TEACHER, now=DAY1) == 0
    assert await _rows(maker) == 0


@pytest.mark.asyncio
async def test_scope_binds_context_with_calls_today_and_records(maker, monkeypatch):
    cloud = EffectiveAiSettings(source="cloud", origin="env", key_set=True, key_last4="ZZZZ", _env_key=SecretStr(KEY))

    async def fake_effective(db):
        return cloud

    monkeypatch.setattr(ai_settings_service, "effective", fake_effective)
    sent = _outcome("cloud", active="cloud", sent=True, cloud_result="ok")
    await _record(maker, sent, sent, now=DAY1)
    async with maker() as db:
        async with ai_health_service.llm_scope(db, TEACHER, now=DAY1) as ctx:
            assert llm.current_context() is ctx and ctx.ai is cloud and ctx.calls_today == 2
            ctx.outcomes.append(sent)
        assert llm.current_context() is None
        await db.commit()
    async with maker() as db:
        row = await db.get(AiHealth, 1)
        assert row is not None and row.calls_today == 3
    async with maker() as db:
        async with ai_health_service.llm_scope(db, TEACHER, now=DAY2) as ctx:
            assert ctx.calls_today == 0  # новые сутки: прошлый расход не считается
