"""Спека 004, T004: пояснение через внешнюю модель и аудит `ai.external_call` (без текстов и ключа)."""

from __future__ import annotations

import json

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app import ai_gateway
from app.api.deps import Viewer
from app.db.base import Base
from app.models.audit import AuditLog
from app.schemas.error_map import ErrorMapStage, ErrorMapStageLevel, ErrorMapStudentRef, ErrorMapTypicalError
from app.services.error_map_explain import build_explanation
from ml.generate import llm

KEY = "pk-audit-key-0987654321"
ADMIN = Viewer(user_id="adm", role="admin")
STAGE = ErrorMapStage(id="statuses", order=7, title="Статусы реагирования")
LEVEL = ErrorMapStageLevel(
    stage_id="statuses", attempts=10, attempts_with_error=5, share=0.5, level="often", affected_students=3
)
ERRORS = [
    ErrorMapTypicalError(
        rule_id="v1",
        plain_text="Не проставлен статус «Принята»",
        severity="critical",
        student_count=3,
        students=[ErrorMapStudentRef(id="u-1", name="Иванов Секретный")],
    )
]


@pytest_asyncio.fixture
async def maker():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture(autouse=True)
def _clean():
    ai_gateway.set_gateway(None)
    llm.drain_external_events()
    yield
    ai_gateway.set_gateway(None)
    llm.drain_external_events()


def _use_polza(monkeypatch, handler) -> None:
    client = llm.PolzaClient("https://polza.ai/api/v1", KEY, "openai/gpt-4o", 5.0, transport=httpx.MockTransport(handler))
    monkeypatch.setattr(llm, "external_client", lambda: client)


async def _explain(maker):
    async with maker() as db:
        return await build_explanation(
            db, ADMIN, group_id="G", student_id="", mode="dds", stage=STAGE, level=LEVEL, typical_errors=ERRORS, subject="group"
        )


async def _audit(maker) -> list[AuditLog]:
    async with maker() as db:
        return list((await db.execute(select(AuditLog).where(AuditLog.action == "ai.external_call"))).scalars().all())


@pytest.mark.asyncio
async def test_external_text_is_marked_ai_and_call_is_audited_without_content(maker, monkeypatch):
    answer = {"choices": [{"message": {"content": json.dumps({"text": "Торопятся и пропускают статус."})}}]}
    _use_polza(monkeypatch, lambda request: httpx.Response(200, json=answer))
    result = await _explain(maker)
    assert result is not None and result.source == "ai" and result.text == "Торопятся и пропускают статус."
    entries = await _audit(maker)
    assert len(entries) == 1
    entry = entries[0]
    assert entry.user_id == "adm" and entry.role == "admin"
    assert "polza:openai/gpt-4o" in entry.details and "ok" in entry.details
    for secret in (KEY, "Торопятся", "Иванов", "Принята"):
        assert secret not in entry.details


@pytest.mark.asyncio
async def test_provider_error_gives_template_and_failed_audit_entry(maker, monkeypatch):
    _use_polza(monkeypatch, lambda request: httpx.Response(401, json={"error": KEY}))
    result = await _explain(maker)
    assert result is not None and result.source == "template"
    entries = await _audit(maker)
    assert len(entries) == 1 and "http_401" in entries[0].details and KEY not in entries[0].details


@pytest.mark.asyncio
async def test_without_external_provider_nothing_is_audited(maker, monkeypatch):
    monkeypatch.setattr(llm, "external_client", lambda: None)
    result = await _explain(maker)
    assert result is not None and result.source == "template"
    assert await _audit(maker) == []
