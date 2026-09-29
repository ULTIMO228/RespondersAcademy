"""Widen classifier sign columns for the shipped EKP data.

Revision ID: 0003_widen_classifier_signs
Revises: 0002_ai_auth
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0003_widen_classifier_signs"
down_revision = "0002_ai_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in ("sign1", "sign2", "sign3"):
        op.alter_column(
            "classifier_entries",
            column,
            existing_type=sa.String(length=160),
            type_=sa.String(length=400),
            existing_nullable=False,
        )


def downgrade() -> None:
    for column in ("sign1", "sign2", "sign3"):
        op.alter_column(
            "classifier_entries",
            column,
            existing_type=sa.String(length=400),
            type_=sa.String(length=160),
            existing_nullable=False,
        )
