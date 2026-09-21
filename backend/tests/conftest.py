"""Общие фикстуры: SQLite in-memory с сидами фронта, httpx-клиент, вход под ролью (cookie arm112_session)."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from urllib.parse import quote

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.db.session import configure_engine
from app.seed.load import run_seed
from app.services import reference as reference_service

DEMO_USERS = {
    "student": {"login": "ivanov", "password": "student112", "armNumber": 1},
    "student2": {"login": "petrov", "password": "student112", "armNumber": 2},
    "teacher": {"login": "morozova", "password": "teacher112", "armNumber": 21},
    "admin": {"login": "admin", "password": "admin112", "armNumber": 24},
    "blocked": {"login": "egorov", "password": "student112", "armNumber": 6},
}


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def seeded_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False})
    configure_engine(engine)
    reference_service.reset_cache()
    summary = await run_seed(get_settings().seed_dir, reset=True)
    yield summary
    await engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def app(seeded_db):
    from app.main import create_app

    return create_app()


@pytest_asyncio.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/mock") as http:
        yield http


def cookie_value(session: dict) -> str:
    fields = ("userId", "role", "token", "twoFactorUsed", "issuedAt")
    return quote(json.dumps({key: session[key] for key in fields}, ensure_ascii=False), safe="")


async def login_as(client: AsyncClient, role: str) -> dict:
    """Вход демо-учёткой и установка cookie сессии на клиент; возвращает AuthSession."""
    creds = {**DEMO_USERS[role], "twoFactorCode": "123456"}
    response = await client.post("/auth/login", json=creds)
    assert response.status_code == 200, response.text
    session = response.json()
    client.cookies.set("arm112_session", cookie_value(session))
    return session
