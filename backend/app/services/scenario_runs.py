"""Прохождение опубликованной версии сценария обучающимся на детерминированном движке."""

from __future__ import annotations

import secrets
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import Viewer
from app.api.errors import conflict, forbidden, not_found, validation_failed
from app.api.v1.ai_access import require_scenario_access
from app.models.ai_scenario import ScenarioRunRecord, ScenarioVersion
from app.scenario_runtime import (
    EngineError,
    Graph,
    InvalidActionError,
    LoopLimitError,
    RunFinishedError,
    ScenarioEngine,
    ScenarioRun,
)
from app.schemas.v1.ai import ScenarioRunActionRequest
from app.services.ai_scenario_service import checked_graph
from app.services.audit import record
from app.services.time import now_iso


def _scalars(fields: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in fields.items() if isinstance(value, (str, int, float, bool)) and key}


def _view(record_: ScenarioRunRecord, run: ScenarioRun, *, staff: bool) -> dict[str, Any]:
    view: dict[str, Any] = {
        "runId": record_.id,
        "scenarioId": record_.scenario_id,
        "version": record_.version,
        "studentId": record_.student_id,
        "status": run.status,
        "outcome": run.outcome,
        "steps": run.steps,
    }
    if staff:
        view["facts"] = dict(run.facts)
        view["events"] = [{"seq": e.seq, "kind": e.kind, "node": e.node, "data": e.data} for e in run.events]
    return view


async def _published(db: AsyncSession, scenario_id: str, version_number: int, viewer: Viewer) -> tuple[ScenarioVersion, Graph]:
    # Обучающийся получает только утверждённую версию своего задания (существующее правило доступа).
    await require_scenario_access(db, scenario_id, viewer, version=version_number)
    version = await db.get(ScenarioVersion, (scenario_id, version_number))
    if version is None or not version.available_for_training:
        raise not_found("Опубликованная версия не найдена")
    if version.graph is None:
        raise conflict("Версия не содержит графа сценария")
    return version, checked_graph(version.graph)


async def start_run(db: AsyncSession, scenario_id: str, version_number: int, viewer: Viewer) -> dict[str, Any]:
    if viewer.role != "student":
        raise forbidden("Сценарии проходит обучающийся")
    version, graph = await _published(db, scenario_id, version_number, viewer)
    engine = ScenarioEngine(graph)
    try:
        run = engine.start(_scalars(dict(version.card_snapshot.get("fields") or {})))
    except LoopLimitError:
        raise conflict("Сценарий остановлен защитой от зацикливания") from None
    now = now_iso()
    row = ScenarioRunRecord(
        id=f"run-{secrets.token_hex(8)}", scenario_id=scenario_id, version=version_number,
        student_id=viewer.user_id, status=run.status, snapshot=run.to_dict(), created_at=now, updated_at=now,
    )
    db.add(row)
    await db.flush()
    await record(db, action="ai.scenario.run.start", user_id=viewer.user_id, role=viewer.role,
                 details=f"Старт прогона {row.id}: {scenario_id} v{version_number}")
    return _view(row, run, staff=False)


async def _load(db: AsyncSession, run_id: str, viewer: Viewer) -> tuple[ScenarioRunRecord, bool]:
    row = await db.get(ScenarioRunRecord, run_id)
    if row is None:
        raise not_found(f"Прогон «{run_id}» не найден")
    if viewer.role == "admin":
        return row, True
    if viewer.role == "student" and row.student_id == viewer.user_id:
        return row, False
    if viewer.role == "teacher":
        version = await db.get(ScenarioVersion, (row.scenario_id, row.version))
        if version is not None and version.created_by == viewer.user_id:
            return row, True
    raise forbidden("Нет доступа к прогону")


def _restore(row: ScenarioRunRecord, graph: Graph) -> tuple[ScenarioEngine, ScenarioRun]:
    return ScenarioEngine(graph), ScenarioRun.from_dict(graph, row.snapshot)


def _save(row: ScenarioRunRecord, run: ScenarioRun) -> None:
    row.snapshot, row.status, row.updated_at = run.to_dict(), run.status, now_iso()
    flag_modified(row, "snapshot")


async def read_run(db: AsyncSession, run_id: str, viewer: Viewer) -> dict[str, Any]:
    row, staff = await _load(db, run_id, viewer)
    version = await db.get(ScenarioVersion, (row.scenario_id, row.version))
    if version is None or version.graph is None:
        raise not_found("Версия прогона не найдена")
    _, run = _restore(row, checked_graph(version.graph))
    return _view(row, run, staff=staff)


async def perform_action(db: AsyncSession, run_id: str, body: ScenarioRunActionRequest, viewer: Viewer) -> dict[str, Any]:
    row, staff = await _load(db, run_id, viewer)
    if staff or viewer.role != "student":
        raise forbidden("Действия выполняет обучающийся")
    _, graph = await _published(db, row.scenario_id, row.version, viewer)
    engine, run = _restore(row, graph)
    try:
        engine.perform(run, body.action, set_facts=body.facts)
    except InvalidActionError:
        # Ожидаемое действие не раскрываем: это ответ обучающегося.
        raise conflict("Действие не соответствует текущему шагу сценария") from None
    except RunFinishedError as error:
        raise conflict(str(error)) from None
    except ValueError as error:
        raise validation_failed(str(error)) from None
    except LoopLimitError:
        pass  # прогон помечен faulted и сохраняется ниже
    except EngineError as error:  # pragma: no cover - защитная ветка
        raise conflict(str(error)) from None
    _save(row, run)
    await db.flush()
    return _view(row, run, staff=False)


async def finish_run(db: AsyncSession, run_id: str, viewer: Viewer) -> dict[str, Any]:
    row, staff = await _load(db, run_id, viewer)
    if staff or viewer.role != "student":
        raise forbidden("Прогон завершает обучающийся")
    _, graph = await _published(db, row.scenario_id, row.version, viewer)
    engine, run = _restore(row, graph)
    try:
        engine.finish(run, outcome="abandoned")
    except RunFinishedError as error:
        raise conflict(str(error)) from None
    _save(row, run)
    await db.flush()
    await record(db, action="ai.scenario.run.finish", user_id=viewer.user_id, role=viewer.role,
                 details=f"Прогон {row.id} завершён обучающимся")
    return _view(row, run, staff=False)
