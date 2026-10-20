"""Один активный прогон версии сценария на обучающегося.

Revision ID: 0008_scenario_run_active_unique
Revises: 0007_scenario_run_revision
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0008_scenario_run_active_unique"
down_revision = "0007_scenario_run_revision"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_ai_scenario_run_active",
        "ai_scenario_runs",
        ["student_id", "scenario_id", "version"],
        unique=True,
        sqlite_where=sa.text("status = 'waiting'"),
        postgresql_where=sa.text("status = 'waiting'"),
    )


def downgrade() -> None:
    op.drop_index("uq_ai_scenario_run_active", table_name="ai_scenario_runs")
