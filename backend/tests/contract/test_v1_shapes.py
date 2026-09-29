"""Спека 002, T016/T008: ответы `/api/v1` ⊇ обязательные поля TS-типов фронта (`src/shared/api/types/{assignments,lobby,kb,operator112}.ts`).

Сверка идёт по `expected_fields.json` (см. `scripts/extract_ts_fields.py`) тем же способом, что и `test_response_shapes.py`:
лишние поля бэкенда допустимы, отсутствие обязательного поля TS-типа — ошибка контракта.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.db.session import get_sessionmaker
from app.models.assignment import AssignmentAttempt
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation
from app.models.ticket_audio import TicketAudio
from tests.conftest import login_as
from tests.contract.test_response_shapes import assert_shape
from tests.contract.test_v1_operator112 import _draft_for_c010


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _restore_db(app) -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        attempt_ids = list((await db.execute(select(Attempt.id).where(Attempt.mode == "operator112"))).scalars().all())
        await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.attempt_id.in_(attempt_ids)))
        await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.mode_origin.in_(("operator112", "manual"))))
        await db.execute(delete(TicketAudio))
        await db.commit()


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        yield http


async def test_operator112_flow_matches_typescript_types(v1: AsyncClient):
    await login_as(v1, "student")
    listing = await v1.get("/assignments")
    assert listing.status_code == 200
    assert_shape(listing.json(), "Assignment", "list", "/assignments")
    detail = await v1.get("/assignments/asg-001")
    assert_shape(detail.json(), "AssignmentDetail", "object", "/assignments/asg-001")

    started = await v1.post("/assignments/asg-001/start")
    assert started.status_code == 200, started.text
    attempt = started.json()["attempt"]
    assert_shape(attempt, "OperatorAttempt", "object", "start.attempt")
    assert_shape(attempt["hints"], "OperatorHints", "object", "start.attempt.hints")
    assert_shape(attempt["audio"], "TicketAudio", "object", "start.attempt.audio")
    attempt_id = attempt["id"]

    answered = await v1.post(f"/operator112/attempts/{attempt_id}/answer")
    assert_shape(answered.json(), "OperatorAttempt", "object", "answer")

    for body in (
        {"type": "signSelected", "payload": {"signs": ["жилой дом", "балкон", "открытое пламя"]}},
        {"type": "fieldChanged", "payload": {"field": "description", "value": "горит балкон"}},
        {"type": "fieldChanged", "payload": {"field": "description", "value": "горит балкон и окна"}},
    ):
        event = await v1.post(f"/operator112/attempts/{attempt_id}/events", json=body)
        assert event.status_code == 201, event.text
        assert_shape(event.json(), "OperatorEvent", "object", f"events[{body['type']}]")
    assert event.json()["before"] == "горит балкон", "повторная правка поля отдаёт значение до неё"

    notification = await v1.get(f"/operator112/attempts/{attempt_id}/notification-list")
    assert_shape(notification.json(), "NotificationListResponse", "object", "notification-list")
    assert notification.json()["services"], "по признакам пожара обязательные службы не пусты"
    assert_shape(notification.json()["services"], "NotificationListItem", "list", "notification-list.services")
    preview = await v1.get(f"/operator112/attempts/{attempt_id}/notification-list", params={"signs": ["жилой дом"]})
    assert preview.status_code == 200

    submitted = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010())
    assert submitted.status_code == 200, submitted.text
    assert_shape(submitted.json()["attempt"], "OperatorAttempt", "object", "submit.attempt")
    assert submitted.json()["evaluationId"] == attempt_id and "card" in submitted.json()

    evaluation = await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")
    assert_shape(evaluation.json(), "OperatorEvaluation", "object", "evaluation")
    assert_shape(evaluation.json()["fieldDiff"], "FieldDiff", "list", "evaluation.fieldDiff")

    streets = await v1.get("/streets", params={"q": "Грин"})
    assert streets.status_code == 200
    assert_shape(streets.json(), "Street", "list", "/streets")
    assert streets.json(), "справочник улиц находит «Грин…»"

    # Пока попытка открыта в экзамене повтор запрещён — восстановление идёт через start, а не через create.
    again = await v1.post("/assignments/asg-001/start")
    assert again.status_code == 200 and again.json()["attempt"]["id"] != attempt_id  # следующий билет тренировки


async def test_lobby_and_kb_match_typescript_types(v1: AsyncClient):
    await login_as(v1, "student")
    history = await v1.get("/me/history")
    assert history.status_code == 200
    assert_shape(history.json(), "HistoryItem", "page", "/me/history")
    analytics = await v1.get("/me/analytics")
    assert_shape(analytics.json(), "Analytics", "object", "/me/analytics")
    for name in ("byMode", "byFormat", "byGroup"):
        for key, stats in analytics.json()[name].items():
            assert_shape(stats, "Stats", "object", f"/me/analytics.{name}.{key}")
    # Analytics.byFormat — Record<AssignmentFormat, Stats>: оба ключа всегда (страница аналитики падала на отсутствующем exam)
    assert set(analytics.json()["byFormat"]) == {"training", "exam"}
    assert_shape(analytics.json()["dynamics"], "AnalyticsDynamics", "object", "/me/analytics.dynamics")
    assert_shape(analytics.json()["topErrors"], "AnalyticsTopError", "list", "/me/analytics.topErrors")
    articles = await v1.get("/kb/articles")
    assert len(articles.json()) == 105
    assert_shape(articles.json()[:5], "KbArticle", "list", "/kb/articles")
    assert_shape(articles.json()[0]["sections"], "KbSections", "object", "/kb/articles[0].sections")
    recommendations = await v1.get("/me/recommendations")
    assert recommendations.status_code == 200
    assert_shape(recommendations.json(), "Recommendation", "list", "/me/recommendations")
    for item in recommendations.json():
        assert item["kind"] in ("category", "article", "card", "mode")
        assert_shape(item["reason"], "RecommendationReason", "object", "recommendation.reason")
