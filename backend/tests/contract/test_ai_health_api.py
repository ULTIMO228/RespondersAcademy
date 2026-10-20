"""Фича 006, T022: контракт и ролевое сокрытие сведений GET /ai/health."""

from __future__ import annotations

import datetime as dt
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.db.session import get_sessionmaker
from app.models.ai_settings import AiHealth
from tests.conftest import login_as


@pytest_asyncio.fixture
async def v1(app, ai_env) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


async def _set_health(*, active: str, served: str, reason: str | None, errors: int, calls: int) -> None:
    async with get_sessionmaker()() as db:
        row = await db.get(AiHealth, 1)
        if row is None:
            row = AiHealth(id=1, active_source=active)
            db.add(row)
        row.active_source = active
        row.served_by_last = served
        row.last_ok_at = dt.datetime.now(dt.UTC) if served != "template" else None
        row.last_error_at = dt.datetime.now(dt.UTC) if reason else None
        row.last_error_reason = reason
        row.errors_today = errors
        row.calls_today = calls
        row.day = dt.datetime.now().astimezone().date()
        await db.commit()


@pytest.mark.asyncio
async def test_roles_cache_policy_and_admin_details(v1):
    assert (await v1.get("/ai/health")).status_code == 401
    await login_as(v1, "student")
    assert (await v1.get("/ai/health")).status_code == 403

    await _set_health(active="cloud", served="local", reason="invalid_key", errors=3, calls=4)
    await login_as(v1, "teacher")
    teacher = await v1.get("/ai/health")
    assert teacher.status_code == 200 and teacher.headers["cache-control"] == "no-store"
    assert teacher.json() == {
        "state": "degraded",
        "activeSource": "cloud",
        "servedBy": "local",
        "lastOkAt": teacher.json()["lastOkAt"],
        "lastErrorAt": teacher.json()["lastErrorAt"],
    }
    assert "reason" not in teacher.json() and "callsToday" not in teacher.json()

    await login_as(v1, "admin")
    admin = await v1.get("/ai/health")
    assert admin.status_code == 200 and admin.headers["cache-control"] == "no-store"
    assert admin.json() == {
        **teacher.json(),
        "reason": "invalid_key",
        "errorsToday": 3,
        "callsToday": 4,
        "dailyLimit": admin.json()["dailyLimit"],
    }
    assert isinstance(admin.json()["dailyLimit"], int)


@pytest.mark.asyncio
async def test_state_transitions_and_day_rollover(v1):
    await login_as(v1, "admin")
    url = "/ai/health"
    ok = await v1.get(url)
    assert ok.status_code == 200 and ok.json()["state"] == "ok"

    await _set_health(active="cloud", served="local", reason="rate_limited", errors=2, calls=5)
    degraded = (await v1.get(url)).json()
    assert degraded["state"] == "degraded" and degraded["reason"] == "rate_limited"
    assert degraded["callsToday"] == 5 and degraded["errorsToday"] == 2

    await _set_health(active="cloud", served="template", reason="local_down", errors=3, calls=5)
    down = (await v1.get(url)).json()
    assert down["state"] == "down" and down["servedBy"] == "template"

    # Смена даты обнуляет оба дневных счётчика, сохраняя последнее состояние и причину.
    async with get_sessionmaker()() as db:
        row = await db.get(AiHealth, 1)
        assert row is not None
        row.day = dt.datetime.now().astimezone().date() - dt.timedelta(days=1)
        await db.commit()
    recovered_day = (await v1.get(url)).json()
    assert recovered_day["state"] == "down"
    assert recovered_day["errorsToday"] == 0 and recovered_day["callsToday"] == 0

    await _set_health(active="cloud", served="cloud", reason=None, errors=0, calls=1)
    recovered = (await v1.get(url)).json()
    assert recovered["state"] == "ok" and recovered["servedBy"] == "cloud"
