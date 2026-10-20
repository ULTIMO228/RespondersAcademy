"""Спека 004, T005: `GET /api/v1/admin/ai/provider` — статус внешнего провайдера, только администратор, без ключа."""

from __future__ import annotations

from collections.abc import AsyncIterator
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.db.session import get_sessionmaker
from app.services import ai_settings_service
from ml.generate import llm
from tests.conftest import login_as

ROUTE = "/admin/ai/provider"
KEY = "pk-status-key-5555555555"


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


def _settings(provider: str) -> SimpleNamespace:
    class Secret:
        def get_secret_value(self) -> str:
            return KEY

    return SimpleNamespace(
        ai_provider=provider,
        polza_api_key=Secret() if provider == "polza" else None,
        polza_base_url="https://polza.ai/api/v1",
        polza_model="openai/gpt-4o",
        polza_timeout_sec=5.0,
        polza_rpm=20,
        polza_daily_limit=500,
        llama_url=None,
        ollama_url=None,
        llama_model="m",
        ollama_model="m",
        ollama_timeout_sec=5.0,
    )


@pytest.mark.asyncio
async def test_admin_sees_local_status_by_default(v1, ai_env, monkeypatch):
    ai_env.configure(ai_provider="local", polza_api_key=None)
    llm.reset_external_client()
    await login_as(v1, "admin")
    response = await v1.get(ROUTE)
    assert response.status_code == 200, response.text
    assert response.json() == {"provider": "local", "model": None, "configured": False, "withinLimits": True}


@pytest.mark.asyncio
async def test_admin_sees_polza_status_without_key(v1, ai_env, monkeypatch):
    ai_env.configure(ai_provider="polza", polza_api_key=SecretStr(KEY), polza_model="openai/gpt-4o")
    ai_settings_service.invalidate_cache()
    llm.reset_external_client()
    await login_as(v1, "admin")
    response = await v1.get(ROUTE)
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "polza" and body["model"] == "openai/gpt-4o"
    assert body["configured"] is True and body["withinLimits"] is True
    assert KEY not in response.text
    llm.reset_external_client()


@pytest.mark.asyncio
async def test_database_provider_status_tracks_saved_source_and_cloud_gate(v1, ai_env, monkeypatch):
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", True)
    async with get_sessionmaker()() as db:
        await ai_settings_service.save(db, source="cloud", key=KEY, user_id="u-001")
        await db.commit()
    ai_settings_service.invalidate_cache()
    monkeypatch.setattr(llm, "external_client", lambda: None)  # статус обязан читать сохранённую настройку
    await login_as(v1, "admin")

    cloud = await v1.get(ROUTE)
    assert cloud.status_code == 200
    assert cloud.json() == {"provider": "polza", "model": llm.CLOUD_MODEL, "configured": True, "withinLimits": True}
    assert KEY not in cloud.text

    async with get_sessionmaker()() as db:
        await ai_settings_service.save(db, source="local", key=None, user_id="u-001")
        await db.commit()
    ai_settings_service.invalidate_cache()
    local = await v1.get(ROUTE)
    assert local.json() == {"provider": "local", "model": None, "configured": False, "withinLimits": True}

    async with get_sessionmaker()() as db:
        await ai_settings_service.save(db, source="cloud", key=None, user_id="u-001")
        await db.commit()
    ai_settings_service.invalidate_cache()
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", False)
    blocked = await v1.get(ROUTE)
    assert blocked.json() == {"provider": "polza", "model": None, "configured": False, "withinLimits": True}


@pytest.mark.asyncio
async def test_teacher_student_and_anonymous_are_refused(v1, monkeypatch):
    monkeypatch.setattr("app.config.get_settings", lambda: _settings("local"))
    assert (await v1.get(ROUTE)).status_code == 401
    await login_as(v1, "student")
    assert (await v1.get(ROUTE)).status_code == 403
    await login_as(v1, "teacher")
    assert (await v1.get(ROUTE)).status_code == 403
    await login_as(v1, "admin")
    assert (await v1.get(ROUTE)).status_code == 200
