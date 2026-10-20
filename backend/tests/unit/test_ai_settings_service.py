"""Сервис настроек языковой модели (фича 006, T007): эффективный источник, кэш, сохранение, удаление ключа, стопор облака.

Настройки окружения собираются без `backend/.env` (`_env_file=None`). Часы кэша подменяются, тесты не спят.
Проверки на отсутствие ключа пишутся как `(KEY in text) is False`, чтобы при падении ключ не печатался.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # регистрирует таблицы в Base.metadata
from app.api.errors import ApiError
from app.config import Settings
from app.db.base import Base
from app.models.ai_settings import AiSettings
from app.services import ai_settings_service as svc_module
from app.services.ai_settings_service import AiSettingsService

JWT = "j" * 40
DB_KEY = "pza-db-key-0123456789-ABCD"
ENV_KEY = "pza-env-key-9876543210-WXYZ"


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _env(provider: str = "local", key: str | None = None) -> Settings:
    values = {"JWT_SECRET": JWT, "AI_PROVIDER": provider}
    if key is not None:
        values["POLZA_API_KEY"] = key
    if provider == "polza":
        # Модель обязательна и задаётся явно (AGENTS.md §2, условие организаторов): значения по умолчанию в коде нет.
        values["POLZA_MODEL"] = "qwen/qwen3-30b-a3b-instruct-2507"
    return Settings(_env_file=None, **values)


@pytest_asyncio.fixture
async def factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
def cloud_verified(monkeypatch):
    """Снимает стопор облака на время теста (в коде он False до T003)."""
    monkeypatch.setattr(svc_module, "CLOUD_ROUTE_VERIFIED", True)


def _service(settings: Settings | None = None, clock: FakeClock | None = None) -> AiSettingsService:
    return AiSettingsService(settings=settings or _env(), clock=clock or FakeClock())


# --- эффективный источник: БД, иначе окружение (FR-016) ---


async def test_no_row_falls_back_to_env_local(factory):
    service = _service(_env("local"))
    async with factory() as db:
        effective = await service.effective(db)
    assert (effective.source, effective.origin, effective.key_set) == ("local", "env", False)


async def test_no_row_falls_back_to_env_polza_with_key(factory):
    service = _service(_env("polza", ENV_KEY))
    async with factory() as db:
        effective = await service.effective(db)
    assert (effective.source, effective.origin, effective.key_set, effective.key_last4) == ("cloud", "env", True, "WXYZ")
    assert (service.cloud_key(effective) == ENV_KEY) is True


async def test_db_row_overrides_env(factory, cloud_verified):
    service = _service(_env("polza", ENV_KEY))
    async with factory() as db:
        await service.save(db, source="local", key=DB_KEY, user_id=None)
        await db.commit()
    async with factory() as db:
        effective = await service.effective(db)
    assert (effective.source, effective.origin, effective.key_last4) == ("local", "db", "ABCD")
    assert (service.cloud_key(effective) == DB_KEY) is True


# --- шифрование в БД и отсутствие ключа в repr ---


async def test_key_is_stored_encrypted_and_hidden_from_repr(factory, cloud_verified):
    service = _service()
    async with factory() as db:
        await service.save(db, source="cloud", key=DB_KEY, user_id=None)
        await db.commit()
    async with factory() as db:
        row = (await db.execute(select(AiSettings))).scalar_one()
        assert (DB_KEY in (row.cloud_key_cipher or "")) is False
        assert row.cloud_key_last4 == "ABCD"
        assert ("ABCD" in repr(row)) is False
        effective = await service.effective(db)
    for text in (repr(effective), str(effective)):
        assert (DB_KEY in text) is False
        assert ((row.cloud_key_cipher or "") in text) is False


async def test_env_key_hidden_from_repr(factory):
    service = _service(_env("polza", ENV_KEY))
    async with factory() as db:
        effective = await service.effective(db)
    assert (ENV_KEY in repr(effective)) is False


# --- кэш: инвалидация при сохранении и TTL 5 с ---


async def test_save_invalidates_cache_for_next_call(factory, cloud_verified):
    service = _service()
    async with factory() as db:
        assert (await service.effective(db)).source == "local"  # закэшировано
        await service.save(db, source="cloud", key=DB_KEY, user_id=None)
        await db.commit()
    async with factory() as db:
        assert (await service.effective(db)).source == "cloud"  # сразу, без ожидания TTL


async def test_cache_ttl_five_seconds(factory, cloud_verified):
    clock = FakeClock()
    service = _service(clock=clock)
    other = _service(clock=FakeClock())  # «другой воркер»: пишет в ту же БД, кэш первого не трогает
    async with factory() as db:
        assert (await service.effective(db)).source == "local"
        await other.save(db, source="cloud", key=DB_KEY, user_id=None)
        await db.commit()
    async with factory() as db:
        clock.now += 4.9
        assert (await service.effective(db)).source == "local"  # ещё в кэше
        clock.now += 0.2
        assert (await service.effective(db)).source == "cloud"  # TTL 5 с истёк


# --- облако без ключа и удаление ключа ---


async def test_cloud_without_key_is_rejected(factory, cloud_verified):
    service = _service(_env("polza", ENV_KEY))  # ключ окружения в строку БД не переносится
    async with factory() as db:
        with pytest.raises(ApiError) as caught:
            await service.save(db, source="cloud", key=None, user_id=None)
        assert caught.value.status == 400
        assert (await db.execute(select(AiSettings))).scalar_one_or_none() is None
        # парный: с ключом — сохраняется
        await service.save(db, source="cloud", key=DB_KEY, user_id=None)
        await db.commit()
    async with factory() as db:
        assert (await service.effective(db)).source == "cloud"


async def test_blank_key_counts_as_missing(factory, cloud_verified):
    service = _service()
    async with factory() as db:
        with pytest.raises(ApiError):
            await service.save(db, source="cloud", key="   ", user_id=None)


async def test_save_without_key_keeps_existing_key(factory, cloud_verified):
    service = _service()
    async with factory() as db:
        await service.save(db, source="cloud", key=DB_KEY, user_id=None)
        await db.commit()
        await service.save(db, source="local", key=None, user_id=None)
        await service.save(db, source="cloud", key=None, user_id=None)
        await db.commit()
    async with factory() as db:
        effective = await service.effective(db)
    assert (effective.source, effective.key_last4) == ("cloud", "ABCD")
    assert (service.cloud_key(effective) == DB_KEY) is True


async def test_clear_key_on_cloud_switches_to_local(factory, cloud_verified):
    service = _service()
    async with factory() as db:
        await service.save(db, source="cloud", key=DB_KEY, user_id=None)
        await db.commit()
        result = await service.clear_key(db, user_id=None)
        await db.commit()
    assert result.switched_to_local is True
    async with factory() as db:
        effective = await service.effective(db)
        row = (await db.execute(select(AiSettings))).scalar_one()
    assert (effective.source, effective.key_set, effective.key_last4) == ("local", False, None)
    assert (row.cloud_key_cipher, row.cloud_key_last4) == (None, None)
    assert service.cloud_key(effective) is None


async def test_clear_key_when_env_selects_cloud_reports_switch(factory):
    service = _service(_env("polza", ENV_KEY))
    async with factory() as db:
        assert (await service.effective(db)).source == "cloud"
        result = await service.clear_key(db, user_id=None)
        await db.commit()
    assert result.switched_to_local is True
    async with factory() as db:
        effective = await service.effective(db)
    assert (effective.source, effective.origin, effective.key_set) == ("local", "db", False)


async def test_clear_key_on_local_keeps_local(factory):
    service = _service()
    async with factory() as db:
        await service.save(db, source="local", key=DB_KEY, user_id=None)
        result = await service.clear_key(db, user_id=None)
        await db.commit()
    assert result.switched_to_local is False
    async with factory() as db:
        assert (await service.effective(db)).key_set is False


# --- стопор облака: пока маршрут не подтверждён (T003), выбор cloud отклоняется ---


async def test_cloud_selection_blocked_until_route_verified(factory, monkeypatch):
    monkeypatch.setattr(svc_module, "CLOUD_ROUTE_VERIFIED", False)  # стопор закрыт: выбор cloud отклоняется
    service = _service()
    async with factory() as db:
        with pytest.raises(ApiError) as caught:
            await service.save(db, source="cloud", key=DB_KEY, user_id=None)
        assert caught.value.status == 400
        assert (DB_KEY in caught.value.message) is False
        assert (await db.execute(select(AiSettings))).scalar_one_or_none() is None
        # парный: локальный источник (и сохранение ключа впрок) работает
        await service.save(db, source="local", key=DB_KEY, user_id=None)
        await db.commit()
    async with factory() as db:
        effective = await service.effective(db)
    assert (effective.source, effective.key_set) == ("local", True)


async def test_unknown_source_rejected(factory):
    service = _service()
    async with factory() as db:
        with pytest.raises(ApiError):
            await service.save(db, source="polza", key=None, user_id=None)
