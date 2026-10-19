"""Спека 003, T038: HTTP-тесты `GET /api/v1/error-map/students/{studentId}` и `.../stages/{stageId}`.

Структура повторяет `test_error_map_stage.py` (T029): своя in-memory SQLite на модуль, подмена `get_db`, настоящие
сессии (`build_auth_session`) и заголовок `Authorization: Bearer`. Хелперы продублированы, а не импортированы.

Ожидаемые значения посчитаны вручную по таблице попыток ниже, без импорта сервиса. Пороги по умолчанию
(data-model.md §2): `sometimesFrom` 0,10, `oftenFrom` 0,30, минимум попыток группы 5, обучающегося 3, зона
«как у группы» ±10 п. п. Окно периода `1m` — 30 суток от текущего времени МСК.

Группа GA, режим dds, окно 1m (14 попыток; s-5 без попыток, s-4 всего 2):
- s-1 (цель, 4 попытки): v1 | v1+v2 | v2 | без ошибок  → статусы 2/4, тип 2/4, карточка 0/4, маршрут 0/4;
- s-2 (4): v1 | c1 | c1 | без ошибок;  s-3 (4): v2 | c1 | без | без;  s-4 (2): d2 | без.
- Группа в целом: статусы (v1) 3/14, тип (v2) 3/14, карточка (c1) 3/14, маршрут (d2) 1/14 ≈ 0,071.
- Сравнение s-1: статусы 50,0 − 21,4 = +28,6 п. п. → «хуже»; тип — «хуже»; карточка 0 − 21,4 = −21,4 → «лучше»;
  маршрут 0 − 7,1 = −7,1, это внутри зоны → «как у группы».
Окно `all` добавляет s-1 старую попытку (40 суток назад) с v1: у s-1 5 попыток, статусы 3/5.
Режим operator112: s-1 — 3 попытки (op-f1 | op-f1 | без), s-2 — 2 попытки без ошибок. Группа: 5 попыток, тип 2/5 = 0,4;
у s-1 тип 2/3 ≈ 0,667 → +26,7 п. п. → «хуже». Режимы не смешиваются: в dds у s-1 по-прежнему 4 попытки.
Группа GC (одна обучающаяся s-6, 3 попытки): у неё хватает данных для карты, но у группы 3 < 5 попыток, поэтому
сравнения нет. Группа GB — чужая для первого преподавателя.

Отрицательные тесты парные: рядом с 404, 403, 401 и 400 стоит запрос, который при реализации обязан вернуть 200.
Разбор этапа не проверяет `typicalErrors` у обучающегося с недостатком данных: поведение сервиса там не оговорено.
Состояние `explanation` — справочное пояснение (шаблон) с без ключа `verdict`, пока вердикта нет (US6).
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # регистрация таблиц в Base.metadata
from app.db.base import Base
from app.db.session import get_db
from app.models.session import Attempt, Evaluation
from app.models.user import User
from app.services.security import build_auth_session, hash_password
from app.services.time import MOSCOW, to_moscow_iso

PASSWORD_HASH = hash_password("err-map-student-112")

GROUP_A = "ТЕСТ-СТУД-А"  # закреплена за первым преподавателем
GROUP_B = "ТЕСТ-СТУД-Б"  # закреплена только за вторым
GROUP_C = "ТЕСТ-СТУД-В"  # закреплена за первым; в группе мало попыток для сравнения

ACCESS_DENIED = "Нет доступа к группе / обучающемуся"
MAP_KEYS = {"scope", "mode", "period", "attempts", "stages", "levels", "headline", "generatedAt"}
LEVEL_KEYS = {"stageId", "attempts", "attemptsWithError", "share", "level", "affectedStudents"}
DETAIL_KEYS = {"stage", "level", "typicalErrors", "chain", "explanation"}

TOKEN_OWNERS: dict[str, str] = {
    "student": "u-ss-stu",
    "teacher1": "u-ss-t1",
    "teacher2": "u-ss-t2",
    "teacher3": "u-ss-t3",
    "admin": "u-ss-adm",
}

# (id, группа, имя). Имена отличаются от id: реализация, отдающая id вместо имени, не пройдёт.
STUDENTS: tuple[tuple[str, str, str], ...] = (
    ("s-1", GROUP_A, "Целев Первый"),
    ("s-2", GROUP_A, "Сосед Второй"),
    ("s-3", GROUP_A, "Сосед Третий"),
    ("s-4", GROUP_A, "Мало Данных"),
    ("s-5", GROUP_A, "Без Попыток"),
    ("s-6", GROUP_C, "Одинокая Шестая"),
    ("s-7", GROUP_B, "Чужой Седьмой"),
)

RULE_META: dict[str, tuple[str, str]] = {
    "v1": ("noPrimaryStatus", "critical"),
    "v2": ("wrongDecision", "critical"),
    "c1": ("keyPhraseMissing", "minor"),
    "d2": ("wrongRecipient", "major"),
    "op-f1": ("wrongFinalType", "critical"),
}

# (id попытки, обучающийся, режим, дней назад, правила ошибок). Все попытки оценены.
ATTEMPTS: tuple[tuple[str, str, str, int, tuple[str, ...]], ...] = (
    ("at-s1-a1", "s-1", "dds", 2, ("v1",)),
    ("at-s1-a2", "s-1", "dds", 3, ("v1", "v2")),
    ("at-s1-a3", "s-1", "dds", 4, ("v2",)),
    ("at-s1-a4", "s-1", "dds", 5, ()),
    ("at-s1-old", "s-1", "dds", 40, ("v1",)),
    ("at-s2-b1", "s-2", "dds", 2, ("v1",)),
    ("at-s2-b2", "s-2", "dds", 3, ("c1",)),
    ("at-s2-b3", "s-2", "dds", 4, ("c1",)),
    ("at-s2-b4", "s-2", "dds", 5, ()),
    ("at-s3-c1", "s-3", "dds", 2, ("v2",)),
    ("at-s3-c2", "s-3", "dds", 3, ("c1",)),
    ("at-s3-c3", "s-3", "dds", 4, ()),
    ("at-s3-c4", "s-3", "dds", 5, ()),
    ("at-s4-d1", "s-4", "dds", 2, ("d2",)),
    ("at-s4-d2", "s-4", "dds", 3, ()),
    ("at-s1-o1", "s-1", "operator112", 2, ("op-f1",)),
    ("at-s1-o2", "s-1", "operator112", 3, ("op-f1",)),
    ("at-s1-o3", "s-1", "operator112", 4, ()),
    ("at-s2-o1", "s-2", "operator112", 2, ()),
    ("at-s2-o2", "s-2", "operator112", 3, ()),
    ("at-s6-g1", "s-6", "dds", 2, ("v1",)),
    ("at-s6-g2", "s-6", "dds", 3, ("v1",)),
    ("at-s6-g3", "s-6", "dds", 4, ()),
    ("at-s7-h1", "s-7", "dds", 2, ("v1",)),
)


def _user(
    uid: str,
    role: str,
    *,
    full_name: str | None = None,
    group: str | None = None,
    assigned: list[str] | None = None,
) -> User:
    return User(
        id=uid,
        login=uid,
        password_hash=PASSWORD_HASH,
        full_name=full_name or uid,
        role=role,
        arm_number=300,
        is_active=True,
        group=group,
        assigned_groups=assigned,
    )


def _error(rule_id: str) -> dict[str, str]:
    error_type, severity = RULE_META[rule_id]
    return {"ruleId": rule_id, "type": error_type, "severity": severity}


def _rows(now: datetime) -> list[Any]:
    rows: list[Any] = [
        _user("u-ss-stu", "student"),
        _user("u-ss-t1", "teacher", assigned=[GROUP_A, GROUP_C]),
        _user("u-ss-t2", "teacher", assigned=[GROUP_B]),
        _user("u-ss-t3", "teacher"),
        _user("u-ss-adm", "admin"),
    ]
    rows += [_user(sid, "student", full_name=name, group=group) for sid, group, name in STUDENTS]
    for attempt_id, student_id, mode, days, rules in ATTEMPTS:
        stamp = to_moscow_iso(now - timedelta(days=days))
        rows.append(
            Attempt(
                id=attempt_id,
                session_id=f"ses-{attempt_id}",  # у каждой попытки своё занятие: проверка exampleSessionId
                card_id="c-001",
                student_id=student_id,
                mode=mode,
                opened_at=stamp,
            )
        )
        rows.append(
            Evaluation(
                attempt_id=attempt_id,
                mode=mode,
                time_score=0,
                correctness_score=0,
                grammar_score=0,
                semantic_score=0,
                total_score=0,
                errors=[_error(rule) for rule in rules],
                generated_at=stamp,
            )
        )
    return rows


@pytest_asyncio.fixture
async def tokens(app) -> AsyncIterator[dict[str, str]]:
    """Изолированная база: пользователи, попытки и настоящие сессии. Общая база conftest не меняется."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    issued: dict[str, str] = {}
    async with maker() as db:
        db.add_all(_rows(datetime.now(MOSCOW)))
        await db.flush()
        for key, uid in TOKEN_OWNERS.items():
            user = await db.get(User, uid)
            assert user is not None
            issued[key] = str((await build_auth_session(db, user))["token"])
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


async def _get(
    app, path: str, token: str | None = None, params: dict[str, str] | None = None
) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.get(path, headers=headers, params=params)


def _params(mode: str | None, period: str | None) -> dict[str, str]:
    params: dict[str, str] = {}
    if mode is not None:
        params["mode"] = mode
    if period is not None:
        params["period"] = period
    return params


async def _map(
    app,
    token: str | None,
    student_id: str = "s-1",
    *,
    mode: str | None = None,
    period: str | None = None,
) -> httpx.Response:
    return await _get(app, f"/error-map/students/{quote(student_id)}", token, _params(mode, period))


async def _stage(
    app,
    token: str | None,
    stage_id: str,
    student_id: str = "s-1",
    *,
    mode: str | None = None,
    period: str | None = None,
) -> httpx.Response:
    path = f"/error-map/students/{quote(student_id)}/stages/{quote(stage_id)}"
    return await _get(app, path, token, _params(mode, period))


def _levels(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["stageId"]: item for item in body["levels"]}


# ---------------------------------------------------------------------------------------------------------------
# Карта обучающегося: уровни, сравнение, вывод
# ---------------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_student_map_levels_comparison_and_headline(app, tokens):
    response = await _map(app, tokens["teacher1"], mode="dds", period="1m")
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == MAP_KEYS
    assert body["scope"] == {"kind": "student", "groupId": GROUP_A, "studentId": "s-1", "title": "Целев Первый"}
    assert (body["mode"], body["period"], body["attempts"]) == ("dds", "1m", 4)

    levels = _levels(body)
    assert levels["statuses"]["attempts"] == 4
    assert levels["statuses"]["attemptsWithError"] == 2
    assert levels["statuses"]["share"] == pytest.approx(0.5)
    assert levels["statuses"]["level"] == "often"
    assert levels["statuses"]["comparison"] == "worse"
    assert levels["decision"]["attemptsWithError"] == 2
    assert levels["decision"]["comparison"] == "worse"
    assert levels["card"]["attemptsWithError"] == 0
    assert levels["card"]["level"] == "rare"
    assert levels["card"]["comparison"] == "better"
    assert levels["route"]["comparison"] == "same"  # −7,1 п. п. — внутри зоны ±10

    assert body["headline"]["kind"] == "problems"
    assert body["headline"]["stageIds"] == ["decision", "statuses"]  # равные доли — по порядку схемы
    assert body["headline"]["text"].startswith("Главные проблемы обучающегося:")
    for item in body["levels"]:
        assert LEVEL_KEYS <= set(item)


@pytest.mark.asyncio
async def test_student_map_defaults_are_dds_and_one_month(app, tokens):
    body = (await _map(app, tokens["teacher1"])).json()
    assert (body["mode"], body["period"], body["attempts"]) == ("dds", "1m", 4)


@pytest.mark.asyncio
async def test_student_map_period_all_includes_old_attempt(app, tokens):
    body = (await _map(app, tokens["teacher1"], period="all")).json()
    assert body["attempts"] == 5
    statuses = _levels(body)["statuses"]
    assert (statuses["attempts"], statuses["attemptsWithError"]) == (5, 3)
    assert statuses["share"] == pytest.approx(0.6)


@pytest.mark.asyncio
async def test_student_map_modes_are_not_mixed(app, tokens):
    body = (await _map(app, tokens["teacher1"], mode="operator112", period="1m")).json()
    assert body["mode"] == "operator112"
    assert body["attempts"] == 3
    levels = _levels(body)
    assert "statuses" not in levels  # этап режима dds
    assert (levels["type"]["attempts"], levels["type"]["attemptsWithError"]) == (3, 2)
    assert levels["type"]["level"] == "often"
    assert levels["type"]["comparison"] == "worse"  # 66,7 против 40,0 п. п.
    dds = (await _map(app, tokens["teacher1"], mode="dds", period="1m")).json()
    assert dds["attempts"] == 4  # попытки operator112 в dds не попали


@pytest.mark.asyncio
async def test_student_with_too_few_attempts_has_no_data_and_no_comparison(app, tokens):
    assert (await _map(app, tokens["teacher1"], "s-1")).status_code == 200  # парный запрос
    response = await _map(app, tokens["teacher1"], "s-4")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["attempts"] == 2  # меньше минимума обучающегося (3)
    assert body["headline"]["kind"] == "noData"
    assert body["headline"]["stageIds"] == []
    for item in body["levels"]:
        assert item["level"] == "noData"
        assert item["share"] is None
        assert "comparison" not in item


@pytest.mark.asyncio
async def test_student_without_attempts_gets_empty_map(app, tokens):
    body = (await _map(app, tokens["teacher1"], "s-5")).json()
    assert body["attempts"] == 0
    assert body["headline"]["kind"] == "noData"
    assert all(item["level"] == "noData" and "comparison" not in item for item in body["levels"])


@pytest.mark.asyncio
async def test_no_comparison_when_group_has_too_few_attempts(app, tokens):
    body = (await _map(app, tokens["teacher1"], "s-6")).json()
    assert body["attempts"] == 3  # у обучающейся хватает данных
    statuses = _levels(body)["statuses"]
    assert statuses["level"] == "often"
    assert statuses["share"] == pytest.approx(2 / 3)
    for item in body["levels"]:
        assert "comparison" not in item  # группа: 3 попытки < 5


@pytest.mark.asyncio
async def test_student_map_does_not_leak_other_students(app, tokens):
    text = (await _map(app, tokens["teacher1"])).text
    for _, _, name in STUDENTS:
        if name != "Целев Первый":
            assert name not in text
    for other in ("s-2", "s-3", "s-4", "s-5", "s-6", "s-7"):
        assert f'"{other}"' not in text


# ---------------------------------------------------------------------------------------------------------------
# Права и ошибки запроса
# ---------------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_map_access_matrix(app, tokens):
    assert (await _map(app, tokens["teacher1"])).status_code == 200
    assert (await _map(app, tokens["admin"])).status_code == 200
    assert (await _map(app, tokens["teacher2"], "s-7")).status_code == 200  # своя группа второго преподавателя

    foreign = await _map(app, tokens["teacher2"])  # s-1 учится в GA, у второго преподавателя только GB
    assert foreign.status_code == 403
    assert ACCESS_DENIED in foreign.text
    assert (await _map(app, tokens["teacher1"], "s-7")).status_code == 403  # s-7 из GB
    assert (await _map(app, tokens["teacher3"])).status_code == 403  # групп нет совсем
    assert (await _map(app, tokens["student"])).status_code == 403
    assert (await _map(app, None)).status_code == 401


@pytest.mark.asyncio
async def test_map_not_found_and_bad_params(app, tokens):
    assert (await _map(app, tokens["teacher1"], "s-1", mode="dds", period="1m")).status_code == 200  # парный
    assert (await _map(app, tokens["teacher1"], "no-such-student")).status_code == 404
    assert (await _map(app, tokens["teacher1"], mode="bogus")).status_code == 400
    assert (await _map(app, tokens["teacher1"], period="bogus")).status_code == 400


# ---------------------------------------------------------------------------------------------------------------
# Разбор этапа обучающегося
# ---------------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stage_detail_has_only_this_students_errors(app, tokens):
    response = await _stage(app, tokens["teacher1"], "statuses", mode="dds", period="1m")
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == DETAIL_KEYS
    assert body["stage"]["id"] == "statuses"
    assert body["level"]["comparison"] == "worse"
    assert body["explanation"]["source"] == "template" and "verdict" not in body["explanation"]

    errors = body["typicalErrors"]
    assert [item["ruleId"] for item in errors] == ["v1"]
    only = errors[0]
    assert only["studentCount"] == 1
    assert only["students"] == [{"id": "s-1", "name": "Целев Первый"}]
    # v1 есть и у s-2 (at-s2-b1) и у s-6/s-7, но пример берётся только из попыток самого обучающегося в окне 1m
    assert only["exampleAttemptId"] in {"at-s1-a1", "at-s1-a2"}
    assert only["exampleSessionId"] == f"ses-{only['exampleAttemptId']}"
    assert "Сосед Второй" not in response.text


@pytest.mark.asyncio
async def test_stage_detail_decision_and_chain(app, tokens):
    body = (await _stage(app, tokens["teacher1"], "decision")).json()
    assert [item["ruleId"] for item in body["typicalErrors"]] == ["v2"]
    assert body["typicalErrors"][0]["exampleAttemptId"] in {"at-s1-a2", "at-s1-a3"}
    chain = {(link["from"], link["to"]) for link in body["chain"]}
    assert chain == {("decision", "services"), ("decision", "route")}


@pytest.mark.asyncio
async def test_stage_detail_without_errors_is_empty_but_compared(app, tokens):
    body = (await _stage(app, tokens["teacher1"], "card")).json()
    assert body["typicalErrors"] == []
    assert body["level"]["level"] == "rare"
    assert body["level"]["comparison"] == "better"


@pytest.mark.asyncio
async def test_stage_detail_for_student_with_too_few_attempts(app, tokens):
    body = (await _stage(app, tokens["teacher1"], "route", "s-4")).json()
    assert body["level"]["level"] == "noData"
    assert "comparison" not in body["level"]


@pytest.mark.asyncio
async def test_stage_detail_operator112_stage(app, tokens):
    response = await _stage(app, tokens["teacher1"], "type", mode="operator112")
    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["ruleId"] for item in body["typicalErrors"]] == ["op-f1"]
    assert body["typicalErrors"][0]["exampleAttemptId"] in {"at-s1-o1", "at-s1-o2"}


@pytest.mark.asyncio
async def test_stage_detail_access_and_errors(app, tokens):
    assert (await _stage(app, tokens["teacher1"], "statuses")).status_code == 200  # парный
    assert (await _stage(app, tokens["admin"], "statuses")).status_code == 200
    assert (await _stage(app, tokens["teacher2"], "statuses")).status_code == 403
    assert (await _stage(app, tokens["teacher3"], "statuses")).status_code == 403
    assert (await _stage(app, tokens["student"], "statuses")).status_code == 403
    assert (await _stage(app, None, "statuses")).status_code == 401
    assert (await _stage(app, tokens["teacher1"], "statuses", "no-such-student")).status_code == 404
    assert (await _stage(app, tokens["teacher1"], "no-such-stage")).status_code == 404
    assert (await _stage(app, tokens["teacher1"], "type")).status_code == 404  # этап режима operator112 при dds
    assert (await _stage(app, tokens["teacher1"], "statuses", mode="bogus")).status_code == 400
    assert json.loads((await _stage(app, tokens["teacher2"], "statuses")).text)  # тело ошибки — JSON
