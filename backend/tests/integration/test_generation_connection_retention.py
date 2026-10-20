"""Фича 006, T045: соединение БД не удерживается во время вызова модели в рекомендациях и генерации сценариев.

Методика та же, что в `test_report_connection_retention.py` (T043): файловая SQLite с одним соединением в пуле
(`pooled_engine`), медленная модель замеряет `pool.checkedout()` в момент вызова. Если запрос держит соединение,
вызов модели видит `held=[1]`; если транзакция зафиксирована до вызова — `held=[0]`.

Каждый тест требует, чтобы подмена реально вызвалась (`calls` непусто): иначе проверка прошла бы вхолостую, когда
генератор уходит в шаблон без модели.

Гарды (зелёные до и после правки, нужны, чтобы правка не сломала жизненный цикл):
- сбой после вызова модели и откат не оставляют текст рекомендации «сохранённым», повтор заполняет его заново;
- черновик с pending-маркером `AIRequest` при сбое после модели остаётся повторяемым с тем же `requestId`.

T046 (политика pending-маркера): маркер несёт токен владельца `started_at`; сбой после модели снимает свой маркер
явно; маркер старше `PENDING_TTL_SEC` перехватывается повторным запросом; итоговая запись проверяет владение
(fence), поэтому опоздавший владелец не фиксирует результат. Все варианты движков (`default` — дефолтные транзакции
aiosqlite с SAVEPOINT, `transactional` — хуки BEGIN, как у PostgreSQL) должны проходить без 409 «ещё выполняется».
"""

from __future__ import annotations

import hashlib
import re
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy import event, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from app.api.deps import Viewer
from app.api.errors import ApiError
from app.config import get_settings
from app.db import session as db_session
from app.db.session import get_sessionmaker
from app.models.ai_scenario import AIRequest, SanitizedTicket, ScenarioVersion
from app.models.session import Attempt, Evaluation
from app.schemas.v1.ai import ScenarioDraftRequest
from app.seed.load import run_seed
from app.services import ai_scenario_service, recommendation_service, scenario_service
from app.services import reference as reference_service
from ml.generate import llm

TEACHER = Viewer("u-002", "teacher")
MODEL_DELAY_SEC = 0.3
POOL_TIMEOUT_SEC = 0.5
RECOMMENDATION_TEXT = "Повторите тему и потренируйте точное решение диспетчера."
DRAFT_SOURCE = "t045-retry-source"
ATTEMPT_IDS = [f"att-45{index}" for index in range(6)]


class SlowRecommendationModel:
    """Медленная модель для `recommendation_text`: отвечает текстом по каждому ключу из запроса."""

    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine
        self.calls: list[str] = []
        self.held: list[int] = []

    def __call__(
        self, purpose: str, system: str, user: str, schema: dict[str, Any], **kwargs: Any
    ) -> llm.LlmOutcome:
        self.calls.append(purpose)
        self.held.append(self.engine.pool.checkedout())
        time.sleep(MODEL_DELAY_SEC)
        keys = re.findall(r"key=([^;\n]+);", user)
        data = {"items": [{"key": key, "text": RECOMMENDATION_TEXT} for key in keys]}
        return llm.LlmOutcome(data, "local", "llamacpp:test", None, purpose, "local", len(system) + len(user))  # type: ignore[arg-type]


class SlowScenarioGateway:
    """Обёртка над настоящим шлюзом: замеряет соединения пула и засыпает перед генерацией сценария."""

    def __init__(self, engine: AsyncEngine, real: Any) -> None:
        self.engine = engine
        self.real = real
        self.calls: list[str] = []
        self.held: list[int] = []

    def generate_scenario(
        self, category: str, cards: Any, addresses: Any, *, count: int = 3, traps: Any = None
    ) -> Any:
        self.calls.append(category)
        self.held.append(self.engine.pool.checkedout())
        time.sleep(MODEL_DELAY_SEC)
        return self.real.generate_scenario(category, cards, addresses, count=count, traps=traps)


def _install_transactional_hooks(engine: AsyncEngine) -> None:
    """Транзакции SQLite как у PostgreSQL: рецепт SQLAlchemy для pysqlite/aiosqlite (SAVEPOINT внутри BEGIN).

    По умолчанию драйвер не открывает транзакцию до DML, и SAVEPOINT из `begin_nested()` становится внешним: его
    RELEASE фиксирует вставку даже после `rollback()`. Хуки устраняют это расхождение только в тестах.
    """

    @event.listens_for(engine.sync_engine, "connect")
    def _connect(dbapi_connection: Any, _record: Any) -> None:
        dbapi_connection.isolation_level = None

    @event.listens_for(engine.sync_engine, "begin")
    def _begin(connection: Any) -> None:
        connection.exec_driver_sql("BEGIN")


@asynccontextmanager
async def _seeded_pool(tmp_path, monkeypatch, *, transactional: bool) -> AsyncIterator[AsyncEngine]:
    """Файловая SQLite с одним соединением в пуле (как в T043); глобальный engine подменяется на время теста."""
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'pool.db'}",
        pool_size=1,
        max_overflow=0,
        pool_timeout=POOL_TIMEOUT_SEC,
    )
    if transactional:
        _install_transactional_hooks(engine)
    monkeypatch.setattr(db_session, "_engine", engine)
    monkeypatch.setattr(db_session, "_sessionmaker", async_sessionmaker(engine, expire_on_commit=False))
    reference_service.reset_cache()
    await run_seed(get_settings().seed_dir, reset=True)
    try:
        yield engine
    finally:
        await engine.dispose()
        reference_service.reset_cache()


@pytest_asyncio.fixture
async def pooled_engine(tmp_path, monkeypatch) -> AsyncIterator[AsyncEngine]:
    async with _seeded_pool(tmp_path, monkeypatch, transactional=False) as engine:
        yield engine


@pytest_asyncio.fixture
async def draft_pool(engine_kind: str, tmp_path, monkeypatch) -> AsyncIterator[AsyncEngine]:
    async with _seeded_pool(tmp_path, monkeypatch, transactional=engine_kind == "transactional") as engine:
        yield engine


async def _add_weak_history() -> None:
    """История ошибок u-006 (как `gas_history` в test_v1_recommendations): без неё рекомендаций нет."""
    async with get_sessionmaker()() as db:
        for index, attempt_id in enumerate(ATTEMPT_IDS):
            mode = "dds" if index % 2 else "operator112"
            db.add(
                Attempt(
                    id=attempt_id,
                    session_id="ses-t045",
                    card_id="c-093",
                    student_id="u-006",
                    mode=mode,
                    opened_at="2026-09-28T12:00:00+03:00",
                    primary_reaction_ms=40_000,
                    statuses=[],
                    services_called=[],
                    completed_at="2026-09-28T12:03:00+03:00",
                    full_processing_ms=180_000,
                    entered_text={},
                    calls=[],
                    seq=index,
                )
            )
            db.add(
                Evaluation(
                    attempt_id=attempt_id,
                    assessor_version="t045",
                    time_score=20,
                    correctness_score=20,
                    grammar_score=20,
                    semantic_score=20,
                    total_score=25,
                    grammar_errors=[],
                    errors=[{"type": "wrongType", "ruleId": "ekp-v046"}],
                    ai_comment="",
                    components={},
                    generated_at="2026-09-28T12:03:00+03:00",
                    mode=mode,
                )
            )
        await db.commit()


async def _seed_draft_source(source_ticket_id: str) -> None:
    text = "Сильный ветер повалил дерево на проезжую часть, пострадавших нет"
    async with get_sessionmaker()() as db:
        db.add(
            SanitizedTicket(
                source_ticket_id=source_ticket_id,
                situation_no=1,
                sanitized_text=text,
                pii_check="passed",
                reviewer_id="u-002",
                reviewed_at="2026-09-24T10:00:00+00:00",
                source_hash=hashlib.sha256(text.encode()).hexdigest(),
                approved=True,
            )
        )
        await db.commit()


async def test_recommendation_model_call_runs_without_holding_pool_connection(
    pooled_engine, ai_env, monkeypatch
):
    """Новые рекомендации: на вызове модели соединение пула не занято запросом, тексты сохраняются."""
    await _add_weak_history()
    model = SlowRecommendationModel(pooled_engine)
    monkeypatch.setattr(llm, "complete_json", model)

    async with get_sessionmaker()() as db:
        rows = await recommendation_service.generate(db, "u-006", 10, TEACHER)
        await db.commit()

    assert model.calls == ["recommendation_text"], "модель не вызвалась: сценарий ничего не проверяет"
    assert model.held == [0], f"соединение удерживалось во время вызова модели: {model.held}"
    assert rows and all(row["text"] == RECOMMENDATION_TEXT for row in rows)


async def test_recommendation_texts_are_requested_again_after_uncommitted_request(
    pooled_engine, ai_env, monkeypatch
):
    """Гард: если запрос упал после вызова модели и не дошёл до commit, повтор заново запрашивает тексты."""
    await _add_weak_history()
    model = SlowRecommendationModel(pooled_engine)
    monkeypatch.setattr(llm, "complete_json", model)

    async with get_sessionmaker()() as db:
        await recommendation_service.generate(db, "u-006", 10, TEACHER)
        await db.rollback()  # маршрут не дошёл до commit: тексты из этой транзакции потеряны

    async with get_sessionmaker()() as db:
        rows = await recommendation_service.generate(db, "u-006", 10, TEACHER)
        await db.commit()

    assert model.calls == ["recommendation_text", "recommendation_text"], (
        "после отката тексты должны быть запрошены заново"
    )
    assert rows and all(row["text"] == RECOMMENDATION_TEXT for row in rows)


async def test_scenario_generation_runs_without_holding_pool_connection(pooled_engine, ai_env, monkeypatch):
    """Генерация сценариев: соединение отпущено до вызова генератора; сценарии создаются с источником generated."""
    gateway = SlowScenarioGateway(pooled_engine, scenario_service.get_gateway())
    monkeypatch.setattr(scenario_service, "get_gateway", lambda: gateway)

    async with get_sessionmaker()() as db:
        saved = await scenario_service.generate_scenarios(
            db, {"category": "Дерево", "requestedBy": "u-002"}, TEACHER
        )
        await db.commit()

    assert gateway.calls == ["Дерево"], "генератор не вызвался: сценарий ничего не проверяет"
    assert gateway.held == [0], f"соединение удерживалось во время генерации: {gateway.held}"
    assert saved and all(item["source"] == "generated" for item in saved)


@pytest.mark.parametrize("engine_kind", ["default", "transactional"])
async def test_draft_retry_after_failure_after_model_is_not_blocked(
    engine_kind, draft_pool, ai_env, monkeypatch
):
    """Гард (T046): сбой после вызова модели откатывает pending-маркер AIRequest; повтор с тем же requestId проходит.

    Если бы соединение отпускалось до модели, маркер уже был бы зафиксирован, и повтор получил бы 409
    «ещё выполняется» навсегда.
    """
    await _seed_draft_source(DRAFT_SOURCE)
    body = ScenarioDraftRequest.model_validate(
        {
            "mode": "operator112",
            "sourceTicketId": DRAFT_SOURCE,
            "category": "Дерево",
            "count": 1,
            "generator": "template",
            "requestId": "t045-retry-request",
        }
    )
    model_stage_calls = 0
    original_generate = ai_scenario_service.generate_from_approved_source
    original_save = ai_scenario_service._save_draft

    def counted_generate(*args: Any, **kwargs: Any) -> Any:
        nonlocal model_stage_calls
        model_stage_calls += 1
        return original_generate(*args, **kwargs)

    async def broken_save(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("сохранение черновика упало после этапа генерации")

    monkeypatch.setattr(ai_scenario_service, "generate_from_approved_source", counted_generate)
    monkeypatch.setattr(ai_scenario_service, "_save_draft", broken_save)
    async with get_sessionmaker()() as db:
        with pytest.raises(RuntimeError):
            await ai_scenario_service.create_drafts(db, body, TEACHER)
        await db.rollback()
    assert model_stage_calls == 1, "сбой должен случиться после этапа генерации"

    monkeypatch.setattr(ai_scenario_service, "_save_draft", original_save)
    async with get_sessionmaker()() as db:
        result = await ai_scenario_service.create_drafts(db, body, TEACHER)
        await db.commit()

    assert len(result) == 1, "повтор после сбоя должен создать черновик, а не получить 409"
    async with get_sessionmaker()() as db:
        versions = (
            (
                await db.execute(
                    select(ScenarioVersion).where(ScenarioVersion.source_ticket_id == DRAFT_SOURCE)
                )
            )
            .scalars()
            .all()
        )
    assert len(versions) == 1


def _draft_body(request_id: str) -> ScenarioDraftRequest:
    return ScenarioDraftRequest.model_validate(
        {
            "mode": "operator112",
            "sourceTicketId": DRAFT_SOURCE,
            "category": "Дерево",
            "count": 1,
            "generator": "template",
            "requestId": request_id,
        }
    )


def _token_at(moment: datetime) -> str:
    return moment.isoformat(timespec="microseconds")


async def _seed_pending_marker(body: ScenarioDraftRequest, started_at: str | None) -> None:
    """Pending-маркер как после сбоя процесса: `response` пуст, метка владельца задана (None — строка до T046)."""
    async with get_sessionmaker()() as db:
        db.add(
            AIRequest(
                actor_id=TEACHER.user_id,
                operation="drafts",
                request_id=body.request_id,
                request_hash=ai_scenario_service._request_hash(body.model_dump(by_alias=True, mode="json")),
                response=None,
                started_at=started_at,
            )
        )
        await db.commit()


async def _marker_rows(request_id: str) -> list[AIRequest]:
    async with get_sessionmaker()() as db:
        return list(
            (await db.execute(select(AIRequest).where(AIRequest.request_id == request_id))).scalars().all()
        )


async def _versions_for(source_ticket_id: str) -> list[ScenarioVersion]:
    async with get_sessionmaker()() as db:
        rows = await db.execute(select(ScenarioVersion).where(ScenarioVersion.source_ticket_id == source_ticket_id))
        return list(rows.scalars().all())


@pytest.mark.parametrize("engine_kind", ["default", "transactional"])
async def test_failed_draft_leaves_no_pending_marker(engine_kind, draft_pool, ai_env, monkeypatch):
    """T046: сбой после модели снимает свой pending-маркер явно, не дожидаясь TTL — на обоих движках."""
    await _seed_draft_source(DRAFT_SOURCE)
    body = _draft_body("t046-marker-request")

    async def broken_save(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("сохранение черновика упало после этапа генерации")

    monkeypatch.setattr(ai_scenario_service, "_save_draft", broken_save)
    async with get_sessionmaker()() as db:
        with pytest.raises(RuntimeError):
            await ai_scenario_service.create_drafts(db, body, TEACHER)
    assert await _marker_rows(body.request_id) == [], "pending-маркер остался после сбоя: повтор получит 409"


@pytest.mark.parametrize("engine_kind", ["default", "transactional"])
@pytest.mark.parametrize("token", ["expired", "legacy"])
async def test_stale_pending_marker_is_reclaimed_and_completed(engine_kind, token, draft_pool, ai_env):
    """T046: брошенный маркер (старше TTL, либо без метки у строки до миграции 0010) перехватывается повтором."""
    await _seed_draft_source(DRAFT_SOURCE)
    body = _draft_body("t046-stale-request")
    stale = _token_at(datetime.now(UTC) - timedelta(seconds=ai_scenario_service.PENDING_TTL_SEC + 60))
    await _seed_pending_marker(body, stale if token == "expired" else None)

    async with get_sessionmaker()() as db:
        result = await ai_scenario_service.create_drafts(db, body, TEACHER)
        await db.commit()

    assert len(result) == 1, "брошенный маркер должен перехватываться, а не давать 409"
    rows = await _marker_rows(body.request_id)
    assert len(rows) == 1 and rows[0].response is not None
    assert rows[0].started_at is None, "завершённый запрос не должен оставлять метку владельца"


@pytest.mark.parametrize("engine_kind", ["default", "transactional"])
async def test_fresh_pending_marker_still_blocks_duplicate(engine_kind, draft_pool, ai_env):
    """Гард: свежий pending (повтор во время работы) по-прежнему даёт 409 и не запускает модель второй раз."""
    await _seed_draft_source(DRAFT_SOURCE)
    body = _draft_body("t046-fresh-request")
    await _seed_pending_marker(body, _token_at(datetime.now(UTC)))

    async with get_sessionmaker()() as db:
        with pytest.raises(ApiError) as caught:
            await ai_scenario_service.create_drafts(db, body, TEACHER)
    assert caught.value.status == 409
    assert "ещё выполняется" in caught.value.message


@pytest.mark.parametrize("engine_kind", ["default", "transactional"])
async def test_successful_retry_returns_the_same_drafts(engine_kind, draft_pool, ai_env):
    """Гард: повтор уже выполненного запроса отдаёт тот же результат и не создаёт вторую версию."""
    await _seed_draft_source(DRAFT_SOURCE)
    body = _draft_body("t046-idempotent-request")
    async with get_sessionmaker()() as db:
        first = await ai_scenario_service.create_drafts(db, body, TEACHER)
        await db.commit()
    async with get_sessionmaker()() as db:
        second = await ai_scenario_service.create_drafts(db, body, TEACHER)
        await db.commit()

    assert [item["scenarioId"] for item in second] == [item["scenarioId"] for item in first]
    assert len(await _versions_for(DRAFT_SOURCE)) == 1


@pytest.mark.parametrize("engine_kind", ["default", "transactional"])
async def test_owner_whose_marker_was_reclaimed_cannot_commit(engine_kind, draft_pool, ai_env, monkeypatch):
    """T046 (fence): пока владелец ждёт модель, другой запрос перехватил его маркер; итог владельца не фиксируется."""
    await _seed_draft_source(DRAFT_SOURCE)
    body = _draft_body("t046-fence-request")
    original_save = ai_scenario_service._save_draft

    async def reclaimed_then_save(db: Any, *args: Any, **kwargs: Any) -> Any:
        # Имитация перехвата: другой запрос переписал метку владельца в той же транзакции.
        await db.execute(
            update(AIRequest)
            .where(AIRequest.request_id == body.request_id)
            .values(started_at=_token_at(datetime.now(UTC) + timedelta(seconds=1)))
            .execution_options(synchronize_session=False)
        )
        return await original_save(db, *args, **kwargs)

    monkeypatch.setattr(ai_scenario_service, "_save_draft", reclaimed_then_save)
    async with get_sessionmaker()() as db:
        with pytest.raises(ApiError) as caught:
            await ai_scenario_service.create_drafts(db, body, TEACHER)
    assert caught.value.status == 409
    assert await _versions_for(DRAFT_SOURCE) == [], "опоздавший владелец не должен фиксировать черновик"
