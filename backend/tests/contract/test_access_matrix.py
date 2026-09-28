"""SC-013: students cannot read another student's training results."""

from __future__ import annotations

import pytest
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.auth_throttle import AuthThrottle
from app.models.session import Attempt, TrainingSession
from app.services import auth_throttle
from app.services.time import now_iso
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
    progress = await client.post(f"/attempts/{other.id}/progress", json={"enteredText": {"dispatcherAction": "чужая правка"}})
    assert progress.status_code == 403, progress.text
    async with get_sessionmaker()() as db:
        unchanged = await db.get(Attempt, other.id)
        assert unchanged is not None and unchanged.entered_text == other.entered_text

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


@pytest.mark.asyncio
async def test_student_session_list_hides_unassigned_sessions(client):
    session_id = "ses-access-matrix-other"
    async with get_sessionmaker()() as db:
        db.add(TrainingSession(
            id=session_id, teacher_id="u-002", student_ids=["u-006"], scenario_ids=[],
            mode="practice", card_source="generated", card_flow=[], state="configured",
            started_at=now_iso(),
        ))
        await db.commit()
    try:
        await login_as(client, "student")
        response = await client.get("/sessions")
        assert response.status_code == 200
        assert session_id not in {session["id"] for session in response.json()}
    finally:
        async with get_sessionmaker()() as db:
            await db.execute(delete(TrainingSession).where(TrainingSession.id == session_id))
            await db.commit()


@pytest.mark.asyncio
async def test_session_control_requires_teacher_or_admin(client):
    path = "/sessions/ses-2026-09-17-demo/control"
    assert (await client.get(path)).status_code == 401
    assert (await client.post(path, json={"action": "invalid"})).status_code == 401

    await login_as(client, "student")
    assert (await client.get(path)).status_code == 403
    client.cookies.clear()

    await login_as(client, "teacher")
    assert (await client.get(path)).status_code == 200
