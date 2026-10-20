"""Фича 006, T043: соединение БД не удерживается во время вызова модели (построение отчёта занятия).

Пул файловой SQLite ограничен одним соединением (`pool_size=1, max_overflow=0`) с коротким `pool_timeout`. Модель
подменена медленной синхронной заглушкой (как `complete_json` в потоке): она фиксирует, сколько соединений пула занято
в момент вызова, и отвечает с задержкой. Если запрос держит соединение на время ответа модели, параллельный читатель
не получает его и падает по таймауту пула; прямой замер `pool.checkedout()` показывает удержание без опоры на время.
"""

from __future__ import annotations

import asyncio
import threading
import time
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.pool import QueuePool

from app.api.compat import sessions as compat_sessions
from app.api.deps import Viewer
from app.config import get_settings
from app.db import session as db_session
from app.db.session import get_sessionmaker
from app.models.report import GroupReport, Report
from app.models.session import TrainingSession
from app.models.user import User
from app.schemas.error_map import ErrorMapStage, ErrorMapStageLevel, ErrorMapStudentRef, ErrorMapTypicalError
from app.seed.load import run_seed
from app.services import error_map_explain, report_builder, session_engine
from app.services import reference as reference_service
from ml.generate import llm

SESSION_ID = "ses-2026-09-16-01"  # единственное завершённое занятие сидов: три курсанта с попытками
TEACHER = Viewer("u-002", "teacher")
POOL_TIMEOUT_SEC = 0.5
MODEL_DELAY_SEC = 0.4
GOOD_COMMENT = "Курсанты уложились в нормативы, замечания по эталону единичные и некритичные."
GOOD_INSIGHT = "Половина группы допустила ошибку в адресе, стоит повторить адресные карточки."


class SlowModel:
    """Медленная модель: отвечает через `MODEL_DELAY_SEC` и запоминает занятость пула в момент каждого вызова."""

    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine
        self.calls: list[str] = []
        self.held: list[int] = []
        self.entered = threading.Event()

    def __call__(self, purpose: str, system: str, user: str, schema: dict[str, Any], **kwargs: Any) -> llm.LlmOutcome:
        self.calls.append(purpose)
        self.held.append(self.engine.pool.checkedout())
        self.entered.set()
        time.sleep(MODEL_DELAY_SEC)
        data: dict[str, Any] | None = None
        if purpose == "report_comment":
            data = {"text": GOOD_COMMENT}
        elif purpose == "report_group_insights":
            data = {"items": [GOOD_INSIGHT]}
        return llm.LlmOutcome(data, "local", "llamacpp:qwen", None, purpose, "local", len(system) + len(user))  # type: ignore[arg-type]


@pytest_asyncio.fixture
async def pooled_engine(tmp_path, monkeypatch) -> AsyncIterator[AsyncEngine]:
    """Файловая SQLite с одним соединением в пуле; глобальный engine подменяется только на время теста."""
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'pool.db'}",
        pool_size=1,
        max_overflow=0,
        pool_timeout=POOL_TIMEOUT_SEC,
    )
    monkeypatch.setattr(db_session, "_engine", engine)
    monkeypatch.setattr(db_session, "_sessionmaker", async_sessionmaker(engine, expire_on_commit=False))
    reference_service.reset_cache()
    await run_seed(get_settings().seed_dir, reset=True)
    assert isinstance(engine.pool, QueuePool) and engine.pool.size() == 1, "пул должен быть ограниченным очередью"
    yield engine
    await engine.dispose()
    reference_service.reset_cache()


@pytest.fixture
def slow_model(pooled_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch) -> SlowModel:
    model = SlowModel(pooled_engine)
    monkeypatch.setattr(llm, "complete_json", model)
    return model


async def _forget_session_reports() -> None:
    """Сбрасывает статические отчёты занятия, чтобы сборка выполнилась заново в файловой БД теста."""
    async with get_sessionmaker()() as db:
        await db.execute(delete(Report).where(Report.session_id == SESSION_ID))
        await db.execute(delete(GroupReport).where(GroupReport.session_id == SESSION_ID))
        await db.commit()


async def _report_count() -> int:
    async with get_sessionmaker()() as db:
        return int((await db.execute(select(func.count()).select_from(Report).where(Report.session_id == SESSION_ID))).scalar_one())


async def _session_state() -> str:
    async with get_sessionmaker()() as db:
        return str((await db.execute(select(TrainingSession.state).where(TrainingSession.id == SESSION_ID))).scalar_one())


async def test_model_call_runs_without_holding_pool_connection(pooled_engine, slow_model, ai_env):
    """Сборка при просмотре: на каждом вызове модели ни одно соединение пула не занято запросом."""
    await _forget_session_reports()
    async with get_sessionmaker()() as db:
        response = await report_builder.get_reports(db, TEACHER, SESSION_ID, None)
        await db.commit()

    assert slow_model.calls, "модель не вызывалась: сценарий ничего не проверяет"
    assert slow_model.held == [0] * len(slow_model.calls), f"соединение удерживалось во время вызова модели: {slow_model.held}"
    assert response["reports"], "отчёты занятия не собрались"


async def test_parallel_reader_is_served_while_model_is_answering(pooled_engine, slow_model, ai_env):
    """Пока модель отвечает на сборку, параллельный запрос получает соединение и не падает по таймауту пула."""
    await _forget_session_reports()

    async def build() -> dict[str, Any]:
        async with get_sessionmaker()() as db:
            response = await report_builder.get_reports(db, TEACHER, SESSION_ID, None)
            await db.commit()
            return response

    async def read_during_model_call() -> list[str]:
        await asyncio.to_thread(slow_model.entered.wait, 5)
        async with get_sessionmaker()() as db:
            user_ids = list((await db.execute(select(User.id).order_by(User.id))).scalars().all())
            await db.rollback()
        return user_ids

    build_result, reader_result = await asyncio.gather(build(), read_during_model_call(), return_exceptions=True)

    assert not isinstance(reader_result, BaseException), f"читатель не получил соединение во время ответа модели: {reader_result!r}"
    assert reader_result, "читатель не увидел пользователей"
    assert not isinstance(build_result, BaseException), f"сборка упала: {build_result!r}"
    built = len(build_result["reports"])
    assert built and await _report_count() == built, "дубликаты или потерянные отчёты после параллельного запроса"


async def test_rebuild_after_parallel_request_does_not_call_model_again(pooled_engine, slow_model, ai_env):
    """Идемпотентность: повторный просмотр уже собранного занятия не строит отчёты и не вызывает модель."""
    await _forget_session_reports()
    async with get_sessionmaker()() as db:
        first = await report_builder.get_reports(db, TEACHER, SESSION_ID, None)
        await db.commit()
    calls_after_first = len(slow_model.calls)

    async with get_sessionmaker()() as db:
        second = await report_builder.get_reports(db, TEACHER, SESSION_ID, None)
        await db.commit()

    assert len(slow_model.calls) == calls_after_first, "повторный просмотр вызвал модель"
    assert len(second["reports"]) == len(first["reports"]) == await _report_count()


async def test_report_action_stores_state_together_with_reports(pooled_engine, slow_model, ai_env):
    """Управление «отчёт»: состояние `reported` и отчёты фиксируются вместе, модель вызвана без соединения."""
    await _forget_session_reports()
    async with get_sessionmaker()() as db:
        await session_engine.post_control(db, SESSION_ID, {"action": "report"}, compat_sessions._report_builder(TEACHER))
        await db.commit()

    assert await _session_state() == "reported"
    assert await _report_count() > 0
    assert slow_model.calls and slow_model.held == [0] * len(slow_model.calls)


async def test_failed_report_build_after_model_call_keeps_session_state(pooled_engine, slow_model, ai_env, monkeypatch):
    """Сбой сборки после вызова модели не оставляет занятие в `reported`: состояние не уходит в коммит раньше отчётов."""
    await _forget_session_reports()

    def broken_group_report(*args, **kwargs):
        raise RuntimeError("сборка группового отчёта упала")

    monkeypatch.setattr(report_builder, "build_group_report", broken_group_report)
    async with get_sessionmaker()() as db:
        with pytest.raises(RuntimeError):
            await session_engine.post_control(db, SESSION_ID, {"action": "report"}, compat_sessions._report_builder(TEACHER))
        await db.rollback()

    assert slow_model.calls, "сбой должен случиться после вызова модели, иначе сценарий не проверяет фиксацию"
    assert await _session_state() == "finished"
    assert await _report_count() == 0


async def test_error_map_explanation_releases_connection_before_model(pooled_engine, ai_env, monkeypatch):
    """Разбор этапа карты ошибок (GET): соединение отпущено до ответа модели; текст шлюза попадает в ответ."""
    held: list[int] = []
    answer = "Чаще всего не заполняют первичный статус. Стоит повторить этап."

    class SlowGateway:
        def explain_stage(self, mode, stage, errors, context):
            held.append(pooled_engine.pool.checkedout())
            time.sleep(MODEL_DELAY_SEC)
            return answer

    monkeypatch.setattr(error_map_explain, "get_gateway", lambda: SlowGateway())
    stage = ErrorMapStage(id="statuses", order=7, title="Статусы реагирования")
    level = ErrorMapStageLevel(stage_id="statuses", attempts=10, attempts_with_error=5, share=0.5, level="often", affected_students=4)
    typical = [
        ErrorMapTypicalError(
            rule_id="v1",
            plain_text="Нет первичного статуса",
            severity="critical",
            student_count=1,
            students=[ErrorMapStudentRef(id="u-1", name="Студент 1")],
        )
    ]
    async with get_sessionmaker()() as db:
        explanation = await error_map_explain.build_explanation(
            db, TEACHER, group_id="G-EXPL", student_id="", mode="dds", stage=stage, level=level, typical_errors=typical, subject="group"
        )
        await db.commit()

    assert held == [0], f"соединение удерживалось во время ответа модели: {held}"
    assert explanation is not None and explanation.text == answer
