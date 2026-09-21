"""Совместимый контракт фронта (docs/mock-api.md): один роутер, монтируется под /api/mock и /api/v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.compat import auth, reference, users


def build_router() -> APIRouter:
    router = APIRouter()
    router.include_router(auth.router)
    router.include_router(reference.router)
    router.include_router(users.router)
    for module_name in ("cards", "card_actions", "attempts", "sessions", "calls", "scenarios", "materials", "profile_mapping", "grammar", "reports", "admin_users", "admin_system"):
        try:
            module = __import__(f"app.api.compat.{module_name}", fromlist=["router"])
        except ModuleNotFoundError:
            continue
        router.include_router(module.router)
    return router
