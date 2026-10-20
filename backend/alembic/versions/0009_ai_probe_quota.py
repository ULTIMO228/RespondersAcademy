"""Отдельный persisted счётчик облачных проб (фича 006, T039).

Revision ID: 0009_ai_probe_quota
Revises: 0008_report_ai_sources
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0009_ai_probe_quota"
down_revision = "0008_report_ai_sources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_health", sa.Column("probe_calls_today", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("ai_health", "probe_calls_today")
