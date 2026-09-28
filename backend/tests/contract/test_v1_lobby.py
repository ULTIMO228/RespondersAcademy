"""US4: история, агрегаты и справочник с изоляцией и правками преподавателя."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.db.session import get_sessionmaker
from app.models.kb import KbArticle
from app.seed.load import seed_kb
from tests.conftest import login_as


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


async def test_own_lobby_history_and_analytics(v1: AsyncClient):
    assert (await v1.get("/me")).status_code == 401
    assert (await v1.get("/me/history")).status_code == 401
    assert (await v1.get("/kb/articles")).status_code == 401
    session = await login_as(v1, "student")
    me = (await v1.get("/me")).json()
    assert me["id"] == session["userId"] and me["armNumber"] == 1
    history = (await v1.get("/me/history?perPage=2")).json()
    assert history["total"] >= 2
    assert len(history["items"]) == 2
    assert all(item["attemptId"] and item["title"] and 0 <= item["score"] <= 100 for item in history["items"])
    assert (await v1.get("/me/history?studentId=u-006")).status_code == 403
    assert (await v1.get("/me/analytics?studentId=u-006")).status_code == 403
    analytics = (await v1.get("/me/analytics")).json()
    assert analytics["byMode"]["dds"]["count"] + analytics["byMode"]["operator112"]["count"] == history["total"]
    assert len(analytics["dynamics"]["values"]) == history["total"]
    assert len(analytics["topErrors"]) <= 3
    assert (await v1.get("/me/history?mode=invalid")).status_code == 400


async def test_kb_source_and_teacher_edit(v1: AsyncClient):
    await login_as(v1, "student")
    response = await v1.get("/kb/articles?group=запах газа")
    assert response.status_code == 200
    articles = response.json()
    assert articles and all("запах газа" in article["group"].casefold() for article in articles)
    article = articles[0]
    assert set(article["sections"]) == {"signs", "notification", "clarify", "ddsDecision", "typicalErrors"}
    assert article["sections"]["notification"]
    article_id = article["id"]
    assert (await v1.get(f"/kb/articles/{article_id}")).json()["id"] == article_id
    assert (await v1.patch(f"/kb/articles/{article_id}", json={"sections": article["sections"]})).status_code == 403
    await login_as(v1, "teacher")
    updated = {**article["sections"], "typicalErrors": [*article["sections"]["typicalErrors"], "Проверено преподавателем"]}
    try:
        response = await v1.patch(f"/kb/articles/{article_id}", json={"sections": updated})
        assert response.status_code == 200, response.text
        assert response.json()["updatedBy"] == "u-002"
        assert "Проверено преподавателем" in (await v1.get(f"/kb/articles/{article_id}")).json()["sections"]["typicalErrors"]
        async with get_sessionmaker()() as db:
            assert await seed_kb(db) >= 1
            assert "Проверено преподавателем" in (await db.get(KbArticle, article_id)).sections["typicalErrors"]
    finally:
        async with get_sessionmaker()() as db:
            row = await db.get(KbArticle, article_id)
            row.sections = article["sections"]
            row.updated_by = None
            row.updated_at = None
            await db.commit()
