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
    """Клиент локальной LLM: Ollama (`/api/chat`) или OpenAI-совместимый llama-server (`openai=True`, `/v1/chat/completions`)."""

    def __init__(self, url: str, model: str, timeout: float = 120.0, *, openai: bool = False) -> None:
        self.url = url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.openai = openai

    @property
    def provider(self) -> str:
        return f"{'llamacpp' if self.openai else 'ollama'}:{self.model}"

    def healthy(self) -> bool:
        cached = _health_cache.get(self.url)
        now = time.monotonic()
        if cached and now - cached[0] < HEALTH_TTL_SEC:
            return cached[1]
        try:
            response = httpx.get(f"{self.url}/health" if self.openai else f"{self.url}/api/tags", timeout=3.0)
            ok = response.status_code == 200
        except httpx.HTTPError:
            ok = False
        _health_cache[self.url] = (now, ok)
        return ok

    def warmup(self, system: str) -> float | None:
        """Прогрев: сервер заранее обрабатывает системный промпт (префикс KV-кэша), первый настоящий запрос не платит за него.

        Возвращает секунды; None — сервер недоступен. Кэш префикса работает, пока системный промпт побайтно тот же.
        """
        if not self.healthy():
            return None
        started = time.perf_counter()
        if self.openai:
            payload: dict[str, Any] = {"model": self.model, "max_tokens": 1, "cache_prompt": True, "messages": [{"role": "system", "content": system}, {"role": "user", "content": "."}]}
            path = "/v1/chat/completions"
        else:
            payload = {"model": self.model, "stream": False, "keep_alive": "30m", "options": {"num_predict": 1}, "messages": [{"role": "system", "content": system}, {"role": "user", "content": "."}]}
            path = "/api/chat"
        try:
            httpx.post(f"{self.url}{path}", json=payload, timeout=self.timeout).raise_for_status()
        except httpx.HTTPError:
            return None
        return time.perf_counter() - started

    def chat_json(self, system: str, user: str, schema: dict[str, Any], *, seed: int | None = None, max_tokens: int | None = None) -> dict[str, Any] | None:
        """Один запрос с JSON-схемой (`format`); None — сервер недоступен или ответ не разобран.

        `max_tokens` ограничивает длину ответа: маленькая модель может не остановиться и «разговаривать» до лимита.
        """
        if self.openai:
            return self._chat_json_openai(system, user, schema, seed, max_tokens)
        payload: dict[str, Any] = {
            "model": self.model,
            "stream": False,
            "format": schema,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "keep_alive": "30m",
            "options": {"temperature": DEFAULT_TEMPERATURE, **({"seed": seed} if seed is not None else {}), **({"num_predict": max_tokens} if max_tokens else {})},
        }
        try:
            response = httpx.post(f"{self.url}/api/chat", json=payload, timeout=self.timeout)
            response.raise_for_status()
            content = response.json().get("message", {}).get("content", "")
            parsed = json.loads(content)
        except (httpx.HTTPError, ValueError, TypeError, AttributeError):
            return None
        return parsed if isinstance(parsed, dict) else None


    def _chat_json_openai(self, system: str, user: str, schema: dict[str, Any], seed: int | None, max_tokens: int | None) -> dict[str, Any] | None:
        payload: dict[str, Any] = {
            "model": self.model,
            "temperature": DEFAULT_TEMPERATURE,
            "max_tokens": max_tokens or 1500,
            "cache_prompt": True,
            "response_format": {"type": "json_schema", "json_schema": {"name": "answer", "schema": schema}},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            **({"seed": seed} if seed is not None else {}),
        }
        try:
            response = httpx.post(f"{self.url}/v1/chat/completions", json=payload, timeout=self.timeout)
            response.raise_for_status()
            parsed = json.loads(response.json()["choices"][0]["message"]["content"])
        except (httpx.HTTPError, ValueError, TypeError, AttributeError, KeyError, IndexError):
            return None
        return parsed if isinstance(parsed, dict) else None


def reset_health_cache() -> None:
    _health_cache.clear()


def configured_client() -> OllamaClient | None:
    """Клиент по настройкам приложения; None — `OLLAMA_URL` не задан."""
    from app.config import get_settings

    settings = get_settings()
    if settings.llama_url:
        return OllamaClient(settings.llama_url, settings.llama_model, settings.ollama_timeout_sec, openai=True)
    if not settings.ollama_url:
        return None
    return OllamaClient(settings.ollama_url, settings.ollama_model, settings.ollama_timeout_sec)
