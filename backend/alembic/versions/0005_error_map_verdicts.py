"""Вердикты преподавателя по пояснениям карты ошибок (фича 003).

Revision ID: 0005_error_map_verdicts
Revises: 0004_ai_guards

Одна таблица `error_map_verdicts`; `student_id` NOT NULL с пустой строкой для вердикта по группе, чтобы уникальный
ключ работал и при отсутствии обучающегося (NULL в уникальном индексе считались бы разными значениями).
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0005_error_map_verdicts"
down_revision = "0004_ai_guards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "error_map_verdicts",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("teacher_id", sa.String(length=16), nullable=False),
        sa.Column("group_id", sa.String(length=64), nullable=False),
        sa.Column("student_id", sa.String(length=16), server_default="", nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("stage_id", sa.String(length=32), nullable=False),
        sa.Column("period", sa.String(length=8), nullable=False),
        sa.Column("source", sa.String(length=12), nullable=False),
        sa.Column("text_hash", sa.String(length=64), nullable=False),
        sa.Column("verdict", sa.String(length=8), nullable=False),
        sa.Column("created_at", sa.String(length=32), nullable=False),
        sa.CheckConstraint("mode IN ('operator112', 'dds')", name="ck_error_map_verdict_mode"),
        sa.CheckConstraint("verdict IN ('agree', 'disagree')", name="ck_error_map_verdict_value"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "teacher_id", "group_id", "student_id", "mode", "stage_id", "text_hash", name="uq_error_map_verdict_target"
        ),
    )
    op.create_index(op.f("ix_error_map_verdicts_teacher_id"), "error_map_verdicts", ["teacher_id"], unique=False)
    op.create_index(op.f("ix_error_map_verdicts_group_id"), "error_map_verdicts", ["group_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_error_map_verdicts_group_id"), table_name="error_map_verdicts")
    op.drop_index(op.f("ix_error_map_verdicts_teacher_id"), table_name="error_map_verdicts")
    op.drop_table("error_map_verdicts")
