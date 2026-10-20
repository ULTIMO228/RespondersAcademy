"""Создание, выдача и завершение заданий обоих режимов (T091)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import conflict, forbidden, not_found, validation_failed
from app.db.ids import PREFIX, next_id
from app.models.ai_scenario import ScenarioVersion
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.card import IncidentCard
from app.models.scenario import Scenario
from app.models.session import Attempt, Evaluation, TrainingSession
from app.models.user import User
from app.services import audit, operator112_service, student_card_service, training_profile
from app.services.session_engine import filter_cards_for_student
from app.services.time import now_iso, parse_iso_ms

# Режим «цепочка A → B» выведен 20.10.2026 (spec/007 Clarifications): старые задания chain только читаются.
LEGACY_CHAIN_MESSAGE = "Режим «Цепочка 112 → ДДС» выведен: задание доступно только для просмотра"


async def require_assignment(db: AsyncSession, assignment_id: str) -> Assignment:
    row = await db.get(Assignment, assignment_id)
    if row is None:
        raise not_found(f"Задание «{assignment_id}» не найдено")
    return row


def _can_manage(row: Assignment, viewer: Viewer) -> bool:
    return viewer.role == "admin" or (viewer.role == "teacher" and row.teacher_id == viewer.user_id)


async def _assert_profile(db: AsyncSession, row: Assignment, student_id: str) -> None:
    """spec/008: курсант с профилем другого режима не открывает и не запускает задание."""
    student = await db.get(User, student_id)
    if student is not None and not training_profile.allows(student, row.training_mode):
        raise forbidden(training_profile.blocked_message(student, row.training_mode))


def _assert_visible(row: Assignment, viewer: Viewer) -> None:
    if viewer.is_student and viewer.user_id not in (row.student_ids or []):
        raise forbidden("Обучающемуся доступны только свои задания")
    if viewer.role == "teacher" and row.teacher_id != viewer.user_id:
        raise forbidden("Задание другого преподавателя")


async def _cards(db: AsyncSession) -> list[IncidentCard]:
    return list((await db.execute(select(IncidentCard).order_by(IncidentCard.id))).scalars().all())


async def _approved_ids(db: AsyncSession) -> set[str]:
    cards = await _cards(db)
    scenarios = (await db.execute(select(Scenario).where(Scenario.deleted.is_(False)))).scalars().all()
    linked = {card_id for scenario in scenarios for card_id in (scenario.card_ids or [])}
    approved = {card.id for card in cards if card.mode_origin == "seed" and card.id not in linked}
    approved.update(card_id for scenario in scenarios if scenario.validation_status == "approved" for card_id in (scenario.card_ids or []))
    return approved


def _difficulty(card: IncidentCard, scenarios: list[Scenario]) -> int:
    values = [s.difficulty for s in scenarios if card.id in (s.card_ids or [])]
    return max(values, default=int((card.extra or {}).get("difficulty") or 1))


async def candidate_card_ids(db: AsyncSession, rule: dict[str, Any], student_ids: list[str], mode: str) -> list[str]:
    cards = await _cards(db)
    approved = await _approved_ids(db)
    scenarios = list((await db.execute(select(Scenario).where(Scenario.deleted.is_(False)))).scalars().all())
    groups = [str(v) for v in rule.get("groups") or []]
    levels = {int(v) for v in rule.get("difficulty") or []}
    pool = [c for c in cards if c.id in approved and (not levels or _difficulty(c, scenarios) in levels)]
    docs = [{**c.to_contract(), "level": _difficulty(c, scenarios), "cardId": c.id} for c in pool]
    if mode == "dds":
        for student_id in student_ids:
            allowed = {c["cardId"] for c in await filter_cards_for_student(db, docs, student_id, groups, mode)}
            docs = [c for c in docs if c["cardId"] in allowed]
    elif groups:
        normalized = {g.casefold().replace("ё", "е") for g in groups}
        docs = [c for c in docs if str(c["group"]).casefold().replace("ё", "е") in normalized]
    count = int(rule.get("count") or 1)
    if len(docs) < count:
        raise validation_failed(f"По правилу найдено билетов: {len(docs)}, требуется: {count}")
    return [c["cardId"] for c in docs[:count]]


async def _audit(db: AsyncSession, viewer: Viewer, action: str, details: str) -> None:
    """Действия по заданиям пишутся в журнал аудита от имени пользователя запроса (конституция: логируются все)."""
    user = await db.get(User, viewer.user_id)
    await audit.record(db, action=action, user_id=viewer.user_id, role=viewer.role, details=details,
                       operator_arm=user.arm_number if user is not None else None)


async def create(db: AsyncSession, body: dict[str, Any], viewer: Viewer) -> dict[str, Any]:
    if viewer.role not in ("teacher", "admin"):
        raise forbidden("Задания создаёт преподаватель или администратор")
    requested_teacher = body.get("teacherId")
    if viewer.role == "teacher":
        if requested_teacher not in (None, viewer.user_id):
            raise forbidden("Нельзя назначить задание от имени другого преподавателя")
        teacher_id = viewer.user_id
    else:
        teacher = await db.get(User, requested_teacher) if isinstance(requested_teacher, str) else None
        if teacher is None or teacher.role != "teacher" or not teacher.is_active:
            raise validation_failed("Администратор должен указать активного преподавателя в teacherId")
        teacher_id = teacher.id
    students = list((await db.execute(select(User).where(User.id.in_(body["studentIds"])))).scalars().all())
    if len(students) != len(body["studentIds"]) or any(u.role != "student" or not u.is_active for u in students):
        raise validation_failed("Все studentIds должны указывать на активных обучающихся")
    order = {student_id: index for index, student_id in enumerate(body["studentIds"])}
    _, blocked = training_profile.split_by_profile(sorted(students, key=lambda u: order[u.id]), body["trainingMode"])
    if blocked:
        raise validation_failed(training_profile.create_rejection(blocked, body["trainingMode"]))
    selected = list(body.get("cardIds") or [])
    ai_links: list[tuple[ScenarioVersion, str]] = []
    for item in body.get("scenarioVersions") or []:
        version = await db.get(ScenarioVersion, (item["scenarioId"], item["version"]))
        if version is None or not version.available_for_training:
            raise validation_failed("В задание можно включать только утверждённую версию AI-сценария")
        if version.created_by != teacher_id and viewer.role != "admin":
            raise forbidden("Нет права назначать сценарий другого преподавателя")
        if version.card_snapshot.get("id") != item["cardId"]:
            raise validation_failed("cardId не соответствует снимку версии сценария")
        if version.mode != body["trainingMode"]:
            raise validation_failed("Режим версии сценария не соответствует заданию")
        ai_links.append((version, item["cardId"]))
    params = dict(body.get("params") or {})
    params.pop("studentCards", None)  # эталоны карточек обучающихся — только из проверенного поля studentCards
    student_card_ids = await student_card_service.check_assignment_cards(db, viewer, body["trainingMode"], selected, body.get("studentCards") or [])
    if student_card_ids:
        params["studentCards"] = list(body.get("studentCards") or [])
    if selected:
        approved = await _approved_ids(db) | student_card_ids
        ai_card_ids = {card_id for _, card_id in ai_links}
        if any(card_id not in approved and card_id not in ai_card_ids for card_id in selected):
            raise validation_failed("В задание можно включать только существующие утверждённые билеты")
        if body["trainingMode"] == "dds":
            by_id = {card.id: card for card in await _cards(db)}
            scenarios = list((await db.execute(select(Scenario).where(Scenario.deleted.is_(False)))).scalars().all())
            docs = [{**by_id[card_id].to_contract(), "cardId": card_id, "level": _difficulty(by_id[card_id], scenarios)} for card_id in selected]
            for student_id in body["studentIds"]:
                allowed = {card["cardId"] for card in await filter_cards_for_student(db, docs, student_id, [], "dds")}
                if allowed != set(selected):
                    raise validation_failed(f"Часть билетов не соответствует профилю службы обучающегося {student_id}")
    rule = body.get("randomRule")
    if body["format"] == "exam" and rule:
        selected = await candidate_card_ids(db, rule, body["studentIds"], body["trainingMode"])
    row = Assignment(
        id=await next_id(db, PREFIX["assignment"], Assignment.id), teacher_id=teacher_id,
        student_ids=body["studentIds"], training_mode=body["trainingMode"], format=body["format"],
        card_ids=selected, random_rule=rule, params=params, due_at=body.get("dueAt"),
        state="active", created_at=now_iso(), title=body.get("title") or "",
    )
    db.add(row)
    await db.flush()
    db.add_all(AssignmentStudent(assignment_id=row.id, student_id=student_id) for student_id in body["studentIds"])
    db.add_all(
        AssignmentScenarioVersion(
            assignment_id=row.id,
            scenario_id=version.scenario_id,
            version=version.version,
            card_id=card_id,
            mode=version.mode,
        )
        for version, card_id in ai_links
    )
    await db.flush()
    await _audit(db, viewer, "assignment.create",
                 f"Задание {row.id}: режим {row.training_mode}, {row.format}, обучающихся {len(row.student_ids)}, "
                 f"справочник: {'доступен' if (row.params or {}).get('referenceAllowed', row.format == 'training') else 'недоступен'}")
    return row.to_contract()


async def _expire(db: AsyncSession, row: Assignment) -> None:
    limit = (row.params or {}).get("timeLimitSec")
    if row.format != "exam" or not isinstance(limit, int):
        return
    links = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.assignment_id == row.id))).scalars().all()
    now = now_iso()
    for link in links:
        if link.state in ("submitted", "notCompleted"):
            continue
        attempt = await db.get(Attempt, link.attempt_id)
        if attempt is None or parse_iso_ms(now) - parse_iso_ms(attempt.opened_at) <= limit * 1000:
            continue
        attempt.completed_at, link.state, link.passed = now, "notCompleted", False
        attempt.full_processing_ms = limit * 1000
        if attempt.mode == "operator112":
            attempt.state = "submitted"
        if await db.get(Evaluation, attempt.id) is None:
            db.add(Evaluation(attempt_id=attempt.id, assessor_version="timeout-1.0.0", time_score=0, correctness_score=0, grammar_score=0, semantic_score=0, total_score=0, grammar_errors=[], errors=[{"type": "timeLimit", "message": "Истёк лимит времени", "source": "Параметры экзамена"}], ai_comment="Попытка завершена по лимиту времени", components={"components": {}, "warnings": []}, generated_at=now, passed=False, mode=attempt.mode))
    await db.flush()


async def list_rows(db: AsyncSession, viewer: Viewer, *, student_id: str | None = None, teacher_id: str | None = None, state: str | None = None) -> list[dict[str, Any]]:
    rows = list((await db.execute(select(Assignment).order_by(Assignment.created_at.desc(), Assignment.id.desc()))).scalars().all())
    if viewer.is_student:
        if student_id and student_id != viewer.user_id:
            raise forbidden("Обучающемуся доступны только свои задания")
        rows = [r for r in rows if viewer.user_id in (r.student_ids or [])]
        me = await db.get(User, viewer.user_id)
        if me is not None:
            rows = [r for r in rows if training_profile.allows(me, r.training_mode)]
    elif viewer.role == "teacher":
        rows = [r for r in rows if r.teacher_id == viewer.user_id]
    if student_id:
        rows = [r for r in rows if student_id in (r.student_ids or [])]
    if teacher_id:
        rows = [r for r in rows if r.teacher_id == teacher_id]
    if state:
        rows = [r for r in rows if r.state == state]
    for row in rows:
        await _expire(db, row)
    return [r.to_contract() for r in rows]


async def detail(db: AsyncSession, assignment_id: str, viewer: Viewer) -> dict[str, Any]:
    row = await require_assignment(db, assignment_id)
    _assert_visible(row, viewer)
    if viewer.is_student:
        await _assert_profile(db, row, viewer.user_id)
    await _expire(db, row)
    links = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.assignment_id == row.id).order_by(AssignmentAttempt.id))).scalars().all()
    progress = []
    for link in links:
        evaluation = await db.get(Evaluation, link.attempt_id)
        item = {"studentId": link.student_id, "cardId": link.card_id, "attemptId": link.attempt_id, "state": link.state}
        if evaluation is not None:
            item["score"] = evaluation.total_score
        if link.passed is not None:
            item["passed"] = link.passed
        progress.append(item)
    return {**row.to_contract(), "progress": progress}


def _student(viewer: Viewer, requested: str | None, row: Assignment) -> str:
    if viewer.is_student:
        if requested and requested != viewer.user_id:
            raise forbidden("Обучающемуся доступны только свои задания")
        student_id = viewer.user_id
    elif requested:
        student_id = requested
    else:
        raise validation_failed("Укажите studentId при запуске преподавателем или администратором")
    if student_id not in (row.student_ids or []):
        raise forbidden("Обучающийся не назначен на это задание")
    return student_id


async def _dds_start(db: AsyncSession, row: Assignment, student_id: str, card_id: str) -> dict[str, Any]:
    sessions = (await db.execute(select(TrainingSession).where(TrainingSession.mode == f"assignment:{row.id}"))).scalars().all()
    session = next((item for item in sessions if student_id in (item.student_ids or [])), None)
    if session is None:
        session = TrainingSession(id=await next_id(db, PREFIX["session"], TrainingSession.id), teacher_id=row.teacher_id, student_ids=[student_id], scenario_ids=[], mode=f"assignment:{row.id}", card_source="generated", card_flow=[], state="running", started_at=now_iso(), plan=row.params, paused_at=None, parked=[], training_mode="dds", format=row.format, exam={"passThreshold": (row.params or {}).get("passThreshold")} if row.format == "exam" else None)
        db.add(session)
        await db.flush()
    attempt = Attempt(id=await next_id(db, PREFIX["attempt"], Attempt.id), session_id=session.id, card_id=card_id, student_id=student_id, mode="dds", opened_at=now_iso(), primary_reaction_ms=0, statuses=[], services_called=[], full_processing_ms=0, entered_text={}, calls=[], seq=len((await db.execute(select(Attempt.id).where(Attempt.session_id == session.id))).scalars().all()))
    db.add(attempt)
    await db.flush()
    db.add(AssignmentAttempt(assignment_id=row.id, student_id=student_id, card_id=card_id, attempt_id=attempt.id, state="answered"))
    await db.flush()
    return {"sessionId": session.id, "attempt": attempt.to_contract(), "created": True}


async def start(db: AsyncSession, assignment_id: str, viewer: Viewer, student_id: str | None, background: Any = None) -> dict[str, Any]:
    row = await require_assignment(db, assignment_id)
    _assert_visible(row, viewer)
    if row.state != "active":
        raise conflict("Задание завершено")
    if row.training_mode == "chain":
        raise conflict(LEGACY_CHAIN_MESSAGE)
    await _expire(db, row)
    student = _student(viewer, student_id, row)
    await _assert_profile(db, row, student)
    links = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.assignment_id == row.id, AssignmentAttempt.student_id == student).order_by(AssignmentAttempt.id))).scalars().all()
    opened = next((link for link in links if link.state not in ("submitted", "notCompleted")), None)
    if opened is not None:
        attempt = await db.get(Attempt, opened.attempt_id)
        if row.training_mode == "operator112" and attempt.mode == "operator112":
            return {"attempt": await operator112_service.contract_of(db, attempt, opened, row)}
        return {"attempt": {"sessionId": attempt.session_id, "attempt": attempt.to_contract(), "created": False}}
    card_ids = list(row.card_ids or [])
    if not card_ids and row.random_rule:
        card_ids = await candidate_card_ids(db, row.random_rule, [student], row.training_mode)
    used = {link.card_id for link in links}
    card_id = next((value for value in card_ids if value not in used), None)
    if row.format == "training" and (row.params or {}).get("adaptive"):
        from app.services.rating_service import sync as sync_rating
        from ml.insights.recommender import adaptive_order

        rating = await sync_rating(db, student, row.training_mode)
        scenarios = (await db.execute(select(Scenario).where(Scenario.deleted.is_(False)))).scalars().all()
        available = {card.id: card for card in await _cards(db) if card.id in card_ids}
        candidates = [{"cardId": cid, "group": available[cid].group, "level": _difficulty(available[cid], scenarios)}
                      for cid in card_ids if cid not in used and cid in available]
        last_card = available.get(links[-1].card_id) if links else None
        last_level = _difficulty(last_card, scenarios) if last_card else None
        ordered = adaptive_order(candidates, rating.rating, rating.weak_groups or {},
                                 [int(item["score"]) for item in (rating.history or [])], last_level)
        card_id = ordered[0]["cardId"] if ordered else None
    if card_id is None:
        raise conflict("Все билеты задания уже выполнены")
    if row.training_mode == "operator112":
        attempt, _ = await operator112_service.create_attempt(db, row.id, card_id, student, viewer, background)
        await _audit(db, viewer, "assignment.start", f"Задание {row.id}: выдан билет {card_id}, обучающийся {student}")
        return {"attempt": attempt}
    await _audit(db, viewer, "assignment.start", f"Задание {row.id}: выдан билет {card_id}, обучающийся {student}")
    return {"attempt": await _dds_start(db, row, student, card_id)}


async def finish(db: AsyncSession, assignment_id: str, viewer: Viewer) -> dict[str, Any]:
    row = await require_assignment(db, assignment_id)
    if not _can_manage(row, viewer):
        raise forbidden("Задание завершает его преподаватель или администратор")
    if row.state == "finished":
        return row.to_contract()
    links = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.assignment_id == row.id))).scalars().all()
    now = now_iso()
    closed = 0
    for link in links:
        if link.state not in ("submitted", "notCompleted"):
            closed += 1
            link.state, link.passed = "notCompleted", False if row.format == "exam" else None
            attempt = await db.get(Attempt, link.attempt_id)
            if attempt is not None and not attempt.completed_at:
                attempt.completed_at = now
                if attempt.mode == "operator112":
                    attempt.state = "submitted"
    row.state = "finished"
    await db.flush()
    await _audit(db, viewer, "assignment.finish", f"Задание {row.id} завершено, незавершённых попыток закрыто: {closed}")
    return row.to_contract()
