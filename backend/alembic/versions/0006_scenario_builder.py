"""Конструктор сценариев 112: граф версии, права эксперта, прогоны обучающихся.

Revision ID: 0006_scenario_builder
Revises: 0005_error_map_verdicts

Все новые колонки nullable: существующие версии остаются линейными (без графа), а у пользователей без
`permissions` нет прав эксперта. Триггеры неизменяемости утверждённых версий не затрагиваются.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0006_scenario_builder"
down_revision = "0005_error_map_verdicts"
branch_labels = None
depends_on = None

JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.add_column("users", sa.Column("permissions", JSON, nullable=True))
    op.add_column("ai_scenario_versions", sa.Column("graph", JSON, nullable=True))
    op.add_column("ai_scenario_versions", sa.Column("reviewed_by", sa.String(length=16), nullable=True))
    op.add_column("ai_scenario_versions", sa.Column("review_comment", sa.String(length=2000), nullable=True))
    op.create_table(
        "ai_scenario_runs",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("scenario_id", sa.String(length=32), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("snapshot", JSON, nullable=False),
        sa.Column("created_at", sa.String(length=32), nullable=False),
        sa.Column("updated_at", sa.String(length=32), nullable=False),
        sa.CheckConstraint("status IN ('waiting', 'completed', 'aborted', 'faulted')", name="ck_ai_scenario_run_status"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_scenario_runs_scenario_id"), "ai_scenario_runs", ["scenario_id"], unique=False)
    op.create_index(op.f("ix_ai_scenario_runs_student_id"), "ai_scenario_runs", ["student_id"], unique=False)
    op.create_index(op.f("ix_ai_scenario_runs_status"), "ai_scenario_runs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ai_scenario_runs_status"), table_name="ai_scenario_runs")
    op.drop_index(op.f("ix_ai_scenario_runs_student_id"), table_name="ai_scenario_runs")
    op.drop_index(op.f("ix_ai_scenario_runs_scenario_id"), table_name="ai_scenario_runs")
    op.drop_table("ai_scenario_runs")
    # Прямой DROP COLUMN: batch-пересоздание таблицы ломает триггеры неизменяемости, ссылающиеся на ai_scenario_versions.
    op.drop_column("ai_scenario_versions", "review_comment")
    op.drop_column("ai_scenario_versions", "reviewed_by")
    op.drop_column("ai_scenario_versions", "graph")
    op.drop_column("users", "permissions")
