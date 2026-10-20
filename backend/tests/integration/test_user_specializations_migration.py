"""T006 / T016 (фича 007): миграция `0007_user_specializations` и перенос специализаций сидом.

Миграция и сид идут в подпроцессах на временной SQLite-базе (как test_alembic.py); dev.db и demo.db не трогаются.
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
PREVIOUS = "0006_ai_settings"
HEAD = "0007_user_specializations"


def _run(*args: str, environment: dict[str, str]) -> None:
    result = subprocess.run([sys.executable, *args], cwd=BACKEND, env=environment, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stdout + result.stderr


def _environment(database: Path) -> dict[str, str]:
    return {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{database.as_posix()}", "ML_WARMUP": "0", "SEED_DIR": str(BACKEND.parent)}


def _insert_user(connection: sqlite3.Connection, user_id: str, role: str) -> None:
    connection.execute(
        "INSERT INTO users (id, login, password_hash, full_name, role, arm_number, is_active, failed_logins)"
        " VALUES (?, ?, 'x', 'Тестовый', ?, 1, 1, 0)",
        (user_id, user_id, role),
    )


def _columns(database: Path) -> set[str]:
    with sqlite3.connect(database) as connection:
        return {row[1] for row in connection.execute("PRAGMA table_info(users)")}


@pytest.fixture
def database(tmp_path: Path) -> Path:
    return tmp_path / "specializations.db"


def test_upgrade_backfills_existing_students_with_dds_and_keeps_staff_empty(database: Path):
    environment = _environment(database)
    _run("-m", "alembic", "upgrade", PREVIOUS, environment=environment)
    with sqlite3.connect(database) as connection:
        _insert_user(connection, "u-old-student", "student")
        _insert_user(connection, "u-old-teacher", "teacher")
    # Именно ревизия фичи 007, а не «head»: поверх неё добавляются следующие миграции других фич.
    _run("-m", "alembic", "upgrade", HEAD, environment=environment)
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == HEAD
        stored = dict(connection.execute("SELECT id, specializations FROM users WHERE id LIKE 'u-old-%'").fetchall())
    assert json.loads(stored["u-old-student"]) == ["dds"]  # существующие обучающиеся — «оператор ДДС» (фактическое поведение)
    assert stored["u-old-teacher"] is None


def test_downgrade_removes_the_column_and_upgrade_restores_it(database: Path):
    environment = _environment(database)
    _run("-m", "alembic", "upgrade", "head", environment=environment)
    assert "specializations" in _columns(database)
    _run("-m", "alembic", "downgrade", PREVIOUS, environment=environment)
    assert "specializations" not in _columns(database)
    _run("-m", "alembic", "upgrade", "head", environment=environment)
    assert "specializations" in _columns(database)


def test_seed_carries_specializations_from_the_mock(database: Path):
    environment = _environment(database)
    _run("-m", "alembic", "upgrade", "head", environment=environment)
    _run("-m", "app.seed.load", environment=environment)
    with sqlite3.connect(database) as connection:
        stored = dict(connection.execute("SELECT id, specializations FROM users").fetchall())
    assert json.loads(stored["u-005"]) == ["operator112", "dds"]  # цепочка: обе специализации
    assert json.loads(stored["u-006"]) == ["operator112", "dds"]
    assert json.loads(stored["u-016"]) == ["operator112"]
    assert json.loads(stored["u-007"]) == ["dds"]
    # У учителя и администратора значение — JSON null (SQLAlchemy JSON пишет None как 'null'); приложение читает None.
    assert json.loads(stored["u-002"] or "null") is None and json.loads(stored["u-001"] or "null") is None
