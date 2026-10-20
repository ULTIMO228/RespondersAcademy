"""Пометка источника ИИ-текстов в отчётах и рекомендациях (фича 006, T028).

Revision ID: 0008_report_ai_sources
Revises: 0007_user_specializations

`reports.ai_comment_source`, `group_reports.group_insights_source`, `recommendations.source` (`cloud | local |
template`) и `recommendations.text` (пояснение модели). Все столбцы необязательные: NULL у старых данных читается
как `template` (data-model.md, «Пометка источника текста»).
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0008_report_ai_sources"
down_revision = "0007_user_specializations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("ai_comment_source", sa.String(length=16), nullable=True))
    op.add_column("group_reports", sa.Column("group_insights_source", sa.String(length=16), nullable=True))
    op.add_column("recommendations", sa.Column("text", sa.String(length=600), nullable=True))
    op.add_column("recommendations", sa.Column("source", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("recommendations", "source")
    op.drop_column("recommendations", "text")
    op.drop_column("group_reports", "group_insights_source")
    op.drop_column("reports", "ai_comment_source")
