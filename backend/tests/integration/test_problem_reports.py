"""Спека 009, US6: «Сообщить о проблеме» — HTTP-тесты на изолированной in-memory базе.

Схема фикстуры — как в `test_student_rating.py`: собственная SQLite через `dependency_overrides[get_db]`, настоящие
серверные сессии (Bearer). Каждый отказ 400/401/403/404 стоит рядом с парным запросом, который обязан вернуть 200/201.
Вложения пишутся во временный `var/` (monkeypatch `settings.var_dir`), в реальный `backend/var/` не попадают.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  # регистрация таблиц в Base.metadata
from app.config import get_settings
from app.db.base import Base
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.session import Attempt
from app.models.user import User
from app.services.security import build_auth_session, hash_password
from app.services.time import now_iso

PASSWORD_HASH = hash_password("problem-112")
GROUP_A = "ПР-1"
GROUP_B = "ПР-2"
TOKEN_OWNERS = {
    "student": "s-pr-1",
    "student_b": "s-pr-2",
    "teacher": "u-pr-t1",
    "teacher_b": "u-pr-t2",
    "teacher_none": "u-pr-t3",
    "admin": "u-pr-adm",
}

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
TWO_MB = 2 * 1024 * 1024


@dataclass
class Env:
    tokens: dict[str, str]
    maker: async_sessionmaker[AsyncSession]
    var_dir: Path


def _user(uid: str, role: str, *, group: str | None = None, assigned: list[str] | None = None) -> User:
    return User(id=uid, login=uid, password_hash=PASSWORD_HASH, full_name=f"ФИО {uid}", role=role, arm_number=500,
                is_active=True, group=group, assigned_groups=assigned)


@pytest_asyncio.fixture
async def env(app, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[Env]:
    var_dir = tmp_path / "var"
    monkeypatch.setattr(get_settings(), "var_dir", var_dir)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool,
                                 connect_args={"check_same_thread": False})
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    issued: dict[str, str] = {}
    async with maker() as db:
        db.add_all([
            _user("u-pr-t1", "teacher", assigned=[GROUP_A]),
            _user("u-pr-t2", "teacher", assigned=[GROUP_B]),
            _user("u-pr-t3", "teacher"),
            _user("u-pr-adm", "admin"),
            _user("s-pr-1", "student", group=GROUP_A),
            _user("s-pr-2", "student", group=GROUP_B),
            Attempt(id="att-pr-1", session_id="ses-pr", card_id="c-001", student_id="s-pr-1", mode="operator112",
                    opened_at=now_iso()),
            Attempt(id="att-pr-2", session_id="ses-pr", card_id="c-001", student_id="s-pr-2", mode="operator112",
                    opened_at=now_iso()),
        ])
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
        yield Env(tokens=issued, maker=maker, var_dir=var_dir)
    finally:
        app.dependency_overrides.pop(get_db, None)
        await engine.dispose()


async def _call(app, method: str, path: str, token: str | None, **kwargs: Any) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api/v1") as http:
        return await http.request(method, path, headers=headers, **kwargs)


def _multipart(fields: dict[str, str], attachment: tuple[str, bytes, str] | None = None) -> dict[str, Any]:
    """multipart/form-data: текстовые поля — частями без имени файла, вложение — файлом."""
    files: dict[str, Any] = {key: (None, value) for key, value in fields.items()}
    if attachment is not None:
        name, data, mime = attachment
        files["attachment"] = (name, data, mime)
    return {"files": files}


async def _send(app, token: str | None, fields: dict[str, str], attachment: tuple[str, bytes, str] | None = None) -> httpx.Response:
    return await _call(app, "POST", "/problem-reports", token, **_multipart(fields, attachment))


async def _report(app, env: Env, text: str, *, who: str = "student", **fields: str) -> dict[str, Any]:
    response = await _send(app, env.tokens[who], {"text": text, **fields})
    assert response.status_code == 201, response.text
    return response.json()


async def test_student_sends_report_without_file_path(app, env: Env):
    response = await _send(app, env.tokens["student"], {"text": "  Не открывается карточка  "})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["text"] == "Не открывается карточка"  # пробелы по краям срезаются
    assert body["id"] == "pr-001"
    assert body["studentId"] == "s-pr-1" and body["studentName"] == "ФИО s-pr-1" and body["groupId"] == GROUP_A
    assert body["hasAttachment"] is False
    assert "attachmentPath" not in body and "attachment_path" not in body
    assert "readAt" not in body  # ещё не прочитано
    assert body["createdAt"]


async def test_only_student_may_send_403_and_student_pair_201(app, env: Env):
    for who in ("teacher", "admin"):
        response = await _send(app, env.tokens[who], {"text": "Сообщение не от ученика"})
        assert response.status_code == 403, who
    anonymous = await _send(app, None, {"text": "Без входа"})
    assert anonymous.status_code == 401
    assert (await _send(app, env.tokens["student"], {"text": "Ученик"})).status_code == 201


async def test_empty_or_too_long_text_400_and_valid_pair_201(app, env: Env):
    assert (await _send(app, env.tokens["student"], {"text": "   "})).status_code == 400
    assert (await _send(app, env.tokens["student"], {})).status_code == 400  # поля text нет
    assert (await _send(app, env.tokens["student"], {"text": "я" * 2001})).status_code == 400
    response = await _send(app, env.tokens["student"], {"text": "я" * 2000})
    assert response.status_code == 201, response.text


async def test_wrong_attachment_type_400_and_valid_images_201(app, env: Env):
    student = env.tokens["student"]
    assert (await _send(app, student, {"text": "Файл"}, ("a.gif", PNG, "image/gif"))).status_code == 400
    assert (await _send(app, student, {"text": "Файл"}, ("a.png", PNG, "text/plain"))).status_code == 400
    assert (await _send(app, student, {"text": "Файл"}, ("a.png", b"not an image", "image/png"))).status_code == 400
    png = await _send(app, student, {"text": "Скриншот"}, ("a.png", PNG, "image/png"))
    assert png.status_code == 201, png.text
    assert png.json()["hasAttachment"] is True
    jpeg = await _send(app, student, {"text": "Фото"}, ("b.jpg", JPEG, "image/jpeg"))
    assert jpeg.status_code == 201, jpeg.text
    stored = env.var_dir / "uploads" / "problem-reports" / "pr-001.png"
    assert stored.read_bytes() == PNG  # на диске, а не в ответе


async def test_attachment_size_limit_400_and_exact_limit_201(app, env: Env):
    student = env.tokens["student"]
    too_big = PNG + b"\x00" * (TWO_MB - len(PNG) + 1)
    assert len(too_big) == TWO_MB + 1
    assert (await _send(app, student, {"text": "Большой"}, ("big.png", too_big, "image/png"))).status_code == 400
    exact = PNG + b"\x00" * (TWO_MB - len(PNG))
    assert len(exact) == TWO_MB
    assert (await _send(app, student, {"text": "Ровно 2 МБ"}, ("ok.png", exact, "image/png"))).status_code == 201


async def test_incident_number_and_attempt_validation(app, env: Env):
    student = env.tokens["student"]
    assert (await _send(app, student, {"text": "Номер", "incidentNumber": "0"})).status_code == 400
    assert (await _send(app, student, {"text": "Номер", "incidentNumber": "abc"})).status_code == 400
    ok = await _send(app, student, {"text": "Номер", "incidentNumber": "7", "attemptId": "att-pr-1"})
    assert ok.status_code == 201, ok.text
    assert ok.json()["incidentNumber"] == 7 and ok.json()["attemptId"] == "att-pr-1"
    # Чужая попытка не привязывается; попытки нет — 404; своя — 201 (см. выше).
    assert (await _send(app, student, {"text": "Чужая", "attemptId": "att-pr-2"})).status_code == 404
    assert (await _send(app, student, {"text": "Нет такой", "attemptId": "att-none"})).status_code == 404


async def test_teacher_sees_only_own_groups_newest_first(app, env: Env):
    await _report(app, env, "первое")
    await _report(app, env, "второе", who="student_b")
    await _report(app, env, "третье")
    teacher = await _call(app, "GET", "/teacher/problem-reports", env.tokens["teacher"])
    assert teacher.status_code == 200, teacher.text
    assert [item["text"] for item in teacher.json()["items"]] == ["третье", "первое"]
    teacher_b = await _call(app, "GET", "/teacher/problem-reports", env.tokens["teacher_b"])
    assert [item["text"] for item in teacher_b.json()["items"]] == ["второе"]
    admin = await _call(app, "GET", "/teacher/problem-reports", env.tokens["admin"])
    assert [item["text"] for item in admin.json()["items"]] == ["третье", "второе", "первое"]
    none = await _call(app, "GET", "/teacher/problem-reports", env.tokens["teacher_none"])
    assert none.status_code == 200 and none.json() == {"items": []}


async def test_student_cannot_list_403_and_teacher_pair_200(app, env: Env):
    await _report(app, env, "Проблема")
    assert (await _call(app, "GET", "/teacher/problem-reports", env.tokens["student"])).status_code == 403
    assert (await _call(app, "GET", "/teacher/problem-reports", None)).status_code == 401
    listed = await _call(app, "GET", "/teacher/problem-reports", env.tokens["teacher"])
    assert listed.status_code == 200
    item = listed.json()["items"][0]
    assert item["studentName"] == "ФИО s-pr-1" and item["groupId"] == GROUP_A and item["hasAttachment"] is False


async def test_mark_read_once_and_foreign_group_404(app, env: Env):
    report = await _report(app, env, "Отметить")
    path = f"/teacher/problem-reports/{report['id']}/read"
    assert (await _call(app, "POST", path, env.tokens["student"])).status_code == 403
    assert (await _call(app, "POST", path, env.tokens["teacher_b"])).status_code == 404  # чужая группа
    first = await _call(app, "POST", path, env.tokens["teacher"])
    assert first.status_code == 200, first.text
    read_at = first.json()["readAt"]
    assert read_at
    again = await _call(app, "POST", path, env.tokens["teacher"])
    assert again.json()["readAt"] == read_at  # повторная отметка не сдвигает время
    listed = (await _call(app, "GET", "/teacher/problem-reports", env.tokens["teacher"])).json()["items"]
    assert listed[0]["readAt"] == read_at


async def test_attachment_for_own_group_200_and_foreign_404(app, env: Env):
    no_file_report = await _report(app, env, "Без файла")
    response = await _send(app, env.tokens["student"], {"text": "Со скриншотом"}, ("shot.png", PNG, "image/png"))
    assert response.status_code == 201, response.text
    path = f"/teacher/problem-reports/{response.json()['id']}/attachment"
    own = await _call(app, "GET", path, env.tokens["teacher"])
    assert own.status_code == 200, own.text
    assert own.headers["content-type"] == "image/png"
    assert own.content == PNG
    assert (await _call(app, "GET", path, env.tokens["teacher_b"])).status_code == 404  # чужая группа
    assert (await _call(app, "GET", path, env.tokens["student"])).status_code == 403
    assert (await _call(app, "GET", path, None)).status_code == 401
    # Сообщение без вложения — 404, даже у своего преподавателя.
    no_file = await _call(app, "GET", f"/teacher/problem-reports/{no_file_report['id']}/attachment", env.tokens["teacher"])
    assert no_file.status_code == 404


async def test_audit_records_created_without_text(app, env: Env):
    marker = "ТЕКСТ-КОТОРЫЙ-НЕ-ДОЛЖЕН-ПОПАСТЬ-В-АУДИТ"
    await _report(app, env, marker, attemptId="att-pr-1")
    async with env.maker() as db:
        rows = (await db.execute(select(AuditLog).where(AuditLog.action == "problem_report.created"))).scalars().all()
    assert len(rows) == 1
    assert rows[0].user_id == "s-pr-1" and rows[0].role == "student"
    assert marker not in rows[0].details
    assert "pr-001" in rows[0].details and "att-pr-1" in rows[0].details
