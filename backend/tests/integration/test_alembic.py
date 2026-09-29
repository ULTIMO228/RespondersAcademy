"""The initial Alembic revision creates the complete schema before seeding."""

from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine

from app import models  # noqa: F401
from app.db.base import Base

BACKEND = Path(__file__).resolve().parents[2]


EXPECTED_GUARDS = {
    "trg_ai_scenario_no_update_approved", "trg_ai_scenario_no_delete_approved",
    "trg_ai_etalon_no_update_approved", "trg_ai_etalon_no_delete_approved",
    "trg_ai_evaluation_revision_validate_insert", "trg_ai_evaluation_revision_no_update",
    "trg_ai_evaluation_revision_no_delete",
}


def _run(*args: str, environment: dict[str, str]) -> str:
    result = subprocess.run([sys.executable, *args], cwd=BACKEND, env=environment,
                            capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout


def _environment(url: str) -> dict[str, str]:
    return {**os.environ, "DATABASE_URL": url, "ML_WARMUP": "0", "SEED_DIR": str(BACKEND.parent)}


def _triggers(connection: sqlite3.Connection) -> set[str]:
    return {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'trigger'")}


@pytest.fixture(scope="module")
def migrated_database(tmp_path_factory: pytest.TempPathFactory) -> Path:
    database = tmp_path_factory.mktemp("migrated") / "guards.db"
    _run("-m", "alembic", "upgrade", "head", environment=_environment(f"sqlite+aiosqlite:///{database.as_posix()}"))
    return database


def test_initial_migration_and_seed_on_clean_database(tmp_path: Path):
    database = tmp_path / "migration.db"
    environment = {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{database.as_posix()}",
                   "ML_WARMUP": "0", "SEED_DIR": str(BACKEND.parent)}
    _run("-m", "alembic", "upgrade", "head", environment=environment)
    with sqlite3.connect(database) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        assert set(Base.metadata.tables) <= tables
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "0004_ai_guards"
    _run("-m", "alembic", "check", environment=environment)
    _run("-m", "app.seed.load", environment=environment)
    with sqlite3.connect(database) as connection:
        assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] >= 20
        assert connection.execute("SELECT COUNT(*) FROM incident_cards").fetchone()[0] >= 96


def test_migrated_schema_has_every_model_table_and_same_guards_as_create_all(migrated_database: Path, tmp_path: Path):
    created = tmp_path / "create_all.db"
    engine = create_engine(f"sqlite:///{created.as_posix()}")
    Base.metadata.create_all(engine)
    engine.dispose()
    with sqlite3.connect(migrated_database) as migrated, sqlite3.connect(created) as reference:
        tables = {row[0] for row in migrated.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        assert set(Base.metadata.tables) <= tables
        assert _triggers(migrated) == _triggers(reference) == EXPECTED_GUARDS


def test_migrated_database_keeps_approved_versions_immutable(migrated_database: Path):
    with sqlite3.connect(migrated_database) as connection:
        connection.execute(
            "INSERT INTO ai_etalon_versions (id, scenario_id, mode, expected_fields, expected_actions, semantic_facts,"
            " rule_source_ids, classifier_version, created_at) VALUES ('et-1', 'sc-1', 'operator112', '{}', '[]', '[]', '[]', 'v', 'now')"
        )
        connection.execute(
            "INSERT INTO ai_scenario_versions (scenario_id, version, mode, source_ticket_id, created_by, source_situation_no,"
            " source_kind, source_hash, validation, validation_report, approval, card_snapshot, etalon_version, rule_source_ids,"
            " approved_by) VALUES ('sc-1', 1, 'operator112', 't-1', 'u-002', 1, 'ticket', ?, 'passed', '{}', 'approved', '{}',"
            " 'et-1', '[]', 'u-002')",
            ("a" * 64,),
        )
        connection.execute(
            "INSERT INTO ai_evaluation_revisions (attempt_id, revision, mode, status, available_axes, axes, total_score, errors,"
            " etalon_version, assessor_version, created_at) VALUES ('a-1', 1, 'operator112', 'preliminary', '[\"timeScore\"]',"
            " '{\"timeScore\": 80, \"correctnessScore\": null, \"grammarScore\": null, \"semanticScore\": null}', 80, '[]',"
            " 'et-1', 'v', 'now')"
        )
        connection.commit()
        for statement, message in (
            ("UPDATE ai_scenario_versions SET teacher_comment = 'x' WHERE scenario_id = 'sc-1'", "approved scenario version is immutable"),
            ("DELETE FROM ai_scenario_versions WHERE scenario_id = 'sc-1'", "approved scenario version is immutable"),
            ("UPDATE ai_etalon_versions SET classifier_version = 'x' WHERE id = 'et-1'", "approved etalon version is immutable"),
            ("DELETE FROM ai_etalon_versions WHERE id = 'et-1'", "approved etalon version is immutable"),
            ("UPDATE ai_evaluation_revisions SET total_score = 10 WHERE attempt_id = 'a-1'", "evaluation revision is immutable"),
            ("DELETE FROM ai_evaluation_revisions WHERE attempt_id = 'a-1'", "evaluation revision is immutable"),
        ):
            with pytest.raises(sqlite3.DatabaseError, match=message):
                connection.execute(statement)
        with pytest.raises(sqlite3.DatabaseError, match="invalid evaluation axes or score"):
            connection.execute(
                "INSERT INTO ai_evaluation_revisions (attempt_id, revision, mode, status, available_axes, axes, total_score,"
                " errors, etalon_version, assessor_version, created_at) VALUES ('a-2', 1, 'operator112', 'preliminary', '[]',"
                " '{}', 80, '[]', 'et-1', 'v', 'now')"
            )


def test_postgresql_migration_renders_tables_and_guards_offline():
    # PostgreSQL 12+ недоступен в среде разработки: проверяем, что ветка миграции выпускает DDL для диалекта.
    sql = _run("-m", "alembic", "upgrade", "head", "--sql",
               environment=_environment("postgresql+asyncpg://arm112:arm112@localhost:5432/arm112"))
    assert sql.count("CREATE TABLE") == len(Base.metadata.tables) + 1  # + alembic_version
    for fragment in (
        "CREATE OR REPLACE FUNCTION guard_ai_scenario_version()", "CREATE TRIGGER trg_ai_scenario_immutable",
        "CREATE OR REPLACE FUNCTION guard_ai_etalon_version()", "CREATE TRIGGER trg_ai_etalon_immutable",
        "CREATE OR REPLACE FUNCTION guard_ai_evaluation_revision()", "CREATE TRIGGER trg_ai_evaluation_revision_immutable",
    ):
        assert fragment in sql


def test_postgresql_offline_upgrade_compiles_jsonb():
    environment = {**os.environ, "DATABASE_URL": "postgresql+asyncpg://offline:offline@invalid.invalid/offline"}
    ddl = _run("-m", "alembic", "upgrade", "head", "--sql", environment=environment)
    assert ddl.count("CREATE TABLE") == len(Base.metadata.tables) + 1  # alembic_version
    assert "JSONB" in ddl
    assert "CREATE TABLE ai_assessment_jobs" in ddl
    assert "0004_ai_guards" in ddl
