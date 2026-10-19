"""Аудит вызовов внешней модели (спека 004, FR-6): действие `ai.external_call`.

Клиент `ml.generate.llm.PolzaClient` копит события в памяти (без текстов запросов, ответов и ключа), а вызывающий
асинхронный код сбрасывает их в журнал аудита от имени пользователя, чей запрос вызвал обращение к модели.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.services import audit
from ml.generate import llm

ACTION = "ai.external_call"
PURPOSES = {"scenario_generation": "генерация сценария", "error_map_explain": "пояснение карты ошибок"}


async def flush_external_calls(db: AsyncSession, viewer: Viewer | None) -> int:
    """Записывает накопленные события в аудит; возвращает их число. Коммит — на вызывающем."""
    events = llm.drain_external_events()
    for event in events:
        purpose = PURPOSES.get(event["purpose"], event["purpose"])
        await audit.record(
            db,
            action=ACTION,
            user_id=viewer.user_id if viewer else None,
            role=viewer.role if viewer else "system",
            details=f"Внешняя модель {event['provider']}: {purpose}; запрос {event['requestChars']} зн.; результат {event['result']}",
        )
    return len(events)
