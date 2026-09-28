"""Занятия: контракт Session из БД, создание/старт/стоп, план выдачи, лента, управление, проекция.

Порт src/shared/api/mock/{sessions,session-plan,session-control,session-state}.ts и entities/session/model/{feed,projection}.ts.
"""

from __future__ import annotations

import copy
import math
from collections.abc import Callable, Coroutine
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, resolve_student_scope
from app.api.errors import forbidden, invalid_transition, not_found, validation_failed
from app.db.ids import PREFIX, next_id
from app.models.card import IncidentCard
from app.models.classifier import ClassifierEntry
from app.models.reference import ReferenceEntry
from app.models.scenario import Scenario
from app.models.session import Attempt, Evaluation, TeacherOverride, TrainingSession
from app.models.teacher import ProfileMappingRow
from app.models.user import User
from app.services.time import is_iso, ms_to_iso, now_iso, parse_iso_ms

SESSION_STATES = ("draft", "configured", "running", "finished", "reported")
SESSION_TRANSITIONS = {"draft": ("configured",), "configured": ("running",), "running": ("finished",), "finished": ("reported",), "reported": ()}
MODES = ("demo", "follow", "practice")
CARD_SOURCES = ("generated", "studentCreated", "mixed")
ISSUE_ORDERS = ("manual", "adaptive")
CONTROL_ACTIONS = ("pause", "resume", "issue", "report")
DEFAULT_ISSUE_INTERVAL_MS = 180_000
CONVEYOR_HORIZON_MS = 60 * 60 * 1000
ADAPTIVE_HISTORY = 3
ADAPTIVE_STRONG_SCORE = 80
ADAPTIVE_WEAK_SCORE = 60
ADAPTIVE_SLOWDOWN = 1.5
PLAN_REACTION_NORM_SEC = 30
PLAN_PROCESSING_NORM_SEC = 180
DEFAULT_SESSION_PLAN: dict[str, Any] = {
    "categories": [],
    "issueOrder": "adaptive",
    "hints": False,
    "timeNorms": {"primaryReactionSec": PLAN_REACTION_NORM_SEC, "fullProcessingSec": PLAN_PROCESSING_NORM_SEC},
    "maxGrammarErrors": 0,
    "paceSec": PLAN_PROCESSING_NORM_SEC,
    "conveyor": False,
}
KIND_ORDER = {"cardIssued": 0, "cardOpened": 1, "statusChanged": 2, "cardCompleted": 3, "aiEvaluation": 4}
FOREIGN_SESSION_MESSAGE = "Занятие ведёт другой преподаватель — мониторинг недоступен"
NOT_IN_SESSION_MESSAGE = "Вы не участвуете в этом занятии"

ReportBuilder = Callable[[AsyncSession, str], Coroutine[Any, Any, None]]


# ─── Загрузка контракта ───────────────────────────────────────────────────────────────────────────


async def evaluation_contract(db: AsyncSession, attempt_id: str) -> dict[str, Any] | None:
    from sqlalchemy import desc

    from app.models.ai_assessment import EvaluationRevision

    latest_rev = (
        await db.execute(
            select(EvaluationRevision)
            .where(EvaluationRevision.attempt_id == attempt_id)
            .order_by(desc(EvaluationRevision.revision))
            .limit(1)
        )
    ).scalar_one_or_none()

    if latest_rev is not None and latest_rev.status in ("pending", "review_required"):
        # По контракту v1: готовый Evaluation отдается только при preliminary|final
        return None

    evaluation = await db.get(Evaluation, attempt_id)
    if evaluation is None:
        return None
    override = (await db.execute(select(TeacherOverride).where(TeacherOverride.attempt_id == attempt_id).order_by(TeacherOverride.id.desc()))).scalars().first()
    data = evaluation.to_contract(override.to_contract() if override else None)
    if latest_rev is not None:
        data["revision"] = latest_rev.revision
        data["status"] = latest_rev.status
    return data


async def evaluations_for_attempts(db: AsyncSession, attempt_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Load a session's evaluations in three queries instead of three per attempt."""
    from app.models.ai_assessment import EvaluationRevision

    if not attempt_ids:
        return {}
    revisions = (
        await db.execute(
            select(EvaluationRevision)
            .where(EvaluationRevision.attempt_id.in_(attempt_ids))
            .order_by(EvaluationRevision.attempt_id, EvaluationRevision.revision.desc())
        )
    ).scalars().all()
    latest = {}
    for revision in revisions:
        latest.setdefault(revision.attempt_id, revision)
    evaluations = (
        await db.execute(select(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
    ).scalars().all()
    overrides = (
        await db.execute(
            select(TeacherOverride)
            .where(TeacherOverride.attempt_id.in_(attempt_ids))
            .order_by(TeacherOverride.attempt_id, TeacherOverride.id.desc())
        )
    ).scalars().all()
    newest_override = {}
    for override in overrides:
        newest_override.setdefault(override.attempt_id, override)
    result = {}
    for evaluation in evaluations:
        revision = latest.get(evaluation.attempt_id)
        if revision is not None and revision.status in ("pending", "review_required"):
            continue
        override = newest_override.get(evaluation.attempt_id)
        data = evaluation.to_contract(override.to_contract() if override else None)
        if revision is not None:
            data["revision"] = revision.revision
            data["status"] = revision.status
        result[evaluation.attempt_id] = data
    return result


async def attempts_of(db: AsyncSession, session_id: str) -> list[Attempt]:
    return list((await db.execute(select(Attempt).where(Attempt.session_id == session_id).order_by(Attempt.seq, Attempt.id))).scalars().all())


async def session_contract(db: AsyncSession, row: TrainingSession) -> dict[str, Any]:
    attempts = await attempts_of(db, row.id)
    evaluations = await evaluations_for_attempts(db, [attempt.id for attempt in attempts])
    events = [attempt.to_contract(evaluations.get(attempt.id)) for attempt in attempts]
    return {
        "id": row.id,
        "teacherId": row.teacher_id,
        "studentIds": list(row.student_ids or []),
        "scenarioIds": list(row.scenario_ids or []),
        "mode": row.mode,
        "cardSource": row.card_source,
        "cardFlow": copy.deepcopy(row.card_flow or []),
        "state": row.state,
        "startedAt": row.started_at,
        "finishedAt": row.finished_at,
        "cardEvents": events,
    }


async def require_session_row(db: AsyncSession, session_id: str) -> TrainingSession:
    row = await db.get(TrainingSession, session_id)
    if row is None:
        raise not_found(f"Занятие «{session_id}» не найдено")
    return row


async def list_session_rows(db: AsyncSession) -> list[TrainingSession]:
    return list((await db.execute(select(TrainingSession).order_by(TrainingSession.id))).scalars().all())


def project_for_student(session: dict[str, Any], student_id: str) -> dict[str, Any]:
    return {
        **session,
        "studentIds": [student_id],
        "cardFlow": [item for item in session["cardFlow"] if item.get("studentId") == student_id],
        "cardEvents": [event for event in session["cardEvents"] if event.get("studentId") == student_id],
    }


# ─── Список ───────────────────────────────────────────────────────────────────────────────────────


async def list_sessions(db: AsyncSession, viewer: Viewer | None, teacher_id: str | None, student_id: str | None, state: str | None) -> list[dict[str, Any]]:
    student_scope = resolve_student_scope(viewer, student_id)
    if state is not None and state not in SESSION_STATES:
        raise validation_failed(f"Некорректное состояние занятия: {state}")
    result = []
    for row in await list_session_rows(db):
        if teacher_id and row.teacher_id != teacher_id:
            continue
        if student_scope and student_scope not in (row.student_ids or []):
            continue
        if state and row.state != state:
            continue
        session = await session_contract(db, row)
        if viewer is not None and viewer.is_student:
            session = project_for_student(session, viewer.user_id)
        result.append(session)
    return result


# ─── Создание по мастеру ──────────────────────────────────────────────────────────────────────────


def _is_string_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _is_time_norms(value: Any) -> bool:
    return isinstance(value, dict) and all(isinstance(value.get(k), (int, float)) and not isinstance(value.get(k), bool) and value.get(k) > 0 for k in ("primaryReactionSec", "fullProcessingSec"))


def read_plan(plan: Any) -> dict[str, Any] | None:
    if plan is None:
        return None
    valid = (
        isinstance(plan, dict)
        and _is_string_list(plan.get("categories"))
        and plan.get("issueOrder") in ISSUE_ORDERS
        and isinstance(plan.get("hints"), bool)
        and _is_time_norms(plan.get("timeNorms"))
        and isinstance(plan.get("maxGrammarErrors"), (int, float))
        and not isinstance(plan.get("maxGrammarErrors"), bool)
        and plan.get("maxGrammarErrors") >= 0
        and isinstance(plan.get("paceSec"), (int, float))
        and not isinstance(plan.get("paceSec"), bool)
        and plan.get("paceSec") > 0
        and isinstance(plan.get("conveyor"), bool)
    )
    if not valid:
        raise validation_failed("Некорректные настройки занятия (plan)")
    if "adaptive" in plan and not isinstance(plan["adaptive"], bool):
        raise validation_failed("Некорректное значение adaptive в настройках занятия")
    if "workMessagesEnabled" in plan and not isinstance(plan["workMessagesEnabled"], bool):
        raise validation_failed("Некорректное значение workMessagesEnabled")
    result = {k: plan[k] for k in ("categories", "issueOrder", "hints", "timeNorms", "maxGrammarErrors", "paceSec", "conveyor")}
    if "adaptive" in plan:
        result["adaptive"] = plan["adaptive"]
    for key in ("workMessagesEnabled", "workMessageIntervalsSec", "workMessageIntervalsByGroup"):
        if key in plan:
            result[key] = plan[key]
    return result


async def create_session(db: AsyncSession, body: dict[str, Any]) -> dict[str, Any]:
    teacher_id = body.get("teacherId")
    teacher = await db.get(User, teacher_id) if isinstance(teacher_id, str) else None
    if teacher is None or teacher.role != "teacher":
        raise validation_failed("Преподаватель занятия не найден")
    student_ids = body.get("studentIds")
    if not _is_string_list(student_ids) or not student_ids:
        raise validation_failed("Выберите курсантов занятия")
    for sid in student_ids:
        user = await db.get(User, sid)
        if user is None or user.role != "student":
            raise validation_failed(f"Курсант «{sid}» не найден")
    scenario_ids = body.get("scenarioIds")
    if not _is_string_list(scenario_ids) or not scenario_ids:
        raise validation_failed("Выберите сценарии занятия")
    for scenario_id in scenario_ids:
        scenario = await db.get(Scenario, scenario_id)
        if scenario is None or scenario.deleted:
            raise validation_failed(f"Сценарий «{scenario_id}» не найден")
        if scenario.validation_status != "approved":
            raise validation_failed(f"Сценарий «{scenario_id}» не утверждён и недоступен для занятий")
    if body.get("mode") not in MODES:
        raise validation_failed("Выберите режим занятия")
    if body.get("cardSource") not in CARD_SOURCES:
        raise validation_failed("Выберите категорию вопросов")
    card_flow = body.get("cardFlow")
    flow: list[dict[str, Any]] = []
    if card_flow is not None:
        card_ids = {row for row in (await db.execute(select(IncidentCard.id))).scalars().all()}
        ok = isinstance(card_flow, list) and all(
            isinstance(item, dict)
            and item.get("cardId") in card_ids
            and item.get("studentId") in student_ids
            and is_iso(item.get("issuedAt"))
            and isinstance(item.get("level"), (int, float))
            and not isinstance(item.get("level"), bool)
            for item in card_flow
        )
        if not ok:
            raise validation_failed("Некорректное расписание выдачи карточек (cardFlow)")
        flow = [{"cardId": i["cardId"], "studentId": i["studentId"], "issuedAt": i["issuedAt"], "level": i["level"]} for i in card_flow]
    plan = read_plan(body.get("plan"))
    row = TrainingSession(
        id=await next_id(db, PREFIX["session"], TrainingSession.id),
        teacher_id=teacher_id,
        student_ids=list(student_ids),
        scenario_ids=list(scenario_ids),
        mode=body["mode"],
        card_source=body["cardSource"],
        card_flow=flow,
        state="configured",
        started_at=now_iso(),
        finished_at=None,
        plan=plan,
        paused_at=None,
        parked=[],
        training_mode=body.get("trainingMode") if body.get("trainingMode") in ("dds", "operator112", "chain") else "dds",
        format=body.get("format") if body.get("format") in ("training", "exam") else "training",
        exam=body.get("exam") if isinstance(body.get("exam"), dict) else None,
    )
    db.add(row)
    await db.flush()
    return await session_contract(db, row)


# ─── Состояния ────────────────────────────────────────────────────────────────────────────────────


def assert_transition(row: TrainingSession, target: str) -> None:
    if target not in SESSION_TRANSITIONS.get(row.state, ()):
        raise invalid_transition(f"Переход занятия из «{row.state}» в «{target}» недопустим")


# ─── План выдачи ──────────────────────────────────────────────────────────────────────────────────


def _norm(value: str) -> str:
    return value.strip().lower()


async def _scenario_docs(db: AsyncSession, scenario_ids: list[str]) -> list[dict[str, Any]]:
    docs = []
    for scenario_id in scenario_ids:
        row = await db.get(Scenario, scenario_id)
        if row is not None and not row.deleted:
            docs.append(row.to_contract())
    return docs


async def build_default_card_flow(db: AsyncSession, row: TrainingSession, started_at: str) -> list[dict[str, Any]]:
    start_ms = parse_iso_ms(started_at)
    queue = [(card_id, doc.get("difficulty", 1)) for doc in await _scenario_docs(db, row.scenario_ids or []) for card_id in doc.get("cardIds", [])]
    flow = []
    for student_id in row.student_ids or []:
        for index, (card_id, level) in enumerate(queue):
            flow.append({"cardId": card_id, "studentId": student_id, "issuedAt": ms_to_iso(start_ms + index * DEFAULT_ISSUE_INTERVAL_MS), "level": level})
    return flow


async def _card_groups(db: AsyncSession) -> dict[str, str]:
    rows = (await db.execute(select(IncidentCard.id, IncidentCard.group))).all()
    return {cid: group for cid, group in rows}


async def build_session_pool(db: AsyncSession, row: TrainingSession, plan: dict[str, Any]) -> list[dict[str, Any]]:
    groups = await _card_groups(db)
    scenarios = await _scenario_docs(db, row.scenario_ids or [])
    if plan.get("issueOrder") == "adaptive":
        scenarios = sorted(scenarios, key=lambda d: d.get("difficulty", 1))
    generated = [{"cardId": cid, "level": doc.get("difficulty", 1), "group": groups.get(cid, "")} for doc in scenarios for cid in doc.get("cardIds", [])]

    def level_of(card_id: str) -> int:
        return next((c["level"] for c in generated if c["cardId"] == card_id), 1)

    made_rows = (await db.execute(select(IncidentCard.id).where(IncidentCard.created_by_student_id.is_not(None)))).scalars().all()
    student_made_ids = list(made_rows)
    seen: set[str] = set()
    student_made = []
    for card_id in student_made_ids:
        if card_id in seen:
            continue
        seen.add(card_id)
        student_made.append({"cardId": card_id, "level": level_of(card_id), "group": groups.get(card_id, "")})

    def unique(pool: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out, known = [], set()
        for card in pool:
            if card["cardId"] not in known:
                known.add(card["cardId"])
                out.append(card)
        return out

    if row.card_source == "generated":
        return unique(generated)
    if row.card_source == "studentCreated":
        return unique(student_made)
    merged = []
    for index in range(max(len(generated), len(student_made))):
        if index < len(generated):
            merged.append(generated[index])
        if index < len(student_made):
            merged.append(student_made[index])
    return unique(merged)


async def resolve_student_profile(db: AsyncSession, student_id: str) -> tuple[set[str] | None, set[str] | None]:
    """Категории профиля курсанта и их строгое подмножество с реакцией службы в классификаторе (T054).

    Возвращает `(groups, strict)`: `groups` — категории профиля (None — профиля нет), `strict` — `groups` ∩ группы,
    где хотя бы одна служба профиля реагирует (`mapped`/`card112`); None — у служб профиля нет `classifierName`
    (районные демо-профили сохраняют категории преподавателя).
    """
    user = await db.get(User, student_id)
    if user is None or not user.service:
        return None, None
    rows = (await db.execute(select(ProfileMappingRow))).scalars().all()
    row = next((r for r in rows if _norm(r.profile) == _norm(user.service)), None)
    if row is None:
        return None, None
    groups = {_norm(g) for g in (row.incident_groups or [])}
    reference = await db.get(ReferenceEntry, "services")
    services = reference.value if reference else []
    names = {_norm(s["classifierName"]) for s in services if s["id"] in row.service_ids and s.get("classifierName")}
    if not names:
        return groups, None
    entries = (await db.execute(select(ClassifierEntry))).scalars().all()
    reacting = {_norm(e.group) for e in entries if any(_norm(n.get("service", "")) in names and n.get("mode") in ("mapped", "card112") for n in (e.notifications or []))}
    return groups, groups & reacting


async def resolve_student_profile_groups(db: AsyncSession, student_id: str) -> set[str] | None:
    groups, strict = await resolve_student_profile(db, student_id)
    return groups if strict is None else strict


async def _warn_profile_fallback(db: AsyncSession, student_id: str, categories: list[str]) -> None:
    from app.models.system import SystemLog

    message = f"План занятия для {student_id}: у служб профиля нет реакции на категории {', '.join(categories) or '—'} в классификаторе — карточки выданы по категориям профиля без проверки реакции"
    db.add(SystemLog(id=await next_id(db, PREFIX["systemLog"], SystemLog.id), at=now_iso(), level="WARN", source="svc-web", message=message))
    await db.flush()


async def filter_cards_for_student(db: AsyncSession, pool: list[dict[str, Any]], student_id: str, categories: list[str], training_mode: str = "dds") -> list[dict[str, Any]]:
    """Карточки курсанта: категории плана ∩ профиль ∩ реакция службы; при пустом строгом пересечении — мягкий фолбэк
    на «категории плана ∩ категории профиля» с предупреждением в системных журналах (уточнение T054, 2026-09-21)."""
    selected = {_norm(c) for c in categories} if categories else None
    groups, strict = (await resolve_student_profile(db, student_id)) if training_mode != "operator112" else (None, None)

    def pick(profile: set[str] | None) -> list[dict[str, Any]]:
        return [c for c in pool if (selected is None or _norm(c["group"]) in selected) and (profile is None or _norm(c["group"]) in profile)]

    if strict is None:
        return pick(groups)
    cards = pick(strict)
    if cards:
        return cards
    fallback = pick(groups)
    if fallback:
        await _warn_profile_fallback(db, student_id, categories)
    return fallback


async def read_student_score(db: AsyncSession, student_id: str, except_session_id: str | None) -> float | None:
    rows = (await db.execute(select(Attempt).where(Attempt.student_id == student_id))).scalars().all()
    rows = [a for a in rows if a.session_id != except_session_id]
    rows.sort(key=lambda a: parse_iso_ms(a.opened_at))
    scores = []
    for attempt in rows[-ADAPTIVE_HISTORY:]:
        evaluation = await evaluation_contract(db, attempt.id)
        if evaluation:
            scores.append(evaluation["totalScore"])
    return sum(scores) / len(scores) if scores else None


def order_for_student(cards: list[dict[str, Any]], issue_order: str, score: float | None) -> list[dict[str, Any]]:
    if issue_order == "manual" or not cards:
        return list(cards)
    by_level = sorted(cards, key=lambda c: c["level"])
    if score is not None and score >= ADAPTIVE_STRONG_SCORE:
        easiest = by_level[0]["level"]
        harder = [c for c in by_level if c["level"] > easiest]
        return [*harder, *[c for c in by_level if c["level"] == easiest]] if harder else by_level
    if score is not None and score <= ADAPTIVE_WEAK_SCORE:
        return [by_level[0], *by_level]
    return by_level


def pace_ms_for_student(plan: dict[str, Any], score: float | None) -> int:
    base = int(plan["paceSec"] * 1000)
    return round(base * ADAPTIVE_SLOWDOWN) if score is not None and score <= ADAPTIVE_WEAK_SCORE else base


def schedule_for_student(queue: list[dict[str, Any]], student_id: str, start_ms: int, pace_ms: int, conveyor: bool) -> list[dict[str, Any]]:
    if not queue:
        return []
    count = max(len(queue), math.ceil(CONVEYOR_HORIZON_MS / pace_ms)) if conveyor else len(queue)
    return [{"cardId": queue[i % len(queue)]["cardId"], "studentId": student_id, "issuedAt": ms_to_iso(start_ms + i * pace_ms), "level": queue[i % len(queue)]["level"]} for i in range(count)]


async def build_planned_card_flow(db: AsyncSession, row: TrainingSession, plan: dict[str, Any], started_at: str) -> list[dict[str, Any]]:
    start_ms = parse_iso_ms(started_at)
    pool = await build_session_pool(db, row, plan)
    flow = []
    for student_id in row.student_ids or []:
        score = await read_student_score(db, student_id, row.id)
        filtered = await filter_cards_for_student(db, pool, student_id, plan.get("categories", []), row.training_mode)
        if plan.get("adaptive") and row.format == "training":
            from app.services.rating_service import sync as sync_rating
            from ml.insights.recommender import adaptive_order

            rating = await sync_rating(db, student_id, row.training_mode)
            queue = adaptive_order(filtered, rating.rating, rating.weak_groups or {},
                                   [int(item["score"]) for item in rating.history or []])
        else:
            queue = order_for_student(filtered, plan.get("issueOrder", "adaptive"), score)
        flow.extend(schedule_for_student(queue, student_id, start_ms, pace_ms_for_student(plan, score), bool(plan.get("conveyor"))))
    return flow


async def next_card_for_student(db: AsyncSession, row: TrainingSession, plan: dict[str, Any], student_id: str) -> dict[str, Any] | None:
    issued = {item["cardId"] for item in (row.card_flow or []) if item.get("studentId") == student_id}
    queue = await filter_cards_for_student(db, await build_session_pool(db, row, plan), student_id, plan.get("categories", []), row.training_mode)
    if plan.get("adaptive") and row.format == "training":
        from app.services.rating_service import sync as sync_rating
        from ml.insights.recommender import adaptive_order

        rating = await sync_rating(db, student_id, row.training_mode)
        previous = next((item for item in reversed(row.card_flow or []) if item.get("studentId") == student_id), None)
        queue = adaptive_order(queue, rating.rating, rating.weak_groups or {},
                               [int(item["score"]) for item in rating.history or []],
                               int(previous["level"]) if previous else None)
    return next((c for c in queue if c["cardId"] not in issued), queue[0] if queue else None)


# ─── start / stop ─────────────────────────────────────────────────────────────────────────────────


async def start_session(db: AsyncSession, session_id: str) -> dict[str, Any]:
    row = await require_session_row(db, session_id)
    assert_transition(row, "running")
    started_at = now_iso()
    if row.card_flow:
        flow = list(row.card_flow)
    elif row.plan or row.card_source in ("studentCreated", "mixed"):
        flow = await build_planned_card_flow(db, row, row.plan or copy.deepcopy(DEFAULT_SESSION_PLAN), started_at)
    else:
        flow = await build_default_card_flow(db, row, started_at)
    row.state = "running"
    row.started_at = started_at
    row.card_flow = flow
    await db.flush()
    return await session_contract(db, row)


async def stop_session(db: AsyncSession, session_id: str) -> dict[str, Any]:
    row = await require_session_row(db, session_id)
    assert_transition(row, "finished")
    row.state = "finished"
    row.finished_at = now_iso()
    await db.flush()
    return await session_contract(db, row)


# ─── Лента ────────────────────────────────────────────────────────────────────────────────────────


def build_feed(session: dict[str, Any], since: str | None, at: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for item in session["cardFlow"]:
        events.append({"kind": "cardIssued", "at": item["issuedAt"], "studentId": item["studentId"], "cardId": item["cardId"], "level": item.get("level", 1)})
    for attempt in session["cardEvents"]:
        base = {"studentId": attempt["studentId"], "cardId": attempt["cardId"], "attemptId": attempt["id"]}
        events.append({**base, "kind": "cardOpened", "at": attempt["openedAt"]})
        for mark in attempt.get("statuses", []):
            events.append({**base, "kind": "statusChanged", "at": mark["at"], "mark": dict(mark)})
        if attempt.get("completedAt"):
            events.append({**base, "kind": "cardCompleted", "at": attempt["completedAt"], "fullProcessingMs": attempt.get("fullProcessingMs", 0)})
            evaluation = attempt.get("evaluation")
            if evaluation:
                rev_num = evaluation.get("revision", 1)
                rev_status = evaluation.get("status", "final" if evaluation.get("teacherOverride") else "preliminary")
                ev_payload: dict[str, Any] = {
                    **base,
                    "kind": "aiEvaluation",
                    "at": attempt["completedAt"],
                    "isAi": True,
                    "revision": rev_num,
                    "status": rev_status,
                    "errorCount": len(evaluation.get("errors", [])) + len(evaluation.get("grammarErrors", [])),
                    "aiComment": evaluation.get("aiComment", ""),
                }
                if rev_status in ("preliminary", "final"):
                    ev_payload["totalScore"] = evaluation.get("totalScore")
                events.append(ev_payload)
    at_ms = parse_iso_ms(at)
    since_ms = parse_iso_ms(since) if since else None
    ranked = [(parse_iso_ms(e["at"]), seq, e) for seq, e in enumerate(events)]
    ranked = [r for r in ranked if (since_ms is None or r[0] > since_ms) and r[0] <= at_ms]
    ranked.sort(key=lambda r: (r[0], KIND_ORDER[r[2]["kind"]], r[2]["studentId"], r[2]["cardId"], r[2].get("attemptId", ""), r[1]))
    return [r[2] for r in ranked]


async def feed_attempts(db: AsyncSession, session_id: str) -> list[dict[str, Any]]:
    """Read attempts and their latest score state in one query for concurrent polling."""
    from app.models.ai_assessment import EvaluationRevision

    latest_revisions = (
        select(EvaluationRevision.attempt_id, func.max(EvaluationRevision.revision).label("revision"))
        .group_by(EvaluationRevision.attempt_id)
        .subquery()
    )
    latest_overrides = (
        select(TeacherOverride.attempt_id, func.max(TeacherOverride.id).label("id"))
        .group_by(TeacherOverride.attempt_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(Attempt, Evaluation, EvaluationRevision, TeacherOverride)
            .outerjoin(Evaluation, Evaluation.attempt_id == Attempt.id)
            .outerjoin(latest_revisions, latest_revisions.c.attempt_id == Attempt.id)
            .outerjoin(
                EvaluationRevision,
                and_(EvaluationRevision.attempt_id == Attempt.id, EvaluationRevision.revision == latest_revisions.c.revision),
            )
            .outerjoin(latest_overrides, latest_overrides.c.attempt_id == Attempt.id)
            .outerjoin(TeacherOverride, TeacherOverride.id == latest_overrides.c.id)
            .where(Attempt.session_id == session_id)
            .order_by(Attempt.seq, Attempt.id)
        )
    ).all()
    events = []
    for attempt, evaluation, revision, override in rows:
        data = None
        if evaluation is not None and (revision is None or revision.status not in ("pending", "review_required")):
            data = evaluation.to_contract(override.to_contract() if override else None)
            if revision is not None:
                data["revision"] = revision.revision
                data["status"] = revision.status
        events.append(attempt.to_contract(data))
    return events


async def session_feed(db: AsyncSession, session_id: str, viewer: Viewer | None, since: str | None, at: str | None, student_id: str | None) -> dict[str, Any]:
    row = await require_session_row(db, session_id)
    if viewer is not None and viewer.role == "teacher" and row.teacher_id != viewer.user_id:
        raise forbidden(FOREIGN_SESSION_MESSAGE)
    if viewer is not None and viewer.is_student and viewer.user_id not in (row.student_ids or []):
        raise forbidden(NOT_IN_SESSION_MESSAGE)
    scope = resolve_student_scope(viewer, student_id)
    for key, value in (("since", since), ("at", at)):
        if value is not None and not is_iso(value):
            raise validation_failed(f"Некорректная метка времени «{key}»: {value}")
    at_value = at or now_iso()
    events = build_feed({"cardFlow": row.card_flow or [], "cardEvents": await feed_attempts(db, session_id)}, since, at_value)
    if scope:
        events = [e for e in events if e["studentId"] == scope]
    return {"sessionId": session_id, "at": at_value, "events": events}


# ─── Управление ───────────────────────────────────────────────────────────────────────────────────


async def control_response(db: AsyncSession, row: TrainingSession) -> dict[str, Any]:
    now_ms = parse_iso_ms(now_iso())
    pending = sum(1 for item in (row.card_flow or []) if parse_iso_ms(item["issuedAt"]) > now_ms)
    return {"session": await session_contract(db, row), "plan": copy.deepcopy(row.plan) if row.plan else None, "paused": row.paused_at is not None, "pausedAt": row.paused_at, "pendingCount": pending + len(row.parked or [])}


def _ensure_plan(row: TrainingSession) -> dict[str, Any]:
    if not row.plan:
        row.plan = copy.deepcopy(DEFAULT_SESSION_PLAN)
    return row.plan


async def _pause(row: TrainingSession) -> None:
    _ensure_plan(row)
    if row.paused_at is not None:
        return
    at = now_iso()
    at_ms = parse_iso_ms(at)
    row.parked = [item for item in (row.card_flow or []) if parse_iso_ms(item["issuedAt"]) > at_ms]
    row.card_flow = [item for item in (row.card_flow or []) if parse_iso_ms(item["issuedAt"]) <= at_ms]
    row.paused_at = at


async def _resume(row: TrainingSession) -> None:
    _ensure_plan(row)
    if row.paused_at is None:
        return
    offset = parse_iso_ms(now_iso()) - parse_iso_ms(row.paused_at)
    resumed = [{**item, "issuedAt": ms_to_iso(parse_iso_ms(item["issuedAt"]) + offset)} for item in (row.parked or [])]
    row.card_flow = [*(row.card_flow or []), *resumed]
    row.paused_at = None
    row.parked = []


async def _issue(db: AsyncSession, row: TrainingSession, student_id: str | None, card_id: str | None, trap_type: str | None = None) -> None:
    if row.state != "running":
        raise validation_failed("Карточку можно выдать только во время занятия")
    if not student_id or student_id not in (row.student_ids or []):
        raise validation_failed("Выберите курсанта занятия")
    plan = _ensure_plan(row)
    if card_id:
        level = next((item.get("level", 1) for item in (row.card_flow or []) if item["cardId"] == card_id), 1)
        planned: dict[str, Any] | None = {"cardId": card_id, "level": level}
    else:
        planned = await next_card_for_student(db, row, plan, student_id)
    if planned is None:
        raise validation_failed("Для курсанта не осталось карточек выбранных категорий")
    source_card = await db.get(IncidentCard, planned["cardId"])
    if source_card is None:
        raise validation_failed(f"Карточка «{planned['cardId']}» не найдена")
    issued_id = planned["cardId"]
    if trap_type is not None:
        from ml.generate.scenario_generator import build_trap_from_source

        if trap_type not in ("wrongType", "addressTypo", "outOfZone", "duplicate"):
            raise validation_failed("Неизвестная ловушка")
        issued_id = await next_id(db, PREFIX["card"], IncidentCard.id)
        ticket, etalon = build_trap_from_source(source_card.to_contract(), trap_type, issued_id)
        db.add(IncidentCard(id=issued_id, ticket_no=source_card.ticket_no, situation_no=source_card.situation_no,
                            group=ticket["group"], summary=ticket["summary"], address=ticket["address"],
                            caller=ticket["caller"], victims=ticket.get("victims"), no_ambulance=ticket.get("noAmbulance"),
                            expected_services=ticket.get("expectedServices") or [], expected_tags=ticket.get("expectedTags") or [],
                            duplicate_of=ticket.get("duplicateOf"), mode_origin="generated",
                            extra={"baseCardId": source_card.id, "trap": trap_type, "chainEtalon": etalon}))
        await db.flush()
    row.card_flow = [*(row.card_flow or []), {"cardId": issued_id, "studentId": student_id, "issuedAt": now_iso(),
                                                   "level": planned["level"], **({"issuedBy": "trap", "trap": trap_type} if trap_type else {})}]


def _read_optional_id(body: dict[str, Any], key: str) -> str | None:
    value = body.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise validation_failed(f"Некорректное поле «{key}»")
    return value.strip()


async def post_control(db: AsyncSession, session_id: str, body: dict[str, Any], build_report: ReportBuilder | None) -> dict[str, Any]:
    action = body.get("action")
    if action not in CONTROL_ACTIONS:
        raise validation_failed(f"Некорректное действие управления занятием: {action}")
    row = await require_session_row(db, session_id)
    if action == "pause":
        await _pause(row)
    elif action == "resume":
        await _resume(row)
    elif action == "issue":
        await _issue(db, row, _read_optional_id(body, "studentId"), _read_optional_id(body, "cardId"), _read_optional_id(body, "trapType"))
    elif action == "report":
        assert_transition(row, "reported")
        row.state = "reported"
        await db.flush()
        if build_report is not None:
            await build_report(db, session_id)
    await db.flush()
    return await control_response(db, row)
