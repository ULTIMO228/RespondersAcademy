"""Общие схемы и разбор query-параметров в соглашениях мок-слоя (docs/mock-api.md → «Соглашения»)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from starlette.datastructures import QueryParams

from app.api.errors import bad_request

DEFAULT_PAGE = 1
DEFAULT_PER_PAGE = 10
MAX_PER_PAGE = 100


class ApiModel(BaseModel):
    """camelCase-алиасы 1:1 с TS-типами фронта; лишние поля игнорируются."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore", str_strip_whitespace=False)

    def dump(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True, exclude_none=True)


def page_response(items: list[Any], total: int, page: int, per_page: int) -> dict[str, Any]:
    return {"items": items, "total": total, "page": page, "perPage": per_page}


def read_string(params: QueryParams, key: str) -> str | None:
    raw = params.get(key)
    if raw is None:
        return None
    raw = raw.strip()
    return raw or None


def read_list(params: QueryParams, *keys: str) -> list[str]:
    """Повторный ключ (`?a=1&a=2`) + синонимы; CSV не разбирается; пустые значения отбрасываются."""
    values: list[str] = []
    for key in keys:
        values.extend(v.strip() for v in params.getlist(key) if v and v.strip())
    return values


def read_int(params: QueryParams, key: str, fallback: int, minimum: int | None = None, maximum: int | None = None) -> int:
    raw = read_string(params, key)
    if raw is None:
        return fallback
    try:
        if not raw.lstrip("-").isdigit():
            raise ValueError
        parsed = int(raw)
    except ValueError as exc:
        raise bad_request(f"Некорректное значение параметра «{key}»: {raw}") from exc
    if (minimum is not None and parsed < minimum) or (maximum is not None and parsed > maximum):
        raise bad_request(f"Некорректное значение параметра «{key}»: {raw}")
    return parsed


def read_page(params: QueryParams) -> tuple[int, int]:
    page = read_int(params, "page", DEFAULT_PAGE, minimum=1)
    per_page = read_int(params, "perPage", DEFAULT_PER_PAGE, minimum=1, maximum=MAX_PER_PAGE)
    return page, per_page


def read_one_of(params: QueryParams, key: str, allowed: tuple[str, ...], fallback: str | None) -> str | None:
    raw = read_string(params, key)
    if raw is None:
        return fallback
    if raw not in allowed:
        raise bad_request(f"Некорректное значение параметра «{key}»: {raw}")
    return raw
