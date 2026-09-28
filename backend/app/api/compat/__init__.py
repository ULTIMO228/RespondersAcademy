"""Совместимый контракт фронта; все объявленные роутеры обязательны."""

from __future__ import annotations

from fastapi import APIRouter

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


def build_router() -> APIRouter:
    router = APIRouter()
    router.include_router(auth.router)
    router.include_router(reference.router)
    router.include_router(users.router)
    for module in (
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
        router.include_router(module.router)
    return router
