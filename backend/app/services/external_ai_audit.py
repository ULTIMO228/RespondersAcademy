"""Аудит обращений к облачной модели (спека 004 FR-6, фича 006): действие `ai.external_call`.

Запись делается по исходу `ml.generate.llm.LlmOutcome` в контексте запроса пользователя, чей запрос вызвал обращение
(`ai_health_service.record_outcomes`). В запись попадают цель, провайдер, размер запроса, результат облака и то, чем
фактически ответили; текстов запроса и ответа и ключа здесь нет — их нет и в самом исходе.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.services import audit
from ml.generate import llm

ACTION = "ai.external_call"
PURPOSES = {
    "scenario_generation": "генерация сценария",
    "error_map_explain": "пояснение карты ошибок",
    "connection_probe": "проверка подключения",
    "attempt_chat": "ответ чата разбора попытки",
}
SERVED = {
    "cloud": "ответила облачная модель",
    "local": "ответила локальная модель (запасной путь)",
    "template": "использован шаблон (запасной путь)",
}


async def audit_outcome(db: AsyncSession, viewer: Viewer | None, outcome: llm.LlmOutcome) -> None:
    """Одна запись аудита на попытку обращения к облаку. Коммит — на вызывающем."""
    purpose = PURPOSES.get(outcome.purpose, outcome.purpose)
    await audit.record(
        db,
        action=ACTION,
        user_id=viewer.user_id if viewer else None,
        role=viewer.role if viewer else "system",
        details=(
            f"Внешняя модель {llm.CLOUD_PROVIDER}: {purpose}; запрос {outcome.request_chars} зн.; "
            f"результат {outcome.cloud_result or outcome.reason or 'ok'}; {SERVED[outcome.source]}"
        ),
    )
