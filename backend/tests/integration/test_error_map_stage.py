"""Спека 003, T029: HTTP-тесты `GET /api/v1/error-map/groups/{groupId}/stages/{stageId}` на изолированной базе.

Структура повторяет `test_error_map_group.py` (T020): собственная in-memory SQLite на модуль, подмена `get_db`
через `app.dependency_overrides`, настоящие сессии (`build_auth_session`) и заголовок `Authorization: Bearer`.
Хелперы продублированы, а не импортированы: импорт тест-модуля повторно собрал бы его тесты.

Ожидаемые значения посчитаны вручную по таблице попыток ниже, без импорта сервиса. Таблица намеренно задаёт:
- четыре правила на одном этапе (`decision`, `card`), чтобы срез «не более трёх» шёл после сортировки;
- пары с равным числом обучающихся и разной тяжестью (тай-брейк по тяжести), а minor с большим числом
  обучающихся стоит выше major (сначала число, потом тяжесть);
- обучающегося чужой группы с тем же правилом и самой ранней попыткой в окне 1m: ни его имени, ни попытки в
  ответе быть не должно;
- попытки режима operator112 у тех же обучающихся: числа режима dds доказывают фильтр по режиму.
Доли 0,10 и 0,30 (границы уровней) здесь не используются: граничные случаи покрывают юнит-тесты.
Минимум попыток группы — 5 (data-model.md §2). Даты отсчитываются от текущего времени МСК.

Отрицательные тесты парные: рядом с 404, 403, 401 и 400 стоит запрос, который при реализации обязан вернуть 200.
До появления эндпоинта тесты падают, и это ожидаемо: зелёный тест без реализации ничего не доказывает.
Состояние `explanation` — справочное пояснение (шаблон) без ключа `verdict`, пока вердикта нет (US6).
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

PASSWORD_HASH = hash_password("err-map-stage-112")

GROUP_A = "ТЕСТ-ЭТАП"  # закреплена за первым преподавателем
GROUP_B = "ТЕСТ-ЧУЖОЙ-ЭТАП"  # закреплена только за вторым
MISSING_GROUP = "ТЕСТ-НЕТ-ЭТАП"

ACCESS_DENIED = "Нет доступа к группе / обучающемуся"
DETAIL_KEYS = {"stage", "level", "typicalErrors", "chain", "explanation"}
LEVEL_KEYS = {"stageId", "attempts", "attemptsWithError", "share", "level", "affectedStudents"}
TYPICAL_KEYS = {"ruleId", "plainText", "severity", "studentCount", "students", "exampleAttemptId", "exampleSessionId"}
CHAIN_KEYS = {"from", "to", "caption"}

# Ключ фикстуры → id пользователя, для которого выдаётся настоящая сессия.
TOKEN_OWNERS: dict[str, str] = {
    "student": "u-st-stu",
    "teacher1": "u-st-t1",
    "teacher2": "u-st-t2",
    "teacher3": "u-st-t3",
    "admin": "u-st-adm",
}

# (id обучающегося, группа, имя). Имена отличаются от id: реализация, отдающая id вместо имени, не пройдёт.
STUDENTS: tuple[tuple[str, str, str], ...] = (
    ("sa-1", GROUP_A, "Тестов Один"),
    ("sa-2", GROUP_A, "Тестов Два"),
    ("sa-3", GROUP_A, "Тестов Три"),
    ("sa-4", GROUP_A, "Тестов Четыре"),
    ("sa-5", GROUP_A, "Тестов Пять"),
    ("sb-1", GROUP_B, "Тестов Чужой"),
)

# Правило → (type, severity) из реестра `ml/assess/rules.py`. В ошибке тяжесть совпадает с `Rule.severity`.
RULE_META: dict[str, tuple[str, str]] = {
    "v2": ("wrongDecision", "critical"),
    "v2t": ("wrongDecision", "critical"),
    "tr1": ("trapNotDetected", "critical"),
    "d4": ("wrongDecision", "major"),
    "c1": ("keyPhraseMissing", "minor"),
    "c2": ("reportIncomplete", "minor"),
    "g1": ("grammarLimitExceeded", "major"),
    "f1": ("requiredFieldMissing", "major"),
    "v1": ("noPrimaryStatus", "critical"),
    "s2": ("statusSequenceOrder", "minor"),
    "s3": ("statusMissing", "major"),
    "d1": ("missedRequiredCall", "critical"),
    "d2": ("wrongRecipient", "major"),
    "d3": ("transferMissing", "major"),
    "x1": ("guessing", "minor"),
    "op-f1": ("wrongFinalType", "critical"),
    "op-d1": ("lostFact", "major"),
}

# (id попытки, обучающийся, режим, дней назад, правила ошибок). Все попытки оценены.
ATTEMPTS: tuple[tuple[str, str, str, int, tuple[str, ...]], ...] = (
    # ГРУППА A, ДДС, 10 попыток в окне 1m; at-a11 — старая, видна только при period=all.
    # decision: v2 — 3 обуч. (critical), v2t — 2 (critical), d4 — 2 (major), tr1 — 1 (critical, срезается).
    # card: c1 — 3 обуч. (minor), g1 — 2 (major), c2 — 2 (minor), f1 — 1 (major, срезается).
    # at-a03 и at-a07 — по две ошибки одного этапа в одной попытке: попытка учитывается один раз (FR-003).
    ("at-a01", "sa-1", "dds", 2, ("v2", "c1")),
    ("at-a02", "sa-1", "dds", 3, ("d2", "s2")),
    ("at-a03", "sa-2", "dds", 4, ("v2", "d4", "c2", "g1", "d1")),
    ("at-a04", "sa-2", "dds", 5, ("v1", "x1")),
    ("at-a05", "sa-3", "dds", 6, ("v2", "c1")),
    ("at-a06", "sa-3", "dds", 7, ("d3", "s3")),
    ("at-a07", "sa-4", "dds", 8, ("v2t", "d4", "f1", "c2", "d1")),
    ("at-a08", "sa-4", "dds", 9, ("v1", "s2", "d2")),
    ("at-a09", "sa-5", "dds", 20, ("v2t", "tr1", "c1", "g1")),
    ("at-a10", "sa-5", "dds", 25, ("d2", "x1")),
    ("at-a11", "sa-1", "dds", 40, ("v2",)),
    # ГРУППА A, operator112: те же обучающиеся, 5 попыток (минимум группы).
    # Тип: op-f1 у 3 из 5 попыток; суть: op-d1 у 2 из 5.
    ("at-o01", "sa-1", "operator112", 1, ("op-f1",)),
    ("at-o02", "sa-2", "operator112", 2, ("op-f1", "op-d1")),
    ("at-o03", "sa-3", "operator112", 3, ("op-f1",)),
    ("at-o04", "sa-4", "operator112", 4, ("op-d1",)),
    ("at-o05", "sa-5", "operator112", 5, ()),
    # ГРУППА B (чужая для первого преподавателя): 5 попыток с v2. at-b01 — самая старая v2 в выборке,
    # at-b05 — самая свежая: чужая попытка на обоих концах окна ловит утечку примера при любом правиле выбора.
    ("at-b01", "sb-1", "dds", 28, ("v2",)),
    ("at-b02", "sb-1", "dds", 27, ("v2",)),
    ("at-b03", "sb-1", "dds", 26, ("v2",)),
    ("at-b04", "sb-1", "dds", 25, ("v2",)),
    ("at-b05", "sb-1", "dds", 1, ("v2",)),
)

# Пулы примеров: какие попытки группы A (окно 1m) содержат правило на этапе. Пример обязан быть из пула.
EXAMPLE_POOLS: list[tuple[str, str, str, set[str]]] = [
    ("dds", "decision", "v2", {"at-a01", "at-a03", "at-a05"}),
    ("dds", "decision", "v2t", {"at-a07", "at-a09"}),
    ("dds", "decision", "d4", {"at-a03", "at-a07"}),
    ("dds", "card", "c1", {"at-a01", "at-a05", "at-a09"}),
    ("dds", "card", "g1", {"at-a03", "at-a09"}),
    ("dds", "card", "c2", {"at-a03", "at-a07"}),
    ("dds", "statuses", "v1", {"at-a04", "at-a08"}),
    ("dds", "statuses", "s2", {"at-a02", "at-a08"}),
    ("dds", "statuses", "s3", {"at-a06"}),
    ("dds", "route", "d2", {"at-a02", "at-a08", "at-a10"}),
    ("dds", "route", "d3", {"at-a06"}),
    ("dds", "services", "d1", {"at-a03", "at-a07"}),
    ("operator112", "type", "op-f1", {"at-o01", "at-o02", "at-o03"}),
    ("operator112", "essence", "op-d1", {"at-o02", "at-o04"}),
]

# Связи, исходящие из этапа: (режим, этап, ожидаемый набор (from, to, caption)). Пустой набор — исходящих нет.
CHAIN_CASES: list[tuple[str, str, set[tuple[str, str, str]]]] = [
    (
        "dds",
        "decision",
        {
            ("decision", "services", "Неверный тип → не те службы"),
            ("decision", "route", "Неверный тип → не тот маршрут"),
        },
    ),
    ("dds", "services", {("services", "statuses", "Не те службы → сбой в статусах")}),
    ("dds", "statuses", {("statuses", "closing", "Статусы не доведены → карточка не закрыта")}),
    ("dds", "route", set()),
    ("dds", "card", set()),
    ("operator112", "essence", {("essence", "type", "Неверное описание → неверный тип")}),
    (
        "operator112",
        "type",
        {
            ("type", "signs", "Неверный тип → не выставлены признаки"),
            ("type", "services", "Неверный тип → не та служба в оповещении"),
        },
    ),
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
        _user("u-st-stu", "student"),  # без группы: отказ по роли до поиска группы
        _user("u-st-t1", "teacher", assigned=[GROUP_A]),
        _user("u-st-t2", "teacher", assigned=[GROUP_B]),
        _user("u-st-t3", "teacher"),
        _user("u-st-adm", "admin"),
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


def _path(group_id: str, stage_id: str | None = None) -> str:
    base = f"/error-map/groups/{quote(group_id)}"
    return base if stage_id is None else f"{base}/stages/{quote(stage_id)}"


def _query(mode: str | None, period: str | None) -> dict[str, str]:
    params: dict[str, str] = {}
    if mode is not None:
        params["mode"] = mode
    if period is not None:
        params["period"] = period
    return params


async def _get(
    app, path: str, token: str | None = None, params: dict[str, str] | None = None
) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.get(path, headers=headers, params=params)


async def _stage(
    app,
    token: str | None,
    stage_id: str,
    *,
    group_id: str = GROUP_A,
    mode: str | None = None,
    period: str | None = None,
) -> httpx.Response:
    return await _get(app, _path(group_id, stage_id), token, _query(mode, period))


async def _detail(
    app,
    token: str,
    stage_id: str,
    *,
    group_id: str = GROUP_A,
    mode: str | None = None,
    period: str | None = None,
) -> dict[str, Any]:
    response = await _stage(app, token, stage_id, group_id=group_id, mode=mode, period=period)
    assert response.status_code == 200, response.text
    return response.json()


def _expect_level(
    row: dict[str, Any], *, attempts: int, with_error: int, share: float, level: str, affected: int
) -> None:
    assert row["attempts"] == attempts
    assert row["attemptsWithError"] == with_error
    assert row["share"] == pytest.approx(share)
    assert row["level"] == level
    assert row["affectedStudents"] == affected
    assert "comparison" not in row


def _by_rule(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["ruleId"]: item for item in body["typicalErrors"]}


def _students(item: dict[str, Any]) -> list[tuple[str, str]]:
    return sorted((student["id"], student["name"]) for student in item["students"])


async def test_stage_answers_200_with_contract_shape(app, tokens):
    response = await _stage(app, tokens["teacher1"], "decision")
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == DETAIL_KEYS
    assert body["stage"] == {"id": "decision", "order": 3, "title": "Тип происшествия"}
    assert set(body["level"]) == LEVEL_KEYS
    assert body["typicalErrors"]
    assert all(set(item) == TYPICAL_KEYS for item in body["typicalErrors"])
    assert all(set(link) == CHAIN_KEYS for link in body["chain"])
    # US6: на этапе с данными есть справочное пояснение (шаблон), вердикта пока нет.
    assert body["explanation"]["source"] == "template" and "verdict" not in body["explanation"]


async def test_stage_has_no_article_id_key(app, tokens):
    decision = await _detail(app, tokens["teacher1"], "decision")
    other = await _detail(app, tokens["teacher1"], "other")
    assert "articleId" not in decision["stage"]
    assert "articleId" not in other["stage"]


async def test_level_is_counted_by_hand_in_dds_only(app, tokens):
    # 10 попыток dds в окне 1m; 5 попыток operator112 тех же обучающихся в знаменатель не входят.
    body = await _detail(app, tokens["teacher1"], "decision")
    _expect_level(body["level"], attempts=10, with_error=5, share=0.5, level="often", affected=5)


async def test_level_matches_group_map_row(app, tokens):
    stage = await _detail(app, tokens["teacher1"], "decision")
    group_response = await _get(app, _path(GROUP_A), tokens["teacher1"])
    assert group_response.status_code == 200, group_response.text
    row = {item["stageId"]: item for item in group_response.json()["levels"]}["decision"]
    assert stage["level"] == row


@pytest.mark.parametrize(
    ("stage_id", "rules", "counts", "severities"),
    [
        # Срез «не более трёх» и порядок: число обучающихся ↓, затем тяжесть critical > major > minor.
        # decision: tr1 (critical, 1 обуч.) отрезан; v2t и d4 — по 2 обуч., critical выше major.
        ("decision", ["v2", "v2t", "d4"], [3, 2, 2], ["critical", "critical", "major"]),
        # card: c1 (minor, 3 обуч.) выше g1 (major, 2); g1 выше c2 (minor, 2) при равном числе;
        # f1 (major, 1) отрезан.
        ("card", ["c1", "g1", "c2"], [3, 2, 2], ["minor", "major", "minor"]),
        # statuses: v1 (critical) выше s2 (minor) при равном числе; s2 (minor, 2) выше s3 (major, 1).
        ("statuses", ["v1", "s2", "s3"], [2, 2, 1], ["critical", "minor", "major"]),
        ("route", ["d2", "d3"], [3, 1], ["major", "major"]),
    ],
)
async def test_typical_errors_sorted_by_students_then_severity(
    app, tokens, stage_id, rules, counts, severities
):
    typical = (await _detail(app, tokens["teacher1"], stage_id))["typicalErrors"]
    assert len(typical) <= 3
    assert [item["ruleId"] for item in typical] == rules
    assert [item["studentCount"] for item in typical] == counts
    assert [item["severity"] for item in typical] == severities


async def test_decision_typical_errors_carry_plain_words(app, tokens):
    typical = (await _detail(app, tokens["teacher1"], "decision"))["typicalErrors"]
    assert [item["plainText"] for item in typical] == [
        "Статус реагирования не соответствует заявке",
        "Не распознана ловушка в заявке: статус выбран неверно",
        "Повторная карточка не отмечена как дубль",
    ]


async def test_students_are_named_only_from_own_group(app, tokens):
    response = await _stage(app, tokens["teacher1"], "decision")
    assert response.status_code == 200, response.text
    v2 = _by_rule(response.json())["v2"]
    assert v2["studentCount"] == 3
    assert _students(v2) == [
        ("sa-1", "Тестов Один"),
        ("sa-2", "Тестов Два"),
        ("sa-3", "Тестов Три"),
    ]
    # Обучающийся чужой группы допустил v2 раньше всех; ни его id, ни имени, ни попытки в ответе быть не должно.
    assert "sb-1" not in response.text
    assert "Тестов Чужой" not in response.text
    assert "at-b" not in response.text


@pytest.mark.parametrize(("mode", "stage_id", "rule_id", "pool"), EXAMPLE_POOLS)
async def test_example_attempt_belongs_to_group_and_its_session(app, tokens, mode, stage_id, rule_id, pool):
    body = await _detail(app, tokens["teacher1"], stage_id, mode=mode)
    item = _by_rule(body)[rule_id]
    assert item["exampleAttemptId"] in pool
    assert item["exampleSessionId"] == f"ses-{item['exampleAttemptId']}"


@pytest.mark.parametrize(("mode", "stage_id", "expected"), CHAIN_CASES)
async def test_chain_holds_only_links_leaving_the_stage(app, tokens, mode, stage_id, expected):
    body = await _detail(app, tokens["teacher1"], stage_id, mode=mode)
    links = [(link["from"], link["to"], link["caption"]) for link in body["chain"]]
    assert len(links) == len(expected)
    assert set(links) == expected


async def test_other_stage_is_allowed_and_holds_guessing(app, tokens):
    body = await _detail(app, tokens["teacher1"], "other")
    assert body["stage"] == {"id": "other", "order": 9, "title": "Прочее"}
    _expect_level(body["level"], attempts=10, with_error=2, share=0.2, level="sometimes", affected=2)
    typical = body["typicalErrors"]
    assert [item["ruleId"] for item in typical] == ["x1"]
    assert typical[0]["studentCount"] == 2
    assert typical[0]["severity"] == "minor"
    assert _students(typical[0]) == [("sa-2", "Тестов Два"), ("sa-5", "Тестов Пять")]
    assert typical[0]["plainText"] == "Решение принято слишком быстро: похоже на угадывание"
    assert body["chain"] == []


async def test_operator112_essence_and_type_levels_and_typical(app, tokens):
    essence = await _detail(app, tokens["teacher1"], "essence", mode="operator112")
    assert essence["stage"] == {"id": "essence", "order": 4, "title": "Суть происшествия"}
    _expect_level(essence["level"], attempts=5, with_error=2, share=0.4, level="often", affected=2)
    op_d1 = _by_rule(essence)["op-d1"]
    assert op_d1["studentCount"] == 2
    assert _students(op_d1) == [("sa-2", "Тестов Два"), ("sa-4", "Тестов Четыре")]

    type_stage = await _detail(app, tokens["teacher1"], "type", mode="operator112")
    assert type_stage["stage"] == {"id": "type", "order": 5, "title": "Тип по классификатору"}
    _expect_level(type_stage["level"], attempts=5, with_error=3, share=0.6, level="often", affected=3)
    op_f1 = _by_rule(type_stage)["op-f1"]
    assert op_f1["studentCount"] == 3
    assert op_f1["severity"] == "critical"
    assert _students(op_f1) == [
        ("sa-1", "Тестов Один"),
        ("sa-2", "Тестов Два"),
        ("sa-3", "Тестов Три"),
    ]


@pytest.mark.parametrize(
    ("period", "attempts", "with_error", "share", "affected"),
    [
        # 2w: at-a01…at-a08 (at-a09, at-a10, at-a11 вне окна); 1m: at-a01…at-a10; all: плюс at-a11 с v2.
        ("2w", 8, 4, 0.5, 4),
        ("1m", 10, 5, 0.5, 5),
        ("all", 11, 6, 6 / 11, 5),
    ],
)
async def test_period_changes_decision_counts(app, tokens, period, attempts, with_error, share, affected):
    body = await _detail(app, tokens["teacher1"], "decision", period=period)
    _expect_level(
        body["level"], attempts=attempts, with_error=with_error, share=share, level="often", affected=affected
    )


async def test_teacher_without_access_gets_403_and_owner_gets_200(app, tokens):
    response = await _stage(app, tokens["teacher1"], "decision", group_id=GROUP_B)
    assert response.status_code == 403, response.text
    error = response.json()["error"]
    assert error["code"] == "forbidden"
    assert error["message"] == ACCESS_DENIED

    no_assignments = await _stage(app, tokens["teacher3"], "decision")
    assert no_assignments.status_code == 403, no_assignments.text
    assert no_assignments.json()["error"]["message"] == ACCESS_DENIED

    # Контроль: владелец группы B получает 200 и видит только своего обучающегося.
    owner = await _detail(app, tokens["teacher2"], "decision", group_id=GROUP_B)
    _expect_level(owner["level"], attempts=5, with_error=5, share=1.0, level="often", affected=1)
    assert _students(_by_rule(owner)["v2"]) == [("sb-1", "Тестов Чужой")]


async def test_admin_reads_any_group_stage(app, tokens):
    body = await _detail(app, tokens["admin"], "decision", group_id=GROUP_B)
    assert body["stage"]["id"] == "decision"
    assert body["level"]["attempts"] == 5


async def test_without_session_is_401_next_to_session_200(app, tokens):
    response = await _stage(app, None, "decision")
    assert response.status_code == 401, response.text
    assert response.json()["error"]["code"] == "unauthorized"
    control = await _stage(app, tokens["teacher1"], "decision")
    assert control.status_code == 200, control.text


async def test_student_is_403_next_to_teacher_200(app, tokens):
    response = await _stage(app, tokens["student"], "decision")
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "forbidden"
    control = await _stage(app, tokens["teacher1"], "decision")
    assert control.status_code == 200, control.text


@pytest.mark.parametrize("who", ["teacher1", "teacher3", "admin"])
async def test_missing_group_is_404_with_its_id_in_message(app, tokens, who):
    response = await _stage(app, tokens[who], "decision", group_id=MISSING_GROUP)
    assert response.status_code == 404, response.text
    error = response.json()["error"]
    assert error["code"] == "notFound"
    assert MISSING_GROUP in error["message"]
    control = await _detail(app, tokens["teacher1"], "decision")
    assert control["stage"]["id"] == "decision"


async def test_unknown_stage_is_404_next_to_valid_stage_200(app, tokens):
    missing = await _stage(app, tokens["teacher1"], "nope")
    assert missing.status_code == 404, missing.text
    assert missing.json()["error"]["code"] == "notFound"
    control = await _detail(app, tokens["teacher1"], "decision")
    assert control["stage"]["id"] == "decision"


async def test_stage_of_other_mode_is_404_and_exists_in_its_own_mode(app, tokens):
    # «essence» и «type» есть только в operator112; «decision» — только в dds.
    in_dds = await _stage(app, tokens["teacher1"], "essence", mode="dds")
    assert in_dds.status_code == 404, in_dds.text
    assert in_dds.json()["error"]["code"] == "notFound"
    in_operator = await _detail(app, tokens["teacher1"], "essence", mode="operator112")
    assert in_operator["stage"]["id"] == "essence"

    decision_in_operator = await _stage(app, tokens["teacher1"], "decision", mode="operator112")
    assert decision_in_operator.status_code == 404, decision_in_operator.text
    control = await _detail(app, tokens["teacher1"], "decision", mode="dds")
    assert control["stage"]["id"] == "decision"


@pytest.mark.parametrize(
    ("params", "marker"),
    [({"mode": "ops"}, "«mode»"), ({"period": "week"}, "«period»")],
)
async def test_unknown_mode_or_period_is_400_next_to_valid_200(app, tokens, params, marker):
    response = await _get(app, _path(GROUP_A, "decision"), tokens["teacher1"], params)
    assert response.status_code == 400, response.text
    error = response.json()["error"]
    assert error["code"] == "validationFailed"
    assert marker in error["message"]
    control = await _get(app, _path(GROUP_A, "decision"), tokens["teacher1"], {"mode": "dds", "period": "1m"})
    assert control.status_code == 200, control.text
