"""Настройки карты ошибок (T011): умолчания, чтение/запись раздела `errorMap`, проверки, сохранность прочих настроек."""

from __future__ import annotations

from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # регистрирует таблицы в Base.metadata
from app.api.errors import ApiError
from app.db.base import Base
from app.models.reference import SystemSettings
from app.services.error_map_settings import (
    ErrorMapSettings,
    read_error_map_settings,
    save_error_map_settings,
    settings_payload,
)

OTHER_SECTIONS = {
    "security": {"minPasswordLength": 10, "lockAfterAttempts": 4},
    "backup": {"periodHours": 24},
}


@pytest_asyncio.fixture
async def factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def _seed(factory: async_sessionmaker[AsyncSession], settings: dict[str, Any] | None) -> None:
    async with factory() as db:
        if settings is not None:
            db.add(SystemSettings(id=1, settings=settings))
        await db.commit()


async def _stored(factory: async_sessionmaker[AsyncSession]) -> dict[str, Any]:
    async with factory() as db:
        row = await db.get(SystemSettings, 1)
        assert row is not None
        return dict(row.settings)


async def test_defaults_when_settings_row_is_missing(factory):
    await _seed(factory, None)
    async with factory() as db:
        settings = await read_error_map_settings(db)
    assert settings == ErrorMapSettings()
    assert settings_payload(settings) == {
        "sometimesFrom": 0.10,
        "oftenFrom": 0.30,
        "minAttemptsGroup": 5,
        "minAttemptsStudent": 3,
        "sameBandPoints": 10,
    }


async def test_defaults_when_section_is_missing_and_other_sections_untouched(factory):
    await _seed(factory, dict(OTHER_SECTIONS))
    async with factory() as db:
        assert await read_error_map_settings(db) == ErrorMapSettings()


async def test_partial_section_and_null_values_fall_back_to_defaults(factory):
    await _seed(factory, {"errorMap": {"oftenFrom": 0.5, "sameBandPoints": None}})
    async with factory() as db:
        settings = await read_error_map_settings(db)
    assert settings.often_from == 0.5
    assert settings.sometimes_from == 0.10
    assert settings.same_band_points == 10


async def test_save_then_read_roundtrip_stores_camel_case_section(factory):
    await _seed(factory, dict(OTHER_SECTIONS))
    patch = {
        "sometimesFrom": 0.05,
        "oftenFrom": 0.2,
        "minAttemptsGroup": 8,
        "minAttemptsStudent": 4,
        "sameBandPoints": 0,
    }
    async with factory() as db:
        saved = await save_error_map_settings(db, patch)
        await db.commit()
    assert saved == ErrorMapSettings(0.05, 0.2, 8, 4, 0)
    stored = await _stored(factory)
    assert stored["errorMap"] == patch
    async with factory() as db:
        assert await read_error_map_settings(db) == saved


async def test_save_partial_patch_changes_only_given_keys(factory):
    await _seed(factory, {"errorMap": {"sometimesFrom": 0.2, "oftenFrom": 0.5}})
    async with factory() as db:
        saved = await save_error_map_settings(db, {"oftenFrom": 0.6})
        await db.commit()
    assert saved == ErrorMapSettings(sometimes_from=0.2, often_from=0.6)


async def test_save_keeps_other_sections_and_unknown_keys_of_section(factory):
    await _seed(factory, {**OTHER_SECTIONS, "errorMap": {"sometimesFrom": 0.2, "futureKey": "x"}})
    async with factory() as db:
        await save_error_map_settings(db, {"sameBandPoints": 15})
        await db.commit()
    stored = await _stored(factory)
    assert {key: stored[key] for key in OTHER_SECTIONS} == OTHER_SECTIONS
    assert stored["errorMap"]["futureKey"] == "x"
    assert stored["errorMap"]["sometimesFrom"] == 0.2
    assert stored["errorMap"]["sameBandPoints"] == 15


@pytest.mark.parametrize(
    ("patch", "message_fragment"),
    [
        ({"sometimesFrom": 0}, "0 < «иногда» < «часто» < 1"),
        ({"sometimesFrom": 0.3}, "0 < «иногда» < «часто» < 1"),
        ({"oftenFrom": 0.1}, "0 < «иногда» < «часто» < 1"),
        ({"oftenFrom": 1}, "0 < «иногда» < «часто» < 1"),
        ({"sometimesFrom": "0,1"}, "Порог «иногда»"),
        ({"oftenFrom": True}, "Порог «часто»"),
        ({"sameBandPoints": 51}, "Зона «как у группы»"),
        ({"sameBandPoints": -1}, "Зона «как у группы»"),
        ({"sameBandPoints": 2.5}, "Зона «как у группы»"),
        ({"minAttemptsGroup": 0}, "Минимум попыток для группы"),
        ({"minAttemptsStudent": 1.5}, "Минимум попыток для обучающегося"),
        ({"minAttemptsStudent": False}, "Минимум попыток для обучающегося"),
        ({"unknownKey": 1}, "Неизвестные параметры карты ошибок"),
    ],
)
async def test_invalid_values_are_rejected_and_nothing_is_written(factory, patch, message_fragment):
    await _seed(factory, dict(OTHER_SECTIONS))
    before = await _stored(factory)
    async with factory() as db:
        with pytest.raises(ApiError) as caught:
            await save_error_map_settings(db, patch)
    assert caught.value.status == 400
    assert caught.value.code == "validationFailed"
    assert message_fragment in caught.value.message
    assert await _stored(factory) == before


async def test_all_violations_are_reported_together(factory):
    await _seed(factory, {})
    async with factory() as db:
        with pytest.raises(ApiError) as caught:
            await save_error_map_settings(db, {"sameBandPoints": 60, "minAttemptsGroup": 0})
    assert "Зона «как у группы»" in caught.value.message
    assert "Минимум попыток для группы" in caught.value.message


@pytest.mark.parametrize(
    ("patch", "expected"),
    [
        ({"sometimesFrom": 0.01, "oftenFrom": 0.99}, {"sometimes_from": 0.01, "often_from": 0.99}),
        ({"sameBandPoints": 0}, {"same_band_points": 0}),
        ({"sameBandPoints": 50}, {"same_band_points": 50}),
        ({"sameBandPoints": 50.0}, {"same_band_points": 50}),
        (
            {"minAttemptsGroup": 1, "minAttemptsStudent": 1},
            {"min_attempts_group": 1, "min_attempts_student": 1},
        ),
    ],
)
async def test_edge_values_are_accepted(factory, patch, expected):
    await _seed(factory, {})
    async with factory() as db:
        saved = await save_error_map_settings(db, patch)
        await db.commit()
    for field, value in expected.items():
        assert getattr(saved, field) == value
    assert isinstance(saved.same_band_points, int)


async def test_save_without_settings_row_is_not_found(factory):
    await _seed(factory, None)
    async with factory() as db:
        with pytest.raises(ApiError) as caught:
            await save_error_map_settings(db, {"sameBandPoints": 5})
    assert caught.value.status == 404
    assert caught.value.code == "notFound"
