"""Спека 003, T047: PDF карты и журнала — `GET /api/v1/error-map/export.pdf` и слой `build_document`.

Набор данных тот же, что в T038/T043 (ожидаемые значения посчитаны вручную, см. `test_error_map_journal.py`):
группа GA, режим dds, окно 1m — 14 попыток; в группе нет этапа выше порога «часто» (статусы, тип и карточка по
3/14 ≈ 0,214 — «иногда», маршрут 1/14 — «редко»); у s-1 статусы и тип 2/4 — «часто», карточка 0/4 — «редко».
Группа GD: у неё 3 попытки при минимуме группы 5 — вся карта «мало данных».

Текст внутри PDF не читается без парсера PDF (его нет в зависимостях, а шрифт TTF кодирует буквы номерами глифов),
поэтому проверки разделены:
- состав документа (заголовок, фильтры, дата, строки, пороги) — через `build_document`, чистую структуру без PDF;
- сам файл — через HTTP: тип, `%PDF`, конец файла, встроенный локальный шрифт (`/FontFile2`), число страниц;
- «без сети» — запрос выполняется при запрещённых сокетах.
Отрицательные тесты парные: рядом с 400, 403, 401 и 404 стоит запрос, который при реализации обязан вернуть 200.
"""

from __future__ import annotations

import re
import socket
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
from app.api.deps import Viewer
from app.db.base import Base
from app.db.session import get_db
from app.models.session import Attempt, Evaluation
from app.models.user import User
from app.services import error_map_pdf
from app.services.error_map_pdf import build_document
from app.services.security import build_auth_session, hash_password
from app.services.time import MOSCOW, to_moscow_iso

PASSWORD_HASH = hash_password("err-map-pdf-112")

GROUP_A = "ТЕСТ-PDF-А"
GROUP_B = "ТЕСТ-PDF-Б"  # закреплена только за вторым преподавателем
GROUP_D = "ТЕСТ-PDF-Г"  # 3 попытки: меньше минимума группы

ADMIN = Viewer(user_id="u-sp-adm", role="admin")

TOKEN_OWNERS: dict[str, str] = {
    "student": "u-sp-stu",
    "teacher1": "u-sp-t1",
    "teacher2": "u-sp-t2",
    "admin": "u-sp-adm",
}

STUDENTS: tuple[tuple[str, str, str], ...] = (
    ("s-1", GROUP_A, "Целев Первый"),
    ("s-2", GROUP_A, "Сосед Второй"),
    ("s-3", GROUP_A, "Сосед Третий"),
    ("s-4", GROUP_A, "Мало Данных"),
    ("s-5", GROUP_A, "Без Попыток"),
    ("s-7", GROUP_B, "Чужой Седьмой"),
    ("s-8", GROUP_D, "Прочая Восьмая"),
)

RULE_META: dict[str, tuple[str, str]] = {
    "v1": ("noPrimaryStatus", "critical"),
    "v2": ("wrongDecision", "critical"),
    "c1": ("keyPhraseMissing", "minor"),
    "d2": ("wrongRecipient", "major"),
}

ATTEMPTS: tuple[tuple[str, str, str, int, tuple[str, ...]], ...] = (
    ("at-s1-a1", "s-1", "dds", 2, ("v1",)),
    ("at-s1-a2", "s-1", "dds", 3, ("v1", "v2")),
    ("at-s1-a3", "s-1", "dds", 4, ("v2",)),
    ("at-s1-a4", "s-1", "dds", 5, ()),
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
    ("at-s7-h1", "s-7", "dds", 2, ("v1",)),
    ("at-s8-p1", "s-8", "dds", 2, ("v1",)),
    ("at-s8-p2", "s-8", "dds", 3, ()),
    ("at-s8-p3", "s-8", "dds", 4, ()),
)

ICON_WORD = {"rare": "✓ редко", "sometimes": "~ иногда", "often": "! часто", "noData": "○ мало данных"}


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


def _rows(now: datetime) -> list[Any]:
    rows: list[Any] = [
        _user("u-sp-stu", "student"),
        _user("u-sp-t1", "teacher", assigned=[GROUP_A, GROUP_D]),
        _user("u-sp-t2", "teacher", assigned=[GROUP_B]),
        _user("u-sp-adm", "admin"),
    ]
    rows += [_user(sid, "student", full_name=name, group=group) for sid, group, name in STUDENTS]
    for attempt_id, student_id, mode, days, rules in ATTEMPTS:
        stamp = to_moscow_iso(now - timedelta(days=days))
        rows.append(
            Attempt(id=attempt_id, session_id=f"ses-{attempt_id}", card_id="c-001", student_id=student_id, mode=mode, opened_at=stamp)
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
                errors=[{"ruleId": rule, "type": RULE_META[rule][0], "severity": RULE_META[rule][1]} for rule in rules],
                generated_at=stamp,
            )
        )
    return rows


@pytest_asyncio.fixture
async def world(app) -> AsyncIterator[tuple[dict[str, str], async_sessionmaker[AsyncSession]]]:
    """Изолированная база: токены ролей и фабрика сессий для проверки слоя `build_document`."""
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
        yield issued, maker
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


async def _get(app, path: str, token: str | None, params: dict[str, str]) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.get(path, headers=headers, params=params)


async def _pdf(app, token: str | None, **params: str) -> httpx.Response:
    return await _get(app, "/error-map/export.pdf", token, params)


def _is_pdf(response: httpx.Response) -> bool:
    body = response.content
    return body.startswith(b"%PDF-") and body.rstrip().endswith(b"%%EOF")


# ---------------------------------------------------------------------------------------------------------------
# Файл: тип, структура, шрифт, сеть
# ---------------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "params",
    [
        {"scope": "group", "groupId": GROUP_A},
        {"scope": "student", "studentId": "s-1"},
        {"scope": "journal", "groupId": GROUP_A},
    ],
)
async def test_pdf_for_each_scope(app, world, params):
    tokens, _ = world
    response = await _pdf(app, tokens["teacher1"], mode="dds", period="1m", **params)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/pdf")
    assert _is_pdf(response)
    assert len(response.content) > 2000
    assert b"/FontFile2" in response.content  # шрифт встроен в файл: кириллица читается без системных шрифтов
    assert len(re.findall(rb"/Type\s*/Page\b", response.content)) >= 1
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("inline;") and "filename*=UTF-8''" in disposition
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.asyncio
async def test_pdf_uses_defaults_and_both_modes(app, world):
    tokens, _ = world
    plain = await _pdf(app, tokens["teacher1"], scope="group", groupId=GROUP_A)
    assert plain.status_code == 200 and _is_pdf(plain)
    for mode in ("dds", "operator112"):
        response = await _pdf(app, tokens["teacher1"], scope="group", groupId=GROUP_A, mode=mode, period="all")
        assert response.status_code == 200 and _is_pdf(response), mode


@pytest.mark.asyncio
async def test_pdf_is_built_without_network(app, world, monkeypatch):
    tokens, _ = world

    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("PDF не должен обращаться к сети")

    monkeypatch.setattr(socket.socket, "connect", forbidden)
    response = await _pdf(app, tokens["teacher1"], scope="journal", groupId=GROUP_A)
    assert response.status_code == 200 and _is_pdf(response)


def test_font_is_local_to_the_repository():
    font = error_map_pdf.FONT_PATH
    assert font.is_file()
    assert "backend" in font.parts or "app" in font.parts  # шрифт из репозитория, не из системы


# ---------------------------------------------------------------------------------------------------------------
# Состав документа
# ---------------------------------------------------------------------------------------------------------------


async def _stage_titles(app, token: str) -> dict[str, str]:
    body = (await _get(app, f"/error-map/groups/{quote(GROUP_A)}", token, {"mode": "dds", "period": "1m"})).json()
    return {stage["id"]: stage["title"] for stage in body["stages"]}


@pytest.mark.asyncio
async def test_group_document_has_filters_date_and_levels(app, world):
    tokens, maker = world
    titles = await _stage_titles(app, tokens["teacher1"])
    async with maker() as db:
        doc = await build_document(db, ADMIN, scope="group", group_id=GROUP_A, mode="dds", period="1m")
    today = datetime.now(MOSCOW).strftime("%d.%m.%Y")
    assert GROUP_A in doc.title
    assert "месяц" in doc.subtitle and "ДДС" in doc.subtitle and today in doc.subtitle
    assert doc.headline == "Критичных проблем нет"
    assert doc.columns[0] == "Этап" and "Уровень" in doc.columns
    by_stage = {row[0]: row for row in doc.rows}
    assert [row[0] for row in doc.rows] == list(titles.values())  # порядок схемы
    assert by_stage[titles["statuses"]][1] == ICON_WORD["sometimes"]
    assert by_stage[titles["route"]][1] == ICON_WORD["rare"]
    assert "10%" in doc.legend and "30%" in doc.legend  # пороги светофора напечатаны на листе
    for icon_word in ICON_WORD.values():
        assert icon_word in doc.legend  # легенда называет все четыре уровня словом и значком


@pytest.mark.asyncio
async def test_group_document_with_too_little_data(app, world):
    _, maker = world
    async with maker() as db:
        doc = await build_document(db, ADMIN, scope="group", group_id=GROUP_D, mode="dds", period="1m")
    assert doc.headline.startswith("Данных пока мало")
    assert all(row[1] == ICON_WORD["noData"] for row in doc.rows)  # без цвета видно: данных нет


@pytest.mark.asyncio
async def test_student_document_compares_with_group(app, world):
    tokens, maker = world
    titles = await _stage_titles(app, tokens["teacher1"])
    async with maker() as db:
        doc = await build_document(db, ADMIN, scope="student", student_id="s-1", mode="dds", period="1m")
    assert "Целев Первый" in doc.title
    assert GROUP_A in doc.subtitle
    assert doc.headline is not None and doc.headline.startswith("Главные проблемы обучающегося")
    assert "Сравнение с группой" in doc.columns
    compare = doc.columns.index("Сравнение с группой")
    by_stage = {row[0]: row for row in doc.rows}
    assert by_stage[titles["statuses"]][1] == ICON_WORD["often"] and by_stage[titles["statuses"]][compare] == "хуже группы"
    assert by_stage[titles["card"]][1] == ICON_WORD["rare"] and by_stage[titles["card"]][compare] == "лучше группы"
    assert by_stage[titles["route"]][compare] == "как у группы"


@pytest.mark.asyncio
async def test_student_without_data_has_no_comparison_in_document(app, world):
    _, maker = world
    async with maker() as db:
        doc = await build_document(db, ADMIN, scope="student", student_id="s-4", mode="dds", period="1m")
    compare = doc.columns.index("Сравнение с группой")
    assert all(row[1] == ICON_WORD["noData"] and row[compare] == "—" for row in doc.rows)


@pytest.mark.asyncio
async def test_journal_document_is_a_table_of_students_and_stages(app, world):
    tokens, maker = world
    titles = await _stage_titles(app, tokens["teacher1"])
    async with maker() as db:
        doc = await build_document(db, ADMIN, scope="journal", group_id=GROUP_A, mode="dds", period="1m")
    assert GROUP_A in doc.title and "Журнал" in doc.title
    assert doc.columns[:2] == ["Обучающийся", "Попыток"]
    assert doc.columns[2:] == list(titles.values())
    assert [row[0] for row in doc.rows] == ["Без Попыток", "Мало Данных", "Сосед Второй", "Сосед Третий", "Целев Первый"]
    target = next(row for row in doc.rows if row[0] == "Целев Первый")
    assert target[1] == "4"
    assert target[2 + list(titles).index("statuses")] == ICON_WORD["often"]
    assert all(cell == ICON_WORD["noData"] for cell in next(row for row in doc.rows if row[0] == "Без Попыток")[2:])


# ---------------------------------------------------------------------------------------------------------------
# Права и ошибки запроса
# ---------------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_access_matrix(app, world):
    tokens, _ = world
    group = {"scope": "group", "groupId": GROUP_A}
    assert (await _pdf(app, tokens["teacher1"], **group)).status_code == 200  # парный запрос
    assert (await _pdf(app, tokens["admin"], **group)).status_code == 200
    assert (await _pdf(app, tokens["teacher2"], **group)).status_code == 403
    assert (await _pdf(app, tokens["teacher2"], scope="journal", groupId=GROUP_A)).status_code == 403
    assert (await _pdf(app, tokens["teacher2"], scope="student", studentId="s-1")).status_code == 403
    assert (await _pdf(app, tokens["teacher2"], scope="student", studentId="s-7")).status_code == 200  # свой
    assert (await _pdf(app, tokens["student"], **group)).status_code == 403
    assert (await _pdf(app, None, **group)).status_code == 401


@pytest.mark.asyncio
async def test_missing_scope_ids_and_bad_values(app, world):
    tokens, _ = world
    assert (await _pdf(app, tokens["teacher1"], scope="group", groupId=GROUP_A)).status_code == 200  # парный
    assert (await _pdf(app, tokens["teacher1"])).status_code == 400  # нет scope
    assert (await _pdf(app, tokens["teacher1"], scope="bogus", groupId=GROUP_A)).status_code == 400
    assert (await _pdf(app, tokens["teacher1"], scope="group")).status_code == 400  # нет groupId
    assert (await _pdf(app, tokens["teacher1"], scope="journal")).status_code == 400
    assert (await _pdf(app, tokens["teacher1"], scope="student")).status_code == 400  # нет studentId
    assert (await _pdf(app, tokens["teacher1"], scope="group", groupId=GROUP_A, mode="bogus")).status_code == 400
    assert (await _pdf(app, tokens["teacher1"], scope="group", groupId=GROUP_A, period="bogus")).status_code == 400


@pytest.mark.asyncio
async def test_unknown_targets_are_404(app, world):
    tokens, _ = world
    assert (await _pdf(app, tokens["teacher1"], scope="group", groupId=GROUP_A)).status_code == 200  # парный
    assert (await _pdf(app, tokens["teacher1"], scope="group", groupId="ТЕСТ-НЕТ-ТАКОЙ")).status_code == 404
    assert (await _pdf(app, tokens["teacher1"], scope="student", studentId="no-such")).status_code == 404
