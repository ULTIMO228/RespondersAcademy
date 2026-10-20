"""Общие фикстуры: SQLite in-memory с сидами фронта, httpx-клиент, вход под ролью (cookie arm112_session)."""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import tempfile
from collections.abc import AsyncIterator
from urllib.parse import quote

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

os.environ.setdefault("JWT_SECRET", secrets.token_urlsafe(48))

from app.config import Settings, get_settings

# Локальный backend/.env разработчика (ключи, AI_PROVIDER=polza, живые звонки) тестам не нужен:
# иначе прогон уходит во внешние платные API. До первого get_settings().
Settings.model_config["env_file"] = None

from app.db.session import configure_engine, get_sessionmaker  # noqa: E402
from app.seed.load import run_seed  # noqa: E402
from app.services import reference as reference_service  # noqa: E402

os.environ.setdefault("ML_WARMUP", "0")  # get_settings() ещё не вызывался: модели грузятся лениво там, где нужны тесту
os.environ.setdefault("VAR_DIR", tempfile.mkdtemp(prefix="arm112-test-var-"))  # готовые демо-WAV из var/audio тестам не мешают
os.environ.setdefault("DEMO_AUDIO_DIR", tempfile.mkdtemp(prefix="arm112-test-demo-audio-"))
os.environ.setdefault("TTS_ENABLED", "0")  # аудио билетов в тестах не синтезируется (аварийный режим с расшифровкой)

DEMO_USERS = {
    "student": {"login": "ivanov", "password": "student112", "armNumber": 1},
    "student2": {"login": "petrova", "password": "student112", "armNumber": 2},
    # spec/008: ivanov — специалист-112; для режима ДДС в тестах — petrova, «чужой» курсант ДДС — sidorova.
    "student3": {"login": "sidorova", "password": "student112", "armNumber": 3},
    "teacher": {"login": "morozova", "password": "teacher112", "armNumber": 21},
    "teacher2": {"login": "kovalev", "password": "teacher112", "armNumber": 22},
    "admin": {"login": "admin", "password": "admin112", "armNumber": 24},
    "blocked": {"login": "lebedev", "password": "student112", "armNumber": 30},
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


@pytest.fixture(autouse=True)
def _reset_chat_rate_limiter():
    """Лимит запросов чата (фича 010) живёт в памяти процесса: сбрасывается между тестами, чтобы они не мешали друг другу."""
    from app.services import attempt_chat

    attempt_chat.rate_limiter.reset()
    yield


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


class AiEnv:
    """Герметичное окружение фичи 006: настройки без `backend/.env`-значений ИИ, чистые строки `ai_settings`/`ai_health`."""

    def __init__(self) -> None:
        self.settings = get_settings().model_copy(
            update={"ai_provider": "local", "polza_api_key": None, "llama_url": None, "ollama_url": None, "ai_settings_key": None}
        )

    def configure(self, **updates) -> None:
        self.settings = self.settings.model_copy(update=updates)


async def _clear_ai_rows() -> None:
    from sqlalchemy import delete

    from app.models.ai_settings import AiHealth, AiSettings

    async with get_sessionmaker()() as db:
        await db.execute(delete(AiSettings))
        await db.execute(delete(AiHealth))
        await db.commit()


@pytest_asyncio.fixture
async def ai_env(app, monkeypatch) -> AsyncIterator[AiEnv]:
    """Фича 006: подменяет `get_settings` для кода ИИ, чистит строки настроек/здоровья и кэши до и после теста."""
    from app.services import ai_settings_service
    from ml.generate import llm

    env = AiEnv()
    for target in ("app.config.get_settings", "app.services.ai_settings_service.get_settings", "app.services.ai_secrets.get_settings"):
        monkeypatch.setattr(target, lambda: env.settings)
    monkeypatch.setattr(llm, "_cloud_transport", None)
    monkeypatch.setattr(llm, "configured_client", lambda: None)
    await _clear_ai_rows()
    ai_settings_service.invalidate_cache()
    llm.reset_external_client()
    yield env
    await _clear_ai_rows()
    ai_settings_service.invalidate_cache()
    llm.reset_external_client()
