"""Спека 003, T061: `GET /api/v1/me/focus` — «Над чем поработать» для обучающегося (US7, FR-020).

Изолированная in-memory SQLite, настоящие сессии. Таблица данных (период 1m, все попытки оценены):
- fo-1 (группа G): 10 попыток ДДС — `v1` (этап «statuses») в 8, `d2` («route») в 5, `v2` («decision») в 4,
  `c1` («card») в 2; плюс 3 попытки operator112 без ошибок. Доли: 0,8 / 0,5 / 0,4 / 0,2 → в блоке три первых;
  режим ДДС (10 попыток против 3).
- fo-2 (G): 2 попытки — меньше минимума обучающегося (3): «Пройдите ещё несколько тренировок…».
- fo-3 (G): 4 чистые попытки: «Пока замечаний нет».
- fo-4 (G): 1 попытка ДДС и 4 попытки operator112 с `op-f1` в 4 (этап «type»): выбирается operator112.
- fo-5 (G): без попыток: режима нет.
- fo-6 (G): группа-сосед с кучей ошибок — его данные в ответе fo-1 быть не должны.
Отрицательные тесты парные (рядом 200), в ответе нет групповых полей и оценочных слов.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.models.session import Attempt, Evaluation
from app.models.user import User
from app.services.error_map_stages import get_stage
from app.services.security import build_auth_session, hash_password
from app.services.time import MOSCOW, to_moscow_iso

PASSWORD_HASH = hash_password("err-map-focus-112")
G = "ТЕСТ-ФОКУС"
BAD_WORDS = ("хуже", "лучше", "часто", "иногда", "редко", "слаб", "групп", "ошибаетесь")
OWNERS = ("fo-1", "fo-2", "fo-3", "fo-4", "fo-5", "u-fo-t", "u-fo-adm")

META = {
    "v1": ("noPrimaryStatus", "critical"),
    "d2": ("wrongRecipient", "major"),
    "v2": ("wrongDecision", "critical"),
    "c1": ("keyPhraseMissing", "minor"),
    "op-f1": ("wrongFinalType", "critical"),
}


def _err(rule: str) -> dict[str, str]:
    kind, severity = META[rule]
    return {"ruleId": rule, "type": kind, "severity": severity}


def _plan() -> list[tuple[str, str, list[str]]]:
    """(обучающийся, режим, правила ошибок) — по одной записи на попытку."""
    rows: list[tuple[str, str, list[str]]] = []
    for i in range(10):
        rules = [r for r, n in (("v1", 8), ("d2", 5), ("v2", 4), ("c1", 2)) if i < n]
        rows.append(("fo-1", "dds", rules))
    rows += [("fo-1", "operator112", [])] * 3
    rows += [("fo-2", "dds", ["v1"])] * 2
    rows += [("fo-3", "dds", [])] * 4
    rows += [("fo-4", "dds", [])]
    rows += [("fo-4", "operator112", ["op-f1"])] * 4
    rows += [("fo-6", "dds", ["v1", "d2", "v2"])] * 6
    return rows


def _user(uid: str, role: str, **extra: Any) -> User:
    # Обучающимся — обе специализации (спека 021): иначе действует «оператор ДДС» по умолчанию и фокус сужается до ДДС.
    if role == "student":
        extra.setdefault("specializations", ["operator112", "dds"])
    return User(
        id=uid, login=uid, password_hash=PASSWORD_HASH, full_name=f"Имя {uid}", role=role, arm_number=300,
        is_active=True, **extra,
    )


@pytest_asyncio.fixture
async def tokens(app) -> AsyncIterator[dict[str, str]]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.now(MOSCOW)
    rows: list[Any] = [_user(f"fo-{i}", "student", group=G) for i in range(1, 7)]
    rows += [_user("u-fo-t", "teacher", assigned_groups=[G]), _user("u-fo-adm", "admin")]
    for index, (student, mode, rules) in enumerate(_plan()):
        stamp = to_moscow_iso(now - timedelta(hours=index + 1))
        attempt = f"at-fo{index}"
        rows.append(Attempt(id=attempt, session_id=f"ses-{attempt}", card_id="c-001", student_id=student, mode=mode, opened_at=stamp))
        rows.append(
            Evaluation(
                attempt_id=attempt, mode=mode, time_score=0, correctness_score=0, grammar_score=0, semantic_score=0,
                total_score=0, errors=[_err(r) for r in rules], generated_at=stamp,
            )
        )
    issued: dict[str, str] = {}
    async with maker() as db:
        db.add_all(rows)
        await db.flush()
        for uid in OWNERS:
            user = await db.get(User, uid)
            assert user is not None
            issued[uid] = str((await build_auth_session(db, user))["token"])
        await db.commit()

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    try:
        yield issued
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


async def _focus(app, token: str | None) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.get("/me/focus", headers=headers)


async def _ok(app, tokens: dict[str, str], who: str) -> dict[str, Any]:
    response = await _focus(app, tokens[who])
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_three_stages_by_share_in_busier_mode(app, tokens):
    body = await _ok(app, tokens, "fo-1")
    assert body["mode"] == "dds"
    assert [item["stageId"] for item in body["items"]] == ["statuses", "route", "decision"]
    assert [item["title"] for item in body["items"]] == [get_stage("dds", s).title for s in ("statuses", "route", "decision")]
    assert "message" not in body


@pytest.mark.asyncio
async def test_items_have_only_own_fields_and_neutral_hints(app, tokens):
    body = await _ok(app, tokens, "fo-1")
    assert set(body) <= {"mode", "items", "message"}
    for item in body["items"]:
        assert set(item) <= {"stageId", "title", "hint", "articleId"}
        assert item["hint"].strip()
        text = f'{item["title"]} {item["hint"]}'.lower()
        assert not any(word in text for word in BAD_WORDS), text
    raw = str(body)
    for forbidden in ("students", "comparison", "affectedStudents", "share", "fo-6", "Имя fo-"):
        assert forbidden not in raw


@pytest.mark.asyncio
async def test_mode_follows_the_mode_with_more_attempts(app, tokens):
    body = await _ok(app, tokens, "fo-4")
    assert body["mode"] == "operator112"
    assert [item["stageId"] for item in body["items"]] == ["type"]


@pytest.mark.asyncio
async def test_no_errors_says_nothing_to_fix(app, tokens):
    body = await _ok(app, tokens, "fo-3")
    assert body["items"] == []
    assert body["message"] == "Пока замечаний нет"


@pytest.mark.asyncio
async def test_few_attempts_asks_to_practice_more(app, tokens):
    for who in ("fo-2", "fo-5"):
        body = await _ok(app, tokens, who)
        assert body["items"] == []
        assert body["message"].startswith("Пройдите ещё несколько тренировок")
    assert (await _ok(app, tokens, "fo-5"))["mode"] is None


@pytest.mark.asyncio
async def test_only_student_role_is_allowed(app, tokens):
    assert (await _focus(app, None)).status_code == 401
    assert (await _focus(app, tokens["u-fo-t"])).status_code == 403
    assert (await _focus(app, tokens["u-fo-adm"])).status_code == 403
    assert (await _focus(app, tokens["fo-1"])).status_code == 200
