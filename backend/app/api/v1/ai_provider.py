"""Статус внешнего провайдера моделей (спека 004, T005): `GET /api/v1/admin/ai/provider`, только администратор.

Ключ не отдаётся; сеть не используется (достижимость провайдера не проверяется на каждый запрос).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app import config
from app.api.deps import Viewer, require_role
from ml.generate import llm

router = APIRouter()
admin_only = require_role("admin")


@router.get("/admin/ai/provider")
async def provider_status(viewer: Viewer = Depends(admin_only)) -> dict[str, Any]:
    settings = config.get_settings()
    client = llm.external_client()
    return {
        "provider": settings.ai_provider,
        "model": settings.polza_model if client is not None else None,
        "configured": client is not None,
        "withinLimits": client.healthy() if client is not None else True,
    }
