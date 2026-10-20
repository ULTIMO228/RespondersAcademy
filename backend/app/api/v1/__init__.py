"""Реализованные эндпоинты /api/v1; ошибка импорта блокирует запуск."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import require_viewer


def build_router() -> APIRouter:
    from app.api.v1 import (
        ai_assessments,
        ai_errors,
        ai_provider,
        ai_scenarios,
        assignments,
        error_map,
        live_calls,
        lobby,
        operator112,
        problem_reports,
        realtime_calls,
        recommendations,
        reports_export,
        student_cards,
        student_rating,
        tickets,
        validation,
        work_messages,
    )

    router = APIRouter()
    for module in (
        realtime_calls,
        live_calls,
        ai_assessments,
        ai_errors,
        ai_provider,
        ai_scenarios,
        lobby,
        recommendations,
        work_messages,
        reports_export,
        tickets,
        operator112,
        assignments,
        validation,
        error_map,
        student_rating,
        problem_reports,
        student_cards,
    ):
        # Без действующей сессии — 401 (ТЗ §9); /api/v1/health объявлен в main.py и остаётся открытым.
        router.include_router(module.router, dependencies=[Depends(require_viewer)])
    return router
