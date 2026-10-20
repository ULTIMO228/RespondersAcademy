"""Сообщения обучающихся «Сообщить о проблеме» (спека 009, US6).

Revision ID: 0007_problem_reports
Revises: 0006_user_training_profile

Одна таблица `problem_reports`: текст ≤ 2000, путь к вложению (png/jpeg ≤ 2 МБ, файл под `var/`), отметка прочтения.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0007_problem_reports"
down_revision = "0006_user_training_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "problem_reports",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("student_id", sa.String(length=16), nullable=False),
        sa.Column("attempt_id", sa.String(length=16), nullable=True),
        sa.Column("incident_number", sa.Integer(), nullable=True),
        sa.Column("text", sa.String(length=2000), nullable=False),
        sa.Column("attachment_path", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.String(length=32), nullable=False),
        sa.Column("read_at", sa.String(length=32), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_problem_reports_student_id"), "problem_reports", ["student_id"], unique=False)
    op.create_index(op.f("ix_problem_reports_created_at"), "problem_reports", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_problem_reports_created_at"), table_name="problem_reports")
    op.drop_index(op.f("ix_problem_reports_student_id"), table_name="problem_reports")
    op.drop_table("problem_reports")
