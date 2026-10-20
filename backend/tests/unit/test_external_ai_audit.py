"""Спека 004 T004 / фича 006 T012: пояснение через облачную модель и аудит `ai.external_call` (без текстов и ключа).

Сквозной путь: `build_explanation` → `llm_scope` → `run_in_threadpool` → `explain_stage` → `complete_json`; исход
возвращается в контекст запроса (contextvar копируется в поток) и пишется в аудит и `ai_health`. Сеть — MockTransport,
стопор облака и форма маршрута открыты только на время теста.
"""

from __future__ import annotations

import json

import httpx
import pytest
import pytest_asyncio
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app import ai_gateway
from app.api.deps import Viewer
from app.db.base import Base
from app.models.ai_settings import AiHealth
from app.models.audit import AuditLog
from app.schemas.error_map import ErrorMapStage, ErrorMapStageLevel, ErrorMapStudentRef, ErrorMapTypicalError
from app.services import ai_settings_service
from app.services.ai_settings_service import EffectiveAiSettings
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
def _clean(monkeypatch):
    ai_gateway.set_gateway(None)
    llm.reset_external_client()
    monkeypatch.setattr(llm, "configured_client", lambda: None)  # локальной модели нет: запасной путь — шаблон
    yield
    ai_gateway.set_gateway(None)
    llm.reset_external_client()


def _use_source(monkeypatch, source: str) -> None:
    value = EffectiveAiSettings(source=source, origin="env", key_set=True, key_last4=KEY[-4:], _env_key=SecretStr(KEY))  # type: ignore[arg-type]

    async def effective(db):
        return value

    monkeypatch.setattr(ai_settings_service, "effective", effective)


def _use_polza(monkeypatch, handler) -> None:
    _use_source(monkeypatch, "cloud")
    monkeypatch.setattr(ai_settings_service, "CLOUD_ROUTE_VERIFIED", True)
    monkeypatch.setattr(llm, "CLOUD_ROUTE_PARAMS", {"x_test_route": "тест"})  # форма маршрута не подтверждена (T003)
    monkeypatch.setattr(llm, "_cloud_transport", httpx.MockTransport(handler))


def _use_test_db(monkeypatch, maker) -> None:
    # Квота резервируется в отдельной сессии; направляем её в in-memory БД этой фикстуры.
    monkeypatch.setattr("app.db.session.get_sessionmaker", lambda: maker)


async def _explain(maker):
    async with maker() as db:
        return await build_explanation(
            db, ADMIN, group_id="G", student_id="", mode="dds", stage=STAGE, level=LEVEL, typical_errors=ERRORS, subject="group"
        )


async def _audit(maker) -> list[AuditLog]:
    async with maker() as db:
        return list((await db.execute(select(AuditLog).where(AuditLog.action == "ai.external_call"))).scalars().all())


@pytest.mark.asyncio
async def test_external_text_is_marked_cloud_and_call_is_audited_without_content(maker, monkeypatch):
    answer = {"choices": [{"message": {"content": json.dumps({"text": "Торопятся и пропускают статус."})}}]}
    _use_polza(monkeypatch, lambda request: httpx.Response(200, json=answer))
    _use_test_db(monkeypatch, maker)
    result = await _explain(maker)
    assert result is not None and result.source == "cloud" and result.text == "Торопятся и пропускают статус."
    assert result.source_kind is None and result.model == llm.CLOUD_MODEL  # T034: фактический источник — `source`
    entries = await _audit(maker)
    assert len(entries) == 1
    entry = entries[0]
    assert entry.user_id == "adm" and entry.role == "admin"
    assert llm.CLOUD_PROVIDER in entry.details and "результат ok" in entry.details
    for secret in (KEY, "Торопятся", "Иванов", "Принята"):
        assert secret not in entry.details


@pytest.mark.asyncio
async def test_provider_error_gives_template_and_failed_audit_entry(maker, monkeypatch):
    _use_polza(monkeypatch, lambda request: httpx.Response(401, json={"error": KEY}))
    _use_test_db(monkeypatch, maker)
    result = await _explain(maker)
    assert result is not None and result.source == "template" and result.source_kind is None and result.model is None
    entries = await _audit(maker)
    assert len(entries) == 1 and "invalid_key" in entries[0].details and KEY not in entries[0].details
    async with maker() as db:
        health = await db.get(AiHealth, 1)
        assert health is not None and health.served_by_last == "template" and health.last_error_reason == "invalid_key"


@pytest.mark.asyncio
async def test_without_external_provider_nothing_is_audited(maker, monkeypatch):
    _use_source(monkeypatch, "local")
    result = await _explain(maker)
    assert result is not None and result.source == "template"
    assert await _audit(maker) == []
    # T029: при локальном источнике модель тоже спрашивают (её нет → шаблон); исход учтён в здоровье, наружу — ничего.
    async with maker() as db:
        health = await db.get(AiHealth, 1)
        assert health is not None and health.served_by_last == "template" and health.last_error_reason == "local_down"


@pytest.mark.asyncio
async def test_cloud_error_falls_back_to_local_model_for_explanation(maker, monkeypatch):
    class Local:
        provider = "llamacpp:semantic-review"

        def healthy(self):
            return True

        def chat_json(self, system, user, schema, *, seed=None, max_tokens=None):
            return {"text": "Путают порядок статусов."}

    _use_polza(monkeypatch, lambda request: httpx.Response(401, json={"error": KEY}))
    _use_test_db(monkeypatch, maker)
    monkeypatch.setattr(llm, "configured_client", lambda: Local())
    result = await _explain(maker)
    assert result is not None and result.source == "local" and result.text == "Путают порядок статусов."
    assert result.source_kind is None and result.model == "semantic-review"  # FR-018: облако упало → локальная
    entries = await _audit(maker)
    assert len(entries) == 1 and "invalid_key" in entries[0].details and KEY not in entries[0].details


def test_attempt_chat_purpose_has_russian_title():
    from app.services.external_ai_audit import PURPOSES

    assert PURPOSES["attempt_chat"] == "ответ чата разбора попытки"
