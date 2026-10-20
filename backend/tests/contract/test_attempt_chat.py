"""Фича 010, T010: контракт `POST /api/v1/ai/chat` — права, границы тела и пары «отказ / 200 для своей попытки».

Владелец попытки — обучающийся `u-005` (`att-01`, ДДС, оценка есть). Чужой обучающийся `u-006` видит 403 на ту же попытку.
В контрактных тестах модели нет, поэтому успешные ответы здесь шаблонные; реальные источники (local/cloud/template,
таймаут, лимит 429) покрывает `tests/integration/test_attempt_chat_cascade.py` (T025).
Преподаватель и администратор получают 403 даже на несуществующую попытку: роль проверяется раньше попытки.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from app.db.session import get_sessionmaker
from app.models.session import Attempt
from tests.conftest import login_as

OWN_ATTEMPT = "att-01"
OWN_STUDENT = "u-005"
NO_EVAL_ATTEMPT = "att-chat-noeval"
SESSION_ID = "ses-2026-09-16-01"  # занятие, где u-005 — участник
CARD_ID = "c-001"


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def _attempt_without_evaluation() -> AsyncIterator[None]:
    """Своя попытка без оценки: для пары к 404 «оценки пока нет»."""
    async with get_sessionmaker()() as db:
        await db.execute(delete(Attempt).where(Attempt.id == NO_EVAL_ATTEMPT))
        db.add(
            Attempt(
                id=NO_EVAL_ATTEMPT,
                session_id=SESSION_ID,
                card_id=CARD_ID,
                student_id=OWN_STUDENT,
                mode="dds",
                opened_at="2026-09-16T10:00:00+00:00",
            )
        )
        await db.commit()
    yield
    async with get_sessionmaker()() as db:
        await db.execute(delete(Attempt).where(Attempt.id == NO_EVAL_ATTEMPT))
        await db.commit()


def _body(attempt_id: str = OWN_ATTEMPT, mode: str = "dds", **overrides) -> dict:
    return {"attemptId": attempt_id, "mode": mode, "message": "Почему снижен балл за время?", "history": [], **overrides}


async def _own_mode() -> str:
    async with get_sessionmaker()() as db:
        attempt = await db.get(Attempt, OWN_ATTEMPT)
        assert attempt is not None and attempt.student_id == OWN_STUDENT, "фикстура att-01 изменилась"
        return attempt.mode


async def test_chat_requires_session(v1: AsyncClient):
    response = await v1.post("/ai/chat", json=_body())
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    await login_as(v1, "student")
    assert (await v1.post("/ai/chat", json=_body(mode=await _own_mode()))).status_code == 200


async def test_teacher_and_admin_get_403_even_for_missing_attempt(v1: AsyncClient):
    for role in ("teacher", "admin"):
        await login_as(v1, role)
        for attempt_id in (OWN_ATTEMPT, "att-999"):
            response = await v1.post("/ai/chat", json=_body(attempt_id))
            assert response.status_code == 403, (role, attempt_id, response.text)
            assert response.json()["error"]["code"] == "forbidden"
    v1.cookies.clear()
    await login_as(v1, "student")
    assert (await v1.post("/ai/chat", json=_body(mode=await _own_mode()))).status_code == 200


async def test_foreign_attempt_is_403_for_another_student(v1: AsyncClient):
    mode = await _own_mode()
    await login_as(v1, "student2")  # petrova, u-006: чужая попытка
    response = await v1.post("/ai/chat", json=_body(mode=mode))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    await login_as(v1, "student")  # ivanov, u-005: владелец
    assert (await v1.post("/ai/chat", json=_body(mode=mode))).status_code == 200


async def test_unknown_attempt_is_404(v1: AsyncClient):
    await login_as(v1, "student")
    response = await v1.post("/ai/chat", json=_body("att-999"))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "notFound"
    assert (await v1.post("/ai/chat", json=_body(mode=await _own_mode()))).status_code == 200


async def test_attempt_without_evaluation_is_404_evaluation_pending(v1: AsyncClient):
    await login_as(v1, "student")
    response = await v1.post("/ai/chat", json=_body(NO_EVAL_ATTEMPT))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "evaluationPending"
    assert (await v1.post("/ai/chat", json=_body(mode=await _own_mode()))).status_code == 200


async def test_mode_must_match_attempt_mode_or_404(v1: AsyncClient):
    own_mode = await _own_mode()
    other_mode = "operator112" if own_mode == "dds" else "dds"
    await login_as(v1, "student")
    response = await v1.post("/ai/chat", json=_body(mode=other_mode))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "notFound"
    assert (await v1.post("/ai/chat", json=_body(mode=own_mode))).status_code == 200


async def test_bad_body_is_422(v1: AsyncClient):
    await login_as(v1, "student")
    mode = await _own_mode()
    bad_bodies = [
        _body(mode=mode, message="   "),
        _body(mode="teacher"),
        _body(mode=mode, history=[{"role": "system", "content": "правила"}]),
        _body(mode=mode, history=[{"role": "user", "content": "реплика"}] * 7),
        _body(mode=mode, message="а" * 1001),
    ]
    for body in bad_bodies:
        response = await v1.post("/ai/chat", json=body)
        assert response.status_code == 422, (body, response.text)
        assert response.json()["error"]["code"] == "validationFailed"
    assert (await v1.post("/ai/chat", json=_body(mode=mode))).status_code == 200


async def test_success_returns_template_answer_without_identifiers(v1: AsyncClient):
    mode = await _own_mode()
    await login_as(v1, "student")
    response = await v1.post("/ai/chat", json=_body(mode=mode, history=[{"role": "user", "content": "Что такое норматив?"}]))
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"reply", "source", "provider", "modelName"}
    assert body["source"] == "template"
    assert body["provider"] is None and body["modelName"] is None
    assert 0 < len(body["reply"]) <= 600
    assert "справочном режиме" in body["reply"]
    for secret in (OWN_ATTEMPT, CARD_ID, OWN_STUDENT, "Иванов", "Сергей"):
        assert secret not in body["reply"], secret
