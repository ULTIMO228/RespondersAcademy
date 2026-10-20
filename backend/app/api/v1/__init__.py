"""Реализованные эндпоинты /api/v1; ошибка импорта блокирует запуск."""

from __future__ import annotations

from fastapi import APIRouter


def build_router() -> APIRouter:
    from app.api.v1 import (
        ai_assessments,
        ai_errors,
        ai_provider,
        ai_scenario_runs,
        ai_scenarios,
        assignments,
        error_map,
        lobby,
        operator112,
        recommendations,
        reports_export,
        scenario_permissions,
        tickets,
        validation,
        work_messages,
    )

    router = APIRouter()
    for module in (
        ai_assessments,
        ai_errors,
        ai_provider,
        ai_scenarios,
        ai_scenario_runs,
        scenario_permissions,
        lobby,
        recommendations,
        work_messages,
        reports_export,
        tickets,
        operator112,
        assignments,
        lobby,
        recommendations,
        work_messages,
        validation,
        error_map,
    ):
        router.include_router(module.router)
    return router
