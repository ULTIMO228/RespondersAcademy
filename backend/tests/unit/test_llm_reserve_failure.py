"""Фича 006, T045: сбой резервации суточной квоты облака — причина по природе сбоя, а не `network`.

Резервация идёт через БД (`reserve_cloud_call` → отдельная сессия из пула). Таймаут пула SQLAlchemy — это занятость
нашей БД, а не отказ облака: запрос не ушёл (`sent=False`). `sqlalchemy.exc.TimeoutError` не является встроенным
`TimeoutError`, поэтому без явной ветки попадал в общий `except Exception` и записывался как `network` облака.
Сеть не используется: транспорт `httpx.MockTransport` падает, если до него дошло, — запрос не должен уйти.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.services.ai_health_service import reserve_cloud_call
from ml.generate import llm

KEY = "pk-secret-key-1234567890"


def _client() -> llm.PolzaClient:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("запрос к облаку не должен уйти при сбое резервации")

    return llm.PolzaClient(
        "https://polza.ai/api/v1/",
        KEY,
        "openai/gpt-4o",
        30.0,
        transport=httpx.MockTransport(handler),
        rpm=100,
        daily_limit=1000,
    )


def _raising(error: BaseException) -> Any:
    def reserve() -> bool:
        raise error

    return reserve


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (
            PoolTimeoutError(
                "QueuePool limit of size 1 overflow 0 reached, connection timed out, timeout 0.5"
            ),
            "timeout",
        ),
        (TimeoutError("reservation waited too long"), "timeout"),
        (RuntimeError("сбой учёта квоты"), "network"),
    ],
)
def test_reservation_failure_reason_and_nothing_sent(error: BaseException, reason: str) -> None:
    client = _client()
    data, result, sent = client.request_json(
        {"model": "openai/gpt-4o", "messages": []}, reserve_cloud_call=_raising(error)
    )
    assert data is None
    assert result == reason
    assert sent is False
    assert client.cloud_reserved is False


async def test_real_pool_exhaustion_during_reservation_is_timeout(tmp_path) -> None:
    """Сквозной путь без подмены исключения: единственное соединение пула занято, резервация идёт из потока.

    Как в `llm_scope.reserve_from_worker`: `reserve_cloud_call` выполняется в цикле событий через
    `run_coroutine_threadsafe`, а вызывающий поток получает исключение пула SQLAlchemy. Ожидаем `timeout`, `sent=False`.
    """
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'pool.db'}", pool_size=1, max_overflow=0, pool_timeout=0.3
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    loop = asyncio.get_running_loop()

    def reserve_from_worker() -> bool:
        return asyncio.run_coroutine_threadsafe(
            reserve_cloud_call(10, session_factory=sessions), loop
        ).result()

    try:
        async with sessions() as holder:
            await holder.execute(text("select 1"))  # единственное соединение удерживается до конца блока
            data, result, sent = await asyncio.to_thread(
                _client().request_json,
                {"model": "openai/gpt-4o", "messages": []},
                reserve_cloud_call=reserve_from_worker,
            )
    finally:
        await engine.dispose()
    assert (data, result, sent) == (None, "timeout", False)
