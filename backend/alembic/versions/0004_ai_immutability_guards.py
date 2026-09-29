"""Защитные триггеры неизменяемости утверждённых ИИ-версий и ревизий оценки.

Revision ID: 0004_ai_guards
Revises: 0003_widen_classifier_signs

Автогенерация не создаёт триггеры: они задаются событиями ``after_create`` в моделях, которые ``op.create_table``
не запускает. Поэтому выполняются те же DDL-константы, что и в моделях.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op
from app.models import ai_assessment, ai_scenario

revision = "0004_ai_guards"
down_revision = "0003_widen_classifier_signs"
branch_labels = None
depends_on = None

_GUARDS = {
    "sqlite": (
        ai_scenario.SQLITE_SCENARIO_UPDATE_GUARD,
        ai_scenario.SQLITE_SCENARIO_DELETE_GUARD,
        ai_scenario.SQLITE_ETALON_UPDATE_GUARD,
        ai_scenario.SQLITE_ETALON_DELETE_GUARD,
        ai_assessment.SQLITE_EVALUATION_INSERT_GUARD,
        ai_assessment.SQLITE_EVALUATION_UPDATE_GUARD,
        ai_assessment.SQLITE_EVALUATION_DELETE_GUARD,
    ),
    "postgresql": (
        ai_scenario.POSTGRES_SCENARIO_GUARD_FUNCTION,
        ai_scenario.POSTGRES_SCENARIO_GUARD_TRIGGER,
        ai_scenario.POSTGRES_ETALON_GUARD_FUNCTION,
        ai_scenario.POSTGRES_ETALON_GUARD_TRIGGER,
        ai_assessment.POSTGRES_EVALUATION_GUARD_FUNCTION,
        ai_assessment.POSTGRES_EVALUATION_GUARD_TRIGGER,
    ),
}
_SQLITE_TRIGGERS = (
    "trg_ai_scenario_no_update_approved", "trg_ai_scenario_no_delete_approved",
    "trg_ai_etalon_no_update_approved", "trg_ai_etalon_no_delete_approved",
    "trg_ai_evaluation_revision_validate_insert", "trg_ai_evaluation_revision_no_update",
    "trg_ai_evaluation_revision_no_delete",
)
_POSTGRES_TRIGGERS = (
    ("trg_ai_scenario_immutable", "ai_scenario_versions"),
    ("trg_ai_etalon_immutable", "ai_etalon_versions"),
    ("trg_ai_evaluation_revision_immutable", "ai_evaluation_revisions"),
)
_POSTGRES_FUNCTIONS = ("guard_ai_scenario_version", "guard_ai_etalon_version", "guard_ai_evaluation_revision")


def upgrade() -> None:
    for statement in _GUARDS.get(op.get_context().dialect.name, ()):
        op.execute(sa.DDL(statement))


def downgrade() -> None:
    dialect = op.get_context().dialect.name
    if dialect == "sqlite":
        for trigger in _SQLITE_TRIGGERS:
            op.execute(sa.DDL(f"DROP TRIGGER IF EXISTS {trigger}"))
    elif dialect == "postgresql":
        for trigger, table in _POSTGRES_TRIGGERS:
            op.execute(sa.DDL(f"DROP TRIGGER IF EXISTS {trigger} ON {table}"))
        for function in _POSTGRES_FUNCTIONS:
            op.execute(sa.DDL(f"DROP FUNCTION IF EXISTS {function}()"))
