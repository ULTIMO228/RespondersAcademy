"""Единая модель специализации обучающегося: `users.training_profile` (фича 008/018) → `users.specializations` (007/019).

Revision ID: 0012_specs_from_training_profile
Revises: 0011_merge_sasha_seva

Решение владельца (спека 021): источник истины — список `specializations`. Профиль spec/008 переносится в список из
одного значения (ivanov → ["operator112"], профиль «dds» → ["dds"]); у обучающегося без профиля остаётся значение,
которое уже проставила 0007_user_specializations (или преподаватель/администратор), — данные стенда не теряются.
Затем колонка `training_profile` удаляется. Сиды (`app.seed.load`) задают специализации демо-учёток явно из моков.
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# Не длиннее 32 символов: alembic_version.version_num — VARCHAR(32) (PostgreSQL).
revision = "0012_specs_from_training_profile"
down_revision = "0011_merge_sasha_seva"
branch_labels = None
depends_on = None

PROFILES = ("operator112", "dds")


# Только op.execute с литералами: миграция должна рендериться и офлайн (`alembic upgrade --sql`, PostgreSQL).
# '["dds"]' — та же запись, что пишет SQLAlchemy JSON (json.dumps); в PostgreSQL литерал приводится к JSONB.
def upgrade() -> None:
    for profile in PROFILES:
        op.execute(
            f"UPDATE users SET specializations = '[\"{profile}\"]' "
            f"WHERE role = 'student' AND training_profile = '{profile}'"
        )
    with op.batch_alter_table("users") as batch:
        batch.drop_column("training_profile")


def downgrade() -> None:
    # Обратно переносится только однозначный профиль: одна специализация → профиль, обе → NULL («не задан»).
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("training_profile", sa.String(length=16), nullable=True))
    for profile in PROFILES:
        op.execute(
            f"UPDATE users SET training_profile = '{profile}' "
            f"WHERE role = 'student' AND specializations = '[\"{profile}\"]'"
        )
