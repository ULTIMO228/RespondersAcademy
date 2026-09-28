"""Реализованные эндпоинты /api/v1; ошибка импорта блокирует запуск."""

from __future__ import annotations

from fastapi import APIRouter


def build_router() -> APIRouter:
    from app.api.v1 import (
        ai_assessments,
        ai_errors,
        ai_scenarios,
        assignments,
        operator112,
        reports_export,
        tickets,
        validation,
    )

    router = APIRouter()
    for module in (
        ai_assessments,
        ai_errors,
        ai_scenarios,
        reports_export,
        tickets,
        operator112,
        assignments,
        validation,
    ):
        router.include_router(module.router)
    return router
