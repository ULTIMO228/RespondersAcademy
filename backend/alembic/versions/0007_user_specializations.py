"""Специализация обучающегося (фича 019): колонка `users.specializations`.

Revision ID: 0007_user_specializations
Revises: 0006_ai_settings

JSON-список значений `operator112 | dds` (одна или обе); у `student` — непустой список, у `teacher`/`admin` — NULL.
Существующим обучающимся проставляется `["dds"]` — фактическое поведение до фичи (допущение 10 спеки 019).
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0007_user_specializations"
down_revision = "0006_ai_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("specializations", sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"), nullable=True),
    )
    op.execute("UPDATE users SET specializations = '[\"dds\"]' WHERE role = 'student'")


def downgrade() -> None:
    op.drop_column("users", "specializations")
