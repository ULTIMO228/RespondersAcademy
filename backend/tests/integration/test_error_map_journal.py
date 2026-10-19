"""Спека 003, T043: HTTP-тесты `GET /api/v1/error-map/groups/{groupId}/journal` на изолированной базе.

Структура повторяет `test_error_map_student.py` (T038): своя in-memory SQLite, подмена `get_db`, настоящие сессии,
заголовок `Authorization: Bearer`. Хелперы продублированы, а не импортированы.

Набор данных тот же, что в T038, поэтому ожидаемые значения посчитаны вручную и без импорта сервиса.
Группа GA, режим dds, окно 1m, 14 попыток (пороги по умолчанию: 0,10 / 0,30; минимум группы 5, обучающегося 3; зона
«как у группы» ±10 п. п.):
- s-1 (4 попытки): v1 | v1+v2 | v2 | без → статусы 2/4, тип 2/4, карточка 0/4;
- s-2 (4): v1 | c1 | c1 | без → статусы 1/4, карточка 2/4;  s-3 (4): v2 | c1 | без | без → тип 1/4, карточка 1/4;
- s-4 (2 попытки, меньше минимума обучающегося): d2 | без;  s-5 — без попыток.
- Группа: статусы (v1), тип (v2), карточка (c1) — по 3/14 ≈ 0,214; маршрут (d2) 1/14 ≈ 0,071.
Сравнение (разница в п. п. к доле группы): s-1 статусы +28,6 «хуже», тип «хуже», карточка −21,4 «лучше»;
s-2 статусы +3,6 «как у группы», карточка +28,6 «хуже», тип −21,4 «лучше»; s-3 статусы −21,4 «лучше», тип +3,6 и
карточка +3,6 «как у группы».
Режим operator112: s-1 — 3 попытки (op-f1 | op-f1 | без), s-2 — 2 попытки без ошибок; группа: 5 попыток, тип 2/5.
Группа GD: одна обучающаяся s-8 с тремя попытками, в одной ошибка без `ruleId` — единственная группа, у которой
в журнале появляется столбец «Прочее»; у GD всего 3 попытки, поэтому сравнения с группой нет.

Журнал не вызывает карту обучающегося в цикле (T045), но обязан давать те же значения: тест
`test_journal_cells_equal_student_maps` сверяет каждую ячейку с `GET /error-map/students/{id}`.
Отрицательные тесты парные: рядом с 404, 403, 401 и 400 стоит запрос, который при реализации обязан вернуть 200.
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
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # регистрация таблиц в Base.metadata
from app.db.base import Base
from app.db.session import get_db
from app.models.session import Attempt, Evaluation
from app.models.user import User
from app.services.security import build_auth_session, hash_password
from app.services.time import MOSCOW, to_moscow_iso

PASSWORD_HASH = hash_password("err-map-journal-112")

GROUP_A = "ТЕСТ-ЖУРНАЛ-А"
GROUP_B = "ТЕСТ-ЖУРНАЛ-Б"  # закреплена только за вторым преподавателем
GROUP_C = "ТЕСТ-ЖУРНАЛ-В"
GROUP_D = "ТЕСТ-ЖУРНАЛ-Г"  # единственная с ошибкой без ruleId

ACCESS_DENIED = "Нет доступа к группе / обучающемуся"
JOURNAL_KEYS = {"mode", "period", "groupId", "stages", "rows"}
ROW_KEYS = {"studentId", "name", "attempts", "levels"}
LEVEL_KEYS = {"stageId", "attempts", "attemptsWithError", "share", "level", "affectedStudents"}
DDS_STAGE_IDS = ["intake", "address", "decision", "card", "services", "route", "statuses", "closing"]
OP_STAGE_IDS = ["intake", "applicant", "place", "essence", "type", "signs", "services", "closing"]

TOKEN_OWNERS: dict[str, str] = {
    "student": "u-sj-stu",
    "teacher1": "u-sj-t1",
    "teacher2": "u-sj-t2",
    "teacher3": "u-sj-t3",
    "admin": "u-sj-adm",
}

STUDENTS: tuple[tuple[str, str, str], ...] = (
    ("s-1", GROUP_A, "Целев Первый"),
    ("s-2", GROUP_A, "Сосед Второй"),
    ("s-3", GROUP_A, "Сосед Третий"),
    ("s-4", GROUP_A, "Мало Данных"),
    ("s-5", GROUP_A, "Без Попыток"),
    ("s-6", GROUP_C, "Одинокая Шестая"),
    ("s-7", GROUP_B, "Чужой Седьмой"),
    ("s-8", GROUP_D, "Прочая Восьмая"),
)
# Порядок строк журнала — по имени (casefold), затем по id: детерминирован и не зависит от коллации базы.
GROUP_A_ROW_ORDER = ["s-5", "s-4", "s-2", "s-3", "s-1"]

RULE_META: dict[str, tuple[str, str]] = {
    "v1": ("noPrimaryStatus", "critical"),
    "v2": ("wrongDecision", "critical"),
    "c1": ("keyPhraseMissing", "minor"),
    "d2": ("wrongRecipient", "major"),
    "op-f1": ("wrongFinalType", "critical"),
    "none": ("timeLimit", "major"),  # ошибка без ruleId → этап «Прочее»
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
    ("at-s8-p1", "s-8", "dds", 2, ("none",)),
    ("at-s8-p2", "s-8", "dds", 3, ()),
    ("at-s8-p3", "s-8", "dds", 4, ()),
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
    error = {"type": error_type, "severity": severity}
    if rule_id != "none":
        error["ruleId"] = rule_id
    return error


def _rows(now: datetime) -> list[Any]:
    rows: list[Any] = [
        _user("u-sj-stu", "student"),
        _user("u-sj-t1", "teacher", assigned=[GROUP_A, GROUP_C, GROUP_D]),
        _user("u-sj-t2", "teacher", assigned=[GROUP_B]),
        _user("u-sj-t3", "teacher"),
        _user("u-sj-adm", "admin"),
    ]
    rows += [_user(sid, "student", full_name=name, group=group) for sid, group, name in STUDENTS]
    for attempt_id, student_id, mode, days, rules in ATTEMPTS:
        stamp = to_moscow_iso(now - timedelta(days=days))
        rows.append(
            Attempt(
                id=attempt_id,
                session_id=f"ses-{attempt_id}",
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


async def _journal(
    app,
    token: str | None,
    group_id: str = GROUP_A,
    *,
    mode: str | None = None,
    period: str | None = None,
) -> httpx.Response:
    return await _get(app, f"/error-map/groups/{quote(group_id)}/journal", token, _params(mode, period))


def _cells(row: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["stageId"]: item for item in row["levels"]}


def _row_by_student(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {row["studentId"]: row for row in body["rows"]}


# ---------------------------------------------------------------------------------------------------------------
# Состав журнала и значения ячеек
# ---------------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_journal_has_all_students_and_all_stages(app, tokens):
    response = await _journal(app, tokens["teacher1"], mode="dds", period="1m")
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == JOURNAL_KEYS
    assert (body["mode"], body["period"], body["groupId"]) == ("dds", "1m", GROUP_A)
    assert [stage["id"] for stage in body["stages"]] == DDS_STAGE_IDS  # «Прочее» нет: ошибок без этапа нет
    assert [row["studentId"] for row in body["rows"]] == GROUP_A_ROW_ORDER  # в том числе s-5 без попыток
    for row in body["rows"]:
        assert set(row) == ROW_KEYS
        assert [item["stageId"] for item in row["levels"]] == DDS_STAGE_IDS
        for item in row["levels"]:
            assert LEVEL_KEYS <= set(item)
    names = {row["studentId"]: row["name"] for row in body["rows"]}
    assert names["s-1"] == "Целев Первый"  # имя, а не id


@pytest.mark.asyncio
async def test_journal_defaults_are_dds_and_one_month(app, tokens):
    body = (await _journal(app, tokens["teacher1"])).json()
    assert (body["mode"], body["period"]) == ("dds", "1m")
    assert _row_by_student(body)["s-1"]["attempts"] == 4  # старая попытка (40 суток) в окно 1m не входит


@pytest.mark.asyncio
async def test_journal_known_cells(app, tokens):
    rows = _row_by_student((await _journal(app, tokens["teacher1"], mode="dds", period="1m")).json())
    assert {sid: row["attempts"] for sid, row in rows.items()} == {"s-1": 4, "s-2": 4, "s-3": 4, "s-4": 2, "s-5": 0}

    s1 = _cells(rows["s-1"])
    assert (s1["statuses"]["attemptsWithError"], s1["statuses"]["level"], s1["statuses"]["comparison"]) == (2, "often", "worse")
    assert (s1["decision"]["attemptsWithError"], s1["decision"]["comparison"]) == (2, "worse")
    assert (s1["card"]["attemptsWithError"], s1["card"]["level"], s1["card"]["comparison"]) == (0, "rare", "better")
    assert s1["route"]["comparison"] == "same"  # 0 против 7,1 п. п. — внутри зоны

    s2 = _cells(rows["s-2"])
    assert (s2["statuses"]["share"], s2["statuses"]["level"], s2["statuses"]["comparison"]) == (0.25, "sometimes", "same")
    assert (s2["card"]["level"], s2["card"]["comparison"]) == ("often", "worse")
    assert s2["decision"]["comparison"] == "better"

    s3 = _cells(rows["s-3"])
    assert s3["statuses"]["comparison"] == "better"
    assert (s3["decision"]["level"], s3["decision"]["comparison"]) == ("sometimes", "same")
    assert s3["card"]["comparison"] == "same"


@pytest.mark.asyncio
async def test_journal_students_with_too_little_data_are_gray_without_comparison(app, tokens):
    rows = _row_by_student((await _journal(app, tokens["teacher1"], mode="dds", period="1m")).json())
    for student_id in ("s-4", "s-5"):  # 2 и 0 попыток, минимум обучающегося — 3
        for item in rows[student_id]["levels"]:
            assert item["level"] == "noData"
            assert item["share"] is None
            assert "comparison" not in item


@pytest.mark.asyncio
async def test_journal_modes_and_period(app, tokens):
    op = (await _journal(app, tokens["teacher1"], mode="operator112", period="1m")).json()
    assert [stage["id"] for stage in op["stages"]] == OP_STAGE_IDS
    rows = _row_by_student(op)
    assert rows["s-1"]["attempts"] == 3
    type_cell = _cells(rows["s-1"])["type"]
    assert (type_cell["attemptsWithError"], type_cell["level"], type_cell["comparison"]) == (2, "often", "worse")
    assert all(item["level"] == "noData" for item in rows["s-2"]["levels"])  # 2 попытки < 3
    assert rows["s-5"]["attempts"] == 0

    all_time = (await _journal(app, tokens["teacher1"], mode="dds", period="all")).json()
    s1 = _row_by_student(all_time)["s-1"]
    assert s1["attempts"] == 5  # добавилась старая попытка
    assert _cells(s1)["statuses"]["attemptsWithError"] == 3


@pytest.mark.asyncio
async def test_other_column_appears_only_when_there_are_unmapped_errors(app, tokens):
    plain = (await _journal(app, tokens["teacher1"], GROUP_A)).json()
    assert "other" not in [stage["id"] for stage in plain["stages"]]

    body = (await _journal(app, tokens["teacher1"], GROUP_D)).json()
    assert [stage["id"] for stage in body["stages"]] == [*DDS_STAGE_IDS, "other"]
    only = body["rows"][0]
    assert only["studentId"] == "s-8" and only["attempts"] == 3
    other = _cells(only)["other"]
    assert (other["attemptsWithError"], other["level"]) == (1, "often")  # 1/3 > 0,30
    for item in only["levels"]:
        assert "comparison" not in item  # у группы 3 попытки < 5


@pytest.mark.asyncio
async def test_journal_cells_equal_student_maps(app, tokens):
    """Журнал — тот же расчёт, что карта обучающегося, но одним проходом (T045)."""
    journal = (await _journal(app, tokens["teacher1"], mode="dds", period="1m")).json()
    for row in journal["rows"]:
        response = await _get(
            app, f"/error-map/students/{quote(row['studentId'])}", tokens["teacher1"], {"mode": "dds", "period": "1m"}
        )
        assert response.status_code == 200, response.text
        student_map = response.json()
        assert row["attempts"] == student_map["attempts"]
        in_journal = _cells(row)
        for level in student_map["levels"]:
            assert in_journal[level["stageId"]] == level, (row["studentId"], level["stageId"])


@pytest.mark.asyncio
async def test_journal_does_not_leak_other_groups(app, tokens):
    response = await _journal(app, tokens["teacher1"])
    assert response.status_code == 200, response.text
    text = response.text
    for _, group, name in STUDENTS:
        if group != GROUP_A:
            assert name not in text
    for other in ("s-6", "s-7", "s-8"):
        assert f'"{other}"' not in text


# ---------------------------------------------------------------------------------------------------------------
# Права и ошибки запроса
# ---------------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_journal_access_matrix(app, tokens):
    assert (await _journal(app, tokens["teacher1"])).status_code == 200
    assert (await _journal(app, tokens["admin"])).status_code == 200
    assert (await _journal(app, tokens["teacher2"], GROUP_B)).status_code == 200  # своя группа второго преподавателя

    foreign = await _journal(app, tokens["teacher2"], GROUP_A)
    assert foreign.status_code == 403
    assert ACCESS_DENIED in foreign.text
    assert (await _journal(app, tokens["teacher1"], GROUP_B)).status_code == 403
    assert (await _journal(app, tokens["teacher3"])).status_code == 403  # групп нет совсем
    assert (await _journal(app, tokens["student"])).status_code == 403
    assert (await _journal(app, None)).status_code == 401


@pytest.mark.asyncio
async def test_journal_not_found_and_bad_params(app, tokens):
    assert (await _journal(app, tokens["teacher1"], mode="dds", period="1m")).status_code == 200  # парный запрос
    assert (await _journal(app, tokens["teacher1"], "ТЕСТ-НЕТ-ТАКОЙ")).status_code == 404
    assert (await _journal(app, tokens["teacher1"], mode="bogus")).status_code == 400
    assert (await _journal(app, tokens["teacher1"], period="bogus")).status_code == 400
