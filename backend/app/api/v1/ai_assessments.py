"""API маршруты управления и разрешения оценки ai-workflow/1 (US2, T024)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer, get_db, get_viewer
from app.api.errors import forbidden, not_found
from app.api.v1.ai_access import require_attempt_access
from app.models.ai_assessment import ErrorRecord, EvaluationRevision
from app.models.session import Evaluation
from app.models.user import User
from app.schemas.v1.ai import (
    AssessmentResolveRequest,
    AssessmentReviewResponse,
    AssessmentStateResponse,
    EvaluationAxes,
    SemanticReviewResponseItem,
)
from app.schemas.v1.ai import (
    EvaluationRevision as EvaluationRevisionSchema,
)
from app.services.ai_assessment import (
    create_evaluation_revision,
    get_latest_evaluation_revision,
    get_semantic_reviews_for_attempt,
    resolve_assessment,
)

router = APIRouter(prefix="/ai", tags=["ai-assessments"])


async def _ensure_initial_revision(db: AsyncSession, attempt_id: str, mode: str) -> EvaluationRevision:
    """Если ревизии еще нет, инициализирует её из существующего Evaluation или как preliminary/pending."""
    latest = await get_latest_evaluation_revision(db, attempt_id)
    if latest is not None:
        return latest

    # Проверяем старый Evaluation
    old_eval = await db.get(Evaluation, attempt_id)
    if old_eval is not None:
        axes = {
            "timeScore": old_eval.time_score,
            "correctnessScore": old_eval.correctness_score,
            "grammarScore": old_eval.grammar_score,
            "semanticScore": old_eval.semantic_score,
        }
        available_axes = [k for k, v in axes.items() if v is not None]
        status = "final" if old_eval.teacher_override else "preliminary"
        return await create_evaluation_revision(
            db=db,
            attempt_id=attempt_id,
            mode=mode,
            status=status,
            available_axes=available_axes,
            axes=axes,
            total_score=old_eval.total_score,
            etalon_version="etalon-v1",
            assessor_version=old_eval.assessor_version or "dds-1.1.0",
            errors=old_eval.errors or [],
            teacher_override=old_eval.teacher_override,
        )

    # Иначе создаем начальную ревизию со статусом pending (без баллов)
    return await create_evaluation_revision(
        db=db,
        attempt_id=attempt_id,
        mode=mode,
        status="pending",
        available_axes=[],
        axes={"timeScore": None, "correctnessScore": None, "grammarScore": None, "semanticScore": None},
        total_score=None,
        etalon_version="etalon-v1",
        assessor_version="dds-1.1.0",
    )


@router.get("/attempts/{attempt_id}/assessment-state", response_model=AssessmentStateResponse)
async def get_assessment_state(
    attempt_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[Viewer | None, Depends(get_viewer)],
) -> AssessmentStateResponse:
    """Состояние оценки попытки: доступно курсанту (своя попытка) и преподавателю занятия."""
    attempt = await require_attempt_access(db, attempt_id, viewer)
    revision = await _ensure_initial_revision(db, attempt_id, attempt.mode or "dds")

    axes_dump = revision.axes or {}
    axes_model = EvaluationAxes(
        time_score=axes_dump.get("timeScore"),
        correctness_score=axes_dump.get("correctnessScore"),
        grammar_score=axes_dump.get("grammarScore"),
        semantic_score=axes_dump.get("semanticScore"),
    )

    total_score = revision.total_score if revision.status in ("preliminary", "final") else None

    return AssessmentStateResponse(
        attempt_id=revision.attempt_id,
        mode=revision.mode,  # type: ignore[arg-type]
        status=revision.status,  # type: ignore[arg-type]
        revision=revision.revision,
        available_axes=revision.available_axes,  # type: ignore[arg-type]
        axes=axes_model,
        total_score=total_score,
        reason_code="review_pending" if revision.status == "review_required" else None,
        updated_at=revision.created_at,  # type: ignore[arg-type]
    )


@router.get("/attempts/{attempt_id}/review", response_model=AssessmentReviewResponse)
async def get_assessment_review(
    attempt_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[Viewer | None, Depends(get_viewer)],
) -> AssessmentReviewResponse:
    """Полный разбор оценки: доступен только преподавателю и администратору."""
    attempt = await require_attempt_access(db, attempt_id, viewer)
    if viewer is not None and viewer.is_student:
        raise forbidden("Разбор оценки доступен только преподавателю и администратору")

    revision = await _ensure_initial_revision(db, attempt_id, attempt.mode or "dds")
    semantic_reviews = await get_semantic_reviews_for_attempt(db, attempt_id)

    # Читаем ErrorRecord для этой попытки, если есть
    stmt_errors = select(ErrorRecord).where(ErrorRecord.attempt_id == attempt_id).order_by(ErrorRecord.id)
    error_records = list((await db.execute(stmt_errors)).scalars().all())

    axes_dump = revision.axes or {}
    axes_model = EvaluationAxes(
        time_score=axes_dump.get("timeScore"),
        correctness_score=axes_dump.get("correctnessScore"),
        grammar_score=axes_dump.get("grammarScore"),
        semantic_score=axes_dump.get("semanticScore"),
    )

    s_items = [
        SemanticReviewResponseItem(
            id=s.id,
            attempt_id=s.attempt_id,
            field_path=s.field_path,
            reference_fact_ids=s.reference_fact_ids or [],
            reason=s.reason,
            base_similarity=s.base_similarity,
            threshold_version=s.threshold_version,
            decision=s.decision,  # type: ignore[arg-type]
            explanation=s.explanation,
            model_release_id=s.model_release_id,
            validated_at=s.validated_at,  # type: ignore[arg-type]
        )
        for s in semantic_reviews
    ]

    return AssessmentReviewResponse(
        attempt_id=revision.attempt_id,
        mode=revision.mode,  # type: ignore[arg-type]
        status=revision.status,  # type: ignore[arg-type]
        revision=revision.revision,
        available_axes=revision.available_axes,  # type: ignore[arg-type]
        axes=axes_model,
        total_score=revision.total_score,
        etalon_version=revision.etalon_version,
        assessor_version=revision.assessor_version,
        model_release_id=revision.model_release_id,
        semantic_reviews=s_items,
        error_records=error_records,  # type: ignore[arg-type]
        teacher_override=revision.teacher_override,
        updated_at=revision.created_at,  # type: ignore[arg-type]
    )


@router.post("/attempts/{attempt_id}/resolve", response_model=EvaluationRevisionSchema)
async def post_assessment_resolve(
    attempt_id: str,
    payload: AssessmentResolveRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    viewer: Annotated[Viewer | None, Depends(get_viewer)],
) -> EvaluationRevisionSchema:
    """Арбитраж преподавателя: итоговое утверждение оценки (final)."""
    await require_attempt_access(db, attempt_id, viewer)
    if viewer is None or viewer.is_student:
        raise forbidden("Разрешение спора оценки доступно только преподавателю и администратору")

    teacher = await db.get(User, viewer.user_id)
    if teacher is None:
        raise not_found("Пользователь преподавателя не найден")

    rev = await resolve_assessment(
        db=db,
        attempt_id=attempt_id,
        expected_revision=payload.expected_revision,
        score=payload.score,
        comment=payload.comment,
        teacher=teacher,
        semantic_decisions=[item.model_dump() for item in payload.semantic_decisions],
        request_id=payload.request_id,
    )

    axes_dump = rev.axes or {}
    axes_model = EvaluationAxes(
        time_score=axes_dump.get("timeScore"),
        correctness_score=axes_dump.get("correctnessScore"),
        grammar_score=axes_dump.get("grammarScore"),
        semantic_score=axes_dump.get("semanticScore"),
    )

    return EvaluationRevisionSchema(
        schema_version="ai-workflow/1",
        attempt_id=rev.attempt_id,
        mode=rev.mode,  # type: ignore[arg-type]
        status=rev.status,  # type: ignore[arg-type]
        revision=rev.revision,
        available_axes=rev.available_axes,  # type: ignore[arg-type]
        total_score=rev.total_score,
        etalon_version=rev.etalon_version,
        assessor_version=rev.assessor_version,
        model_release_id=rev.model_release_id,
        errors=[],
        axes=axes_model,
        created_at=rev.created_at,  # type: ignore[arg-type]
    )
