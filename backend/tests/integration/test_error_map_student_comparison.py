"""Спека 003, T038: HTTP-тесты карты обучающегося на изолированной базе.

Эндпоинты: `GET /api/v1/error-map/students/{studentId}` и `GET /api/v1/error-map/students/{studentId}/stages/{stageId}`.
Структура повторяет `test_error_map_stage.py` и `test_error_map_group.py`: собственная in-memory SQLite на модуль,
подмена `get_db` через `app.dependency_overrides`, настоящие сессии (`build_auth_session`), `Authorization: Bearer`.

Ожидаемые значения посчитаны вручную по таблице попыток ниже, без импорта сервиса. Даты — от текущего времени МСК:
окно 1m — дни 1–23, попытка `as-60` (60 дней назад) вне любого окна, кроме `period=all`.

Группа A (ДДС, 1m): 25 попыток = S1 (20) + S4 (2) + O1 (3). Доля группы считается по всем её попыткам,
включая попытки самого обучающегося (тот же агрегат, что в карте группы). Доля обучающегося — его ошибочные попытки
на этапе / его попытки (знаменатель общий для этапов).

| этап       | S1 с ошибкой | доля S1 | группа с ошибкой | доля группы | S1 − группа, п.п. | сравнение |
|------------|--------------|---------|------------------|-------------|-------------------|-----------|
| decision   | 10           | 0,50    | 10               | 0,40        | +10 (граница)     | same      |
| card       | 11           | 0,55    | 11               | 0,44        | +11               | worse     |
| statuses   | 1            | 0,05    | 4                | 0,16        | −11               | better    |
| route      | 10           | 0,50    | 15               | 0,60        | −10 (граница)     | same      |
| address    | 3            | 0,15    | 3                | 0,12        | +3                | same      |
| intake, services, closing | 0 | 0     | 0                | 0           | 0                 | same      |

Группа МАЛО: 4 попытки (меньше минимума группы 5) — сравнения нет, уровень обучающегося считается.
S4: 2 попытки (меньше minAttemptsStudent = 3) — уровень noData, доля null, сравнения нет.
Группа B — владелец второй преподаватель; S1 из неё недоступен первому преподавателю.
Группа Д (10 + 10 попыток) — граница «ровно ±10 п.п.» на значениях 0,4 и 0,3: в двоичной арифметике 0,4 − 0,3 даёт
10,000000000000004, и сравнение без округления ошиблось бы («хуже» вместо «как у группы»).

Отрицательные тесты стоят рядом с позитивными: 403, 404, 401 и 400 сопровождаются запросом, который обязан вернуть 200.
До реализации эндпоинтов тесты падают на 404, и это ожидаемо.
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

PASSWORD_HASH = hash_password("err-map-student-112")

GROUP_A = "ТЕСТ-СТ-А"  # закреплена за первым преподавателем: S1, S4, O1
GROUP_B = "ТЕСТ-СТ-Б"  # закреплена только за вторым: SB
GROUP_SMALL = "ТЕСТ-СТ-МАЛО"  # закреплена за первым: 4 попытки при минимуме 5
GROUP_D = "ТЕСТ-СТ-Д"  # закреплена за первым: 10 + 10 попыток, граница на двоичной арифметике

# Обучающиеся. id и ФИО уникальны и не входят друг в друга, чтобы утечка любого из них была видна в тексте ответа.
STUDENT = "u-st-kart"  # S1: проверяемый обучающийся, группа A
STUDENT_NAME = "Тестов Карта"
NEIGHBOUR = "u-st-sosed"  # O1: группа A, 3 попытки
NEIGHBOUR_NAME = "Тестов Сосед"
SHORT = "u-st-redk"  # S4: группа A, 2 попытки
SHORT_NAME = "Тестов Редкий"
SMALL = "u-st-malo"  # S3: группа МАЛО, 4 попытки
SMALL_NAME = "Тестов Малый"
FOREIGN = "u-st-chuzh"  # SB: группа B, 5 попыток
FOREIGN_NAME = "Тестов Чужой"
DVOI = "u-st-dvoi"  # SD: группа D, 10 попыток (4 — address, 3 — card)
DVOI_NAME = "Тестов Двоичный"
DROB = "u-st-drob"  # OD: группа D, 10 попыток (2 — address, 5 — card)
DROB_NAME = "Тестов Дробный"

TEACHER1 = "u-st-t1"  # закреплена: GROUP_A, GROUP_SMALL и GROUP_D
TEACHER2 = "u-st-t2"  # закреплён: GROUP_B
TEACHER3 = "u-st-t3"  # без закреплений
ADMIN = "u-st-adm"
MISSING_STUDENT = "u-st-nope"

ACCESS_DENIED = "Нет доступа к группе / обучающемуся"
DDS_STAGE_IDS = ["intake", "address", "decision", "card", "services", "route", "statuses", "closing"]
MAP_KEYS = {"scope", "mode", "period", "attempts", "stages", "levels", "headline", "generatedAt"}
LEVEL_KEYS = {"stageId", "attempts", "attemptsWithError", "share", "level", "affectedStudents"}
DETAIL_KEYS = {"stage", "level", "typicalErrors", "chain", "explanation"}
TYPICAL_KEYS = {"ruleId", "plainText", "severity", "studentCount", "students", "exampleAttemptId", "exampleSessionId"}
CHAIN_KEYS = {"from", "to", "caption"}

# Ключ фикстуры → id пользователя, для которого выдаётся настоящая сессия.
TOKEN_OWNERS: dict[str, str] = {
    "student": STUDENT,
    "student_other": NEIGHBOUR,
    "teacher1": TEACHER1,
    "teacher2": TEACHER2,
    "teacher3": TEACHER3,
    "admin": ADMIN,
}

# (id, группа, ФИО) обучающихся.
STUDENTS: tuple[tuple[str, str, str], ...] = (
    (STUDENT, GROUP_A, STUDENT_NAME),
    (NEIGHBOUR, GROUP_A, NEIGHBOUR_NAME),
    (SHORT, GROUP_A, SHORT_NAME),
    (SMALL, GROUP_SMALL, SMALL_NAME),
    (FOREIGN, GROUP_B, FOREIGN_NAME),
    (DVOI, GROUP_D, DVOI_NAME),
    (DROB, GROUP_D, DROB_NAME),
)

# Правило → (type, severity) из `backend/ml/assess/rules.py`. Тяжесть совпадает с `Rule.severity`.
RULE_META: dict[str, tuple[str, str]] = {
    "v1": ("noPrimaryStatus", "critical"),
    "v2": ("wrongDecision", "critical"),
    "d4": ("wrongDecision", "major"),
    "g1": ("grammarLimitExceeded", "major"),
    "c1": ("keyPhraseMissing", "minor"),
    "d2": ("wrongRecipient", "major"),
    "a1": ("addressLookalike", "major"),
}

# (id попытки, обучающийся, режим, дней назад, правила ошибок). Все попытки оценены.
ATTEMPTS: tuple[tuple[str, str, str, int, tuple[str, ...]], ...] = (
    # S1, ДДС, окно 1m: 20 попыток на днях 1–20. Ошибки по этапам:
    # decision: v2 — дни 1–7, d4 — дни 8–10 → 10 попыток; card: g1 — дни 1–6, c1 — дни 12–16 → 11 попыток;
    # statuses: v1 — день 15 → 1; route: d2 — дни 11–20 → 10; address: a1 — дни 17–19 → 3. Остальные этапы — без ошибок.
    ("as-01", STUDENT, "dds", 1, ("v2", "g1")),
    ("as-02", STUDENT, "dds", 2, ("v2", "g1")),
    ("as-03", STUDENT, "dds", 3, ("v2", "g1")),
    ("as-04", STUDENT, "dds", 4, ("v2", "g1")),
    ("as-05", STUDENT, "dds", 5, ("v2", "g1")),
    ("as-06", STUDENT, "dds", 6, ("v2", "g1")),
    ("as-07", STUDENT, "dds", 7, ("v2",)),
    ("as-08", STUDENT, "dds", 8, ("d4",)),
    ("as-09", STUDENT, "dds", 9, ("d4",)),
    ("as-10", STUDENT, "dds", 10, ("d4",)),
    ("as-11", STUDENT, "dds", 11, ("d2",)),
    ("as-12", STUDENT, "dds", 12, ("d2", "c1")),
    ("as-13", STUDENT, "dds", 13, ("d2", "c1")),
    ("as-14", STUDENT, "dds", 14, ("d2", "c1")),
    ("as-15", STUDENT, "dds", 15, ("d2", "c1", "v1")),
    ("as-16", STUDENT, "dds", 16, ("d2", "c1")),
    ("as-17", STUDENT, "dds", 17, ("d2", "a1")),
    ("as-18", STUDENT, "dds", 18, ("d2", "a1")),
    ("as-19", STUDENT, "dds", 19, ("d2", "a1")),
    ("as-20", STUDENT, "dds", 20, ("d2",)),
    # Вне окна 1m: ошибка v2 не входит ни в знаменатель, ни в пример. Виден только при period=all.
    ("as-60", STUDENT, "dds", 60, ("v2",)),
    # O1, группа A: 3 попытки с v1 и d2 в каждой. В группу добавляет statuses +3 и route +3.
    ("ao-01", NEIGHBOUR, "dds", 21, ("v1", "d2")),
    ("ao-02", NEIGHBOUR, "dds", 22, ("v1", "d2")),
    ("ao-03", NEIGHBOUR, "dds", 23, ("v1", "d2")),
    # S4, группа A: 2 попытки с d2. В группу добавляет route +2; сам S4 — noData.
    ("ar-01", SHORT, "dds", 3, ("d2",)),
    ("ar-02", SHORT, "dds", 4, ("d2",)),
    # S3, группа МАЛО: 4 попытки; decision — v2 в 2 из 4.
    ("am-01", SMALL, "dds", 1, ("v2",)),
    ("am-02", SMALL, "dds", 2, ("v2",)),
    ("am-03", SMALL, "dds", 3, ()),
    ("am-04", SMALL, "dds", 4, ()),
    # SB, группа B: 5 попыток с v2. Чужая группа для первого преподавателя.
    ("ab-01", FOREIGN, "dds", 1, ("v2",)),
    ("ab-02", FOREIGN, "dds", 2, ("v2",)),
    ("ab-03", FOREIGN, "dds", 3, ("v2",)),
    ("ab-04", FOREIGN, "dds", 4, ("v2",)),
    ("ab-05", FOREIGN, "dds", 5, ("v2",)),
    # SD, группа D: 10 попыток; address (a1) — в 4, card (c1) — в 3. Доля 0,4 и 0,3.
    ("ad-01", DVOI, "dds", 1, ("a1",)),
    ("ad-02", DVOI, "dds", 2, ("a1",)),
    ("ad-03", DVOI, "dds", 3, ("a1",)),
    ("ad-04", DVOI, "dds", 4, ("a1",)),
    ("ad-05", DVOI, "dds", 5, ("c1",)),
    ("ad-06", DVOI, "dds", 6, ("c1",)),
    ("ad-07", DVOI, "dds", 7, ("c1",)),
    ("ad-08", DVOI, "dds", 8, ()),
    ("ad-09", DVOI, "dds", 9, ()),
    ("ad-10", DVOI, "dds", 10, ()),
    # OD, группа D: 10 попыток; address — в 2, card — в 5. Группа D: address 4+2 = 6 из 20 (0,3), card 3+5 = 8 из 20 (0,4).
    ("ae-01", DROB, "dds", 11, ("a1",)),
    ("ae-02", DROB, "dds", 12, ("a1",)),
    ("ae-03", DROB, "dds", 13, ("c1",)),
    ("ae-04", DROB, "dds", 14, ("c1",)),
    ("ae-05", DROB, "dds", 15, ("c1",)),
    ("ae-06", DROB, "dds", 16, ("c1",)),
    ("ae-07", DROB, "dds", 17, ("c1",)),
    ("ae-08", DROB, "dds", 18, ()),
    ("ae-09", DROB, "dds", 19, ()),
    ("ae-10", DROB, "dds", 20, ()),
)

# Ожидания для S1 в окне 1m: этап → (ошибочных попыток, доля, уровень, сравнение, обучающихся с ошибкой).
STUDENT_LEVELS: dict[str, tuple[int, float, str, str, int]] = {
    "intake": (0, 0.0, "rare", "same", 0),
    "address": (3, 0.15, "sometimes", "same", 1),  # 15 − 12 = +3 п.п.
    "decision": (10, 0.5, "often", "same", 1),  # 50 − 40 = +10 п.п.: ровно граница зоны
    "card": (11, 0.55, "often", "worse", 1),  # 55 − 44 = +11 п.п.
    "services": (0, 0.0, "rare", "same", 0),
    "route": (10, 0.5, "often", "same", 1),  # 50 − 60 = −10 п.п.: ровно граница зоны
    "statuses": (1, 0.05, "rare", "better", 1),  # 5 − 16 = −11 п.п.
    "closing": (0, 0.0, "rare", "same", 0),
}

# Группа A в окне 1m: этап → (попыток с ошибкой, доля). Знаменатель группы — 25.
GROUP_A_SHARES: dict[str, tuple[int, float]] = {
    "intake": (0, 0.0),
    "address": (3, 0.12),
    "decision": (10, 0.4),
    "card": (11, 0.44),
    "services": (0, 0.0),
    "route": (15, 0.6),
    "statuses": (4, 0.16),
    "closing": (0, 0.0),
}

# Пулы примеров: какие попытки S1 (окно 1m) содержат правило на этапе. Пример обязан быть из пула.
EXAMPLE_POOLS: list[tuple[str, str, set[str]]] = [
    ("decision", "v2", {f"as-{day:02d}" for day in range(1, 8)}),  # as-60 не входит: вне окна
    ("decision", "d4", {"as-08", "as-09", "as-10"}),
    ("card", "g1", {f"as-{day:02d}" for day in range(1, 7)}),
    ("card", "c1", {f"as-{day:02d}" for day in range(12, 17)}),
    ("statuses", "v1", {"as-15"}),
    ("route", "d2", {f"as-{day:02d}" for day in range(11, 21)}),
    ("address", "a1", {"as-17", "as-18", "as-19"}),
]

# Связи, исходящие из этапа (dds). Те же, что в карте группы: связи — свойство этапа, не человека.
CHAIN_CASES: list[tuple[str, set[tuple[str, str, str]]]] = [
    (
        "decision",
        {
            ("decision", "services", "Неверный тип → не те службы"),
            ("decision", "route", "Неверный тип → не тот маршрут"),
        },
    ),
    ("statuses", {("statuses", "closing", "Статусы не доведены → карточка не закрыта")}),
    ("route", set()),
    ("card", set()),
]


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
        _user(TEACHER1, "teacher", assigned=[GROUP_A, GROUP_SMALL, GROUP_D]),
        _user(TEACHER2, "teacher", assigned=[GROUP_B]),
        _user(TEACHER3, "teacher"),
        _user(ADMIN, "admin"),
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


def _path(student_id: str, stage_id: str | None = None) -> str:
    base = f"/error-map/students/{quote(student_id)}"
    return base if stage_id is None else f"{base}/stages/{quote(stage_id)}"


def _clean(params: dict[str, str | None]) -> dict[str, str]:
    return {key: value for key, value in params.items() if value is not None}


async def _get(app, path: str, token: str | None = None, params: dict[str, str] | None = None) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.get(path, headers=headers, params=params)


async def _map(app, token: str | None, student_id: str = STUDENT, **query: str | None) -> httpx.Response:
    return await _get(app, _path(student_id), token, _clean(query))


async def _map_body(app, token: str, student_id: str = STUDENT, **query: str | None) -> dict[str, Any]:
    response = await _map(app, token, student_id, **query)
    assert response.status_code == 200, response.text
    return response.json()


async def _stage(
    app, token: str | None, stage_id: str, student_id: str = STUDENT, **query: str | None
) -> httpx.Response:
    return await _get(app, _path(student_id, stage_id), token, _clean(query))


async def _stage_body(app, token: str, stage_id: str, student_id: str = STUDENT, **query: str | None) -> dict[str, Any]:
    response = await _stage(app, token, stage_id, student_id, **query)
    assert response.status_code == 200, response.text
    return response.json()


def _by_stage(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {row["stageId"]: row for row in body["levels"]}


def _by_rule(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["ruleId"]: item for item in body["typicalErrors"]}


def _expect_row(
    row: dict[str, Any],
    *,
    attempts: int,
    with_error: int,
    share: float | None,
    level: str,
    affected: int,
    comparison: str | None,
) -> None:
    assert row["attempts"] == attempts
    assert row["attemptsWithError"] == with_error
    if share is None:
        assert row["share"] is None
    else:
        assert row["share"] == pytest.approx(share)
    assert row["level"] == level
    assert row["affectedStudents"] == affected
    if comparison is None:
        assert "comparison" not in row
    else:
        assert row["comparison"] == comparison


async def test_map_answers_200_with_contract_shape(app, tokens):
    response = await _map(app, tokens["teacher1"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == MAP_KEYS
    assert body["scope"] == {"kind": "student", "groupId": GROUP_A, "studentId": STUDENT, "title": STUDENT_NAME}
    assert body["mode"] == "dds"
    assert body["period"] == "1m"
    assert body["attempts"] == 20  # as-60 вне окна не считается
    assert [stage["id"] for stage in body["stages"]] == DDS_STAGE_IDS
    assert all("articleId" not in stage for stage in body["stages"])
    assert all(set(row) == LEVEL_KEYS | {"comparison"} for row in body["levels"])
    assert datetime.fromisoformat(body["generatedAt"]).tzinfo is not None


async def test_every_stage_row_matches_hand_count(app, tokens):
    body = await _map_body(app, tokens["teacher1"])
    levels = _by_stage(body)
    assert set(levels) == set(DDS_STAGE_IDS)
    for stage_id, (with_error, share, level, comparison, affected) in STUDENT_LEVELS.items():
        _expect_row(
            levels[stage_id],
            attempts=20,
            with_error=with_error,
            share=share,
            level=level,
            affected=affected,
            comparison=comparison,
        )


async def test_comparison_zone_boundaries_are_inclusive(app, tokens):
    # Зона «как у группы» — ±10 п.п. Ровно 10 входит в зону; 11 уже выходит за неё.
    levels = _by_stage(await _map_body(app, tokens["teacher1"]))
    assert levels["decision"]["comparison"] == "same"  # +10 п.п.
    assert levels["route"]["comparison"] == "same"  # −10 п.п.
    assert levels["card"]["comparison"] == "worse"  # +11 п.п.: хуже группы
    assert levels["statuses"]["comparison"] == "better"  # −11 п.п.: лучше группы


async def test_exact_ten_points_stay_same_despite_binary_fractions(app, tokens):
    # Группа D: 20 попыток; address — 6 с ошибкой (0,3), card — 8 (0,4).
    # Обучающийся SD: address — 4 из 10 (0,4), card — 3 из 10 (0,3).
    # address: 0,4 − 0,3 = +10 п.п.; card: 0,3 − 0,4 = −10 п.п. Оба — same. Без округления разница даёт
    # 10,000000000000004 и −10,000000000000004: граница ошибочно сдвинулась бы в «хуже» и «лучше».
    group = await _get(app, f"/error-map/groups/{quote(GROUP_D)}", tokens["teacher1"])
    assert group.status_code == 200, group.text
    group_levels = _by_stage(group.json())
    assert group.json()["attempts"] == 20
    assert group_levels["address"]["attemptsWithError"] == 6
    assert group_levels["card"]["attemptsWithError"] == 8

    levels = _by_stage(await _map_body(app, tokens["teacher1"], student_id=DVOI))
    assert levels["address"]["attempts"] == 10
    assert levels["address"]["attemptsWithError"] == 4
    assert levels["address"]["share"] == pytest.approx(0.4)
    assert levels["address"]["comparison"] == "same"
    assert levels["card"]["attempts"] == 10
    assert levels["card"]["attemptsWithError"] == 3
    assert levels["card"]["share"] == pytest.approx(0.3)
    assert levels["card"]["comparison"] == "same"


async def test_group_counts_behind_comparison_are_hand_checked(app, tokens):
    # Проверка знаменателя группы: сравнение строится от тех же 25 попыток, что карта группы.
    response = await _get(app, f"/error-map/groups/{quote(GROUP_A)}", tokens["teacher1"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["attempts"] == 25
    levels = _by_stage(body)
    for stage_id, (with_error, share) in GROUP_A_SHARES.items():
        assert levels[stage_id]["attempts"] == 25, stage_id
        assert levels[stage_id]["attemptsWithError"] == with_error, stage_id
        assert levels[stage_id]["share"] == pytest.approx(share), stage_id


async def test_headline_lists_three_often_stages_by_share_then_order(app, tokens):
    headline = (await _map_body(app, tokens["teacher1"]))["headline"]
    assert headline["kind"] == "problems"
    # «часто»: card 0,55; decision 0,50; route 0,50. По доле ↓, при равенстве — по порядку этапа (decision раньше route).
    assert headline["stageIds"] == ["card", "decision", "route"]
    assert headline["text"]


@pytest.mark.parametrize(
    ("period", "attempts", "with_error", "share", "comparison"),
    [
        ("1m", 20, 10, 0.5, "same"),
        # all: плюс as-60 с v2. S1 — 21 попытка, 11 с ошибкой; группа — 26, 11 с ошибкой.
        # 52,4 − 42,3 = 10,1 п.п. → worse. Виден и знаменатель обучающегося, и знаменатель группы.
        ("all", 21, 11, 11 / 21, "worse"),
    ],
)
async def test_period_changes_both_denominators(app, tokens, period, attempts, with_error, share, comparison):
    body = await _map_body(app, tokens["teacher1"], period=period)
    assert body["period"] == period
    assert body["attempts"] == attempts
    _expect_row(
        _by_stage(body)["decision"],
        attempts=attempts,
        with_error=with_error,
        share=share,
        level="often",
        affected=1,
        comparison=comparison,
    )


async def test_student_under_three_attempts_is_nodata_without_comparison(app, tokens):
    # Группа A полная (25 попыток), но у самого обучающегося 2 попытки при минимуме 3: сравнения нет.
    body = await _map_body(app, tokens["teacher1"], student_id=SHORT)
    assert body["scope"] == {"kind": "student", "groupId": GROUP_A, "studentId": SHORT, "title": SHORT_NAME}
    assert body["attempts"] == 2
    assert body["headline"]["kind"] == "noData"
    assert body["headline"]["stageIds"] == []
    assert body["levels"]
    for row in body["levels"]:
        assert row["attempts"] == 2
        assert row["share"] is None
        assert row["level"] == "noData"
        assert "comparison" not in row


async def test_small_group_drops_comparison_but_keeps_student_levels(app, tokens):
    # Группа МАЛО: 4 попытки при минимуме 5. Уровни обучающегося считаются (4 ≥ 3), сравнения нет.
    body = await _map_body(app, tokens["teacher1"], student_id=SMALL)
    assert body["scope"] == {"kind": "student", "groupId": GROUP_SMALL, "studentId": SMALL, "title": SMALL_NAME}
    assert body["attempts"] == 4
    levels = _by_stage(body)
    _expect_row(
        levels["decision"],
        attempts=4,
        with_error=2,
        share=0.5,
        level="often",
        affected=1,
        comparison=None,
    )
    assert all("comparison" not in row for row in body["levels"])

    group = await _get(app, f"/error-map/groups/{quote(GROUP_SMALL)}", tokens["teacher1"])
    assert group.status_code == 200, group.text
    assert group.json()["attempts"] == 4


async def test_map_names_no_other_person_and_no_other_attempt(app, tokens):
    response = await _map(app, tokens["teacher1"])
    assert response.status_code == 200, response.text
    text = response.text
    for forbidden in (
        NEIGHBOUR_NAME,
        SHORT_NAME,
        SMALL_NAME,
        FOREIGN_NAME,
        DVOI_NAME,
        DROB_NAME,
        NEIGHBOUR,
        SHORT,
        SMALL,
        FOREIGN,
        DVOI,
        DROB,
        "ao-0",
        "ar-0",
        "am-0",
        "ab-0",
        "ad-0",
        "ae-0",
    ):
        assert forbidden not in text, forbidden


async def test_teacher_without_access_gets_403_for_foreign_student_and_owner_gets_200(app, tokens):
    response = await _map(app, tokens["teacher1"], student_id=FOREIGN)
    assert response.status_code == 403, response.text
    error = response.json()["error"]
    assert error["code"] == "forbidden"
    assert error["message"] == ACCESS_DENIED

    # Контроль: владелец группы B получает 200 и свою карту (5 попыток).
    owner = await _map_body(app, tokens["teacher2"], student_id=FOREIGN)
    assert owner["scope"]["studentId"] == FOREIGN
    assert owner["attempts"] == 5


async def test_teacher_without_assignments_gets_403(app, tokens):
    response = await _map(app, tokens["teacher3"])
    assert response.status_code == 403, response.text
    assert response.json()["error"]["message"] == ACCESS_DENIED

    control = await _map(app, tokens["teacher1"])
    assert control.status_code == 200, control.text


async def test_admin_reads_any_student_map(app, tokens):
    body = await _map_body(app, tokens["admin"], student_id=FOREIGN)
    assert body["scope"]["title"] == FOREIGN_NAME
    assert body["attempts"] == 5


async def test_without_session_is_401_next_to_session_200(app, tokens):
    response = await _map(app, None)
    assert response.status_code == 401, response.text
    assert response.json()["error"]["code"] == "unauthorized"
    control = await _map(app, tokens["teacher1"])
    assert control.status_code == 200, control.text


async def test_student_is_403_even_for_himself(app, tokens):
    own = await _map(app, tokens["student"])
    assert own.status_code == 403, own.text
    assert own.json()["error"]["code"] == "forbidden"

    other = await _map(app, tokens["student_other"])
    assert other.status_code == 403, other.text
    assert other.json()["error"]["code"] == "forbidden"

    control = await _map(app, tokens["teacher1"])
    assert control.status_code == 200, control.text


@pytest.mark.parametrize("who", ["teacher1", "teacher3", "admin"])
async def test_missing_student_is_404_with_id_in_message(app, tokens, who):
    response = await _map(app, tokens[who], student_id=MISSING_STUDENT)
    assert response.status_code == 404, response.text
    error = response.json()["error"]
    assert error["code"] == "notFound"
    assert MISSING_STUDENT in error["message"]
    control = await _map(app, tokens["teacher1"])
    assert control.status_code == 200, control.text


@pytest.mark.parametrize("who", ["teacher1", "admin"])
async def test_teacher_id_is_not_a_student_404(app, tokens, who):
    # Идентификатор преподавателя — не обучающийся: 404, а не 200 с пустой картой.
    response = await _map(app, tokens[who], student_id=TEACHER2)
    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "notFound"
    control = await _map(app, tokens["teacher1"])
    assert control.status_code == 200, control.text


@pytest.mark.parametrize(
    ("params", "marker"),
    [({"mode": "ops"}, "«mode»"), ({"period": "week"}, "«period»")],
)
async def test_unknown_mode_or_period_is_400_next_to_valid_200(app, tokens, params, marker):
    response = await _get(app, _path(STUDENT), tokens["teacher1"], params)
    assert response.status_code == 400, response.text
    error = response.json()["error"]
    assert error["code"] == "validationFailed"
    assert marker in error["message"]
    control = await _get(app, _path(STUDENT), tokens["teacher1"], {"mode": "dds", "period": "1m"})
    assert control.status_code == 200, control.text


# --- Разбор этапа для обучающегося ---


async def test_stage_answers_200_with_contract_shape(app, tokens):
    response = await _stage(app, tokens["teacher1"], "decision")
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == DETAIL_KEYS
    assert body["stage"] == {"id": "decision", "order": 3, "title": "Тип происшествия"}
    assert set(body["level"]) == LEVEL_KEYS | {"comparison"}
    assert body["level"]["comparison"] == "same"
    assert all(set(item) == TYPICAL_KEYS for item in body["typicalErrors"])
    assert all(set(link) == CHAIN_KEYS for link in body["chain"])
    # Ключ обязан быть; значение пояснения ИИ зависит от US6 и здесь не фиксируется.
    assert "explanation" in body


async def test_stage_level_matches_student_map_row(app, tokens):
    map_levels = _by_stage(await _map_body(app, tokens["teacher1"]))
    for stage_id in ("decision", "card", "statuses", "route", "closing"):
        detail = await _stage_body(app, tokens["teacher1"], stage_id)
        assert detail["level"] == map_levels[stage_id], stage_id


@pytest.mark.parametrize(
    ("stage_id", "rules", "severities"),
    [
        # Один обучающийся: studentCount = 1 у каждой типовой ошибки; порядок — по тяжести critical > major > minor.
        ("decision", ["v2", "d4"], ["critical", "major"]),
        ("card", ["g1", "c1"], ["major", "minor"]),
        ("statuses", ["v1"], ["critical"]),
        ("route", ["d2"], ["major"]),
        ("address", ["a1"], ["major"]),
    ],
)
async def test_typical_errors_are_his_own_with_count_one(app, tokens, stage_id, rules, severities):
    typical = (await _stage_body(app, tokens["teacher1"], stage_id))["typicalErrors"]
    assert [item["ruleId"] for item in typical] == rules
    assert [item["severity"] for item in typical] == severities
    for item in typical:
        assert item["studentCount"] == 1
        assert item["students"] == [{"id": STUDENT, "name": STUDENT_NAME}]


async def test_typical_errors_carry_plain_words(app, tokens):
    typical = (await _stage_body(app, tokens["teacher1"], "decision"))["typicalErrors"]
    assert [item["plainText"] for item in typical] == [
        "Статус реагирования не соответствует заявке",
        "Повторная карточка не отмечена как дубль",
    ]


@pytest.mark.parametrize(("stage_id", "rule_id", "pool"), EXAMPLE_POOLS)
async def test_example_attempt_is_his_own_and_in_window(app, tokens, stage_id, rule_id, pool):
    item = _by_rule(await _stage_body(app, tokens["teacher1"], stage_id))[rule_id]
    assert item["exampleAttemptId"] in pool
    assert item["exampleSessionId"] == f"ses-{item['exampleAttemptId']}"


@pytest.mark.parametrize(("stage_id", "expected"), CHAIN_CASES)
async def test_chain_holds_only_links_leaving_the_stage(app, tokens, stage_id, expected):
    body = await _stage_body(app, tokens["teacher1"], stage_id)
    links = [(link["from"], link["to"], link["caption"]) for link in body["chain"]]
    assert len(links) == len(expected)
    assert set(links) == expected


async def test_stage_without_errors_has_empty_typical_list(app, tokens):
    body = await _stage_body(app, tokens["teacher1"], "closing")
    assert body["typicalErrors"] == []
    assert body["level"]["share"] == pytest.approx(0.0)
    assert body["level"]["comparison"] == "same"


async def test_nodata_student_stage_has_null_explanation_and_no_comparison(app, tokens):
    body = await _stage_body(app, tokens["teacher1"], "route", student_id=SHORT)
    assert body["level"]["attempts"] == 2
    assert body["level"]["share"] is None
    assert body["level"]["level"] == "noData"
    assert "comparison" not in body["level"]
    assert body["explanation"] is None


async def test_stage_of_small_group_has_no_comparison(app, tokens):
    body = await _stage_body(app, tokens["teacher1"], "decision", student_id=SMALL)
    _expect_row(
        body["level"],
        attempts=4,
        with_error=2,
        share=0.5,
        level="often",
        affected=1,
        comparison=None,
    )


async def test_stage_foreign_student_403_next_to_owner_200(app, tokens):
    response = await _stage(app, tokens["teacher1"], "decision", student_id=FOREIGN)
    assert response.status_code == 403, response.text
    error = response.json()["error"]
    assert error["code"] == "forbidden"
    assert error["message"] == ACCESS_DENIED

    owner = await _stage_body(app, tokens["teacher2"], "decision", student_id=FOREIGN)
    assert owner["level"]["attempts"] == 5


async def test_stage_teacher_without_assignments_is_403(app, tokens):
    response = await _stage(app, tokens["teacher3"], "decision")
    assert response.status_code == 403, response.text
    assert response.json()["error"]["message"] == ACCESS_DENIED
    control = await _stage(app, tokens["teacher1"], "decision")
    assert control.status_code == 200, control.text


async def test_stage_student_is_403_even_for_himself(app, tokens):
    own = await _stage(app, tokens["student"], "decision")
    assert own.status_code == 403, own.text
    assert own.json()["error"]["code"] == "forbidden"
    control = await _stage(app, tokens["teacher1"], "decision")
    assert control.status_code == 200, control.text


async def test_stage_admin_reads_any_student(app, tokens):
    body = await _stage_body(app, tokens["admin"], "decision", student_id=FOREIGN)
    assert body["stage"]["id"] == "decision"
    assert body["level"]["attempts"] == 5


async def test_stage_without_session_is_401_next_to_session_200(app, tokens):
    response = await _stage(app, None, "decision")
    assert response.status_code == 401, response.text
    assert response.json()["error"]["code"] == "unauthorized"
    control = await _stage(app, tokens["teacher1"], "decision")
    assert control.status_code == 200, control.text


@pytest.mark.parametrize("who", ["teacher1", "teacher3", "admin"])
async def test_stage_missing_student_is_404(app, tokens, who):
    response = await _stage(app, tokens[who], "decision", student_id=MISSING_STUDENT)
    assert response.status_code == 404, response.text
    error = response.json()["error"]
    assert error["code"] == "notFound"
    assert MISSING_STUDENT in error["message"]
    control = await _stage(app, tokens["teacher1"], "decision")
    assert control.status_code == 200, control.text


@pytest.mark.parametrize("who", ["teacher1", "admin"])
async def test_stage_teacher_id_is_not_a_student_404(app, tokens, who):
    response = await _stage(app, tokens[who], "decision", student_id=TEACHER2)
    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "notFound"
    control = await _stage(app, tokens["teacher1"], "decision")
    assert control.status_code == 200, control.text


async def test_stage_unknown_or_other_mode_is_404_next_to_valid_200(app, tokens):
    missing = await _stage(app, tokens["teacher1"], "nope")
    assert missing.status_code == 404, missing.text
    assert missing.json()["error"]["code"] == "notFound"

    # «essence» есть только в operator112; в режиме ДДС такого этапа нет.
    in_dds = await _stage(app, tokens["teacher1"], "essence", mode="dds")
    assert in_dds.status_code == 404, in_dds.text
    assert in_dds.json()["error"]["code"] == "notFound"

    control = await _stage(app, tokens["teacher1"], "decision", mode="dds")
    assert control.status_code == 200, control.text


@pytest.mark.parametrize(
    ("params", "marker"),
    [({"mode": "ops"}, "«mode»"), ({"period": "week"}, "«period»")],
)
async def test_stage_unknown_mode_or_period_is_400(app, tokens, params, marker):
    response = await _get(app, _path(STUDENT, "decision"), tokens["teacher1"], params)
    assert response.status_code == 400, response.text
    error = response.json()["error"]
    assert error["code"] == "validationFailed"
    assert marker in error["message"]
    control = await _get(app, _path(STUDENT, "decision"), tokens["teacher1"], {"mode": "dds", "period": "1m"})
    assert control.status_code == 200, control.text


async def test_stage_detail_names_no_other_person_and_no_out_of_window_attempt(app, tokens):
    response = await _stage(app, tokens["teacher1"], "decision")
    assert response.status_code == 200, response.text
    text = response.text
    # Свои данные обучающегося в ответе есть; чужие — нет.
    assert STUDENT_NAME in text
    for forbidden in (
        NEIGHBOUR_NAME,
        SHORT_NAME,
        SMALL_NAME,
        FOREIGN_NAME,
        DVOI_NAME,
        DROB_NAME,
        NEIGHBOUR,
        SHORT,
        SMALL,
        FOREIGN,
        "ao-0",
        "ar-0",
        "am-0",
        "ab-0",
        "ad-0",
        "ae-0",
        "as-60",
    ):
        assert forbidden not in text, forbidden
