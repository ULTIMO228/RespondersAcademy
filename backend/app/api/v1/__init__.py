"""Реализованные эндпоинты /api/v1; ошибка импорта блокирует запуск."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import require_viewer


def build_router() -> APIRouter:
    from app.api.v1 import (
        ai_assessments,
        ai_errors,
        ai_scenarios,
        assignments,
        lobby,
        operator112,
        recommendations,
        reports_export,
        tickets,
        validation,
        work_messages,
    )

    router = APIRouter()
    for module in (
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
        # Без действующей сессии — 401 (ТЗ §9); /api/v1/health объявлен в main.py и остаётся открытым.
        router.include_router(module.router, dependencies=[Depends(require_viewer)])
    return router
