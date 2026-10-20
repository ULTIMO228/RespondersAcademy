"""Совместимый контракт фронта; все объявленные роутеры обязательны."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.compat import (
    admin_system,
    admin_users,
    attempts,
    auth,
    calls,
    card_actions,
    cards,
    grammar,
    materials,
    profile_mapping,
    reference,
    reports,
    scenarios,
    sessions,
    users,
)
from app.api.deps import require_viewer


def build_router() -> APIRouter:
    """Без действующей сессии открыт только вход (`/auth/*`), остальное — 401 (ТЗ §9: защита от НСД)."""
    router = APIRouter()
    router.include_router(auth.router)
    for module in (
        reference,
        users,
        cards,
        card_actions,
        attempts,
        sessions,
        calls,
        scenarios,
        materials,
        profile_mapping,
        grammar,
        reports,
        admin_users,
        admin_system,
    ):
        router.include_router(module.router, dependencies=[Depends(require_viewer)])
    return router
