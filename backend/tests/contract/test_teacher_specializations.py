"""Фича 007: преподаватель меняет специализацию обучающегося только в своей группе."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models.audit import AuditLog
from app.models.user import User
from tests.conftest import login_as


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture
async def group_scope() -> AsyncIterator[None]:
    async with get_sessionmaker()() as db:
        teacher = await db.get(User, "u-002")
        student = await db.get(User, "u-006")
        assert teacher is not None and student is not None
        teacher.assigned_groups = ["Группа 007"]
        student.group = "Группа 007"
        before = list(student.specializations or [])
        await db.commit()
    yield
    # Свежая сессия: PATCH менял строку в другой сессии, объект выше устарел и откат не записал бы
    async with get_sessionmaker()() as db:
        student = await db.get(User, "u-006")
        teacher = await db.get(User, "u-002")
        student.specializations = before
        student.group = "ДДС-01"
        teacher.assigned_groups = ["ДДС-01"]
        await db.commit()


async def test_teacher_updates_specialization_for_own_group_and_audits(v1: AsyncClient, group_scope) -> None:
    await login_as(v1, "teacher")
    response = await v1.patch("/teacher/students/u-006/specializations", json={"specializations": ["operator112"]})
    assert response.status_code == 200, response.text
    assert response.json()["specializations"] == ["operator112"]

    async with get_sessionmaker()() as db:
        event = (await db.execute(select(AuditLog).where(AuditLog.action == "user.specialization_changed"))).scalars().first()
        assert event is not None


async def test_teacher_cannot_update_student_outside_assigned_groups(v1: AsyncClient, group_scope) -> None:
    await login_as(v1, "teacher")
    response = await v1.patch("/teacher/students/u-005/specializations", json={"specializations": ["dds"]})
    assert response.status_code == 403


async def test_teacher_specialization_rejects_empty_values(v1: AsyncClient, group_scope) -> None:
    await login_as(v1, "teacher")
    response = await v1.patch("/teacher/students/u-006/specializations", json={"specializations": []})
    assert response.status_code == 400
