"""Вызов языковой модели: локальная (llama.cpp `LLAMA_URL` / Ollama `OLLAMA_URL`) и облачная Polza.ai (фича 006).

Локальный клиент используется при заданном URL и успешном health-check (результат кэшируется на минуту). Любая ошибка
(нет сервера, таймаут, невалидный JSON) → `None`. Единая точка вызова с запасным путём — `complete_json` (облако →
локальная → шаблон), см. раздел ниже. Зависимость — только `httpx` (уже в проекте); пакет `ollama` не нужен.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Literal

import httpx

logger = logging.getLogger(__name__)

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




# --- Облачный провайдер Polza.ai и единый вызов модели (спеки 004, 006) --------------------------------------------
# Облако — опция, по умолчанию выключено (источник `local`). Единственная точка вызова модели — `complete_json`:
# облако → локальная модель → шаблон (FR-018). Исход каждого вызова возвращается в `LlmOutcome` и добавляется
# в контекст текущего запроса (`LlmCallContext`), а не в глобальный список: асинхронный код открывает контекст
# (`app.services.ai_health_service.llm_scope`), запускает синхронную работу в потоке (`asyncio.to_thread` и
# `run_in_threadpool` копируют contextvars, список исходов общий по ссылке) и после неё пишет исходы в `ai_health`
# и аудит в своей сессии БД. Без контекста (скрипты, прогрев) облако не используется никогда — только локальная модель.

CLOUD_MODEL = "qwen/qwen3.8-27b"
CLOUD_ROUTE = "cerebras/fp16"
CLOUD_PROVIDER = f"polza:{CLOUD_MODEL}"
# Маршрут закрепляется объектом `provider` в теле запроса Polza.ai (документация «Выбор провайдера»; проверено живым
# вызовом 2026-10-20, research R1): `only` — белый список, `allow_fallbacks=False` — без резервных маршрутов. Неверное
# имя маршрута дало 503 `noProvidersFiltered`, то есть ограничение действительно применяется. Ответ фактический
# маршрут не называет, поэтому гарантия — закрепление в запросе (`check_cloud_route` остаётся True).
# `reasoning_effort="none"`: модель рассуждает по умолчанию, лишние токены рассуждений нам не нужны.
CLOUD_ROUTE_PARAMS: dict[str, Any] | None = {
    "provider": {"only": [CLOUD_ROUTE], "allow_fallbacks": False},
    "reasoning_effort": "none",
}
# Рассуждения всё равно тратят часть лимита токенов (с «none» наблюдалось ~40 токенов), поэтому для облака нижняя
# граница `max_tokens` выше, чем для локальной модели; длину итогового текста ограничивает промпт и очистка.
CLOUD_MIN_MAX_TOKENS = 1500

Source = Literal["cloud", "local", "template"]
ActiveSource = Literal["local", "cloud"]
# Причины — enum `ai_health.last_error_reason` (data-model.md); другие значения таблица отвергнет (CHECK).
Reason = Literal[
    "invalid_key",
    "insufficient_funds",
    "rate_limited",
    "daily_limit",
    "timeout",
    "network",
    "wrong_route",
    "bad_response",
    "local_down",
]

_cloud_transport: httpx.BaseTransport | None = None  # подмена транспорта (тесты); в работе — сеть httpx
_cloud_lock = threading.Lock()
_limiters: dict[tuple[int, int], _CloudLimiter] = {}
_external_cache: dict[str, Any] = {}
_current: ContextVar[LlmCallContext | None] = ContextVar("llm_call_context", default=None)


@dataclass(frozen=True, slots=True)
class LlmOutcome:
    """Исход одного вызова. `data` (ответ модели) скрыт из `repr`; ключа и текстов запроса здесь нет вовсе.

    `reason` — первая причина отказа в цепочке (для облака — облачная), `fallback_reason` — почему не ответила
    и локальная модель, если отказали обе. `cloud_sent` — запрос к облаку действительно ушёл (расход лимита).
    """

    data: dict[str, Any] | None = field(repr=False)
    source: Source
    provider: str | None
    reason: Reason | None
    purpose: str
    active_source: ActiveSource
    request_chars: int
    cloud_result: str | None = None
    cloud_sent: bool = False
    cloud_reserved: bool = False
    fallback_reason: Reason | None = None


@dataclass(slots=True)
class LlmCallContext:
    """Контекст одного запроса: действующие настройки (`EffectiveAiSettings`, секреты скрыты из repr), суточный
    расход облака из `ai_health` на момент открытия и исходы вызовов, сделанных внутри."""

    ai: Any
    calls_today: int = 0
    cloud_reservations: int = 0
    reserve_cloud_call: Callable[[], bool] | None = None
    outcomes: list[LlmOutcome] = field(default_factory=list)


@contextmanager
def bind_context(ctx: LlmCallContext) -> Iterator[LlmCallContext]:
    token = _current.set(ctx)
    try:
        yield ctx
    finally:
        _current.reset(token)


def current_context() -> LlmCallContext | None:
    return _current.get()


def active_source() -> ActiveSource:
    """Выбранный источник текущего запроса; без контекста — `local`."""
    ctx = _current.get()
    return "cloud" if ctx is not None and ctx.ai is not None and ctx.ai.source == "cloud" else "local"


def build_cloud_payload(
    system: str, user: str, schema: dict[str, Any], *, seed: int | None = None, max_tokens: int | None = None
) -> dict[str, Any] | None:
    """Тело запроса к облаку с закреплёнными моделью и маршрутом; None — маршрут не подтверждён, облако не вызывать.

    Маршрут закреплён без резервных (см. `CLOUD_ROUTE_PARAMS`).
    """
    if CLOUD_ROUTE_PARAMS is None:
        return None
    payload = _openai_payload(CLOUD_MODEL, system, user, schema, seed, max(max_tokens or 0, CLOUD_MIN_MAX_TOKENS))
    return {**payload, **CLOUD_ROUTE_PARAMS}


def check_cloud_route(body: dict[str, Any]) -> bool:
    """Ответ пришёл по закреплённому маршруту. Ответ Polza фактический маршрут не называет (проверено 2026-10-20),
    поэтому проверять нечего: FR-002/SC-004 обеспечиваются закреплением `provider.only` + `allow_fallbacks=False`."""
    return True


def _openai_payload(model: str, system: str, user: str, schema: dict[str, Any], seed: int | None, max_tokens: int | None) -> dict[str, Any]:
    return {
        "model": model,
        "temperature": DEFAULT_TEMPERATURE,
        "max_tokens": max_tokens or 1500,
        "response_format": {"type": "json_schema", "json_schema": {"name": "answer", "schema": schema}},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        **({"seed": seed} if seed is not None else {}),
    }


class _CloudLimiter:
    """RPM — в памяти; суточная квота сверяется с persisted usage и process-local резервом."""

    def __init__(self, rpm: int, daily_limit: int, clock: Callable[[], float] = time.monotonic, today: Callable[[], Any] = date.today) -> None:
        self._rpm = rpm
        self._daily_limit = daily_limit
        self._clock = clock
        self._today = today
        self._recent: deque[float] = deque()
        self._day: Any = None
        self._day_count = 0

    def _blocked(self, used_today: int, *, count_daily: bool = True) -> Reason | None:
        now = self._clock()
        while self._recent and now - self._recent[0] >= 60.0:
            self._recent.popleft()
        today = self._today()
        if today != self._day:
            self._day, self._day_count = today, 0
        if max(used_today, self._day_count) >= self._daily_limit:
            return "daily_limit"
        if len(self._recent) >= self._rpm:
            return "rate_limited"
        return None

    def blocked(self, used_today: int = 0) -> Reason | None:
        with _cloud_lock:
            return self._blocked(used_today)

    def try_take(self, used_today: int = 0, *, count_daily: bool = True) -> Reason | None:
        with _cloud_lock:
            reason = self._blocked(used_today, count_daily=count_daily)
            if reason is None:
                self._recent.append(self._clock())
                if count_daily:
                    self._day_count += 1
            return reason


def _shared_limiter(rpm: int, daily_limit: int) -> _CloudLimiter:
    with _cloud_lock:
        return _limiters.setdefault((rpm, daily_limit), _CloudLimiter(rpm, daily_limit))


class PolzaClient(OllamaClient):
    """OpenAI-совместимый клиент Polza.ai: `POST {base}/chat/completions`, ключ в `Authorization: Bearer`.

    Ключ хранится только в экземпляре (не в `repr`); экземпляр с ключом из БД создаётся на один вызов и не кэшируется.
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
        limiter: _CloudLimiter | None = None,
    ) -> None:
        super().__init__(base_url, model, timeout, openai=True)
        self._api_key = api_key
        self._transport = transport
        self._limiter = limiter or _CloudLimiter(rpm, daily_limit, clock, today)
        self._cloud_reserved = False

    def __repr__(self) -> str:
        return f"PolzaClient(model={self.model!r}, base_url={self.url!r})"

    __str__ = __repr__

    @property
    def provider(self) -> str:
        return f"polza:{self.model}"

    @property
    def cloud_reserved(self) -> bool:
        return self._cloud_reserved

    def healthy(self) -> bool:
        """Без обращения к сети: ключ задан и лимиты не исчерпаны."""
        return bool(self._api_key) and self._limiter.blocked() is None

    def warmup(self, system: str) -> float | None:
        return None

    def request_json(
        self,
        payload: dict[str, Any],
        *,
        used_today: int = 0,
        check_route: bool = False,
        count_toward_daily: bool = True,
        reserve_cloud_call: Callable[[], bool] | None = None,
        before_send: Callable[[], bool] | None = None,
    ) -> tuple[dict[str, Any] | None, str, bool]:
        """Один запрос: (ответ | None, результат `ok` либо причина из `Reason`, ушёл ли запрос в сеть)."""
        self._cloud_reserved = False
        blocked = self._limiter.try_take(used_today, count_daily=count_toward_daily)
        if blocked is not None:
            return None, blocked, False
        if reserve_cloud_call is not None:
            try:
                self._cloud_reserved = reserve_cloud_call()
            except TimeoutError:
                return None, "timeout", False
            except Exception:  # noqa: BLE001 — при ошибке учёта не отправляем оплачиваемый запрос
                return None, "network", False
            if not self._cloud_reserved:
                return None, "daily_limit", False
        if before_send is not None and not before_send():
            return None, "timeout", False
        try:
            with httpx.Client(transport=self._transport, timeout=self.timeout) as http:
                response = http.post(
                    f"{self.url}/chat/completions", json=payload, headers={"Authorization": f"Bearer {self._api_key}"}
                )
        except httpx.TimeoutException:
            return None, "timeout", True
        except httpx.HTTPError:
            return None, "network", True
        if response.status_code != 200:
            return None, _http_reason(response.status_code), True
        try:
            body = response.json()
            parsed = json.loads(body["choices"][0]["message"]["content"])
        except (ValueError, TypeError, AttributeError, KeyError, IndexError):
            return None, "bad_response", True
        if not isinstance(parsed, dict):
            return None, "bad_response", True
        if check_route and not check_cloud_route(body):
            return None, "wrong_route", True
        return parsed, "ok", True

    def chat_json(self, system: str, user: str, schema: dict[str, Any], *, seed: int | None = None, max_tokens: int | None = None) -> dict[str, Any] | None:
        return self.request_json(_openai_payload(self.model, system, user, schema, seed, max_tokens))[0]


def _http_reason(status: int) -> Reason:
    if status in (401, 403):
        return "invalid_key"
    if status == 402:
        return "insufficient_funds"
    if status == 429:
        return "rate_limited"
    if status >= 500:
        return "network"  # сбой на стороне провайдера: для пользователя то же, что недоступность
    return "bad_response"


def _cloud_ready(ai: Any) -> bool:
    """Облако выбрано, стопор снят и форма маршрута подтверждена (без сети и без расшифровки ключа)."""
    if ai is None or ai.source != "cloud":
        return False
    from app.services import ai_settings_service

    return ai_settings_service.cloud_allowed() and build_cloud_payload("", "", {}) is not None


def _cloud_limiter() -> _CloudLimiter:
    from app.config import get_settings

    settings = get_settings()
    return _shared_limiter(settings.polza_rpm, settings.polza_daily_limit)


def _try_cloud(
    ai: Any,
    system: str,
    user: str,
    schema: dict[str, Any],
    seed: int | None,
    max_tokens: int | None,
    used_today: int,
    reserve_cloud_call: Callable[[], bool] | None,
) -> tuple[dict[str, Any] | None, Reason | Literal["ok"], bool, bool]:
    from app.config import get_settings
    from app.services import ai_settings_service
    from app.services.ai_secrets import AiSecretError

    if not ai_settings_service.cloud_allowed():
        return None, "wrong_route", False, False  # стопор: маршрут не подтверждён (T003)
    payload = build_cloud_payload(system, user, schema, seed=seed, max_tokens=max_tokens)
    if payload is None:
        return None, "wrong_route", False, False
    try:
        key = ai_settings_service.default_service().cloud_key(ai)
    except AiSecretError:
        return None, "invalid_key", False, False  # шифртекст не расшифровывается (сменился мастер-ключ)
    if not key:
        return None, "invalid_key", False, False
    settings = get_settings()
    client = PolzaClient(
        settings.polza_base_url, key, CLOUD_MODEL, settings.polza_timeout_sec, transport=_cloud_transport, limiter=_cloud_limiter()
    )
    data, result, sent = client.request_json(
        payload,
        used_today=used_today,
        check_route=True,
        reserve_cloud_call=reserve_cloud_call,
    )
    return data, result, sent, client.cloud_reserved  # type: ignore[return-value]


def complete_json(
    purpose: str,
    system: str,
    user: str,
    schema: dict[str, Any],
    *,
    seed: int | None = None,
    max_tokens: int | None = None,
) -> LlmOutcome:
    """Единый вызов модели: выбранный источник → при облачной ошибке локальная модель → шаблон (`data=None`).

    Исход добавляется в контекст текущего запроса, если он открыт. Шаблонный текст строит вызывающий.
    """
    ctx = _current.get()
    ai = ctx.ai if ctx is not None else None
    active: ActiveSource = "cloud" if ai is not None and ai.source == "cloud" else "local"
    size = len(system) + len(user)
    reason: Reason | None = None
    cloud_result: str | None = None
    sent = False
    reserved = False

    def finish(outcome: LlmOutcome) -> LlmOutcome:
        if ctx is not None:
            ctx.outcomes.append(outcome)
        return outcome

    common = {"purpose": purpose, "active_source": active, "request_chars": size}
    if active == "cloud":
        data, result, sent, reserved = _try_cloud(
            ai,
            system,
            user,
            schema,
            seed,
            max_tokens,
            ctx.calls_today if ctx else 0,
            ctx.reserve_cloud_call if ctx else None,
        )
        if sent and ctx is not None and not reserved:
            ctx.calls_today += 1  # следующий вызов того же запроса видит уже потраченный лимит
        cloud_result = result
        if data is not None:
            return finish(
                LlmOutcome(data, "cloud", CLOUD_PROVIDER, None, cloud_result=result, cloud_sent=sent, cloud_reserved=reserved, **common)
            )
        reason = result  # type: ignore[assignment]

    local = configured_client()
    local_reason: Reason
    if local is None or not local.healthy():
        local_reason = "local_down"
    else:
        try:
            data = local.chat_json(system, user, schema, seed=seed, max_tokens=max_tokens)
        except Exception:  # noqa: BLE001 — сбой локальной модели ведёт к шаблону, а не к ошибке запроса
            logger.warning("complete_json: локальная модель упала (%s)", purpose, exc_info=True)
            data = None
        if data is not None:
            return finish(
                LlmOutcome(
                    data,
                    "local",
                    local.provider,
                    reason,
                    cloud_result=cloud_result,
                    cloud_sent=sent,
                    cloud_reserved=reserved,
                    **common,
                )
            )
        local_reason = "bad_response"
    return finish(
        LlmOutcome(
            None,
            "template",
            None,
            reason or local_reason,
            cloud_result=cloud_result,
            cloud_sent=sent,
            cloud_reserved=reserved,
            fallback_reason=local_reason if reason else None,
            **common,
        )
    )


class RoutedClient:
    """Клиент с интерфейсом `OllamaClient` для генератора сценариев: каждый `chat_json` идёт через `complete_json`.

    Создаётся на один запрос (`purpose` не переходит к другим вызовам); `provider` — тот, кто ответил последним.
    """

    def __init__(self, purpose: str, local: OllamaClient | None) -> None:
        self.purpose = purpose
        self._local = local
        self._provider = CLOUD_PROVIDER if _cloud_ready(_ai()) else (local.provider if local else "template")

    @property
    def provider(self) -> str:
        return self._provider

    def healthy(self) -> bool:
        ctx = _current.get()
        if _cloud_ready(_ai()) and _cloud_limiter().blocked(ctx.calls_today if ctx else 0) is None:
            return True
        return self._local is not None and self._local.healthy()

    def warmup(self, system: str) -> float | None:
        return None

    def chat_json(self, system: str, user: str, schema: dict[str, Any], *, seed: int | None = None, max_tokens: int | None = None) -> dict[str, Any] | None:
        outcome = complete_json(self.purpose, system, user, schema, seed=seed, max_tokens=max_tokens)
        if outcome.provider:
            self._provider = outcome.provider
        return outcome.data


def _ai() -> Any:
    ctx = _current.get()
    return ctx.ai if ctx is not None else None


def generation_client(purpose: str = "scenario_generation") -> RoutedClient | None:
    """Клиент генерации сценариев; None — ни облако (с учётом стопора), ни локальная модель не настроены."""
    local = configured_client()
    if _cloud_ready(_ai()) or local is not None:
        return RoutedClient(purpose, local)
    return None


def reset_external_client() -> None:
    _external_cache.clear()
    with _cloud_lock:
        _limiters.clear()


def external_client() -> PolzaClient | None:
    """Клиент Polza.ai из окружения — только для статуса `GET /admin/ai/provider` (спека 004); вызовы модели идут
    через `complete_json`. None — `AI_PROVIDER` не `polza`. Лимиты общие с `complete_json`."""
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
            limiter=_shared_limiter(settings.polza_rpm, settings.polza_daily_limit),
        )
    return _external_cache["client"]
