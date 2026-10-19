"""Реализованные эндпоинты /api/v1; ошибка импорта блокирует запуск."""

from __future__ import annotations

from fastapi import APIRouter


def build_router() -> APIRouter:
    from app.api.v1 import (
        ai_assessments,
        ai_errors,
        ai_scenarios,
        assignments,
        live_calls,
        lobby,
        operator112,
        realtime_calls,
        recommendations,
        reports_export,
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
        ai_scenarios,
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
    ):
        router.include_router(module.router)
    return router
