"""Спека 003, T057: `PUT /api/v1/error-map/verdicts` — вердикт преподавателя «Согласен / Не согласен» (US6).

Изолированная in-memory SQLite на тест, подмена `get_db`, настоящие сессии. Данные: группа GA (5 обучающихся,
5 попыток ДДС, в каждой ошибка `v1` на этапе «Статусы реагирования»), чужая группа GB.

Что доказывают тесты: вердикт сохраняется и виден при следующем разборе этапа; повтор меняет запись, а не
дублирует; вердикт по группе и по обучающемуся — разные записи; чужой вердикт не виден; в журнале аудита есть
группа, этап, источник и вердикт (при смене — прежний). Отрицательные тесты парные: рядом с каждым 400/403/404
стоит тот же запрос, который обязан вернуть 200, и после отказа в таблице ничего не меняется.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # регистрация таблиц в Base.metadata
from app.db.base import Base
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.error_map import ErrorMapVerdict
from app.models.session import Attempt, Evaluation
from app.models.user import User
from app.services.security import build_auth_session, hash_password
from app.services.time import MOSCOW, to_moscow_iso

PASSWORD_HASH = hash_password("err-map-verdict-112")
GA = "ТЕСТ-ВЕРДИКТ"
GB = "ТЕСТ-ЧУЖАЯ-ВЕРДИКТ"
STAGE = "statuses"
TOKEN_OWNERS = {"student": "u-vd-stu", "t1": "u-vd-t1", "t2": "u-vd-t2", "admin": "u-vd-adm"}


def _user(uid: str, role: str, *, group: str | None = None, assigned: list[str] | None = None) -> User:
    return User(
        id=uid, login=uid, password_hash=PASSWORD_HASH, full_name=f"Имя {uid}", role=role, arm_number=300,
        is_active=True, group=group, assigned_groups=assigned,
    )


def _rows(now: datetime) -> list[Any]:
    rows: list[Any] = [
        _user("u-vd-stu", "student"),
        _user("u-vd-t1", "teacher", assigned=[GA]),
        _user("u-vd-t2", "teacher", assigned=[GB]),
        _user("u-vd-adm", "admin"),
        _user("sb-1", "student", group=GB),
    ]
    # Пять обучающихся по одной попытке; у sa-1 ещё две — минимум попыток обучающегося (3), иначе «мало данных».
    plan = [(1, "sa-1"), (2, "sa-2"), (3, "sa-3"), (4, "sa-4"), (5, "sa-5"), (6, "sa-1"), (7, "sa-1")]
    for index, student in plan:
        if index <= 5:
            rows.append(_user(student, "student", group=GA))
        stamp = to_moscow_iso(now - timedelta(days=index))
        attempt = f"at-vd{index}"
        rows.append(
            Attempt(id=attempt, session_id=f"ses-{attempt}", card_id="c-001", student_id=student, mode="dds", opened_at=stamp)
        )
        rows.append(
            Evaluation(
                attempt_id=attempt, mode="dds", time_score=0, correctness_score=0, grammar_score=0, semantic_score=0,
                total_score=0, errors=[{"ruleId": "v1", "type": "noPrimaryStatus", "severity": "critical"}],
                generated_at=stamp,
            )
        )
    return rows


@pytest_asyncio.fixture
async def env(app) -> AsyncIterator[tuple[dict[str, str], async_sessionmaker[AsyncSession]]]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    tokens: dict[str, str] = {}
    async with maker() as db:
        db.add_all(_rows(datetime.now(MOSCOW)))
        await db.flush()
        for key, uid in TOKEN_OWNERS.items():
            user = await db.get(User, uid)
            assert user is not None
            tokens[key] = str((await build_auth_session(db, user))["token"])
        await db.commit()

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    try:
        yield tokens, maker
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


async def _call(app, method: str, path: str, token: str | None, **kwargs: Any) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    headers.update(kwargs.pop("headers", {}))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.request(method, path, headers=headers, **kwargs)


async def _explanation(app, token: str, *, group: str = GA, student: str | None = None) -> dict[str, Any]:
    """Пояснение, которое сейчас видит преподаватель (по группе или по обучающемуся)."""
    path = f"/error-map/students/{student}/stages/{STAGE}" if student else f"/error-map/groups/{quote(group)}/stages/{STAGE}"
    response = await _call(app, "GET", path, token, params={"mode": "dds", "period": "1m"})
    assert response.status_code == 200, response.text
    explanation = response.json()["explanation"]
    assert explanation is not None
    return explanation


def _body(explanation: dict[str, Any], verdict: str = "agree", **override: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "groupId": GA, "mode": "dds", "period": "1m", "stageId": STAGE,
        "textHash": explanation["textHash"], "source": explanation["source"], "verdict": verdict,
    }
    body.update(override)
    return body


async def _put(app, token: str | None, body: Any) -> httpx.Response:
    return await _call(app, "PUT", "/error-map/verdicts", token, json=body)


async def _count(maker) -> int:
    async with maker() as db:
        return int((await db.execute(select(func.count(ErrorMapVerdict.id)))).scalar_one())


async def _audit(maker) -> list[AuditLog]:
    async with maker() as db:
        return list((await db.execute(select(AuditLog).where(AuditLog.action == "error_map.verdict"))).scalars().all())


@pytest.mark.asyncio
async def test_put_saves_verdict_and_next_detail_shows_it(app, env):
    tokens, maker = env
    explanation = await _explanation(app, tokens["t1"])
    assert "verdict" not in explanation
    response = await _put(app, tokens["t1"], _body(explanation, "agree"))
    assert response.status_code == 200, response.text
    assert (await _explanation(app, tokens["t1"]))["verdict"] == "agree"
    async with maker() as db:
        row = (await db.execute(select(ErrorMapVerdict))).scalar_one()
    assert (row.teacher_id, row.group_id, row.student_id, row.stage_id, row.verdict) == ("u-vd-t1", GA, "", STAGE, "agree")
    assert row.id.startswith("emv-")


@pytest.mark.asyncio
async def test_repeat_changes_verdict_instead_of_duplicating(app, env):
    tokens, maker = env
    explanation = await _explanation(app, tokens["t1"])
    assert (await _put(app, tokens["t1"], _body(explanation, "agree"))).status_code == 200
    assert (await _put(app, tokens["t1"], _body(explanation, "disagree"))).status_code == 200
    assert await _count(maker) == 1
    assert (await _explanation(app, tokens["t1"]))["verdict"] == "disagree"


@pytest.mark.asyncio
async def test_group_and_student_verdicts_are_separate_rows(app, env):
    tokens, maker = env
    group_expl = await _explanation(app, tokens["t1"])
    student_expl = await _explanation(app, tokens["t1"], student="sa-1")
    assert (await _put(app, tokens["t1"], _body(group_expl, "agree"))).status_code == 200
    assert (await _put(app, tokens["t1"], _body(student_expl, "disagree", studentId="sa-1"))).status_code == 200
    assert await _count(maker) == 2
    assert (await _explanation(app, tokens["t1"]))["verdict"] == "agree"
    assert (await _explanation(app, tokens["t1"], student="sa-1"))["verdict"] == "disagree"


@pytest.mark.asyncio
async def test_verdict_of_one_teacher_is_not_visible_to_another_viewer(app, env):
    tokens, _ = env
    explanation = await _explanation(app, tokens["t1"])
    assert (await _put(app, tokens["t1"], _body(explanation, "agree"))).status_code == 200
    assert (await _explanation(app, tokens["t1"]))["verdict"] == "agree"
    assert "verdict" not in await _explanation(app, tokens["admin"])


@pytest.mark.asyncio
async def test_verdict_belongs_to_shown_text(app, env):
    tokens, _ = env
    explanation = await _explanation(app, tokens["t1"])
    assert (await _put(app, tokens["t1"], _body(explanation, "agree", textHash="0" * 64))).status_code == 200
    assert "verdict" not in await _explanation(app, tokens["t1"])  # вердикт по другому тексту не подставляется


@pytest.mark.asyncio
async def test_audit_has_group_stage_source_verdict_and_previous_value(app, env):
    tokens, maker = env
    explanation = await _explanation(app, tokens["t1"])
    assert (await _put(app, tokens["t1"], _body(explanation, "agree"))).status_code == 200
    first = (await _audit(maker))[0]
    assert first.user_id == "u-vd-t1" and first.role == "teacher"
    assert GA in first.details and STAGE in first.details and "«Согласен»" in first.details
    assert "шаблон" in first.details and "прежний" not in first.details
    assert (await _put(app, tokens["t1"], _body(explanation, "disagree"))).status_code == 200
    entries = await _audit(maker)
    assert len(entries) == 2
    changed = max(entries, key=lambda item: item.id)
    assert "«Не согласен»" in changed.details and "прежний вердикт «Согласен»" in changed.details


@pytest.mark.asyncio
async def test_foreign_group_is_403_and_own_is_200(app, env):
    tokens, maker = env
    explanation = await _explanation(app, tokens["t1"])
    denied = await _put(app, tokens["t2"], _body(explanation))
    assert denied.status_code == 403
    assert await _count(maker) == 0 and await _audit(maker) == []
    assert (await _put(app, tokens["t1"], _body(explanation))).status_code == 200


@pytest.mark.asyncio
async def test_foreign_student_is_403_and_student_of_other_group_is_400(app, env):
    tokens, maker = env
    explanation = await _explanation(app, tokens["t1"])
    assert (await _put(app, tokens["t2"], _body(explanation, studentId="sa-1", groupId=GB))).status_code == 400  # сa-1 не из GB
    assert (await _put(app, tokens["t2"], _body(explanation, studentId="sa-1"))).status_code == 403  # группа GA чужая
    assert await _count(maker) == 0
    assert (await _put(app, tokens["t1"], _body(explanation, studentId="sa-1"))).status_code == 200


@pytest.mark.asyncio
async def test_invalid_input_is_400_and_valid_is_200(app, env):
    tokens, maker = env
    explanation = await _explanation(app, tokens["t1"])
    for bad in (
        _body(explanation, verdict="maybe"),
        _body(explanation, mode="x"),
        _body(explanation, period="week"),
        _body(explanation, source="llm"),
        {k: v for k, v in _body(explanation).items() if k != "textHash"},
        _body(explanation, textHash=""),
    ):
        assert (await _put(app, tokens["t1"], bad)).status_code == 400, bad
    response = await _call(app, "PUT", "/error-map/verdicts", tokens["t1"], content="не json", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert await _count(maker) == 0
    assert (await _put(app, tokens["t1"], _body(explanation))).status_code == 200


@pytest.mark.asyncio
async def test_unknown_stage_and_group_are_404_and_known_is_200(app, env):
    tokens, maker = env
    explanation = await _explanation(app, tokens["t1"])
    assert (await _put(app, tokens["t1"], _body(explanation, stageId="nope"))).status_code == 404
    assert (await _put(app, tokens["admin"], _body(explanation, groupId="НЕТ-ТАКОЙ"))).status_code == 404
    assert await _count(maker) == 0
    assert (await _put(app, tokens["admin"], _body(explanation))).status_code == 200


@pytest.mark.asyncio
async def test_no_session_is_401_and_student_is_403(app, env):
    tokens, maker = env
    explanation = await _explanation(app, tokens["t1"])
    assert (await _put(app, None, _body(explanation))).status_code == 401
    assert (await _put(app, tokens["student"], _body(explanation))).status_code == 403
    assert await _count(maker) == 0
    assert (await _put(app, tokens["t1"], _body(explanation))).status_code == 200
