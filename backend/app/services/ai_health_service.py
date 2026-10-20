"""Здоровье языковой модели (фича 006, data-model.md `ai_health`, FR-009/FR-015/FR-018): исходы вызовов и счётчики.

Как это связано с вызовом модели. `ml.generate.llm.complete_json` синхронный и работает в потоке (`asyncio.to_thread`,
`run_in_threadpool`), а сессия БД асинхронная и не переходит между потоками. Поэтому:

1. асинхронный вызывающий код открывает `llm_scope(db, viewer)`: читает действующие настройки и суточный расход облака
   (`ai_health.calls_today + probe_calls_today` за сегодня) и кладёт их в `LlmCallContext` (contextvar);
2. работа с моделью идёт в потоке; contextvars копируются в поток, и исходы складываются в список контекста;
3. на выходе из `llm_scope` исходы пишутся в `ai_health` и аудит в той же асинхронной сессии — в контексте вызова,
   от имени пользователя, чей запрос обратился к модели (так же, как раньше `flush_external_calls`, но без глобального
   списка событий). Коммит — на вызывающем.

Состояние для интерфейса: `ok` — ответил выбранный источник; `degraded` — облако выбрано, ответила локальная модель;
`down` — шаблон. Повторяющиеся сбои не плодят строк: одна строка id=1 и счётчик `errors_today`.
`calls_today` — обычные облачные запросы, `probe_calls_today` — проверки подключения; оба счётчика резервируют общий
суточный лимит FR-015 до отправки. Сутки — по локальной дате сервера, при смене даты счётчики обнуляются.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from typing import Literal

from sqlalchemy import case, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.models.ai_settings import AiHealth
from app.services import ai_settings_service, external_ai_audit
from ml.generate import llm

logger = logging.getLogger(__name__)

HEALTH_ROW_ID = 1
HealthState = Literal["ok", "degraded", "down"]


def _now(now: dt.datetime | None) -> dt.datetime:
    return now or dt.datetime.now(dt.UTC)


def _day(now: dt.datetime) -> dt.date:
    return now.astimezone().date()


def state(row: AiHealth | None) -> HealthState:
    if row is None or row.served_by_last is None:
        return "ok"
    if row.served_by_last == "template":
        return "down"
    if row.served_by_last != row.active_source:
        return "degraded"
    return "ok"


def calls_today(row: AiHealth | None, today: dt.date) -> int:
    """Суточный расход облака для лимитера (включая пробы); запись прошлого дня — ноль."""
    if row is None or row.day != today:
        return 0
    return (row.calls_today or 0) + (row.probe_calls_today or 0)


async def reserve_cloud_call(
    daily_limit: int,
    *,
    usage: Literal["request", "probe"] = "request",
    active_source: Literal["local", "cloud"] = "cloud",
    session_factory=None,
    now: dt.datetime | None = None,
) -> bool:
    """Атомарно резервирует суточную квоту перед сетевым вызовом, включая несколько процессов.

    Резервация коммитится в отдельной сессии до HTTP-запроса: таймаут ожидающего потока или перезапуск процесса
    не возвращают уже отправленный запрос в квоту. Неуспешный reserve не меняет счётчик.
    """
    if daily_limit < 1:
        return False
    if session_factory is None:
        from app.db.session import get_sessionmaker

        session_factory = get_sessionmaker()
    today = _day(_now(now))
    async with session_factory() as db:
        values = {
            "id": HEALTH_ROW_ID,
            "active_source": active_source,
            "errors_today": 0,
            "calls_today": 1 if usage == "request" else 0,
            "probe_calls_today": 1 if usage == "probe" else 0,
            "day": today,
        }
        dialect = db.get_bind().dialect.name
        if dialect == "sqlite":
            from sqlalchemy.dialects.sqlite import insert
        elif dialect == "postgresql":
            from sqlalchemy.dialects.postgresql import insert
        else:
            raise RuntimeError(f"ai_health quota reservation is unsupported for {dialect}")
        same_day = AiHealth.day == today
        statement = insert(AiHealth).values(**values).on_conflict_do_update(
            index_elements=["id"],
            set_={
                "active_source": active_source if usage == "request" else AiHealth.active_source,
                "day": today,
                "errors_today": case((same_day, AiHealth.errors_today), else_=0),
                "calls_today": case(
                    (same_day, AiHealth.calls_today + (1 if usage == "request" else 0)),
                    else_=1 if usage == "request" else 0,
                ),
                "probe_calls_today": case(
                    (same_day, AiHealth.probe_calls_today + (1 if usage == "probe" else 0)),
                    else_=1 if usage == "probe" else 0,
                ),
            },
            where=or_(AiHealth.day != today, AiHealth.calls_today + AiHealth.probe_calls_today < daily_limit),
        ).returning(AiHealth.id)
        result = await db.execute(statement)
        reserved = result.scalar_one_or_none() is not None
        if reserved:
            await db.commit()
        else:
            await db.rollback()
        return reserved


async def _ensure_row(db: AsyncSession, today: dt.date, active: str) -> AiHealth:
    """Строка id=1; первая запись создаёт её через INSERT … ON CONFLICT DO NOTHING (два воркера не столкнутся)."""
    row = await db.get(AiHealth, HEALTH_ROW_ID)
    if row is not None:
        return row
    values = {"id": HEALTH_ROW_ID, "active_source": active, "errors_today": 0, "calls_today": 0, "day": today}
    dialect = db.get_bind().dialect.name
    if dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    elif dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        row = AiHealth(**values)
        db.add(row)
        return row
    await db.execute(insert(AiHealth).values(**values).on_conflict_do_nothing(index_elements=["id"]))
    row = await db.get(AiHealth, HEALTH_ROW_ID, populate_existing=True)
    assert row is not None
    return row


async def record_outcomes(
    db: AsyncSession, outcomes: Sequence[llm.LlmOutcome], viewer: Viewer | None, *, now: dt.datetime | None = None
) -> int:
    """Пишет исходы в `ai_health` и (для попыток облака) в аудит; возвращает число исходов. Коммит — на вызывающем."""
    if not outcomes:
        return 0
    moment = _now(now)
    today = _day(moment)
    row = await _ensure_row(db, today, outcomes[0].active_source)
    errors = sum(1 for outcome in outcomes if outcome.reason is not None)
    # Cloud requests dispatched through llm_scope already consumed an atomic reservation before HTTP.
    sent = sum(1 for outcome in outcomes if outcome.cloud_sent and not outcome.cloud_reserved)
    # Счётчики обновляются от актуального значения БД. Запрос к модели держит свою строку ORM с
    # начала llm_scope, а reserve_cloud_call коммитит квоту в другой сессии; Python-проверка row.day
    # могла бы увидеть вчерашнюю дату и затереть уже зарезервированный сегодняшний вызов.
    same_day = AiHealth.day == today
    await db.execute(
        update(AiHealth)
        .where(AiHealth.id == HEALTH_ROW_ID)
        .values(
            day=today,
            errors_today=case((same_day, AiHealth.errors_today + errors), else_=errors),
            calls_today=case((same_day, AiHealth.calls_today + sent), else_=sent),
            probe_calls_today=case((same_day, AiHealth.probe_calls_today), else_=0),
        )
    )
    await db.refresh(row)
    for outcome in outcomes:
        row.active_source = outcome.active_source
        row.served_by_last = outcome.source
        if outcome.reason is None:
            row.last_ok_at = moment
        else:
            row.last_error_at = moment
            row.last_error_reason = outcome.reason
        if outcome.active_source == "cloud":
            await external_ai_audit.audit_outcome(db, viewer, outcome)
    await db.flush()
    await db.refresh(row, ["errors_today", "calls_today"])
    return len(outcomes)


async def read(db: AsyncSession) -> AiHealth | None:
    return await db.get(AiHealth, HEALTH_ROW_ID, populate_existing=True)


@asynccontextmanager
async def llm_scope(db: AsyncSession, viewer: Viewer | None, *, now: dt.datetime | None = None) -> AsyncIterator[llm.LlmCallContext]:
    """Контекст вызовов модели одного запроса; на выходе исходы записываются (см. docstring модуля)."""
    ai = await ai_settings_service.effective(db)
    row = await db.get(AiHealth, HEALTH_ROW_ID)
    ctx = llm.LlmCallContext(ai=ai, calls_today=calls_today(row, _day(_now(now))))

    async def reserve() -> bool:
        limit = ai_settings_service.get_settings().polza_daily_limit
        accepted = await reserve_cloud_call(limit, now=now)
        if accepted:
            ctx.calls_today += 1
            ctx.cloud_reservations += 1
        return accepted

    event_loop = asyncio.get_running_loop()

    def reserve_from_worker() -> bool:
        return asyncio.run_coroutine_threadsafe(reserve(), event_loop).result()

    ctx.reserve_cloud_call = reserve_from_worker
    try:
        with llm.bind_context(ctx):
            yield ctx
    except BaseException:
        try:
            await record_outcomes(db, ctx.outcomes, viewer, now=now)
        except Exception:  # noqa: BLE001 — не подменяем исходную ошибку запроса ошибкой учёта
            logger.warning("ai_health: исходы вызовов модели не записаны", exc_info=True)
        raise
    await record_outcomes(db, ctx.outcomes, viewer, now=now)
