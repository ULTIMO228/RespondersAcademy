"""Спека 003, T020: HTTP-тесты `GET /api/v1/error-map/groups/{groupId}` на изолированной базе.

Данные лежат в собственной in-memory SQLite, а не в общей сессионной базе conftest: новые группы и обучающиеся
сломали бы точные списки в `contract/test_error_map_router.py`. Подмена делается через
`app.dependency_overrides[get_db]` и снимается в teardown. Сессии настоящие (`build_auth_session`: строка
AuthSession и JWT), запросы идут с `Authorization: Bearer`.

Ожидаемые значения посчитаны вручную, без импорта сервиса. Пороги из data-model.md §2: минимум попыток группы 5,
«иногда» — доля больше 0,10, «часто» — больше 0,30. Доли ровно 0,10 и 0,30 здесь намеренно не используются:
граничные случаи покрывают юнит-тесты. Даты отсчитываются от текущего времени МСК; окна 2w (14 дней) и 1m
(30 дней) проверяются отметками 3, 20 и 60 дней, далеко от границ.
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

PASSWORD_HASH = hash_password("err-map-112")
TIME_LIMIT = "timeLimit"  # ошибка без ruleId: уходит в «Прочее»

GROUP_OK = "ТЕСТ-ОК"  # два проблемных этапа
GROUP_CLEAN = "ТЕСТ-ЧИСТО"  # проблем нет
GROUP_MANY = "ТЕСТ-МНОГО"  # пять «часто», в выводе три
GROUP_FEW = "ТЕСТ-МАЛО"  # четыре попытки при минимуме 5
GROUP_FOREIGN = "ТЕСТ-ЧУЖОЙ"  # существует, закреплена за другим преподавателем
GROUP_PERIOD = "ТЕСТ-ПЕРИОД"  # попытки в разных окнах
GROUP_MODES = "ТЕСТ-РЕЖИМ"  # попытки обоих режимов
GROUP_OTHER = "ТЕСТ-ПРОЧЕЕ"  # ошибки только вне схемы
MISSING_GROUP = "ТЕСТ-НЕТ"

ACCESS_DENIED = "Нет доступа к группе / обучающемуся"
DDS_STAGE_IDS = ["intake", "address", "decision", "card", "services", "route", "statuses", "closing"]
OPERATOR_STAGE_IDS = ["intake", "applicant", "place", "essence", "type", "signs", "services", "closing"]
RESPONSE_KEYS = {"scope", "mode", "period", "attempts", "stages", "levels", "headline", "generatedAt"}
LEVEL_KEYS = {"stageId", "attempts", "attemptsWithError", "share", "level", "affectedStudents"}

# (id, группа)
STUDENTS: tuple[tuple[str, str], ...] = (
    ("s-ok-1", GROUP_OK),
    ("s-ok-2", GROUP_OK),
    ("s-ok-3", GROUP_OK),
    ("s-ok-4", GROUP_OK),
    ("s-cl-1", GROUP_CLEAN),
    ("s-cl-2", GROUP_CLEAN),
    ("s-mn-1", GROUP_MANY),
    ("s-mn-2", GROUP_MANY),
    ("s-mn-3", GROUP_MANY),
    ("s-ml-1", GROUP_FEW),
    ("s-ml-2", GROUP_FEW),
    ("s-of-1", GROUP_FOREIGN),
    ("s-pe-1", GROUP_PERIOD),
    ("s-pe-2", GROUP_PERIOD),
    ("s-rm-1", GROUP_MODES),
    ("s-rm-2", GROUP_MODES),
    ("s-pr-1", GROUP_OTHER),
)

# Ключ фикстуры → id пользователя, для которого выдаётся настоящая сессия.
TOKEN_OWNERS: dict[str, str] = {
    "student": "u-err-stu",
    "teacher1": "u-err-t1",
    "teacher2": "u-err-t2",
    "teacher3": "u-err-t3",
    "admin": "u-err-adm",
}

# (id попытки, обучающийся, режим, дней назад, правила ошибок). Все попытки оценены.
ATTEMPTS: tuple[tuple[str, str, str, int, tuple[str, ...]], ...] = (
    # ГРУППА «ОК» (ДДС, 10 попыток): «Тип происшествия» 5/10 и «Статусы» 4/10 — «часто»,
    # «Адрес» 2/10 — «иногда». Попытка a-ok-04 содержит две ошибки одного этапа: учитывается один раз.
    ("a-ok-01", "s-ok-1", "dds", 1, ("v2", "a1")),
    ("a-ok-02", "s-ok-1", "dds", 2, ("v2t", "v1")),
    ("a-ok-03", "s-ok-1", "dds", 3, ("v2",)),
    ("a-ok-04", "s-ok-1", "dds", 4, ("v2", "d4")),
    ("a-ok-05", "s-ok-2", "dds", 5, ("v2",)),
    ("a-ok-06", "s-ok-2", "dds", 6, ("v3",)),
    ("a-ok-07", "s-ok-3", "dds", 7, ("v4",)),
    ("a-ok-08", "s-ok-3", "dds", 8, ("s1",)),
    ("a-ok-09", "s-ok-3", "dds", 9, ()),
    ("a-ok-10", "s-ok-4", "dds", 10, ("a4",)),
    # ГРУППА «ЧИСТО» (ДДС, 10 попыток): только «Тип» 2/10 — «иногда»; «часто» нет.
    ("a-cl-01", "s-cl-1", "dds", 1, ("v2",)),
    ("a-cl-02", "s-cl-1", "dds", 2, ("d4",)),
    ("a-cl-03", "s-cl-2", "dds", 3, ()),
    ("a-cl-04", "s-cl-2", "dds", 4, ()),
    ("a-cl-05", "s-cl-2", "dds", 5, ()),
    ("a-cl-06", "s-cl-2", "dds", 6, ()),
    ("a-cl-07", "s-cl-2", "dds", 7, ()),
    ("a-cl-08", "s-cl-2", "dds", 8, ()),
    ("a-cl-09", "s-cl-2", "dds", 9, ()),
    ("a-cl-10", "s-cl-2", "dds", 10, ()),
    # ГРУППА «МНОГО» (ДДС, 10 попыток): доли 0,9 / 0,8 / 0,7 / 0,6 / 0,5 у закрытия, приёма, статусов,
    # адреса и типа. Закрытие — последний этап по порядку, но первый по доле.
    ("a-mn-01", "s-mn-1", "dds", 1, ("t2", "t1", "v1", "a1", "v2")),
    ("a-mn-02", "s-mn-1", "dds", 2, ("t2", "t1", "v1", "a1", "v2")),
    ("a-mn-03", "s-mn-1", "dds", 3, ("t2", "t1", "v1", "a1", "v2")),
    ("a-mn-04", "s-mn-1", "dds", 4, ("t2", "t1", "v1", "a1", "v2")),
    ("a-mn-05", "s-mn-2", "dds", 5, ("t2", "t1", "v1", "a1", "v2")),
    ("a-mn-06", "s-mn-2", "dds", 6, ("t2", "t1", "v1", "a1")),
    ("a-mn-07", "s-mn-2", "dds", 7, ("t2", "t1", "v1")),
    ("a-mn-08", "s-mn-3", "dds", 8, ("t2", "t1")),
    ("a-mn-09", "s-mn-3", "dds", 9, ("t2",)),
    ("a-mn-10", "s-mn-3", "dds", 10, ()),
    # ГРУППА «МАЛО» (ДДС, 4 попытки при минимуме 5): «Тип» в трёх из четырёх, но данных мало.
    ("a-ml-01", "s-ml-1", "dds", 1, ("v2",)),
    ("a-ml-02", "s-ml-1", "dds", 2, ("v2",)),
    ("a-ml-03", "s-ml-2", "dds", 3, ("v2",)),
    ("a-ml-04", "s-ml-2", "dds", 4, ()),
    # ГРУППА «ЧУЖОЙ» (ДДС, одна попытка без ошибок).
    ("a-of-01", "s-of-1", "dds", 1, ()),
    # ГРУППА «ПЕРИОД»: 3 дня (2w), 20 дней (1m), 60 дней (только all). Всего 1 / 2 / 5 попыток.
    ("a-pe-01", "s-pe-1", "dds", 3, ()),
    ("a-pe-02", "s-pe-2", "dds", 20, ()),
    ("a-pe-03", "s-pe-1", "dds", 60, ("v2",)),
    ("a-pe-04", "s-pe-2", "dds", 60, ()),
    ("a-pe-05", "s-pe-1", "dds", 60, ()),
    # ГРУППА «РЕЖИМ»: ДДС — g1 (это «Карточка» в ДДС), специалист-112 — op-f1 («Тип» ×3) и op-a1 («Заявитель»).
    ("a-rd-01", "s-rm-1", "dds", 1, ("g1",)),
    ("a-rd-02", "s-rm-1", "dds", 2, ()),
    ("a-rd-03", "s-rm-2", "dds", 3, ()),
    ("a-rd-04", "s-rm-2", "dds", 4, ()),
    ("a-rd-05", "s-rm-2", "dds", 5, ()),
    ("a-ro-01", "s-rm-1", "operator112", 1, ("op-f1",)),
    ("a-ro-02", "s-rm-1", "operator112", 2, ("op-f1",)),
    ("a-ro-03", "s-rm-2", "operator112", 3, ("op-f1",)),
    ("a-ro-04", "s-rm-2", "operator112", 4, ("op-a1",)),
    ("a-ro-05", "s-rm-2", "operator112", 5, ()),
    # ГРУППА «ПРОЧЕЕ» (ДДС, 10 попыток): ошибка без ruleId и правило x1 — оба уходят в «Прочее».
    ("a-pr-01", "s-pr-1", "dds", 1, (TIME_LIMIT,)),
    ("a-pr-02", "s-pr-1", "dds", 2, ("x1",)),
    ("a-pr-03", "s-pr-1", "dds", 3, ()),
    ("a-pr-04", "s-pr-1", "dds", 4, ()),
    ("a-pr-05", "s-pr-1", "dds", 5, ()),
    ("a-pr-06", "s-pr-1", "dds", 6, ()),
    ("a-pr-07", "s-pr-1", "dds", 7, ()),
    ("a-pr-08", "s-pr-1", "dds", 8, ()),
    ("a-pr-09", "s-pr-1", "dds", 9, ()),
    ("a-pr-10", "s-pr-1", "dds", 10, ()),
)


def _user(uid: str, role: str, *, group: str | None = None, assigned: list[str] | None = None) -> User:
    return User(
        id=uid,
        login=uid,
        password_hash=PASSWORD_HASH,
        full_name=uid,
        role=role,
        arm_number=300,
        is_active=True,
        group=group,
        assigned_groups=assigned,
    )


def _error(rule_id: str) -> dict[str, str]:
    return {"type": "timeLimit"} if rule_id == TIME_LIMIT else {"ruleId": rule_id}


def _rows(now: datetime) -> list[Any]:
    rows: list[Any] = [
        _user("u-err-stu", "student", group=GROUP_OK),
        _user(
            "u-err-t1",
            "teacher",
            assigned=[GROUP_OK, GROUP_CLEAN, GROUP_MANY, GROUP_FEW, GROUP_PERIOD, GROUP_MODES, GROUP_OTHER],
        ),
        _user("u-err-t2", "teacher", assigned=[GROUP_FOREIGN]),
        _user("u-err-t3", "teacher"),
        _user("u-err-adm", "admin"),
    ]
    rows += [_user(uid, "student", group=group) for uid, group in STUDENTS]
    for attempt_id, student_id, mode, days, rules in ATTEMPTS:
        stamp = to_moscow_iso(now - timedelta(days=days))
        rows.append(
            Attempt(id=attempt_id, session_id="ses-err", card_id="c-001", student_id=student_id, mode=mode, opened_at=stamp)
        )
        rows.append(
            Evaluation(
                attempt_id=attempt_id,
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


async def _get(app, group_id: str, token: str | None = None, params: dict[str, str] | None = None) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.get(f"/error-map/groups/{quote(group_id)}", headers=headers, params=params)


def _by_stage(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {row["stageId"]: row for row in body["levels"]}


def _stage_ids(body: dict[str, Any]) -> list[str]:
    return [stage["id"] for stage in body["stages"]]


def _expect_level(row: dict[str, Any], *, attempts: int, with_error: int, share: float, level: str, affected: int) -> None:
    assert row["attempts"] == attempts
    assert row["attemptsWithError"] == with_error
    assert row["share"] == pytest.approx(share)
    assert row["level"] == level
    assert row["affectedStudents"] == affected
    assert "comparison" not in row


async def test_own_group_answers_200_with_contract_shape(app, tokens):
    response = await _get(app, GROUP_OK, tokens["teacher1"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == RESPONSE_KEYS
    assert body["scope"] == {"kind": "group", "groupId": GROUP_OK, "title": GROUP_OK}
    assert body["mode"] == "dds"
    assert body["period"] == "1m"
    assert body["attempts"] == 10
    assert _stage_ids(body) == DDS_STAGE_IDS
    assert [stage["order"] for stage in body["stages"]] == list(range(1, 9))
    assert all("articleId" not in stage for stage in body["stages"])
    assert {row["stageId"] for row in body["levels"]} == set(DDS_STAGE_IDS)
    assert all(set(row) == LEVEL_KEYS for row in body["levels"])
    generated = datetime.fromisoformat(body["generatedAt"])
    assert generated.tzinfo is not None


async def test_levels_are_counted_by_hand(app, tokens):
    body = (await _get(app, GROUP_OK, tokens["teacher1"])).json()
    levels = _by_stage(body)
    _expect_level(levels["decision"], attempts=10, with_error=5, share=0.5, level="often", affected=2)
    _expect_level(levels["statuses"], attempts=10, with_error=4, share=0.4, level="often", affected=3)
    _expect_level(levels["address"], attempts=10, with_error=2, share=0.2, level="sometimes", affected=2)
    for stage_id in ("intake", "card", "services", "route", "closing"):
        _expect_level(levels[stage_id], attempts=10, with_error=0, share=0.0, level="rare", affected=0)


async def test_two_problem_stages_are_named_in_headline(app, tokens):
    headline = (await _get(app, GROUP_OK, tokens["teacher1"])).json()["headline"]
    assert headline["kind"] == "problems"
    assert headline["stageIds"] == ["decision", "statuses"]
    assert "Тип происшествия" in headline["text"]
    assert "Статусы реагирования" in headline["text"]


async def test_group_without_problems_says_no_critical_problems(app, tokens):
    body = (await _get(app, GROUP_CLEAN, tokens["teacher1"])).json()
    assert body["headline"] == {"kind": "clean", "stageIds": [], "text": "Критичных проблем нет"}
    assert all(row["level"] != "often" for row in body["levels"])
    assert "other" not in _stage_ids(body)


async def test_more_than_three_problem_stages_keep_exactly_three_by_share(app, tokens):
    body = (await _get(app, GROUP_MANY, tokens["teacher1"])).json()
    headline = body["headline"]
    assert headline["kind"] == "problems"
    # Доли: закрытие 0,9, приём 0,8, статусы 0,7, адрес 0,6, тип 0,5. Порядок по доле, а не по этапам.
    assert headline["stageIds"] == ["closing", "intake", "statuses"]
    assert len(headline["stageIds"]) == 3
    assert "Закрытие" in headline["text"]
    assert "Приём вызова" in headline["text"]
    assert "Статусы реагирования" in headline["text"]
    assert "Адрес" not in headline["text"]
    assert "Тип происшествия" not in headline["text"]


async def test_too_little_data_gives_nodata_and_keeps_share_key(app, tokens):
    body = (await _get(app, GROUP_FEW, tokens["teacher1"])).json()
    assert body["attempts"] == 4
    headline = body["headline"]
    assert headline["kind"] == "noData"
    assert headline["stageIds"] == []
    assert headline["text"].startswith("Данных пока мало")
    assert body["levels"]
    for row in body["levels"]:
        assert row["level"] == "noData"
        assert "share" in row and row["share"] is None
        assert "comparison" not in row


async def test_other_stage_is_absent_without_unmatched_errors(app, tokens):
    for group in (GROUP_OK, GROUP_CLEAN):
        body = (await _get(app, group, tokens["teacher1"])).json()
        assert "other" not in _stage_ids(body), group
        assert "other" not in _by_stage(body), group


async def test_other_stage_is_listed_last_when_it_has_errors(app, tokens):
    body = (await _get(app, GROUP_OTHER, tokens["teacher1"])).json()
    assert _stage_ids(body) == DDS_STAGE_IDS + ["other"]
    assert body["stages"][-1] == {"id": "other", "order": 9, "title": "Прочее"}
    # Ошибка без ruleId и правило x1 — две попытки из десяти; одна обучающаяся.
    _expect_level(_by_stage(body)["other"], attempts=10, with_error=2, share=0.2, level="sometimes", affected=1)


@pytest.mark.parametrize(
    ("period", "attempts", "headline_kind", "decision_level"),
    [("2w", 1, "noData", "noData"), ("1m", 2, "noData", "noData"), ("all", 5, "clean", "sometimes")],
)
async def test_period_changes_attempt_count_and_levels(app, tokens, period, attempts, headline_kind, decision_level):
    body = (await _get(app, GROUP_PERIOD, tokens["teacher1"], {"period": period})).json()
    assert body["period"] == period
    assert body["attempts"] == attempts
    assert body["headline"]["kind"] == headline_kind
    assert _by_stage(body)["decision"]["level"] == decision_level


async def test_all_period_counts_the_old_error_once(app, tokens):
    body = (await _get(app, GROUP_PERIOD, tokens["teacher1"], {"period": "all"})).json()
    _expect_level(_by_stage(body)["decision"], attempts=5, with_error=1, share=0.2, level="sometimes", affected=1)


async def test_default_period_is_one_month(app, tokens):
    body = (await _get(app, GROUP_PERIOD, tokens["teacher1"])).json()
    assert body["period"] == "1m"
    assert body["attempts"] == 2


async def test_operator112_mode_gives_its_own_stage_set(app, tokens):
    dds = (await _get(app, GROUP_MODES, tokens["teacher1"], {"mode": "dds"})).json()
    operator = (await _get(app, GROUP_MODES, tokens["teacher1"], {"mode": "operator112"})).json()

    assert dds["mode"] == "dds"
    assert dds["attempts"] == 5
    assert _stage_ids(dds) == DDS_STAGE_IDS
    assert dds["headline"]["kind"] == "clean"
    _expect_level(_by_stage(dds)["card"], attempts=5, with_error=1, share=0.2, level="sometimes", affected=1)

    assert operator["mode"] == "operator112"
    assert operator["attempts"] == 5
    assert _stage_ids(operator) == OPERATOR_STAGE_IDS
    assert operator["headline"]["kind"] == "problems"
    assert operator["headline"]["stageIds"] == ["type"]
    assert "Тип по классификатору" in operator["headline"]["text"]
    _expect_level(_by_stage(operator)["type"], attempts=5, with_error=3, share=0.6, level="often", affected=2)
    _expect_level(_by_stage(operator)["applicant"], attempts=5, with_error=1, share=0.2, level="sometimes", affected=1)


async def test_teacher_without_access_gets_403_for_foreign_group(app, tokens):
    response = await _get(app, GROUP_FOREIGN, tokens["teacher1"])
    assert response.status_code == 403, response.text
    error = response.json()["error"]
    assert error["code"] == "forbidden"
    assert error["message"] == ACCESS_DENIED

    no_assignments = await _get(app, GROUP_OK, tokens["teacher3"])
    assert no_assignments.status_code == 403, no_assignments.text
    assert no_assignments.json()["error"]["message"] == ACCESS_DENIED

    # Контроль: владелец той же группы получает 200, значит 403 выше — про доступ, а не про отсутствие группы.
    owner = await _get(app, GROUP_FOREIGN, tokens["teacher2"])
    assert owner.status_code == 200, owner.text
    assert owner.json()["attempts"] == 1


async def test_admin_reads_any_group(app, tokens):
    response = await _get(app, GROUP_FOREIGN, tokens["admin"])
    assert response.status_code == 200, response.text
    assert response.json()["scope"]["groupId"] == GROUP_FOREIGN


async def test_without_session_is_401(app, tokens):
    response = await _get(app, GROUP_OK)
    assert response.status_code == 401, response.text
    assert response.json()["error"]["code"] == "unauthorized"


async def test_student_is_403(app, tokens):
    response = await _get(app, GROUP_OK, tokens["student"])
    assert response.status_code == 403, response.text
    assert response.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize("who", ["teacher1", "teacher3", "admin"])
async def test_missing_group_is_404_with_its_id_in_message(app, tokens, who):
    response = await _get(app, MISSING_GROUP, tokens[who])
    assert response.status_code == 404, response.text
    error = response.json()["error"]
    assert error["code"] == "notFound"
    assert MISSING_GROUP in error["message"]


@pytest.mark.parametrize(
    ("params", "marker"),
    [({"mode": "ops"}, "«mode»"), ({"period": "week"}, "«period»")],
)
async def test_unknown_mode_or_period_is_400_validation_failed(app, tokens, params, marker):
    response = await _get(app, GROUP_OK, tokens["teacher1"], params)
    assert response.status_code == 400, response.text
    error = response.json()["error"]
    assert error["code"] == "validationFailed"
    assert marker in error["message"]
