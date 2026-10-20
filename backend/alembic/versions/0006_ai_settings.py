"""Настройки языковой модели и её здоровье (фича 006).

Revision ID: 0006_ai_settings
Revises: 0005_error_map_verdicts

Две таблицы по одной строке (id=1): `ai_settings` (источник и Fernet-шифртекст ключа облака; `source='cloud'`
допустим только при непустом шифртексте — CHECK) и `ai_health` (последний исход вызова, суточные счётчики).
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0006_ai_settings"
down_revision = "0005_error_map_verdicts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=8), server_default="local", nullable=False),
        sa.Column("cloud_key_cipher", sa.Text(), nullable=True),
        sa.Column("cloud_key_last4", sa.String(length=4), nullable=True),
        sa.Column("updated_by", sa.String(length=16), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_ai_settings_single_row"),
        sa.CheckConstraint("source IN ('local', 'cloud')", name="ck_ai_settings_source"),
        sa.CheckConstraint(
            "source <> 'cloud' OR (cloud_key_cipher IS NOT NULL AND cloud_key_cipher <> '')",
            name="ck_ai_settings_cloud_needs_key",
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "ai_health",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("active_source", sa.String(length=8), nullable=False),
        sa.Column("served_by_last", sa.String(length=8), nullable=True),
        sa.Column("last_ok_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_reason", sa.String(length=32), nullable=True),
        sa.Column("errors_today", sa.Integer(), server_default="0", nullable=False),
        sa.Column("calls_today", sa.Integer(), server_default="0", nullable=False),
        sa.Column("day", sa.Date(), nullable=True),
        sa.CheckConstraint("id = 1", name="ck_ai_health_single_row"),
        sa.CheckConstraint("active_source IN ('local', 'cloud')", name="ck_ai_health_active_source"),
        sa.CheckConstraint(
            "served_by_last IS NULL OR served_by_last IN ('cloud', 'local', 'template')", name="ck_ai_health_served_by"
        ),
        sa.CheckConstraint(
            "last_error_reason IS NULL OR last_error_reason IN ('invalid_key', 'insufficient_funds', 'rate_limited', "
            "'daily_limit', 'timeout', 'network', 'wrong_route', 'bad_response', 'local_down')",
            name="ck_ai_health_reason",
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("ai_health")
    op.drop_table("ai_settings")
