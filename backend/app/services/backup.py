"""Резервное копирование БД (T070, ТЗ §9): `pg_dump` для PostgreSQL, копия файла через sqlite3 backup API для SQLite.

Архивы — `VAR_DIR/backups/backup-<UTC-метка>.{sql|db}`. Ошибка (нет `pg_dump`, недоступна БД) — `BackupError`,
которую вызывающий пишет в системные журналы, не блокируя сохранение настроек (мок бэкапа всегда «успешен»).
"""

from __future__ import annotations

import datetime as dt
import shutil
import sqlite3
import subprocess
from pathlib import Path

from app.config import Settings, get_settings

BACKUPS_DIR_NAME = "backups"
PG_DUMP_TIMEOUT_SEC = 300


class BackupError(RuntimeError):
    pass


def backups_dir(settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    path = settings.var_dir / BACKUPS_DIR_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def _stamp() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y%m%d-%H%M%S")


def _sqlite_path(settings: Settings) -> Path:
    url = settings.resolved_database_url
    if ":memory:" in url:
        raise BackupError("БД в памяти не копируется")
    return Path(url.split(":///", 1)[1])


def _backup_sqlite(settings: Settings) -> Path:
    source_path = _sqlite_path(settings)
    if not source_path.exists():
        raise BackupError(f"Файл БД не найден: {source_path}")
    target = backups_dir(settings) / f"backup-{_stamp()}.db"
    source = sqlite3.connect(source_path)
    try:
        destination = sqlite3.connect(target)
        try:
            source.backup(destination)  # консистентная копия даже при открытых соединениях
        finally:
            destination.close()
    finally:
        source.close()
    return target


def _libpq_url(database_url: str) -> str:
    # SQLAlchemy `postgresql+asyncpg://…` → libpq `postgresql://…`
    scheme, rest = database_url.split("://", 1)
    return f"{scheme.split('+', 1)[0]}://{rest}"


def _backup_postgres(settings: Settings) -> Path:
    executable = shutil.which("pg_dump")
    if executable is None:
        raise BackupError("pg_dump не найден в PATH")
    target = backups_dir(settings) / f"backup-{_stamp()}.sql"
    try:
        completed = subprocess.run([executable, "--no-owner", "--format=plain", "--file", str(target), _libpq_url(settings.database_url)], capture_output=True, text=True, timeout=PG_DUMP_TIMEOUT_SEC, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BackupError(f"pg_dump не выполнен: {exc}") from exc
    if completed.returncode != 0:
        raise BackupError(f"pg_dump завершился с кодом {completed.returncode}: {completed.stderr.strip()[:300]}")
    return target


def run_backup(settings: Settings | None = None) -> Path:
    """Создаёт архив и возвращает путь; синхронная — вызывать через `asyncio.to_thread`."""
    settings = settings or get_settings()
    return _backup_sqlite(settings) if settings.sqlite else _backup_postgres(settings)
