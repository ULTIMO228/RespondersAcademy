"""Спека 003, T015: права карты ошибок — группы по assigned_groups, администратор, обучающийся, 401/403/404.

Демо-сид: u-002 закреплён за «ДДС-01», u-003 — за «ДДС-02», u-004 — без групп; обучающиеся — по группам.
Счётчики обучающихся считаются в тесте отдельно от сервиса (тестовые пользователи других тестов не ломают ожидания).
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.api.deps import Viewer
from app.api.errors import ApiError
from app.db.session import get_sessionmaker
from app.models.user import User
from app.services import error_map_access as access

MOROZOVA = "u-002"  # assignedGroups: ["ДДС-01"]
KOVALEV = "u-003"  # assignedGroups: ["ДДС-02"]
VINOGRADOVA = "u-004"  # assignedGroups: пусто
ADMIN = "u-001"
STUDENT_DDS01 = "u-005"
STUDENT_DDS02 = "u-015"
TEMP_TEACHER = "u-tst-em-t"  # ["ДДС-01", "ДДС-99"]: «ДДС-99» нет у обучающихся
TEMP_NO_GROUP = "u-tst-em-s"  # обучающийся без группы
MISSING_GROUP = "ДДС-99"


def viewer(user_id: str, role: str) -> Viewer:
    return Viewer(user_id=user_id, role=role)


async def _student_counts() -> dict[str, int]:
    """Независимый подсчёт: все строки, без группировки SQL."""
    async with get_sessionmaker()() as db:
        rows = (await db.execute(select(User.group, User.role))).all()
    counts: dict[str, int] = {}
    for group, role in rows:
        if role == "student" and group:
            counts[group] = counts.get(group, 0) + 1
    return counts


async def _expect(status: int, call) -> ApiError:
    with pytest.raises(ApiError) as caught:
        await call
    assert caught.value.status == status, caught.value.message
    return caught.value


@pytest_asyncio.fixture
async def temp_users(seeded_db) -> AsyncIterator[None]:
    rows = [
        User(
            id=TEMP_TEACHER,
            login="tst-em-teacher",
            password_hash="x",
            full_name="Тест карты ошибок",
            role="teacher",
            arm_number=90,
            is_active=True,
            assigned_groups=["ДДС-01", MISSING_GROUP],
        ),
        User(
            id=TEMP_NO_GROUP,
            login="tst-em-nogroup",
            password_hash="x",
            full_name="Тест без группы",
            role="student",
            arm_number=91,
            is_active=True,
        ),
    ]
    async with get_sessionmaker()() as db:
        db.add_all(rows)
        await db.commit()
    yield
    async with get_sessionmaker()() as db:
        await db.execute(delete(User).where(User.id.in_([TEMP_TEACHER, TEMP_NO_GROUP])))
        await db.commit()


async def test_teacher_sees_and_reads_only_own_group(seeded_db):
    counts = await _student_counts()
    async with get_sessionmaker()() as db:
        groups = await access.accessible_groups(db, viewer(MOROZOVA, "teacher"))
        own = await access.require_group_access(db, viewer(MOROZOVA, "teacher"), "ДДС-01")
    assert [(item.group_id, item.student_count) for item in groups] == [("ДДС-01", counts["ДДС-01"])]
    assert own.group_id == "ДДС-01" and own.student_count == counts["ДДС-01"] and own.student_count > 0


async def test_teacher_foreign_group_is_forbidden(seeded_db):
    async with get_sessionmaker()() as db:
        error = await _expect(403, access.require_group_access(db, viewer(MOROZOVA, "teacher"), "ДДС-02"))
        assert error.code == "forbidden" and error.message == access.ACCESS_DENIED_MESSAGE
        await _expect(403, access.require_group_access(db, viewer(KOVALEV, "teacher"), "ДДС-01"))


async def test_admin_reads_every_group(seeded_db):
    counts = await _student_counts()
    async with get_sessionmaker()() as db:
        groups = await access.accessible_groups(db, viewer(ADMIN, "admin"))
        for group_id in ("ДДС-01", "ДДС-02"):
            granted = await access.require_group_access(db, viewer(ADMIN, "admin"), group_id)
            assert granted.student_count == counts[group_id]
    assert [item.group_id for item in groups] == ["ДДС-01", "ДДС-02"]


async def test_student_is_refused_everywhere_even_for_missing_group(seeded_db):
    student = viewer(STUDENT_DDS01, "student")
    async with get_sessionmaker()() as db:
        assert (await _expect(403, access.accessible_groups(db, student))).code == "forbidden"
        await _expect(403, access.require_group_access(db, student, "ДДС-01"))
        # 403 раньше поиска: обучающийся не узнаёт, существует ли группа
        await _expect(403, access.require_group_access(db, student, MISSING_GROUP))
        await _expect(403, access.require_student_access(db, student, STUDENT_DDS01))


async def test_missing_group_is_404_before_rights_check(seeded_db):
    async with get_sessionmaker()() as db:
        await _expect(404, access.require_group_access(db, viewer(MOROZOVA, "teacher"), MISSING_GROUP))
        await _expect(404, access.require_group_access(db, viewer(ADMIN, "admin"), MISSING_GROUP))
        # у преподавателя без закреплений несуществующая группа — 404, а не 403
        await _expect(404, access.require_group_access(db, viewer(VINOGRADOVA, "teacher"), MISSING_GROUP))


async def test_teacher_without_assignments_gets_empty_list_and_403(seeded_db):
    async with get_sessionmaker()() as db:
        assert await access.accessible_groups(db, viewer(VINOGRADOVA, "teacher")) == []
        await _expect(403, access.require_group_access(db, viewer(VINOGRADOVA, "teacher"), "ДДС-01"))
        await _expect(403, access.require_group_access(db, viewer(VINOGRADOVA, "teacher"), "ДДС-02"))
        await _expect(403, access.require_student_access(db, viewer(VINOGRADOVA, "teacher"), STUDENT_DDS01))


async def test_anonymous_viewer_is_401(seeded_db):
    async with get_sessionmaker()() as db:
        assert (await _expect(401, access.accessible_groups(db, None))).code == "unauthorized"
        await _expect(401, access.require_group_access(db, None, "ДДС-01"))
        await _expect(401, access.require_student_access(db, None, STUDENT_DDS01))


async def test_assigned_but_missing_group_is_not_listed(seeded_db, temp_users):
    counts = await _student_counts()
    async with get_sessionmaker()() as db:
        groups = await access.accessible_groups(db, viewer(TEMP_TEACHER, "teacher"))
        assert [(item.group_id, item.student_count) for item in groups] == [("ДДС-01", counts["ДДС-01"])]
        await _expect(404, access.require_group_access(db, viewer(TEMP_TEACHER, "teacher"), MISSING_GROUP))


async def test_student_access_follows_assigned_group(seeded_db):
    async with get_sessionmaker()() as db:
        student = await access.require_student_access(db, viewer(MOROZOVA, "teacher"), STUDENT_DDS01)
        assert student.id == STUDENT_DDS01 and student.group == "ДДС-01"
        await _expect(403, access.require_student_access(db, viewer(MOROZOVA, "teacher"), STUDENT_DDS02))
        await _expect(403, access.require_student_access(db, viewer(VINOGRADOVA, "teacher"), STUDENT_DDS01))
        admin_student = await access.require_student_access(db, viewer(ADMIN, "admin"), STUDENT_DDS02)
        assert admin_student.group == "ДДС-02"


async def test_unknown_or_non_student_id_is_404(seeded_db):
    async with get_sessionmaker()() as db:
        await _expect(404, access.require_student_access(db, viewer(MOROZOVA, "teacher"), "u-999"))
        # id преподавателя не обучающийся: 404 даже у администратора
        await _expect(404, access.require_student_access(db, viewer(ADMIN, "admin"), MOROZOVA))


async def test_student_without_group_is_forbidden_to_teacher_only(seeded_db, temp_users):
    async with get_sessionmaker()() as db:
        await _expect(403, access.require_student_access(db, viewer(MOROZOVA, "teacher"), TEMP_NO_GROUP))
        found = await access.require_student_access(db, viewer(ADMIN, "admin"), TEMP_NO_GROUP)
        assert found.group is None
