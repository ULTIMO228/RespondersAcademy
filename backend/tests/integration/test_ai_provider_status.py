"""Спека 004, T005: `GET /api/v1/admin/ai/provider` — статус внешнего провайдера, только администратор, без ключа."""

from __future__ import annotations

from collections.abc import AsyncIterator
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

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
async def test_admin_sees_local_status_by_default(v1, monkeypatch):
    monkeypatch.setattr("app.config.get_settings", lambda: _settings("local"))
    llm.reset_external_client()
    await login_as(v1, "admin")
    response = await v1.get(ROUTE)
    assert response.status_code == 200, response.text
    assert response.json() == {"provider": "local", "model": None, "configured": False, "withinLimits": True}


@pytest.mark.asyncio
async def test_admin_sees_polza_status_without_key(v1, monkeypatch):
    monkeypatch.setattr("app.config.get_settings", lambda: _settings("polza"))
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
async def test_teacher_student_and_anonymous_are_refused(v1, monkeypatch):
    monkeypatch.setattr("app.config.get_settings", lambda: _settings("local"))
    assert (await v1.get(ROUTE)).status_code == 401
    await login_as(v1, "student")
    assert (await v1.get(ROUTE)).status_code == 403
    await login_as(v1, "teacher")
    assert (await v1.get(ROUTE)).status_code == 403
    await login_as(v1, "admin")
    assert (await v1.get(ROUTE)).status_code == 200
