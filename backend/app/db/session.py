"""Async engine / sessionmaker и зависимость get_db."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db.base import Base

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        settings = get_settings()
        if settings.sqlite:
            settings.var_dir.mkdir(parents=True, exist_ok=True)
        _engine = create_async_engine(settings.resolved_database_url, future=True)
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


def configure_engine(engine: AsyncEngine) -> None:
    """Подмена engine (тесты: SQLite in-memory)."""
    global _engine, _sessionmaker
    _engine = engine
    _sessionmaker = async_sessionmaker(engine, expire_on_commit=False)


async def init_db() -> None:
    """create_all — для SQLite и тестов; в PostgreSQL схему ведёт Alembic."""
    from app import models  # noqa: F401  # регистрация таблиц
    from app.models.ai_assessment import install_ai_assessment_guards
    from app.models.ai_scenario import install_ai_scenario_guards

    engine = get_engine()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.run_sync(install_ai_scenario_guards)
        await connection.run_sync(install_ai_assessment_guards)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session
