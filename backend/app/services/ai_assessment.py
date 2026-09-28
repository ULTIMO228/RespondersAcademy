"""Сервис AI-оценки ai-workflow/1: жизненный цикл ревизий, очередь задач и арбитраж (US2)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import conflict, not_found, validation_failed
from app.models.ai_assessment import SCORE_AXES, AssessmentJob, EvaluationRevision, SemanticReview
from app.models.ai_scenario import AIRequest
from app.models.report import CalibrationSample
from app.models.session import Evaluation, TeacherOverride
from app.models.user import User
from app.services import audit
from app.services.time import now_iso

AUDIT_ACTION_RESOLVE = "evaluation.resolve"


async def get_latest_evaluation_revision(db: AsyncSession, attempt_id: str) -> EvaluationRevision | None:
    """Возвращает последнюю ревизию оценки для попытки."""
    stmt = (
        select(EvaluationRevision)
        .where(EvaluationRevision.attempt_id == attempt_id)
        .order_by(desc(EvaluationRevision.revision))
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_semantic_reviews_for_attempt(db: AsyncSession, attempt_id: str) -> list[SemanticReview]:
    """Возвращает все смысловые решения по попытке."""
    stmt = select(SemanticReview).where(SemanticReview.attempt_id == attempt_id).order_by(SemanticReview.id)
    return list((await db.execute(stmt)).scalars().all())


async def create_evaluation_revision(
    db: AsyncSession,
    attempt_id: str,
    mode: str,
    status: str,
    available_axes: list[str],
    axes: dict[str, int | None],
    total_score: int | None,
    etalon_version: str,
    assessor_version: str,
    model_release_id: str | None = None,
    errors: list[dict[str, Any]] | None = None,
    teacher_override: dict[str, Any] | None = None,
    reason_code: str | None = None,
) -> EvaluationRevision:
    """Создает новую неизменяемую ревизию оценки. Защищает final от поздней перезаписи."""
    latest = await get_latest_evaluation_revision(db, attempt_id)
    if latest is not None and latest.status == "final" and status != "final":
        # Поздний ответ фоновой задачи/LLM не может перезаписать утвержденный final
        return latest

    next_revision = (latest.revision + 1) if latest else 1

    # Заполняем недостающие оси как None
    full_axes = {axis: axes.get(axis) for axis in SCORE_AXES}

    row = EvaluationRevision(
        attempt_id=attempt_id,
        revision=next_revision,
        mode=mode,
        status=status,
        available_axes=available_axes,
        axes=full_axes,
        total_score=total_score,
        errors=errors or [],
        etalon_version=etalon_version,
        assessor_version=assessor_version,
        model_release_id=model_release_id,
        teacher_override=teacher_override,
        created_at=now_iso(),
    )
    db.add(row)
    await db.flush()
    return row


async def get_or_create_assessment_job(
    db: AsyncSession,
    attempt_id: str,
    base_revision: int,
) -> tuple[AssessmentJob, bool]:
    """Возвращает существующую активную задачу или создает новую (T022)."""
    stmt = select(AssessmentJob).where(
        AssessmentJob.attempt_id == attempt_id,
        AssessmentJob.base_revision == base_revision,
        AssessmentJob.state.in_(("queued", "running")),
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        return existing, False

    job = AssessmentJob(
        attempt_id=attempt_id,
        base_revision=base_revision,
        state="queued",
        queued_at=now_iso(),
    )
    db.add(job)
    await db.flush()
    return job, True


async def resolve_assessment(
    db: AsyncSession,
    attempt_id: str,
    expected_revision: int,
    score: int,
    comment: str,
    teacher: User,
    semantic_decisions: list[dict[str, Any]] | None = None,
    request_id: str | None = None,
) -> EvaluationRevision:
    """Атомарное разрешение спора преподавателем (US2, T024):

    - Идемпотентность по requestId
    - Проверка expectedRevision (409 на stale)
    - Новая ревизия final
    - TeacherOverride + CalibrationSample + AuditLog
    """
    clean_comment = comment.strip()
    if not clean_comment:
        raise validation_failed("Комментарий к решению обязателен")
    if not 0 <= score <= 100:
        raise validation_failed("Балл должен быть целым числом от 0 до 100")

    # 1. Идемпотентность по requestId
    import hashlib

    req_hash = hashlib.sha256(
        json.dumps(
            {
                "attemptId": attempt_id,
                "expectedRevision": expected_revision,
                "score": score,
                "comment": clean_comment,
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()

    if request_id:
        stmt_req = select(AIRequest).where(
            AIRequest.actor_id == teacher.id,
            AIRequest.operation == "assessment.resolve",
            AIRequest.request_id == request_id,
        )
        existing_req = (await db.execute(stmt_req)).scalar_one_or_none()
        if existing_req is not None:
            if existing_req.request_hash != req_hash:
                raise conflict(f"Повторный запрос с requestId «{request_id}» содержит другие параметры")
            latest = await get_latest_evaluation_revision(db, attempt_id)
            if latest is not None and latest.status == "final":
                return latest

    # 2. Проверка текущей ревизии
    latest = await get_latest_evaluation_revision(db, attempt_id)
    if latest is None:
        raise not_found(f"Ревизия оценки для попытки «{attempt_id}» не найдена")
    if latest.revision != expected_revision:
        raise conflict(f"Ревизия оценки изменилась: ожидалась {expected_revision}, актуальная {latest.revision}")

    now = now_iso()
    previous_score = latest.total_score if latest.total_score is not None else score

    # 3. Фиксация решений по семантике, если переданы
    if semantic_decisions:
        for item in semantic_decisions:
            review_id = item.get("reviewId")
            if review_id:
                s_rev = await db.get(SemanticReview, review_id)
                if s_rev is not None and s_rev.attempt_id == attempt_id:
                    s_rev.validated_at = now
                    new_dec = item.get("decision")
                    if new_dec in ("equivalent", "different", "uncertain"):
                        s_rev.decision = new_dec
                    await db.flush()

    # 4. Обновление осей: семантическая ось теперь получает балл преподавателя
    new_axes = dict(latest.axes)
    new_available = list(latest.available_axes)
    if "semanticScore" not in new_available:
        new_available.append("semanticScore")
    new_axes["semanticScore"] = score

    teacher_override_payload = {
        "teacherId": teacher.id,
        "score": score,
        "comment": clean_comment,
        "at": now,
        "previousScore": previous_score,
    }

    # 5. Создание новой финальной ревизии
    new_rev = await create_evaluation_revision(
        db=db,
        attempt_id=attempt_id,
        mode=latest.mode,
        status="final",
        available_axes=new_available,
        axes=new_axes,
        total_score=score,
        etalon_version=latest.etalon_version,
        assessor_version=latest.assessor_version,
        model_release_id=latest.model_release_id,
        errors=latest.errors,
        teacher_override=teacher_override_payload,
    )

    # 6. Атомарное сохранение TeacherOverride и CalibrationSample
    override_record = TeacherOverride(
        attempt_id=attempt_id,
        teacher_id=teacher.id,
        score=score,
        comment=clean_comment,
        at=now,
        previous_score=previous_score,
    )
    db.add(override_record)

    calibration_sample = CalibrationSample(
        attempt_id=attempt_id,
        source="teacher_resolve",
        payload={
            "teacherId": teacher.id,
            "score": score,
            "comment": clean_comment,
            "previousRevision": latest.revision,
            "previousScore": previous_score,
            "axes": new_axes,
            "errors": latest.errors,
        },
        created_at=now,
    )
    db.add(calibration_sample)

    # 7. Аудит
    await audit.record(
        db,
        action=AUDIT_ACTION_RESOLVE,
        user_id=teacher.id,
        role=teacher.role,
        details=f"Итоговая оценка утверждена преподавателем {teacher.full_name} (попытка {attempt_id}): балл {score}. Комментарий: {clean_comment}",
    )

    # 8. Синхронизация старой сущности Evaluation (для обратной совместимости)
    old_eval = await db.get(Evaluation, attempt_id)
    if old_eval is not None:
        old_eval.total_score = score
        old_eval.teacher_override = teacher_override_payload
        await db.flush()

    # 9. Фиксация requestId
    if request_id:
        ai_req = AIRequest(
            actor_id=teacher.id,
            operation="assessment.resolve",
            request_id=request_id,
            request_hash=req_hash,
            response={"revision": new_rev.revision, "status": "final", "totalScore": score},
        )
        db.add(ai_req)

    await db.commit()
    return new_rev
