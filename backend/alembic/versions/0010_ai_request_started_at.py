"""Токен владельца pending-запроса сценарного API (фича 006, T046).

Колонка без подстановки значений: строки, созданные до миграции, с `response IS NULL` считаются брошенными
(`ai_scenario_service._is_expired`), завершённые строки остаются с NULL и не участвуют в перехвате.

Revision ID: 0010_ai_request_started_at
Revises: 0009_ai_probe_quota
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0010_ai_request_started_at"
down_revision = "0009_ai_probe_quota"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_scenario_requests", sa.Column("started_at", sa.String(40), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_scenario_requests", "started_at")
