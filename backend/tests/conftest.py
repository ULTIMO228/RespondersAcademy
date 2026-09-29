"""Общие фикстуры: SQLite in-memory с сидами фронта, httpx-клиент, вход под ролью (cookie arm112_session)."""

from __future__ import annotations

import asyncio
import json
import os
import secrets
from collections.abc import AsyncIterator
from urllib.parse import quote

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(48))

from app.config import get_settings
from app.db.session import configure_engine, get_sessionmaker
from app.seed.load import run_seed
from app.services import reference as reference_service

os.environ.setdefault("ML_WARMUP", "0")  # get_settings() ещё не вызывался: модели грузятся лениво там, где нужны тесту
os.environ.setdefault("TTS_ENABLED", "0")  # аудио билетов в тестах не синтезируется (аварийный режим с расшифровкой)

DEMO_USERS = {
    "student": {"login": "ivanov", "password": "student112", "armNumber": 1},
    "student2": {"login": "petrova", "password": "student112", "armNumber": 2},
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
    """Вход демо-учёткой; cookie сессии (JWT) ставит сам сервер, клиент хранит её в jar; возвращает AuthSession."""
    creds = DEMO_USERS[role]
    response = await client.post("/auth/login", json=creds)
    assert response.status_code == 200, response.text
    return response.json()


async def token_for(user_id: str) -> str:
    """Создаёт настоящую серверную сессию для проверки доступа без UI-входа."""
    from app.models.user import User
    from app.services.security import build_auth_session

    async with get_sessionmaker()() as db:
        user = await db.get(User, user_id)
        assert user is not None and user.is_active
        session = await build_auth_session(db, user)
        await db.commit()
        return str(session["token"])
