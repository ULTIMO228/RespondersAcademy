"""Спека 003, T016: каркас роутера карты ошибок — подключение в /api/v1, роли, 401/403, общие параметры mode/period.

Параметры проверяются зависимостью `map_params` на отдельном приложении-зонде с теми же обработчиками ошибок:
ни одного маршрута карты, который использовал бы её, пока нет (его добавят истории 1–7).
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest_asyncio
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.api.errors import install_error_handlers
from app.api.v1.error_map import MapParams, map_params
from app.db.session import get_sessionmaker
from app.models.user import User
from tests.conftest import login_as, token_for

KOVALEV_ID = "u-003"  # assignedGroups: ["ДДС-02"]
VINOGRADOVA_ID = "u-004"  # assignedGroups: пусто
ROUTE = "/error-map/groups"


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


async def _students_in(group_id: str) -> int:
    async with get_sessionmaker()() as db:
        return int(
            (await db.execute(select(func.count(User.id)).where(User.role == "student", User.group == group_id))).scalar_one()
        )


def test_error_map_router_is_mounted_under_v1_only(app):
    paths = app.openapi()["paths"]
    assert "/api/v1/error-map/groups" in paths
    assert not [path for path in paths if path.startswith("/api/mock/error-map")]


async def test_groups_is_not_served_under_mock_prefix(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock") as mock:
        assert (await mock.get(ROUTE)).status_code == 404


async def test_groups_without_session_is_401(v1: AsyncClient):
    response = await v1.get(ROUTE)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


async def test_groups_refuses_student(v1: AsyncClient):
    await login_as(v1, "student")
    response = await v1.get(ROUTE)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


async def test_teacher_gets_only_assigned_groups(v1: AsyncClient):
    await login_as(v1, "teacher")
    response = await v1.get(ROUTE)
    assert response.status_code == 200, response.text
    assert response.json() == [{"groupId": "ДДС-01", "title": "ДДС-01", "studentCount": await _students_in("ДДС-01")}]


async def test_admin_gets_every_group(v1: AsyncClient):
    await login_as(v1, "admin")
    response = await v1.get(ROUTE)
    assert response.status_code == 200, response.text
    assert [item["groupId"] for item in response.json()] == ["ДДС-01", "ДДС-02"]


async def test_teacher_without_assignments_gets_empty_list(v1: AsyncClient):
    v1.headers["Authorization"] = f"Bearer {await token_for(VINOGRADOVA_ID)}"
    response = await v1.get(ROUTE)
    assert response.status_code == 200, response.text
    assert response.json() == []


async def test_second_teacher_sees_only_own_group(v1: AsyncClient):
    v1.headers["Authorization"] = f"Bearer {await token_for(KOVALEV_ID)}"
    response = await v1.get(ROUTE)
    assert response.status_code == 200, response.text
    assert [item["groupId"] for item in response.json()] == ["ДДС-02"]
    assert response.json()[0]["studentCount"] == await _students_in("ДДС-02")


def _probe_app() -> FastAPI:
    probe = FastAPI()
    install_error_handlers(probe)

    @probe.get("/probe")
    async def probe_route(params: MapParams = Depends(map_params)) -> dict[str, str]:
        return {"mode": params.mode, "period": params.period}

    return probe


async def _probe(query: str = "") -> httpx.Response:
    async with AsyncClient(transport=ASGITransport(app=_probe_app()), base_url="http://test") as client:
        return await client.get(f"/probe{query}")


async def test_map_params_defaults_to_dds_and_one_month():
    response = await _probe()
    assert response.status_code == 200
    assert response.json() == {"mode": "dds", "period": "1m"}


async def test_map_params_accepts_known_values_and_blank_as_default():
    response = await _probe("?mode=operator112&period=all")
    assert response.status_code == 200 and response.json() == {"mode": "operator112", "period": "all"}
    blank = await _probe("?mode=&period=")
    assert blank.status_code == 200 and blank.json() == {"mode": "dds", "period": "1m"}


async def test_map_params_unknown_mode_is_400_in_common_error_form():
    response = await _probe("?mode=ops")
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "validationFailed"
    assert "«mode»" in error["message"] and "dds" in error["message"]


async def test_map_params_unknown_period_is_400_not_422():
    response = await _probe("?period=week")
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "validationFailed" and "«period»" in error["message"]
