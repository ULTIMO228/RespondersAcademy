"""Прохождение опубликованной версии сценария обучающимся на детерминированном движке."""

from __future__ import annotations

import secrets
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import conflict, forbidden, not_found, validation_failed
from app.api.v1.ai_access import require_scenario_access
from app.models.ai_scenario import ScenarioRunRecord, ScenarioVersion
from app.models.assignment import Assignment, AssignmentScenarioVersion, AssignmentStudent
from app.scenario_runtime import (
    EngineError,
    Graph,
    InvalidActionError,
    InvalidChoiceError,
    LoopLimitError,
    RunFinishedError,
    ScenarioEngine,
    ScenarioRun,
)
from app.schemas.v1.ai import ScenarioRunActionRequest
from app.services.ai_scenario_service import checked_graph
from app.services.audit import record
from app.services.time import now_iso


def _scalars(fields: dict[str, Any], prefix: str = "", depth: int = 0) -> dict[str, Any]:
    """Скалярные поля карточки; вложенные объекты разворачиваются в ключи `caller.status` (до 3 уровней)."""
    found: dict[str, Any] = {}
    for key, value in fields.items():
        if not isinstance(key, str) or not key:
            continue
        name = f"{prefix}{key}"
        if isinstance(value, dict) and depth < 2:
            found.update(_scalars(value, f"{name}.", depth + 1))
        elif isinstance(value, (str, int, float, bool)):
            found[name] = value
    return found


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


async def _published(
    db: AsyncSession, scenario_id: str, version_number: int, viewer: Viewer, *, active_only: bool = True
) -> tuple[ScenarioVersion, Graph]:
    # Обучающийся получает только утверждённую версию своего задания (существующее правило доступа).
    await require_scenario_access(db, scenario_id, viewer, version=version_number)
    if active_only and not await _has_active_assignment(db, scenario_id, version_number, viewer.user_id):
        raise forbidden("Задание с этой версией сценария завершено")
    version = await db.get(ScenarioVersion, (scenario_id, version_number))
    if version is None or not version.available_for_training:
        raise not_found("Опубликованная версия не найдена")
    if version.graph is None:
        raise conflict("Версия не содержит графа сценария")
    return version, checked_graph(version.graph)


async def _has_active_assignment(db: AsyncSession, scenario_id: str, version_number: int, student_id: str) -> bool:
    found = await db.scalar(
        select(Assignment.id)
        .join(AssignmentScenarioVersion, AssignmentScenarioVersion.assignment_id == Assignment.id)
        .join(AssignmentStudent, AssignmentStudent.assignment_id == Assignment.id)
        .where(
            Assignment.state == "active",
            AssignmentScenarioVersion.scenario_id == scenario_id,
            AssignmentScenarioVersion.version == version_number,
            AssignmentStudent.student_id == student_id,
        )
        .limit(1)
    )
    return found is not None


async def _active_run(db: AsyncSession, scenario_id: str, version_number: int, student_id: str) -> ScenarioRunRecord | None:
    return (
        await db.execute(
            select(ScenarioRunRecord)
            .where(
                ScenarioRunRecord.scenario_id == scenario_id,
                ScenarioRunRecord.version == version_number,
                ScenarioRunRecord.student_id == student_id,
                ScenarioRunRecord.status == "waiting",
            )
            .order_by(ScenarioRunRecord.created_at.desc(), ScenarioRunRecord.id)
            .limit(1)
        )
    ).scalar_one_or_none()


async def start_run(
    db: AsyncSession, scenario_id: str, version_number: int, viewer: Viewer
) -> tuple[dict[str, Any], bool]:
    """Старт прогона; незавершённый прогон той же версии возвращается повторно (двойной клик, повтор запроса)."""
    if viewer.role != "student":
        raise forbidden("Сценарии проходит обучающийся")
    version, graph = await _published(db, scenario_id, version_number, viewer)
    existing = await _active_run(db, scenario_id, version_number, viewer.user_id)
    if existing is not None:
        return _view(existing, ScenarioRun.from_dict(graph, existing.snapshot), staff=False), False
    engine = ScenarioEngine(graph)
    try:
        run = engine.start(_scalars(dict(version.card_snapshot.get("fields") or {})))
    except LoopLimitError:
        raise conflict("Сценарий остановлен защитой от зацикливания") from None
    except ValueError as error:
        raise conflict(f"Карточка сценария не подходит для запуска: {error}") from None
    now = now_iso()
    row = ScenarioRunRecord(
        id=f"run-{secrets.token_hex(8)}", scenario_id=scenario_id, version=version_number,
        student_id=viewer.user_id, status=run.status, snapshot=run.to_dict(), created_at=now, updated_at=now,
    )
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        # Параллельный старт успел раньше: отдаём его прогон (уникальный индекс на активный прогон).
        existing = await _active_run(db, scenario_id, version_number, viewer.user_id)
        if existing is None:
            raise conflict("Не удалось создать прогон; повторите запрос") from None
        return _view(existing, ScenarioRun.from_dict(graph, existing.snapshot), staff=False), False
    await record(db, action="ai.scenario.run.start", user_id=viewer.user_id, role=viewer.role,
                 details=f"Старт прогона {row.id}: {scenario_id} v{version_number}")
    return _view(row, run, staff=False), True


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


async def _save(db: AsyncSession, row: ScenarioRunRecord, run: ScenarioRun) -> None:
    """Запись с условием по ревизии: параллельное изменение не перезаписывается молча, а даёт 409."""
    snapshot, revision = run.to_dict(), row.revision
    result = await db.execute(
        update(ScenarioRunRecord)
        .where(ScenarioRunRecord.id == row.id, ScenarioRunRecord.revision == revision)
        .values(snapshot=snapshot, status=run.status, updated_at=now_iso(), revision=revision + 1)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise conflict("Прогон изменён параллельным запросом; обновите состояние и повторите")


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
    if body.expected_steps != run.steps:
        raise conflict("Состояние прогона изменилось; обновите его и повторите действие")
    try:
        engine.perform(run, body.action, choice=body.choice)
    except InvalidActionError:
        # Ожидаемое действие не раскрываем: это ответ обучающегося.
        raise conflict("Действие не соответствует текущему шагу сценария") from None
    except InvalidChoiceError as error:
        raise validation_failed(str(error)) from None
    except RunFinishedError as error:
        raise conflict(str(error)) from None
    except ValueError as error:
        raise validation_failed(str(error)) from None
    except LoopLimitError:
        pass  # прогон помечен faulted и сохраняется ниже
    except EngineError as error:  # pragma: no cover - защитная ветка
        raise conflict(str(error)) from None
    await _save(db, row, run)
    return _view(row, run, staff=False)


async def finish_run(db: AsyncSession, run_id: str, viewer: Viewer) -> dict[str, Any]:
    row, staff = await _load(db, run_id, viewer)
    if staff or viewer.role != "student":
        raise forbidden("Прогон завершает обучающийся")
    _, graph = await _published(db, row.scenario_id, row.version, viewer, active_only=False)
    engine, run = _restore(row, graph)
    if run.status == "aborted" and run.outcome == "abandoned":
        return _view(row, run, staff=False)  # повторное завершение обучающимся идемпотентно
    try:
        engine.finish(run, outcome="abandoned")
    except RunFinishedError as error:
        raise conflict(str(error)) from None
    await _save(db, row, run)
    await record(db, action="ai.scenario.run.finish", user_id=viewer.user_id, role=viewer.role,
                 details=f"Прогон {row.id} завершён обучающимся")
    return _view(row, run, staff=False)
