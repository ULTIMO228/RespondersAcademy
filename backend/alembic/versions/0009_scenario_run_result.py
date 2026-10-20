"""Результат прохождения сценария хранится вместе с попыткой.

Revision ID: 0009_scenario_run_result
Revises: 0008_scenario_run_active_unique
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0009_scenario_run_result"
down_revision = "0008_scenario_run_active_unique"
branch_labels = None
depends_on = None

JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.add_column("ai_scenario_runs", sa.Column("result", JSON, nullable=True))
    op.add_column("ai_scenario_runs", sa.Column("finished_at", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_scenario_runs", "finished_at")
    op.drop_column("ai_scenario_runs", "result")
