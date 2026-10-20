"""Настройки языковой модели (фича 006, contracts/ai-endpoints.md): `GET/PUT /admin/ai/settings`, `POST …/test`.

Только администратор. Ключ облака не возвращается ни в одном ответе и не пишется в аудит; все ответы — `no-store`.
Коммит транзакции делает роут вместе с аудитом (`ai.settings.change`, `ai.connection_test`).
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import time
from collections.abc import Callable
from typing import Any, cast

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.api.deps import Viewer, get_db, require_role
from app.api.errors import validation_failed
from app.services import ai_health_service, ai_settings_service, audit
from app.services.ai_secrets import AiSecretError
from app.services.ai_settings_service import (
    CLOUD_NEEDS_KEY_MESSAGE,
    UNKNOWN_SOURCE_MESSAGE,
    EffectiveAiSettings,
)
from app.services.time import to_moscow_iso
from ml.generate import llm

logger = logging.getLogger(__name__)

router = APIRouter()
admin_only = require_role("admin")
admin_or_teacher = require_role("admin", "teacher")

NO_STORE = "no-store"
PROBE_TIMEOUT_SEC = 15.0  # SC-008: проба укладывается в 15 с
MAX_KEY_LENGTH = 512
# FR-014: функции, которые уходят в облако при активном облачном источнике (диалог звонящего сюда не входит).
CLOUD_FUNCTIONS = [
    "Генерация сценариев",
    "Пояснения карты ошибок",
    "Тексты отчётов занятия, попытки и сводной успеваемости",
    "Рекомендации",
]
PROBE_SYSTEM = "Ответь JSON-объектом {\"ok\": true}."
PROBE_USER = "Проверка подключения."
PROBE_SCHEMA = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}
PROBE_PURPOSE = "connection_probe"  # метка аудита `ai.external_call` для пробы облака


class SettingsBody(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    source: StrictStr
    api_key: StrictStr | None = Field(default=None, alias="apiKey", max_length=MAX_KEY_LENGTH)
    clear_key: StrictBool | None = Field(default=None, alias="clearKey")


class ProbeBody(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    source: StrictStr
    api_key: StrictStr | None = Field(default=None, alias="apiKey", max_length=MAX_KEY_LENGTH)


def _check_source(source: str) -> None:
    if source not in ("local", "cloud"):
        raise validation_failed(UNKNOWN_SOURCE_MESSAGE)


def _view(ai: EffectiveAiSettings) -> dict[str, Any]:
    return {
        "source": ai.source,
        "cloud": {
            "model": llm.CLOUD_MODEL,
            "route": llm.CLOUD_ROUTE,
            "keyConfigured": ai.key_set,
            "keyLast4": ai.key_last4,
            "available": ai_settings_service.cloud_allowed(),
        },
        "fromEnv": ai.origin == "env",
        "cloudFunctions": list(CLOUD_FUNCTIONS),
        "updatedAt": to_moscow_iso(ai.updated_at) if ai.updated_at else None,
        "updatedBy": ai.updated_by,
    }


@router.get("/admin/ai/settings")
async def get_ai_settings(
    response: Response, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(admin_only)
) -> dict[str, Any]:
    response.headers["Cache-Control"] = NO_STORE
    return _view(await ai_settings_service.effective(db))


@router.put("/admin/ai/settings")
async def put_ai_settings(
    body: SettingsBody, response: Response, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(admin_only)
) -> dict[str, Any]:
    response.headers["Cache-Control"] = NO_STORE
    _check_source(body.source)
    key = (body.api_key or "").strip() or None
    if body.clear_key and key is not None:
        raise validation_failed("Нельзя одновременно задать и удалить ключ")
    before = (await ai_settings_service.effective(db)).source
    if body.clear_key:
        result = await ai_settings_service.clear_key(db, user_id=viewer.user_id)
    else:
        result = await ai_settings_service.save(db, source=body.source, key=key, user_id=viewer.user_id)
    await audit.record(
        db,
        action="ai.settings.change",
        user_id=viewer.user_id,
        role=viewer.role,
        details=(
            f"Настройки языковой модели: from={before} to={result.source} "
            f"keyChanged={'true' if result.key_changed else 'false'}"
        ),
    )
    await db.commit()
    ai_settings_service.invalidate_cache()
    return _view(await ai_settings_service.effective(db))


def _probe_local() -> str:
    client = llm.configured_client()
    if isinstance(client, llm.OllamaClient) and not isinstance(client, llm.PolzaClient):
        client = llm.OllamaClient(client.url, client.model, min(client.timeout, PROBE_TIMEOUT_SEC), openai=client.openai)
    if client is None or not client.healthy():
        return "local_down"
    try:
        data = client.chat_json(PROBE_SYSTEM, PROBE_USER, PROBE_SCHEMA, max_tokens=16)
    except Exception:  # noqa: BLE001 — сбой модели — это исход пробы, а не ошибка запроса
        data = None
    return "ok" if data is not None else "bad_response"


def _probe_cloud(
    key: str,
    reserve_cloud_call: Callable[[], bool],
    before_send: Callable[[], bool],
    timeout_sec: float = PROBE_TIMEOUT_SEC,
) -> tuple[str, bool, bool]:
    """Одна проба облака теми же примитивами, что и `complete_json` (закреплённый маршрут, лимиты, транспорт).

    Возвращает (результат, запрос ушёл в сеть, квота зарезервирована) — по ним пишется исход в `ai_health`.
    """
    if not ai_settings_service.cloud_allowed():
        return "wrong_route", False, False
    payload = llm.build_cloud_payload(PROBE_SYSTEM, PROBE_USER, PROBE_SCHEMA, max_tokens=16)
    if payload is None:
        return "wrong_route", False, False
    settings = config.get_settings()
    client = llm.PolzaClient(
        settings.polza_base_url,
        key,
        llm.CLOUD_MODEL,
        min(settings.polza_timeout_sec, max(1.0, timeout_sec)),
        transport=llm._cloud_transport,
        limiter=llm._cloud_limiter(),
    )
    _, result, sent = client.request_json(
        payload,
        check_route=True,
        count_toward_daily=False,
        reserve_cloud_call=reserve_cloud_call,
        before_send=before_send,
    )
    return result, sent, client.cloud_reserved


async def _record_cloud_probe(db: AsyncSession, viewer: Viewer, result: str, *, sent: bool, reserved: bool) -> None:
    """Исход облачной пробы — в `ai_health` тем же путём, что и обычные вызовы (`ai_health_service.record_outcomes`).

    Успех: облако ответило — `served_by=cloud`, `last_ok_at=now`, прошлая причина сбоя не стирается. Неудача: причина
    из enum; запасной путь пробой не проверяется, поэтому `served_by=template` (облако не ответило, ответа нет).
    Квота пробы уже зарезервирована до HTTP, поэтому `cloud_sent and not cloud_reserved` не даёт второго списания.
    Вызывается только для выбранного облака и сохранённого ключа: состояние описывает настроенный источник, а не
    пробу до сохранения или с другим ключом.
    """
    ok = result == "ok"
    outcome = llm.LlmOutcome(
        data=None,
        source="cloud" if ok else "template",
        provider=llm.CLOUD_PROVIDER,
        reason=None if ok else cast(llm.Reason, result),
        purpose=PROBE_PURPOSE,
        active_source="cloud",
        request_chars=len(PROBE_SYSTEM) + len(PROBE_USER),
        cloud_result=result,
        cloud_sent=sent,
        cloud_reserved=reserved,
    )
    await ai_health_service.record_outcomes(db, [outcome], viewer)


@router.post("/admin/ai/settings/test")
async def test_ai_connection(
    body: ProbeBody, response: Response, db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(admin_only)
) -> dict[str, Any]:
    """Пробный запрос: настройки не меняются; квота пробы учитывается отдельно.

    Исход облачной пробы пишется в `ai_health` только если облако выбрано и проверен сохранённый ключ: проба с
    введённым (несохранённым) ключом ничего не меняет (quickstart, шаг 2).
    """
    response.headers["Cache-Control"] = NO_STORE
    _check_source(body.source)
    key = (body.api_key or "").strip() or None
    typed_key = key is not None
    effective = await ai_settings_service.effective(db)
    if body.source == "cloud" and key is None:
        try:
            key = ai_settings_service.default_service().cloud_key(effective)
        except AiSecretError:
            key = None
        if not key:
            raise validation_failed(CLOUD_NEEDS_KEY_MESSAGE)
    # Освобождаем транзакцию сессии `db` до запуска потока и резервации,
    # чтобы не удерживать блокировку SQLite (lock contention / busy wait)
    await db.rollback()
    started = time.perf_counter()
    sent = reserved = False
    if body.source == "cloud":
        if not ai_settings_service.cloud_allowed() or llm.build_cloud_payload(PROBE_SYSTEM, PROBE_USER, PROBE_SCHEMA, max_tokens=16) is None:
            result = "wrong_route"
        else:
            event_loop = asyncio.get_running_loop()
            probe_deadline = time.monotonic() + PROBE_TIMEOUT_SEC

            def reserve_probe() -> bool:
                reservation = ai_health_service.reserve_cloud_call(
                    config.get_settings().polza_daily_limit,
                    usage="probe",
                    active_source=effective.source,
                )
                scheduled = asyncio.run_coroutine_threadsafe(reservation, event_loop)
                try:
                    return scheduled.result(timeout=max(0.0, probe_deadline - time.monotonic()))
                except TimeoutError:
                    scheduled.cancel()
                    raise

            def probe_is_before_deadline() -> bool:
                return time.monotonic() < probe_deadline

            try:
                remaining_sec = max(0.0, probe_deadline - time.monotonic())
                result, sent, reserved = await asyncio.wait_for(
                    asyncio.to_thread(_probe_cloud, key, reserve_probe, probe_is_before_deadline, remaining_sec),
                    timeout=remaining_sec + 0.5,
                )
            except TimeoutError:
                result = "timeout"
    else:
        try:
            result = await asyncio.wait_for(asyncio.to_thread(_probe_local), timeout=PROBE_TIMEOUT_SEC)
        except TimeoutError:
            result = "timeout"
    latency = int((time.perf_counter() - started) * 1000)
    ok = result == "ok"
    if not ok:
        logger.warning("ai_probe_failed source=%s reason=%s latency_ms=%d", body.source, result, latency)
    if body.source == "cloud" and effective.source == "cloud" and not typed_key:
        await _record_cloud_probe(db, viewer, result, sent=sent, reserved=reserved)
    await audit.record(
        db,
        action="ai.connection_test",
        user_id=viewer.user_id,
        role=viewer.role,
        details=(
            f"Проверка подключения к модели: source={body.source} ok={'true' if ok else 'false'}"
            + ("" if ok else f" reason={result}")
        ),
    )
    await db.commit()
    answer: dict[str, Any] = {"ok": ok, "latencyMs": latency, "route": llm.CLOUD_ROUTE if ok and body.source == "cloud" else None}
    if not ok:
        answer["reason"] = result
    return answer


@router.get("/ai/health")
async def get_ai_health(
    response: Response,
    db: AsyncSession = Depends(get_db),
    viewer: Viewer = Depends(admin_or_teacher),
) -> dict[str, Any]:
    """Состояние последнего исхода модели; причины и счётчики доступны только администратору."""
    response.headers["Cache-Control"] = NO_STORE
    row = await ai_health_service.read(db)
    if row is None:
        active_source = (await ai_settings_service.effective(db)).source
        served_by = active_source
    else:
        active_source = row.active_source
        served_by = row.served_by_last or row.active_source
    result: dict[str, Any] = {
        "state": ai_health_service.state(row),
        "activeSource": active_source,
        "servedBy": served_by,
        "lastOkAt": to_moscow_iso(row.last_ok_at) if row and row.last_ok_at else None,
        "lastErrorAt": to_moscow_iso(row.last_error_at) if row and row.last_error_at else None,
    }
    if viewer.role == "admin":
        today = dt.datetime.now().astimezone().date()
        settings = config.get_settings()
        result.update(
            reason=row.last_error_reason if row else None,
            errorsToday=row.errors_today if row and row.day == today else 0,
            callsToday=ai_health_service.calls_today(row, today),
            dailyLimit=settings.polza_daily_limit,
        )
    return result
