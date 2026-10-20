"""Фича 006, T026: интеграция complete_json → ai_health → audit для сбоя и восстановления."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import select

from app.api.deps import Viewer
from app.db.session import get_sessionmaker
from app.models.ai_settings import AiHealth
from app.models.audit import AuditLog
from app.services import ai_health_service, ai_settings_service
from app.services.ai_settings_service import EffectiveAiSettings
from ml.generate import llm

KEY = "pza-fallback-test-key-123456-SECRET"
SCHEMA = {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}


class Local:
    provider = "llamacpp:test"
    running = True

    def healthy(self) -> bool:
        return self.running

    def chat_json(self, *_args, **_kwargs):
        return {"text": "локальный ответ"} if self.running else None


@pytest.mark.asyncio
async def test_cloud_failure_local_outage_and_recovery_are_persisted(ai_env, monkeypatch):
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", True)
    monkeypatch.setattr(llm, "CLOUD_ROUTE_PARAMS", {"provider": {"only": [llm.CLOUD_ROUTE], "allow_fallbacks": False}})
    ai = EffectiveAiSettings(source="cloud", origin="db", key_set=True, key_last4="CRET", _env_key=SecretStr(KEY))
    monkeypatch.setattr(ai_settings_service, "effective", lambda _db: _async_value(ai))
    local = Local()
    monkeypatch.setattr(llm, "configured_client", lambda: local)
    cloud_mode = {"status": 401}

    def response(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == f"Bearer {KEY}"
        if cloud_mode["status"] == 200:
            return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"text": "облачный ответ"})}}]})
        return httpx.Response(cloud_mode["status"], json={"error": {"message": "invalid key"}})

    monkeypatch.setattr(llm, "_cloud_transport", httpx.MockTransport(response))
    llm.reset_external_client()
    viewer = Viewer(user_id="u-001", role="teacher")

    async with get_sessionmaker()() as db:
        async with ai_health_service.llm_scope(db, viewer):
            outcome = await asyncio.to_thread(llm.complete_json, "scenario_generation", "system", "request", SCHEMA)
            assert outcome.source == "local" and outcome.reason == "invalid_key"
        await db.commit()
    async with get_sessionmaker()() as db:
        row = await db.get(AiHealth, 1)
        assert row is not None and ai_health_service.state(row) == "degraded"
        assert row.last_error_reason == "invalid_key" and row.calls_today == 1

    local.running = False
    async with get_sessionmaker()() as db:
        async with ai_health_service.llm_scope(db, viewer):
            outcome = await asyncio.to_thread(llm.complete_json, "scenario_generation", "system", "request", SCHEMA)
            assert outcome.source == "template" and outcome.data is None
        await db.commit()
    async with get_sessionmaker()() as db:
        row = await db.get(AiHealth, 1)
        assert row is not None and ai_health_service.state(row) == "down"
        assert row.last_error_reason == "invalid_key"  # облачная ошибка сохраняется как первопричина

    local.running = True
    cloud_mode["status"] = 200
    async with get_sessionmaker()() as db:
        async with ai_health_service.llm_scope(db, viewer):
            outcome = await asyncio.to_thread(llm.complete_json, "scenario_generation", "system", "request", SCHEMA)
            assert outcome.source == "cloud" and outcome.data == {"text": "облачный ответ"}
        await db.commit()
    async with get_sessionmaker()() as db:
        row = await db.get(AiHealth, 1)
        assert row is not None and ai_health_service.state(row) == "ok"
        events = list((await db.execute(select(AuditLog).where(AuditLog.action == "ai.external_call"))).scalars().all())
        assert len(events) == 3
        assert all((KEY in event.details) is False for event in events)
        assert all(("request" in event.details) is False for event in events)

    llm.reset_external_client()


async def _async_value(value):
    return value
