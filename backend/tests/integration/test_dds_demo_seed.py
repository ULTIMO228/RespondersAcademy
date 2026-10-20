"""Демо-учётка оператора ДДС egorov: активна, видит своё задание ДДС и получает карточку в АРМ."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import AssignmentAttempt
from app.models.session import Attempt, TrainingSession
from app.models.user import User

EGOROV = {"login": "egorov", "password": "student112"}
DDS_ASSIGNMENT = "asg-003"


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client
    async with get_sessionmaker()() as db:
        links = (await db.execute(select(AssignmentAttempt).where(AssignmentAttempt.assignment_id == DDS_ASSIGNMENT))).scalars().all()
        attempt_ids = [link.attempt_id for link in links]
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id == DDS_ASSIGNMENT))
        await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        await db.execute(delete(TrainingSession).where(TrainingSession.mode == f"assignment:{DDS_ASSIGNMENT}"))
        await db.commit()


async def test_egorov_has_dds_assignment_and_gets_card(v1: AsyncClient):
    assert (await v1.post("/auth/login", json=EGOROV)).status_code == 200
    listing = (await v1.get("/assignments")).json()
    dds = next(item for item in listing if item["id"] == DDS_ASSIGNMENT)
    assert dds["trainingMode"] == "dds" and dds["studentIds"] == ["u-010"]
    started = await v1.post(f"/assignments/{DDS_ASSIGNMENT}/start")
    assert started.status_code == 200, started.text
    attempt = started.json()["attempt"]["attempt"]
    assert attempt["cardId"] in dds["cardIds"] and "sessionId" in started.json()["attempt"]


async def test_other_student_cannot_start_egorov_assignment(v1: AsyncClient):
    assert (await v1.post("/auth/login", json={"login": "petrova", "password": "student112"})).status_code == 200
    assert (await v1.post(f"/assignments/{DDS_ASSIGNMENT}/start")).status_code == 403


async def test_egorov_is_dds_profile_and_cannot_open_112_assignment(v1: AsyncClient):
    session = await v1.post("/auth/login", json=EGOROV)
    assert session.status_code == 200, session.text
    async with get_sessionmaker()() as db:
        assert (await db.get(User, "u-010")).specializations == ["dds"]
    listing = [item["id"] for item in (await v1.get("/assignments")).json()]
    assert "asg-001" not in listing and DDS_ASSIGNMENT in listing
    assert (await v1.post("/assignments/asg-001/start")).status_code == 403
