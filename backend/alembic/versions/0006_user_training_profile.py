"""Профиль режима обучаемого (фича 008).

Revision ID: 0006_user_training_profile
Revises: 0005_error_map_verdicts

Колонка `users.training_profile` ("operator112" | "dds" | NULL — «не задан»). Data-шаг переводит демо-курсанта
ivanov в чистые специалисты-112, чтобы существующие стенды не требовали пересоздания базы.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0006_user_training_profile"
down_revision = "0005_error_map_verdicts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("training_profile", sa.String(length=16), nullable=True))
    op.execute(
        "UPDATE users SET training_profile = 'operator112', service = 'ЦОВ системы-112' WHERE login = 'ivanov'"
    )


def downgrade() -> None:
    # Службу ivanov не восстанавливаем: прежнее значение берётся из сидов при следующей загрузке.
    with op.batch_alter_table("users") as batch:
        batch.drop_column("training_profile")
