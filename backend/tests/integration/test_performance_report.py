"""Спека 005, T002/T003: `GET /api/v1/performance/report` — сводная успеваемость (все вместе / группы / обучающиеся).

Данные посчитаны вручную (см. таблицу ATTEMPTS), сервис в тестах не импортируется. Группы:
- G1 (a1, a2) и G2 (b1) закреплены за первым преподавателем, G3 (c1) — за вторым; n1 без группы (видит только админ).
- Занятия: `ses-train` (тренировка) и `ses-exam` (экзамен, порог 70).
Ожидания (режим dds, период 1m; нормативы 30 с и 180 с; минимумы: обучающийся 3, группа/организация 5; риск < 60):
  a1: попытки 80, 50, 75 (65 с правкой 75) → 3 шт., среднее 68,3; реакция в норме 2/3, отработка 2/3; экзамен 1/1 сдан;
      слабый этап «Статусы реагирования» (v1 в двух попытках)
  a2: 90, 40 → 2 шт. (< 3): среднее нет, «мало данных»; экзамены 2, сдан 1
  G1: 5 шт., среднее 67,0, реакция 0,6, отработка 0,6, экзамены 3/2, слабый этап «Статусы реагирования»
  G2 (b1: 30): 1 шт. → «мало данных»
  G3 (c1: пять по 100): среднее 100, нормы 1,0, без слабого этапа
  n1 (51): без группы
  Итого у первого преподавателя: 6 шт., 365/6 = 60,8; у админа: 12 шт., (365 + 500 + 51)/12 = 76,3
Режимы и периоды: `p-a1-op` (operator112, балл 11) входит только в `all`/`operator112`; `p-a1-old` (40 дней назад) вне месяца
и образует предыдущее окно (30–60 дней) со средним 20; `p-a1-ancient` (100 дней) видна только при `period=all`.
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
from app.models.session import Attempt, Evaluation, TeacherOverride, TrainingSession
from app.models.user import User
from app.services.error_map_stages import get_stage, rule_plain
from app.services.security import build_auth_session, hash_password
from app.services.time import MOSCOW, to_moscow_iso

PASSWORD_HASH = hash_password("perf-report-112")
G1, G2, G3 = "ТЕСТ-СВОДКА-1", "ТЕСТ-СВОДКА-2", "ТЕСТ-СВОДКА-3"
NO_GROUP = "Без группы"
TOKEN_OWNERS = {"student": "u-pr-stu", "t1": "u-pr-t1", "t2": "u-pr-t2", "admin": "u-pr-adm"}

STUDENTS = (
    ("a1", G1, "Андреев Алексей"),
    ("a2", G1, "Белова Анна"),
    ("b1", G2, "Власов Борис"),
    ("c1", G3, "Громова Галина"),
    ("n1", None, "Дмитриев Денис"),
)

# (id, студент, режим, дней назад, реакция мс, отработка мс, балл, правка, правила ошибок, занятие)
ATTEMPTS: tuple[tuple[Any, ...], ...] = (
    ("p-a1-1", "a1", "dds", 1, 20000, 150000, 80, None, (), "ses-train"),
    ("p-a1-2", "a1", "dds", 2, 40000, 200000, 50, None, ("v1",), "ses-train"),
    ("p-a1-3", "a1", "dds", 3, 25000, 170000, 65, 75, ("v1", "v2"), "ses-exam"),
    ("p-a2-1", "a2", "dds", 4, 10000, 100000, 90, None, (), "ses-exam"),
    ("p-a2-2", "a2", "dds", 5, 35000, 190000, 40, None, ("d2",), "ses-exam"),
    ("p-b1-1", "b1", "dds", 6, 15000, 120000, 30, None, (), "ses-train"),
    ("p-c1-1", "c1", "dds", 1, 5000, 60000, 100, None, (), "ses-train"),
    ("p-c1-2", "c1", "dds", 2, 5000, 60000, 100, None, (), "ses-train"),
    ("p-c1-3", "c1", "dds", 3, 5000, 60000, 100, None, (), "ses-train"),
    ("p-c1-4", "c1", "dds", 4, 5000, 60000, 100, None, (), "ses-train"),
    ("p-c1-5", "c1", "dds", 5, 5000, 60000, 100, None, (), "ses-train"),
    ("p-n1-1", "n1", "dds", 7, 20000, 100000, 51, None, (), "ses-train"),
    ("p-a1-op", "a1", "operator112", 2, 0, 0, 11, None, (), "ses-train"),
    ("p-a1-old", "a1", "dds", 40, 20000, 100000, 20, None, (), "ses-train"),
    ("p-a1-ancient", "a1", "dds", 100, 20000, 100000, 0, None, (), "ses-train"),
)

RULE_TYPES = {"v1": "noPrimaryStatus", "v2": "wrongDecision", "d2": "wrongRecipient"}


def _user(uid: str, role: str, **extra: Any) -> User:
    return User(
        id=uid, login=uid, password_hash=PASSWORD_HASH, full_name=extra.pop("full_name", f"Имя {uid}"), role=role,
        arm_number=300, is_active=True, **extra,
    )


def _rows(now: datetime) -> list[Any]:
    rows: list[Any] = [
        _user("u-pr-stu", "student"),
        _user("u-pr-t1", "teacher", assigned_groups=[G1, G2]),
        _user("u-pr-t2", "teacher", assigned_groups=[G3]),
        _user("u-pr-adm", "admin"),
    ]
    rows += [_user(sid, "student", group=group, full_name=name) for sid, group, name in STUDENTS]
    for sid, fmt, exam in (("ses-train", "training", None), ("ses-exam", "exam", {"passThreshold": 70})):
        rows.append(TrainingSession(id=sid, teacher_id="u-pr-t1", started_at=to_moscow_iso(now), format=fmt, exam=exam))
    for pid, student, mode, days, reaction, processing, score, override, rules, session in ATTEMPTS:
        stamp = to_moscow_iso(now - timedelta(days=days))
        rows.append(
            Attempt(
                id=pid, session_id=session, card_id="c-001", student_id=student, mode=mode, opened_at=stamp,
                primary_reaction_ms=reaction, completed_at=stamp if processing else None, full_processing_ms=processing,
            )
        )
        rows.append(
            Evaluation(
                attempt_id=pid, mode=mode, time_score=0, correctness_score=0, grammar_score=0, semantic_score=0,
                total_score=score,
                errors=[{"ruleId": r, "type": RULE_TYPES[r], "severity": "major"} for r in rules], generated_at=stamp,
            )
        )
        if override is not None:
            rows.append(TeacherOverride(attempt_id=pid, teacher_id="u-pr-t1", score=override, comment="правка", at=stamp))
    return rows


@pytest_asyncio.fixture
async def tokens(app) -> AsyncIterator[dict[str, str]]:
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


async def _report(app, token: str | None, **params: str) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.get("/performance/report", headers=headers, params=params)


async def _ok(app, token: str, **params: str) -> dict[str, Any]:
    response = await _report(app, token, mode="dds", period="1m", **params)
    assert response.status_code == 200, response.text
    return response.json()


def _by(items: list[dict[str, Any]], key: str, value: str) -> dict[str, Any]:
    return next(item for item in items if item[key] == value)


@pytest.mark.asyncio
async def test_teacher_totals_cover_only_assigned_groups(app, tokens):
    body = await _ok(app, tokens["t1"])
    stats = body["totals"]
    assert (stats["students"], stats["activeStudents"], stats["attempts"]) == (3, 3, 6)
    assert stats["avgScore"] == pytest.approx(60.8)
    assert [g["groupId"] for g in body["groups"]] == [G1, G2]
    assert {s["studentId"] for s in body["students"]} == {"a1", "a2", "b1"}
    assert body["filters"] == {"mode": "dds", "period": "1m"}


@pytest.mark.asyncio
async def test_admin_sees_everything_including_students_without_group(app, tokens):
    body = await _ok(app, tokens["admin"])
    stats = body["totals"]
    assert (stats["students"], stats["attempts"]) == (6, 12)  # + u-pr-stu: обучающийся без группы и без попыток
    assert stats["avgScore"] == pytest.approx(76.3)
    assert [g["groupId"] for g in body["groups"]] == [G1, G2, G3, NO_GROUP]
    assert _by(body["students"], "studentId", "n1")["groupId"] is None


@pytest.mark.asyncio
async def test_student_row_numbers(app, tokens):
    stats = _by((await _ok(app, tokens["t1"]))["students"], "studentId", "a1")["stats"]
    assert stats["attempts"] == 3 and stats["avgScore"] == pytest.approx(68.3)
    assert stats["reactionInNormShare"] == pytest.approx(0.667, abs=0.001)
    assert stats["processingInNormShare"] == pytest.approx(0.667, abs=0.001)
    assert (stats["exams"], stats["examsPassed"]) == (1, 1)
    assert stats["weakStage"] == get_stage("dds", "statuses").title
    assert stats["level"] == "ok"
    assert _by((await _ok(app, tokens["t1"]))["students"], "studentId", "a1")["name"] == "Андреев Алексей"


@pytest.mark.asyncio
async def test_too_few_attempts_give_no_average_and_no_data_level(app, tokens):
    body = await _ok(app, tokens["t1"])
    a2 = _by(body["students"], "studentId", "a2")["stats"]
    assert a2["attempts"] == 2 and a2["avgScore"] is None and a2["level"] == "noData"
    assert a2["reactionInNormShare"] is None and a2["weakStage"] is None
    assert (a2["exams"], a2["examsPassed"]) == (2, 1)  # счётчики остаются честными
    b1 = _by(body["groups"], "groupId", G2)["stats"]
    assert b1["attempts"] == 1 and b1["avgScore"] is None and b1["level"] == "noData"


@pytest.mark.asyncio
async def test_group_rows(app, tokens):
    g1 = _by((await _ok(app, tokens["t1"]))["groups"], "groupId", G1)["stats"]
    assert (g1["students"], g1["activeStudents"], g1["attempts"]) == (2, 2, 5)
    assert g1["avgScore"] == pytest.approx(67.0)
    assert g1["reactionInNormShare"] == pytest.approx(0.6) and g1["processingInNormShare"] == pytest.approx(0.6)
    assert (g1["exams"], g1["examsPassed"]) == (3, 2)
    assert g1["weakStage"] == get_stage("dds", "statuses").title and g1["level"] == "ok"
    g3 = _by((await _ok(app, tokens["admin"]))["groups"], "groupId", G3)["stats"]
    assert g3["avgScore"] == 100 and g3["reactionInNormShare"] == 1.0 and g3["weakStage"] is None


@pytest.mark.asyncio
async def test_top_errors_are_plain_and_sorted(app, tokens):
    top = (await _ok(app, tokens["t1"]))["topErrors"]
    assert top[0] == {"label": rule_plain("v1"), "attempts": 2}
    assert {item["attempts"] for item in top[1:]} == {1} and len(top) == 3
    assert len(top) <= 5


@pytest.mark.asyncio
async def test_override_replaces_evaluation_score(app, tokens):
    # p-a1-3: оценка 65, правка 75 → в среднем 75; без правки среднее было бы (80 + 50 + 65)/3 = 65,0
    stats = _by((await _ok(app, tokens["t1"]))["students"], "studentId", "a1")["stats"]
    assert stats["avgScore"] != pytest.approx(65.0) and stats["avgScore"] == pytest.approx(68.3)


@pytest.mark.asyncio
async def test_mode_filter(app, tokens):
    both = await _report(app, tokens["t1"], mode="all", period="1m")
    stats = _by(both.json()["students"], "studentId", "a1")["stats"]
    assert stats["attempts"] == 4 and stats["avgScore"] == pytest.approx(54.0) and stats["level"] == "risk"
    op = (await _report(app, tokens["t1"], mode="operator112", period="1m")).json()
    a1 = _by(op["students"], "studentId", "a1")["stats"]
    assert a1["attempts"] == 1 and a1["level"] == "noData"
    assert op["totals"]["attempts"] == 1


@pytest.mark.asyncio
async def test_period_and_previous_window(app, tokens):
    month = (await _ok(app, tokens["t1"]))["totals"]
    assert month["attempts"] == 6  # 40 и 100 дней назад — вне месяца
    assert month["previousAvgScore"] == pytest.approx(20.0)  # окно 30–60 дней: только p-a1-old
    assert month["delta"] == pytest.approx(60.8 - 20.0, abs=0.01)
    everything = (await _report(app, tokens["t1"], mode="dds", period="all")).json()["totals"]
    assert everything["attempts"] == 8 and everything["previousAvgScore"] is None and everything["delta"] is None


@pytest.mark.asyncio
async def test_date_range(app, tokens):
    now = datetime.now(MOSCOW)
    start, end = (now - timedelta(days=3)).date().isoformat(), now.date().isoformat()
    response = await _report(app, tokens["t1"], mode="dds", period="range", **{"from": start, "to": end})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["filters"]["period"] == "range" and body["filters"]["from"] == start
    assert body["totals"]["attempts"] == 3  # p-a1-1, p-a1-2, p-a1-3 (1–3 дня назад)


@pytest.mark.asyncio
async def test_group_filter_and_access(app, tokens):
    one = await _ok(app, tokens["t1"], groupId=G1)
    assert [g["groupId"] for g in one["groups"]] == [G1] and one["totals"]["attempts"] == 5
    assert (await _report(app, tokens["t1"], groupId=G3)).status_code == 403
    assert (await _report(app, tokens["t1"], groupId=G1)).status_code == 200  # парный запрос
    assert (await _report(app, tokens["admin"], groupId="НЕТ-ТАКОЙ")).status_code == 404
    assert (await _report(app, tokens["admin"], groupId=G3)).status_code == 200


@pytest.mark.asyncio
async def test_roles_and_bad_input(app, tokens):
    assert (await _report(app, tokens["t1"])).status_code == 200
    assert (await _report(app, tokens["student"])).status_code == 403
    assert (await _report(app, None)).status_code == 401
    for bad in ({"mode": "x"}, {"period": "week"}, {"period": "range"}, {"period": "range", "from": "2026-10-01"},
                {"period": "range", "from": "2026-10-10", "to": "2026-10-01"}, {"period": "range", "from": "не-дата", "to": "2026-10-01"},
                {"period": "1m", "from": "2026-10-01", "to": "2026-10-02"}):
        assert (await _report(app, tokens["t1"], **bad)).status_code == 400, bad


@pytest.mark.asyncio
async def test_teacher_without_groups_gets_an_empty_report(app, tokens):
    # t2 закреплён за G3, у которой есть данные; админ-снимок сравниваем с пустым охватом через несуществующую группу нельзя,
    # поэтому проверяем соседа: второй преподаватель не видит группы первого
    body = await _ok(app, tokens["t2"])
    assert [g["groupId"] for g in body["groups"]] == [G3] and body["totals"]["attempts"] == 5
    assert "a1" not in {s["studentId"] for s in body["students"]}


@pytest.mark.asyncio
async def test_response_shape(app, tokens):
    body = await _ok(app, tokens["t1"])
    assert set(body) == {"filters", "generatedAt", "thresholds", "totals", "groups", "students", "topErrors"}
    assert set(body["thresholds"]) == {"minAttemptsStudent", "minAttemptsGroup", "riskScore"}
    stats_keys = {"students", "activeStudents", "attempts", "avgScore", "previousAvgScore", "delta",
                  "reactionInNormShare", "processingInNormShare", "exams", "examsPassed", "weakStage", "level"}
    assert set(body["totals"]) == stats_keys
    assert set(body["groups"][0]) == {"groupId", "title", "stats"}
    assert set(body["students"][0]) == {"studentId", "name", "groupId", "stats"}


# ---------------------------------------------------------------------------------------------------------------
# Экспорт: Excel и PDF (T004)
# ---------------------------------------------------------------------------------------------------------------

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def _export(app, token: str | None, kind: str, **params: str) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.get(f"/performance/export.{kind}", headers=headers, params=params)


def _sheet_rows(content: bytes, name: str) -> list[tuple[Any, ...]]:
    from io import BytesIO

    from openpyxl import load_workbook

    ws = load_workbook(BytesIO(content))[name]
    return [row for row in ws.iter_rows(values_only=True) if any(cell is not None for cell in row)]


@pytest.mark.asyncio
async def test_xlsx_sheets_match_the_report(app, tokens):
    from io import BytesIO

    from openpyxl import load_workbook

    response = await _export(app, tokens["admin"], "xlsx", mode="dds", period="1m")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == XLSX
    assert response.headers["content-disposition"].startswith("attachment;") and ".xlsx" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "no-store"
    assert load_workbook(BytesIO(response.content)).sheetnames == ["Сводка", "Группы", "Обучающиеся", "Ошибки", "Параметры"]
    report = (await _report(app, tokens["admin"], mode="dds", period="1m")).json()

    groups = _sheet_rows(response.content, "Группы")
    header = next(i for i, row in enumerate(groups) if row[0] == "Группа")
    body = groups[header + 1 :]
    assert [row[0] for row in body] == [g["groupId"] for g in report["groups"]]
    g1 = next(row for row in body if row[0] == G1)
    assert g1[3] == 5 and g1[4] == 67.0  # «Попыток», «Средний балл»
    assert "Статусы реагирования" in g1  # слабый этап

    students = _sheet_rows(response.content, "Обучающиеся")
    names = {row[0] for row in students}
    assert "Андреев Алексей" in names and "Белова Анна" in names  # ФИО в файле есть
    a2 = next(row for row in students if row[0] == "Белова Анна")
    assert "мало данных" in a2  # слово, а не только пустая ячейка

    params = {row[0]: row[1] for row in _sheet_rows(response.content, "Параметры") if len(row) > 1}
    assert params["Режим"] == "ДДС" and params["Период"] == "месяц"
    assert params["Сформировал"]  # кто выгрузил


@pytest.mark.asyncio
async def test_xlsx_for_teacher_has_only_own_groups(app, tokens):
    response = await _export(app, tokens["t2"], "xlsx", mode="dds", period="1m")
    assert response.status_code == 200
    text = str(_sheet_rows(response.content, "Группы")) + str(_sheet_rows(response.content, "Обучающиеся"))
    assert G3 in text and "Громова Галина" in text
    assert G1 not in text and "Андреев Алексей" not in text and "Дмитриев Денис" not in text


@pytest.mark.asyncio
async def test_pdf_summary(app, tokens):
    response = await _export(app, tokens["admin"], "pdf", mode="all", period="1m")
    assert response.status_code == 200, response.text
    assert response.content.startswith(b"%PDF-") and response.content.rstrip().endswith(b"%%EOF")
    assert b"/FontFile2" in response.content
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.headers["content-disposition"].startswith("inline;")
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["xlsx", "pdf"])
async def test_export_access_and_input_checks(app, tokens, kind):
    assert (await _export(app, tokens["t1"], kind, groupId=G1)).status_code == 200  # парный запрос
    assert (await _export(app, tokens["t1"], kind, groupId=G3)).status_code == 403
    assert (await _export(app, tokens["admin"], kind, groupId="НЕТ-ТАКОЙ")).status_code == 404
    assert (await _export(app, tokens["student"], kind)).status_code == 403
    assert (await _export(app, None, kind)).status_code == 401
    assert (await _export(app, tokens["t1"], kind, mode="x")).status_code == 400
    assert (await _export(app, tokens["t1"], kind, period="range")).status_code == 400
