"""Спека 003, T019: демо-набор карты ошибок `scripts/seed_error_map_demo.py` — сценарии и идемпотентность.

Набор прогоняется на временной SQLite-базе (не на backend/var): `app.seed.load --reset`, затем скрипт дважды.
Доли и уровни считаются заново из сырых строк `attempts` / `evaluations` / `users`; этапы — через `stage_for_rule`,
пороги — из `ErrorMapSettings()` (умолчания: 0,10 / 0,30; minAttemptsGroup 5; minAttemptsStudent 3; зона ±10).
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from app.services.error_map_settings import ErrorMapSettings
from app.services.error_map_stages import stage_for_rule
from app.services.time import MOSCOW
from ml.assess.rules import RULES
from scripts.seed_error_map_demo import SCENARIOS, Scenario

BACKEND = Path(__file__).resolve().parents[2]
THRESHOLDS = ErrorMapSettings()
BAND = THRESHOLDS.same_band_points / 100


def _run(args: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, *args], cwd=BACKEND, env=env, capture_output=True, text=True, check=True, timeout=600)


@pytest.fixture(scope="module")
def demo_db(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Временная база: сид, затем демо-набор дважды (второй прогон проверяет отсутствие дублей)."""
    db = tmp_path_factory.mktemp("error-map-demo") / "demo.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{db}", "ML_WARMUP": "0"}
    _run(["-m", "app.seed.load", "--reset"], env)
    _run(["scripts/seed_error_map_demo.py"], env)
    _run(["scripts/seed_error_map_demo.py"], env)
    return db


@pytest.fixture(scope="module")
def env_for_extra_run(demo_db: Path) -> dict[str, str]:
    return {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{demo_db}", "ML_WARMUP": "0"}


def _connect(db: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def _attempts(db: Path) -> list[dict[str, Any]]:
    """Все демо-попытки: группа, обучающийся, режим, этапы с ошибкой (через stage_for_rule), дата оценки."""
    with _connect(db) as connection:
        rows = connection.execute(
            """
            select a.id, a.student_id, a.mode, u."group" as grp, e.errors, e.generated_at
            from attempts a
            join evaluations e on e.attempt_id = a.id
            join users u on u.id = a.student_id
            where a.student_id like 'u-9%'
            order by a.id
            """
        ).fetchall()
    items = []
    for row in rows:
        errors = json.loads(row["errors"])
        items.append(
            {
                "id": row["id"],
                "student": row["student_id"],
                "mode": row["mode"],
                "group": row["grp"],
                "errors": errors,
                "stages": {stage_for_rule(row["mode"], error.get("ruleId")).id for error in errors},
                "generated": row["generated_at"],
            }
        )
    return items


def _share(items: list[dict[str, Any]], stage: str) -> tuple[int, int]:
    return sum(1 for item in items if stage in item["stages"]), len(items)


def _level(count: int, attempts: int, min_attempts: int) -> str:
    if attempts < min_attempts:
        return "noData"
    share = count / attempts
    if share < THRESHOLDS.sometimes_from:
        return "rare"
    if share <= THRESHOLDS.often_from:
        return "sometimes"
    return "often"


def _group_items(attempts: list[dict[str, Any]], scenario: Scenario) -> list[dict[str, Any]]:
    return [item for item in attempts if item["group"] == scenario.group and item["mode"] == scenario.mode]


def _student_ids(db: Path, group: str) -> list[str]:
    with _connect(db) as connection:
        return [row["id"] for row in connection.execute('select id from users where "group" = ? order by id', (group,)).fetchall()]


def _dump(db: Path) -> dict[str, list[tuple[Any, ...]]]:
    """Все строки, которые пишет скрипт (включая назначения преподавателей) — для сравнения между прогонами."""
    with _connect(db) as connection:
        return {
            "users": [tuple(row) for row in connection.execute("select id, login, role, \"group\", arm_number, assigned_groups from users where id like 'u-9%' or login in ('morozova', 'kovalev') order by id").fetchall()],
            "sessions": [tuple(row) for row in connection.execute("select * from sessions where id like 'ses-7%' order by id").fetchall()],
            "attempts": [tuple(row) for row in connection.execute("select * from attempts where student_id like 'u-9%' order by id").fetchall()],
            "evaluations": [tuple(row) for row in connection.execute("select * from evaluations where attempt_id in (select id from attempts where student_id like 'u-9%') order by attempt_id").fetchall()],
        }


def test_counts_and_no_duplicates_after_two_runs(demo_db: Path) -> None:
    attempts = _attempts(demo_db)
    assert len(attempts) == sum(sum(scenario.attempts_per_student) for scenario in SCENARIOS) == 132
    with _connect(demo_db) as connection:
        students = connection.execute("select count(*) from users where role = 'student' and \"group\" like '%Демо%'").fetchone()[0]
        sessions = connection.execute("select count(*) from sessions where id like 'ses-7%'").fetchone()[0]
    assert students == 36
    assert sessions == len(SCENARIOS) == 8


def test_teachers_keep_existing_groups_and_get_demo_groups(demo_db: Path) -> None:
    with _connect(demo_db) as connection:
        groups = {row["login"]: json.loads(row["assigned_groups"]) for row in connection.execute("select login, assigned_groups from users where login in ('morozova', 'kovalev')")}
    assert groups["morozova"] == ["ДДС-01"] + [s.group for s in SCENARIOS if s.mode == "dds"]
    assert groups["kovalev"] == ["ДДС-02"] + [s.group for s in SCENARIOS if s.mode == "operator112"]
    for values in groups.values():
        assert len(values) == len(set(values))


def test_every_error_is_a_real_rule_mapped_to_a_stage(demo_db: Path) -> None:
    for item in _attempts(demo_db):
        for error in item["errors"]:
            assert error["ruleId"] in RULES
            assert error["message"] and "{" not in error["message"]
            assert stage_for_rule(item["mode"], error["ruleId"]).id != "other"


def test_stage_counts_match_scenario_definitions(demo_db: Path) -> None:
    attempts = _attempts(demo_db)
    for scenario in SCENARIOS:
        items = _group_items(attempts, scenario)
        assert len(items) == sum(scenario.attempts_per_student)
        for stage, expected in scenario.stage_errors.items():
            assert _share(items, stage)[0] == expected, (scenario.group, stage)
        stages_with_errors = {stage for item in items for stage in item["stages"]}
        assert stages_with_errors <= {stage for stage, count in scenario.stage_errors.items() if count}


def test_scenario_1_has_no_often_stage(demo_db: Path) -> None:
    attempts = _attempts(demo_db)
    for scenario in (s for s in SCENARIOS if s.group.endswith("Демо-1")):
        items = _group_items(attempts, scenario)
        levels = {stage: _level(*_share(items, stage), THRESHOLDS.min_attempts_group) for stage in scenario.stage_errors}
        assert "often" not in levels.values(), scenario.group


def test_scenario_2_has_exactly_two_often_stages(demo_db: Path) -> None:
    attempts = _attempts(demo_db)
    expected = {"ДДС-Демо-2": {"decision", "statuses"}, "112-Демо-2": {"essence", "type"}}
    for scenario in (s for s in SCENARIOS if s.group.endswith("Демо-2")):
        items = _group_items(attempts, scenario)
        often = {stage for stage in scenario.stage_errors if _level(*_share(items, stage), THRESHOLDS.min_attempts_group) == "often"}
        assert often == expected[scenario.group], scenario.group


def test_scenario_3_has_more_than_three_often_stages(demo_db: Path) -> None:
    attempts = _attempts(demo_db)
    for scenario in (s for s in SCENARIOS if s.group.endswith("Демо-3")):
        items = _group_items(attempts, scenario)
        often = [stage for stage in scenario.stage_errors if _level(*_share(items, stage), THRESHOLDS.min_attempts_group) == "often"]
        assert len(often) > 3, scenario.group


def test_scenario_4_group_is_below_min_attempts(demo_db: Path) -> None:
    attempts = _attempts(demo_db)
    for scenario in (s for s in SCENARIOS if s.group.endswith("Демо-4")):
        items = _group_items(attempts, scenario)
        assert len(items) < THRESHOLDS.min_attempts_group, scenario.group
        assert all(_level(*_share(items, stage), THRESHOLDS.min_attempts_group) == "noData" for stage in scenario.stage_errors)


def test_scenario_5_student_worse_on_one_stage_and_better_on_another(demo_db: Path) -> None:
    attempts = _attempts(demo_db)
    checked = 0
    for scenario in (s for s in SCENARIOS if s.prefer and s.exclude):
        items = _group_items(attempts, scenario)
        student_id = _student_ids(demo_db, scenario.group)[next(iter(scenario.prefer.values()))]
        mine = [item for item in items if item["student"] == student_id]
        assert len(mine) >= THRESHOLDS.min_attempts_student
        worse_stage = next(iter(scenario.prefer))
        better_stage = next(iter(scenario.exclude))
        share_student = _share(mine, worse_stage)[0] / len(mine)
        share_group = _share(items, worse_stage)[0] / len(items)
        assert share_student - share_group > BAND, (scenario.group, worse_stage)
        share_student = _share(mine, better_stage)[0] / len(mine)
        share_group = _share(items, better_stage)[0] / len(items)
        assert share_group - share_student > BAND, (scenario.group, better_stage)
        checked += 1
    assert checked == 2


def test_scenario_6_student_below_min_attempts(demo_db: Path) -> None:
    attempts = _attempts(demo_db)
    scenarios = [s for s in SCENARIOS if s.group.endswith("Демо-3")]
    for scenario in scenarios:
        last_index = len(scenario.attempts_per_student) - 1
        assert scenario.attempts_per_student[last_index] < THRESHOLDS.min_attempts_student
        student_id = _student_ids(demo_db, scenario.group)[last_index]
        mine = [item for item in _group_items(attempts, scenario) if item["student"] == student_id]
        assert len(mine) == scenario.attempts_per_student[last_index] < THRESHOLDS.min_attempts_student
        assert all(_level(_share(mine, stage)[0], len(mine), THRESHOLDS.min_attempts_student) == "noData" for stage in scenario.stage_errors)


def test_dates_are_inside_two_week_window(demo_db: Path) -> None:
    today = datetime.now(MOSCOW).date()
    earliest = today - timedelta(days=14)
    for item in _attempts(demo_db):
        generated = datetime.fromisoformat(item["generated"]).date()
        assert earliest <= generated < today


def test_rerun_is_idempotent(demo_db: Path, env_for_extra_run: dict[str, str]) -> None:
    before = _dump(demo_db)
    _run(["scripts/seed_error_map_demo.py"], env_for_extra_run)
    assert _dump(demo_db) == before
