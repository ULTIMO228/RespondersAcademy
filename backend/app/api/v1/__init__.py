"""Новые эндпоинты волны B (/api/v1). Пока пусто — заполняется фазами 10–16."""

from __future__ import annotations

from fastapi import APIRouter


def build_router() -> APIRouter:
    router = APIRouter()
    for module_name in ("reports_export", "tickets", "operator112", "assignments", "lobby", "recommendations", "validation", "work_messages"):
        try:
            module = __import__(f"app.api.v1.{module_name}", fromlist=["router"])
        except ModuleNotFoundError:
            continue
        router.include_router(module.router)
    return router
