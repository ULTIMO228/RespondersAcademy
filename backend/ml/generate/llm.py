"""Клиент Ollama для LLM-пути генерации (R5/R21): локальный сервер `OLLAMA_URL`, JSON-схема ответа, без сети наружу.

Используется только при заданном `OLLAMA_URL` и успешном health-check (`GET /api/tags`, результат кэшируется на
минуту). Любая ошибка (нет сервера, таймаут, невалидный JSON) → `None`, генератор переходит на шаблонный путь.
Зависимость — только `httpx` (уже в проекте); пакет `ollama` не нужен.
"""

from __future__ import annotations

import json
import time
from typing import Any

import httpx

HEALTH_TTL_SEC = 60.0
DEFAULT_TEMPERATURE = 0.3

_health_cache: dict[str, tuple[float, bool]] = {}


class OllamaClient:
    def __init__(self, url: str, model: str, timeout: float = 120.0) -> None:
        self.url = url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def healthy(self) -> bool:
        cached = _health_cache.get(self.url)
        now = time.monotonic()
        if cached and now - cached[0] < HEALTH_TTL_SEC:
            return cached[1]
        try:
            response = httpx.get(f"{self.url}/api/tags", timeout=3.0)
            ok = response.status_code == 200
        except httpx.HTTPError:
            ok = False
        _health_cache[self.url] = (now, ok)
        return ok

    def chat_json(self, system: str, user: str, schema: dict[str, Any], *, seed: int | None = None) -> dict[str, Any] | None:
        """Один запрос с JSON-схемой (`format`); None — сервер недоступен или ответ не разобран."""
        payload: dict[str, Any] = {
            "model": self.model,
            "stream": False,
            "format": schema,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "options": {"temperature": DEFAULT_TEMPERATURE, **({"seed": seed} if seed is not None else {})},
        }
        try:
            response = httpx.post(f"{self.url}/api/chat", json=payload, timeout=self.timeout)
            response.raise_for_status()
            content = response.json().get("message", {}).get("content", "")
            parsed = json.loads(content)
        except (httpx.HTTPError, ValueError, TypeError, AttributeError):
            return None
        return parsed if isinstance(parsed, dict) else None


def reset_health_cache() -> None:
    _health_cache.clear()


def configured_client() -> OllamaClient | None:
    """Клиент по настройкам приложения; None — `OLLAMA_URL` не задан."""
    from app.config import get_settings

    settings = get_settings()
    if not settings.ollama_url:
        return None
    return OllamaClient(settings.ollama_url, settings.ollama_model, settings.ollama_timeout_sec)
