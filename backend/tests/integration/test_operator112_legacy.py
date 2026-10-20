"""Спека 009, T071 (FR-033, SC-006): попытки 112, записанные до 009, читаются без ошибок.

Попытка отправлена по старому формату карточки (без `incidents`, `links`, `outcome`, `channel`, расширенного адреса);
в базе её снимок приведён к старому набору полей. Оценка читается учеником, преподавателем и совместимым эндпоинтом,
чужой ученик получает 403, а оценщик пересчитывает такой снимок без `links`. Пары: чужой студент → 403, своя попытка → 200.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.config import get_settings
from app.db.session import get_sessionmaker
from app.models.assignment import Assignment, AssignmentAttempt, AssignmentScenarioVersion, AssignmentStudent
from app.models.card import IncidentCard
from app.models.session import Attempt, Evaluation
from ml.assess import operator112 as assessor
from ml.classify.ekp_group_classifier import classifier_entries
from tests.conftest import login_as
from tests.contract.test_v1_operator112 import _draft_for_c010

TITLE = "009 T071 старые попытки"
IVANOV = "u-005"
# Поля карточки до спеки 009: всё, что вне этого набора, появилось позже и в старом снимке отсутствует.
LEGACY_KEYS = {"applicant", "phones", "address", "what", "description", "emergency", "notificationList"}
LEGACY_ADDRESS_KEYS = {"formal", "street", "house", "okrug", "raion", "descriptive", "source"}
LEGACY_WHAT_KEYS = {"pollAnswers", "signs", "finalType", "classifierCode", "casualties"}
NEW_KEYS = {"incidents", "links", "outcome", "channel", "subject", "locality", "object", "lat", "lon"}


@pytest_asyncio.fixture
async def v1(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as client:
        yield client


@pytest_asyncio.fixture(autouse=True)
async def cleanup() -> AsyncIterator[None]:
    yield
    async with get_sessionmaker()() as db:
        ids = list((await db.execute(select(Assignment.id).where(Assignment.title == TITLE))).scalars().all())
        if not ids:
            return
        attempt_ids = list((await db.execute(select(AssignmentAttempt.attempt_id).where(AssignmentAttempt.assignment_id.in_(ids)))).scalars().all())
        await db.execute(delete(Evaluation).where(Evaluation.attempt_id.in_(attempt_ids)))
        await db.execute(delete(AssignmentAttempt).where(AssignmentAttempt.assignment_id.in_(ids)))
        await db.execute(delete(IncidentCard).where(IncidentCard.source_attempt_id.in_(attempt_ids)))
        await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))
        await db.execute(delete(AssignmentScenarioVersion).where(AssignmentScenarioVersion.assignment_id.in_(ids)))
        await db.execute(delete(AssignmentStudent).where(AssignmentStudent.assignment_id.in_(ids)))
        await db.execute(delete(Assignment).where(Assignment.id.in_(ids)))
        await db.commit()


def legacy_snapshot(draft: dict[str, Any]) -> dict[str, Any]:
    """Снимок в форме до 009: только поля старого набора, без вкладок, связей и расширенного адреса."""
    address = {k: v for k, v in (draft.get("address") or {}).items() if k in LEGACY_ADDRESS_KEYS}
    what = {k: v for k, v in (draft.get("what") or {}).items() if k in LEGACY_WHAT_KEYS}
    snapshot = {k: v for k, v in draft.items() if k in LEGACY_KEYS}
    snapshot.update({"address": address, "what": what})
    return snapshot


async def test_legacy_attempt_is_readable_everywhere(v1: AsyncClient):
    await login_as(v1, "teacher")
    created = await v1.post("/assignments", json={"studentIds": [IVANOV], "trainingMode": "operator112", "format": "training", "cardIds": ["c-010"], "title": TITLE})
    assert created.status_code == 201, created.text
    assignment_id = created.json()["id"]

    await login_as(v1, "student")
    attempt = await v1.post("/operator112/attempts", json={"assignmentId": assignment_id, "cardId": "c-010"})
    assert attempt.status_code in (200, 201), attempt.text
    attempt_id = attempt.json()["id"]
    assert (await v1.post(f"/operator112/attempts/{attempt_id}/answer")).status_code == 200
    submitted = await v1.post(f"/operator112/attempts/{attempt_id}/submit", json=_draft_for_c010())
    assert submitted.status_code == 200, submitted.text

    # Превращаем записанный снимок в снимок старого формата (как в базе до 009).
    async with get_sessionmaker()() as db:
        row = await db.get(Attempt, attempt_id)
        assert row is not None and row.card_snapshot
        row.card_snapshot = legacy_snapshot(dict(row.card_snapshot))
        await db.commit()
    async with get_sessionmaker()() as db:
        stored = (await db.execute(select(Attempt.card_snapshot).where(Attempt.id == attempt_id))).scalar_one()
    assert set(stored) <= LEGACY_KEYS and not NEW_KEYS & set(stored)
    assert set(stored["address"]) <= LEGACY_ADDRESS_KEYS and set(stored["what"]) <= LEGACY_WHAT_KEYS

    # Ученик: оценка читается, поля контракта на месте, связей в оценке нет.
    evaluation = await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")
    assert evaluation.status_code == 200, evaluation.text
    data = evaluation.json()
    assert {"timeScore", "correctnessScore", "grammarScore", "semanticScore", "totalScore", "errors", "aiComment", "fieldDiff", "components"} <= set(data)
    assert "links" not in data["components"] and "passed" not in data
    assert all(error.get("ruleId") and " — " in error["message"] for error in data["errors"])

    # Совместимый эндпоинт отдаёт ту же оценку; преподаватель видит её тоже.
    assert (await v1.get(f"/attempts/{attempt_id}/evaluation")).json()["totalScore"] == data["totalScore"]
    await login_as(v1, "teacher")
    teacher = await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")
    assert teacher.status_code == 200 and teacher.json()["totalScore"] == data["totalScore"]

    # Чужой ученик — 403, свой — 200 (пара).
    await login_as(v1, "student2")
    assert (await v1.get(f"/operator112/attempts/{attempt_id}/evaluation")).status_code == 403

    # Оценщик пересчитывает снимок старого формата без ошибок (вкладки и связи отсутствуют).
    await login_as(v1, "student")
    ticket = (await v1.get("/tickets", params={"q": "c-010"})).json()[0]
    with (get_settings().seed_dir / "spec" / "000-фронт" / "mocks" / "reference.json").open(encoding="utf-8") as handle:
        reference: dict[str, Any] = json.load(handle)
    async with get_sessionmaker()() as db:
        contract = (await db.get(Attempt, attempt_id)).to_operator_contract(replays=0, hints_shown=0)
    result = assessor.assess(contract, ticket, list(classifier_entries()), reference)
    assert 0.0 <= result.total <= 1.0 and "links" not in result.components
