"""Ревизия прогона сценария для оптимистичной блокировки.

Revision ID: 0007_scenario_run_revision
Revises: 0006_scenario_builder

Два параллельных действия одного прогона больше не перезаписывают друг друга: запись идёт с условием по `revision`.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0007_scenario_run_revision"
down_revision = "0006_scenario_builder"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_scenario_runs", sa.Column("revision", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("ai_scenario_runs", "revision")
