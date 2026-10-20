"""Реализованные эндпоинты /api/v1; ошибка импорта блокирует запуск."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import require_viewer


def build_router() -> APIRouter:
    from app.api.v1 import (
        ai_assessments,
        ai_chat,
        ai_errors,
        ai_provider,
        ai_scenario_runs,
        ai_scenarios,
        ai_settings,
        assignments,
        error_map,
        live_calls,
        lobby,
        operator112,
        performance,
        problem_reports,
        realtime_calls,
        recommendations,
        reports_export,
        scenario_permissions,
        student_cards,
        student_rating,
        teacher_students,
        tickets,
        validation,
        work_messages,
    )

    router = APIRouter()
    for module in (
        realtime_calls,
        live_calls,
        ai_assessments,
        ai_chat,
        ai_errors,
        ai_provider,
        ai_scenarios,
        ai_settings,
        ai_scenario_runs,
        scenario_permissions,
        lobby,
        recommendations,
        work_messages,
        reports_export,
        teacher_students,
        tickets,
        operator112,
        performance,
        assignments,
        validation,
        error_map,
        student_rating,
        problem_reports,
        student_cards,
    ):
        # Без действующей сессии — 401 (ТЗ §9); /api/v1/health объявлен в main.py и остаётся открытым.
        router.include_router(module.router, dependencies=[Depends(require_viewer)])
    # Авторизация WebSocket — по билету внутри эндпоинта, cookie-зависимость на нём падает (нет Request).
    router.include_router(realtime_calls.ws_router)
    return router
