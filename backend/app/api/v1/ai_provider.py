"""Статус внешнего провайдера моделей (спека 004, T005): `GET /api/v1/admin/ai/provider`, только администратор.

Ключ не отдаётся; сеть не используется (достижимость провайдера не проверяется на каждый запрос).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.api.deps import Viewer, get_db, require_role
from app.services import ai_health_service, ai_settings_service
from ml.generate import llm

router = APIRouter()
admin_only = require_role("admin")


@router.get("/admin/ai/provider")
async def provider_status(
    db: AsyncSession = Depends(get_db), viewer: Viewer = Depends(admin_only)
) -> dict[str, Any]:
    settings = config.get_settings()
    ai = await ai_settings_service.effective(db)
    configured = ai.source == "cloud" and ai.key_set and ai_settings_service.cloud_allowed()
    health = await ai_health_service.read(db)
    today = dt.datetime.now().astimezone().date()
    used_today = ai_health_service.calls_today(health, today)
    within_limits = llm._cloud_limiter().blocked(used_today) is None if configured else True
    return {
        "provider": "polza" if ai.source == "cloud" else "local",
        "model": llm.CLOUD_MODEL if configured and ai.origin == "db" else settings.polza_model if configured else None,
        "configured": configured,
        "withinLimits": within_limits,
    }
