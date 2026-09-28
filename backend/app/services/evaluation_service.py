"""Оценка попытки: готовая (override приоритетен) либо оценщик по эталону сценария; правка преподавателя.

Порт семантики `src/shared/api/mock/{reports,reports-teacher}.ts` + `entities/report/model/evaluate.ts`:
эталон — первый сценарий занятия, содержащий карточку (иначе любой сценарий с этой карточкой);
нет эталона → 404 `evaluationPending`. Оценка сохраняется в `evaluations`; повторный запрос её читает.
"""

from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_gateway import get_gateway
from app.api.deps import Viewer, assert_own_attempt
from app.api.errors import evaluation_pending, forbidden, not_found, validation_failed
from app.models.assignment import Assignment, AssignmentAttempt
from app.models.card import IncidentCard
from app.models.report import CalibrationSample
from app.models.scenario import Scenario
from app.models.session import Attempt, Evaluation, TeacherOverride, TrainingSession
from app.models.user import User
from app.services import audit
from app.services.reference import read_reference
from app.services.session_engine import evaluation_contract, session_contract
from app.services.time import now_iso

AUDIT_ACTION_OVERRIDE = "evaluation.override"
TEACHER_ONLY_MESSAGE = "Действие доступно преподавателю и администратору"
MIN_SCORE, MAX_SCORE = 0, 100


async def find_scenario_for_attempt(db: AsyncSession, attempt: Attempt, session: TrainingSession | None) -> Scenario | None:
    rows = {row.id: row for row in (await db.execute(select(Scenario).where(Scenario.deleted.is_(False)))).scalars().all()}
    for scenario_id in (session.scenario_ids if session else []) or []:
        row = rows.get(scenario_id)
        if row is not None and attempt.card_id in (row.card_ids or []):
            return row
    return next((row for row in sorted(rows.values(), key=lambda r: r.id) if attempt.card_id in (row.card_ids or [])), None)


async def _cards_index(db: AsyncSession) -> dict[str, dict[str, Any]]:
    rows = (await db.execute(select(IncidentCard))).scalars().all()
    return {row.id: row.to_contract() for row in rows}


async def evaluate_if_possible(db: AsyncSession, attempt: Attempt) -> dict[str, Any] | None:
    """Готовая оценка — как есть; иначе оценщик по эталону (нет эталона → None). Сохраняет `evaluations`."""
    existing = await evaluation_contract(db, attempt.id)
    if existing is not None:
        return existing
    if attempt.mode == "operator112":
        return None  # оценка режима A появляется при отправке карточки (operator112_service.submit), эталон ДДС не применим
    session = await db.get(TrainingSession, attempt.session_id)
    scenario = await find_scenario_for_attempt(db, attempt, session)
    chain_card = await db.get(IncidentCard, attempt.card_id)
    chain_etalon = (chain_card.extra or {}).get("chainEtalon") if chain_card else None
    if scenario is None and not isinstance(chain_etalon, dict):
        return None
    reference = await read_reference(db)
    cards = await _cards_index(db)
    session_doc = await session_contract(db, session) if session else None
    weights = (session.plan or {}).get("weights") if session and session.plan else None
    gateway = get_gateway()
    # Оценщик — CPU-bound (эмбеддер, spellcheck): выполняем вне event loop, БД в потоке не трогаем.
    scenario_doc = scenario.to_contract() if scenario is not None else {
        "id": f"chain:{attempt.card_id}", "cardIds": [attempt.card_id], "etalon": chain_etalon,
        "timeNorms": {"primaryReactionSec": 30, "fullProcessingSec": 180},
        "successCriteria": {"maxGrammarErrors": 1, "requiredFields": []},
    }
    evaluation = await asyncio.to_thread(gateway.evaluate_attempt, attempt.to_contract(), scenario_doc, cards, reference, session_doc, weights)
    row = Evaluation(
        attempt_id=attempt.id,
        assessor_version=str(evaluation.get("assessorVersion") or "unknown"),
        time_score=int(evaluation["timeScore"]),
        correctness_score=int(evaluation["correctnessScore"]),
        grammar_score=int(evaluation["grammarScore"]),
        semantic_score=int(evaluation["semanticScore"]),
        total_score=int(evaluation["totalScore"]),
        grammar_errors=list(evaluation.get("grammarErrors") or []),
        errors=list(evaluation.get("errors") or []),
        ai_comment=str(evaluation.get("aiComment") or ""),
        components={"components": evaluation.get("components") or {}, "warnings": evaluation.get("warnings") or []},
        generated_at=now_iso(),
        passed=evaluation.get("passed"),
        mode=str(evaluation.get("mode") or attempt.mode or "dds"),
    )
    db.add(row)
    await db.flush()
    from app.services.rating_service import sync as sync_rating

    await sync_rating(db, attempt.student_id, attempt.mode)
    link = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.attempt_id == attempt.id))).scalars().first()
    if link is not None:
        assignment = await db.get(Assignment, link.assignment_id)
        threshold = (assignment.params or {}).get("passThreshold") if assignment else None
        link.state = "submitted"
        if assignment is not None and assignment.format == "exam" and isinstance(threshold, (int, float)):
            row.passed = row.total_score >= threshold
            link.passed = row.passed
        await db.flush()
    return await evaluation_contract(db, attempt.id)


async def require_attempt(db: AsyncSession, attempt_id: str) -> Attempt:
    attempt = await db.get(Attempt, attempt_id)
    if attempt is None:
        raise not_found(f"Попытка «{attempt_id}» не найдена")
    return attempt


async def get_or_create_evaluation(db: AsyncSession, attempt_id: str, viewer: Viewer | None) -> dict[str, Any]:
    attempt = await require_attempt(db, attempt_id)
    assert_own_attempt(viewer, attempt.student_id)
    evaluation = await evaluate_if_possible(db, attempt)
    if evaluation is None:
        raise evaluation_pending("Оценка попытки ещё не готова")
    return evaluation


async def _read_teacher(db: AsyncSession, body: dict[str, Any], viewer: Viewer | None) -> User:
    """Автор действия: id из тела (как в моке), роль сверяется по users; viewer-обучающийся → 403."""
    if viewer is not None and viewer.is_student:
        raise forbidden(TEACHER_ONLY_MESSAGE)
    teacher_id = body.get("teacherId")
    teacher_id = teacher_id.strip() if isinstance(teacher_id, str) else ""
    if not teacher_id:
        raise validation_failed("Укажите «teacherId»")
    teacher = await db.get(User, teacher_id)
    if teacher is None or teacher.role not in ("teacher", "admin"):
        raise forbidden(TEACHER_ONLY_MESSAGE)
    return teacher


def _read_score(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) != value or value < MIN_SCORE or value > MAX_SCORE:
        raise validation_failed(f"Балл преподавателя — целое число от {MIN_SCORE} до {MAX_SCORE}")
    return int(value)


def _read_comment(value: Any) -> str:
    comment = value.strip() if isinstance(value, str) else ""
    if not comment:
        raise validation_failed("Комментарий к правке оценки обязателен")
    return comment


async def override_evaluation(db: AsyncSession, attempt_id: str, body: dict[str, Any], viewer: Viewer | None) -> dict[str, Any]:
    """Правка балла: `teacher_overrides` + аудит «было → стало» с ФИО + пример калибровки."""
    teacher = await _read_teacher(db, body, viewer)
    score = _read_score(body.get("score"))
    comment = _read_comment(body.get("comment"))
    current = await get_or_create_evaluation(db, attempt_id, viewer)
    before = int((current.get("teacherOverride") or {}).get("score", current["totalScore"]))
    override = TeacherOverride(attempt_id=attempt_id, teacher_id=teacher.id, score=score, comment=comment, at=now_iso(), previous_score=before)
    db.add(override)
    await db.flush()
    await audit.record(
        db,
        action=AUDIT_ACTION_OVERRIDE,
        user_id=teacher.id,
        role=teacher.role,
        details=f"Оценка изменена преподавателем {teacher.full_name} (попытка {attempt_id}): было {before} → стало {score}. Комментарий: {comment}",
    )
    db.add(
        CalibrationSample(
            attempt_id=attempt_id,
            source="override",
            payload={"teacherId": teacher.id, "score": score, "comment": comment, "aiTotalScore": current["totalScore"], "previousScore": before, "components": current.get("components") or {}, "errors": current.get("errors") or []},
            created_at=now_iso(),
        )
    )
    await db.flush()
    evaluation = await evaluation_contract(db, attempt_id)
    assert evaluation is not None
    return evaluation
