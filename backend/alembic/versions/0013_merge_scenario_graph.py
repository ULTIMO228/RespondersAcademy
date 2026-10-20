"""Слияние веток миграций: итоговая база (SASHA + fix, F5) и конструктор сценариев с графом (спека 015).

Revision ID: 0013_merge_scenario_graph
Revises: 0012_specs_from_training_profile, 0009_scenario_run_result

Схему не меняет: ветка графов (0006_scenario_builder → 0009_scenario_run_result) добавляет только новые nullable-колонки
(`users.permissions`, `ai_scenario_versions.graph|reviewed_by|review_comment`) и таблицу `ai_scenario_runs`; с колонками
и таблицами ветки F5 (`users.specializations`, `ai_settings`, `ai_health`, `problem_reports` и др.) она не пересекается.
"""

from __future__ import annotations

revision = "0013_merge_scenario_graph"
# ПОДСТАВИТЬ: голова после F5 (например, "0011_merge_sasha_seva" или "0012_…" с переносом данных специализаций).
down_revision = ("0012_specs_from_training_profile", "0009_scenario_run_result")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
