"""SC-013: students cannot read another student's training results."""

from __future__ import annotations

import pytest
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.auth_throttle import AuthThrottle
from app.models.session import Attempt
from app.services import auth_throttle
from tests.conftest import login_as


@pytest.mark.asyncio
async def test_student_isolation_across_result_endpoints(client):
    await login_as(client, "student")
    forbidden_queries = (
        "/sessions?studentId=u-006",
        "/reports?studentId=u-006",
        "/reports/journal?studentId=u-006",
    )
    for path in forbidden_queries:
        response = await client.get(path)
        assert response.status_code == 403, (path, response.text)

    async with get_sessionmaker()() as db:
        other = (await db.execute(select(Attempt).where(Attempt.student_id == "u-006").limit(1))).scalar_one_or_none()
    assert other is not None, "сид должен содержать попытку второго обучаемого"
    response = await client.get(f"/attempts/{other.id}/evaluation")
    assert response.status_code == 403, response.text

    assignment = await client.get("http://test/api/v1/assignments", params={"studentId": "u-006"})
    assert assignment.status_code == 403, assignment.text


@pytest.mark.asyncio
async def test_login_throttle_and_security_headers(client, monkeypatch):
    monkeypatch.setattr(auth_throttle, "SOURCE_FAILURE_LIMIT", 2)
    peer = "127.0.0.1"
    async with get_sessionmaker()() as db:
        await db.execute(delete(AuthThrottle).where(AuthThrottle.key_hash == auth_throttle.source_key(peer)))
        await db.commit()
    try:
        for _ in range(2):
            response = await client.post("/auth/login", json={"login": "unknown-throttle-test", "password": "wrong", "armNumber": 1})
            assert response.status_code == 401
        limited = await client.post("/auth/login", json={"login": "unknown-throttle-test", "password": "wrong", "armNumber": 1})
        assert limited.status_code == 429
        assert limited.json()["error"]["code"] == "rateLimited"
        for response in (limited, await client.get("/auth/policy")):
            assert response.headers["X-Content-Type-Options"] == "nosniff"
            assert response.headers["X-Frame-Options"] == "DENY"
            assert response.headers["Referrer-Policy"] == "no-referrer"
            assert "Strict-Transport-Security" not in response.headers  # локальный HTTP
    finally:
        async with get_sessionmaker()() as db:
            await db.execute(delete(AuthThrottle).where(AuthThrottle.key_hash == auth_throttle.source_key(peer)))
            await db.commit()
