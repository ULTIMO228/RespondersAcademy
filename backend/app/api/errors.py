"""Единый формат ошибок контракта фронта: { "error": { "code", "message" } } (docs/mock-api.md)."""

from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

ApiErrorCode = Literal[
    "badRequest",
    "validationFailed",
    "unauthorized",
    "accountBlocked",
    "forbidden",
    "notFound",
    "conflict",
    "invalidTransition",
    "evaluationPending",
    "rateLimited",
    "internal",
]

INTERNAL_MESSAGE = "Внутренняя ошибка сервера"


class ApiError(Exception):
    def __init__(self, status: int, code: ApiErrorCode, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def bad_request(message: str) -> ApiError:
    return ApiError(400, "badRequest", message)


def validation_failed(message: str) -> ApiError:
    return ApiError(400, "validationFailed", message)


def unprocessable(message: str) -> ApiError:
    return ApiError(422, "validationFailed", message)


def unauthorized(message: str) -> ApiError:
    return ApiError(401, "unauthorized", message)


def account_blocked(message: str) -> ApiError:
    return ApiError(403, "accountBlocked", message)


def rate_limited(message: str) -> ApiError:
    return ApiError(429, "rateLimited", message)


def forbidden(message: str) -> ApiError:
    return ApiError(403, "forbidden", message)


def not_found(message: str) -> ApiError:
    return ApiError(404, "notFound", message)


def evaluation_pending(message: str) -> ApiError:
    return ApiError(404, "evaluationPending", message)


def conflict(message: str) -> ApiError:
    return ApiError(409, "conflict", message)


def invalid_transition(message: str) -> ApiError:
    return ApiError(409, "invalidTransition", message)


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def _describe_validation(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "Некорректные поля запроса"
    first = errors[0]
    location = [str(part) for part in first.get("loc", []) if part not in ("body", "query", "path")]
    field = ".".join(location) or "тело запроса"
    kind = first.get("type", "")
    if kind == "json_invalid" or "JSON" in str(first.get("msg", "")):
        return "Некорректное тело запроса: ожидается JSON"
    if kind == "missing":
        return f"Заполните поле «{field}»"
    return f"Некорректное значение поля «{field}»"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        message = _describe_validation(exc)
        code = "badRequest" if "JSON" in message else "validationFailed"
        return error_response(400, code, message)

    @app.exception_handler(Exception)
    async def _internal(_: Request, exc: Exception) -> JSONResponse:
        return error_response(500, "internal", INTERNAL_MESSAGE)
