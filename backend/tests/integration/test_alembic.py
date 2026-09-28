"""The initial Alembic revision creates the complete schema before seeding."""

from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

from app import models  # noqa: F401
from app.db.base import Base

BACKEND = Path(__file__).resolve().parents[2]


def _run(*args: str, environment: dict[str, str]) -> None:
    result = subprocess.run([sys.executable, *args], cwd=BACKEND, env=environment,
                            capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stdout + result.stderr


def test_initial_migration_and_seed_on_clean_database(tmp_path: Path):
    database = tmp_path / "migration.db"
    environment = {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{database.as_posix()}",
                   "ML_WARMUP": "0", "SEED_DIR": str(BACKEND.parent)}
    _run("-m", "alembic", "upgrade", "head", environment=environment)
    with sqlite3.connect(database) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        assert set(Base.metadata.tables) <= tables
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "0002_ai_auth"
    _run("-m", "alembic", "check", environment=environment)
    _run("-m", "app.seed.load", environment=environment)
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] >= 20
        assert connection.execute("SELECT COUNT(*) FROM incident_cards").fetchone()[0] >= 96
