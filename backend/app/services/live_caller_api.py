"""Общий серверный клиент Chat Completions: облако или локальный совместимый сервер."""
from __future__ import annotations

import json
from typing import Any

import httpx

from app.api.errors import ApiError


class CallerApiClient:
    def __init__(self, base_url: str, model: str, api_key: str, timeout: float = 45.0):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._api_key = api_key
        self.timeout = timeout

    def healthy(self) -> bool:
        # У облаков нет общего /health. Старт проверяет конфигурацию, не создаёт платный запрос.
        if not self._api_key:
            raise ApiError(503, "internal", "Добавьте LIVE_CALL_LLM_API_KEY в backend/.env")
        return True

    def complete(self, messages: list[dict[str, str]], schema: dict[str, Any], max_tokens: int) -> dict[str, Any]:
        self.healthy()
        try:
            response = httpx.post(self.base_url + "/chat/completions", headers={"Authorization": "Bearer " + self._api_key},
                                  json={"model": self.model, "messages": messages, "temperature": 0.3,
                                        "max_tokens": max_tokens, "stream": False,
                                        "response_format": {"type": "json_schema", "json_schema": {
                                            "name": "caller_answer", "strict": True, "schema": schema}}},
                                  timeout=self.timeout, follow_redirects=False)
        except httpx.HTTPError as exc:
            raise ApiError(503, "internal", "API разговорной модели недоступен. Повторите отправку") from exc
        if response.status_code in (401, 403):
            raise ApiError(503, "internal", "Проверьте ключ и доступ к модели у API-провайдера")
        if response.status_code == 402:
            raise ApiError(503, "internal", "У API-провайдера недостаточно средств для выбранной модели")
        if response.status_code == 429:
            raise ApiError(503, "internal", "Достигнут лимит API-провайдера. Повторите позже")
        if not response.is_success:
            raise ApiError(503, "internal", "API отклонил запрос. Проверьте URL, имя модели и поддержку JSON Schema")
        try:
            choice = response.json()["choices"][0]
            if choice.get("finish_reason") != "stop":
                raise ValueError("incomplete response")
            result = json.loads(choice["message"]["content"])
            if not isinstance(result, dict):
                raise ValueError("not an object")
            return result
        except (ValueError, TypeError, KeyError, IndexError, AttributeError) as exc:
            raise ApiError(503, "internal", "API вернул неполный или некорректный ответ") from exc

    def chat_json(self, system: str, user: str, schema: dict[str, Any], *, max_tokens: int = 100) -> dict[str, Any]:
        return self.complete([{"role": "system", "content": system}, {"role": "user", "content": user}], schema, max_tokens)
