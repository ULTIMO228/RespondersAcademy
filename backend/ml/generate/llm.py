"""Клиент Ollama для LLM-пути генерации (R5/R21): локальный сервер `OLLAMA_URL`, JSON-схема ответа, без сети наружу.

Используется только при заданном `OLLAMA_URL` и успешном health-check (`GET /api/tags`, результат кэшируется на
минуту). Любая ошибка (нет сервера, таймаут, невалидный JSON) → `None`, генератор переходит на шаблонный путь.
Зависимость — только `httpx` (уже в проекте); пакет `ollama` не нужен.
"""

from __future__ import annotations

import json
import threading
import time
from collections import deque
from collections.abc import Callable
from datetime import date
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


# --- Внешний провайдер Polza.ai (спека 004) ----------------------------------------------------------------------
# Опция, по умолчанию выключена (`AI_PROVIDER=local`). Внешней модели отдаются только генерация сценариев и пояснение
# карты ошибок; оценка попыток и разбор споров остаются локальными. Любой сбой → `None` и привычный фолбэк.

_external_events: list[dict[str, Any]] = []
_external_lock = threading.Lock()
_external_cache: dict[str, Any] = {}


def drain_external_events() -> list[dict[str, Any]]:
    """События вызовов внешней модели с прошлого опустошения (для журнала аудита): без текстов запросов, ответов и ключа."""
    with _external_lock:
        events = list(_external_events)
        _external_events.clear()
    return events


class PolzaClient(OllamaClient):
    """OpenAI-совместимый клиент Polza.ai: `POST {base}/chat/completions`, ключ в `Authorization: Bearer`.

    Лимиты (запросов в минуту и в сутки) считаются в процессе; превышение — `healthy()` False и `chat_json()` без сети.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 60.0,
        *,
        rpm: int = 20,
        daily_limit: int = 500,
        transport: httpx.BaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
        today: Callable[[], Any] = date.today,
    ) -> None:
        super().__init__(base_url, model, timeout, openai=True)
        self._api_key = api_key
        self._rpm = rpm
        self._daily_limit = daily_limit
        self._transport = transport
        self._clock = clock
        self._today = today
        self._recent: deque[float] = deque()
        self._day: Any = None
        self._day_count = 0
        self.purpose = "scenario_generation"

    def __repr__(self) -> str:
        return f"PolzaClient(model={self.model!r}, base_url={self.url!r})"

    @property
    def provider(self) -> str:
        return f"polza:{self.model}"

    def _within_limits(self) -> bool:
        with _external_lock:
            now = self._clock()
            while self._recent and now - self._recent[0] >= 60.0:
                self._recent.popleft()
            today = self._today()
            if today != self._day:
                self._day, self._day_count = today, 0
            return len(self._recent) < self._rpm and self._day_count < self._daily_limit

    def healthy(self) -> bool:
        """Без обращения к сети: ключ задан и лимиты не исчерпаны."""
        return bool(self._api_key) and self._within_limits()

    def warmup(self, system: str) -> float | None:
        return None

    def _record(self, result: str, request_chars: int) -> None:
        with _external_lock:
            _external_events.append(
                {"purpose": self.purpose, "provider": self.provider, "requestChars": request_chars, "result": result}
            )

    def chat_json(self, system: str, user: str, schema: dict[str, Any], *, seed: int | None = None, max_tokens: int | None = None) -> dict[str, Any] | None:
        size = len(system) + len(user)
        if not self._within_limits():
            self._record("rate_limited", size)
            return None
        with _external_lock:
            self._recent.append(self._clock())
            self._day_count += 1
        payload: dict[str, Any] = {
            "model": self.model,
            "temperature": DEFAULT_TEMPERATURE,
            "max_tokens": max_tokens or 1500,
            "response_format": {"type": "json_schema", "json_schema": {"name": "answer", "schema": schema}},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            **({"seed": seed} if seed is not None else {}),
        }
        try:
            with httpx.Client(transport=self._transport, timeout=self.timeout) as http:
                response = http.post(
                    f"{self.url}/chat/completions", json=payload, headers={"Authorization": f"Bearer {self._api_key}"}
                )
        except httpx.TimeoutException:
            self._record("timeout", size)
            return None
        except httpx.HTTPError:
            self._record("network_error", size)
            return None
        if response.status_code != 200:
            self._record(f"http_{response.status_code}", size)
            return None
        try:
            parsed = json.loads(response.json()["choices"][0]["message"]["content"])
        except (ValueError, TypeError, AttributeError, KeyError, IndexError):
            self._record("bad_response", size)
            return None
        if not isinstance(parsed, dict):
            self._record("bad_response", size)
            return None
        self._record("ok", size)
        return parsed


def reset_external_client() -> None:
    _external_cache.clear()


def external_client() -> PolzaClient | None:
    """Общий клиент Polza.ai (лимиты общие на процесс); None — `AI_PROVIDER` не `polza`."""
    from app.config import get_settings

    settings = get_settings()
    if settings.ai_provider != "polza" or settings.polza_api_key is None:
        return None
    key = (settings.polza_base_url, settings.polza_model)
    if _external_cache.get("key") != key:
        _external_cache["key"] = key
        _external_cache["client"] = PolzaClient(
            settings.polza_base_url,
            settings.polza_api_key.get_secret_value(),
            settings.polza_model,
            settings.polza_timeout_sec,
            rpm=settings.polza_rpm,
            daily_limit=settings.polza_daily_limit,
        )
    return _external_cache["client"]


def generation_client() -> OllamaClient | None:
    """Клиент генерации сценариев: внешний при `AI_PROVIDER=polza`, иначе локальный."""
    return external_client() or configured_client()
