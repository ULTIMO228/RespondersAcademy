"""Каждый роутер /api/v1 подключается один раз: повторное подключение дублирует
обработчики и operationId в OpenAPI (предупреждения FastAPI «Duplicate Operation ID»)."""

from collections import Counter

from app.api.v1 import build_router, recommendations


def test_v1_routers_are_included_once():
    included = Counter(id(route.original_router) for route in build_router().routes)
    assert [count for count in included.values() if count > 1] == []
    assert id(recommendations.router) in included  # роутер рекомендаций по-прежнему подключён
