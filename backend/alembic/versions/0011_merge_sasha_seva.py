"""Слияние веток миграций SASHA и seva (фича 021).

Revision ID: 0011_merge_sasha_seva
Revises: 0007_problem_reports, 0010_ai_request_started_at

Пустая merge-ревизия: обе ветки отходят от 0005_error_map_verdicts и меняют разные таблицы. Цепочки не перешиваются,
чтобы базы, созданные на любой из исходных веток, обновлялись `upgrade head` без пересоздания (spec/021, research R3).
"""

from __future__ import annotations

revision = "0011_merge_sasha_seva"
down_revision = ("0007_problem_reports", "0010_ai_request_started_at")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
