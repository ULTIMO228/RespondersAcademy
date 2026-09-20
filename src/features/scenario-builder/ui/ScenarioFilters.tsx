"use client";

import { Button, Select } from "@/shared/ui";

import {
  DIFFICULTY_LEVELS,
  SCENARIO_SOURCES,
  SOURCE_TITLES,
  VALIDATION_STATUS_VIEW,
  VALIDATION_STATUSES,
} from "../config/dictionaries";
import type { ScenarioFilterState } from "../model/types";
import { CategoryMultiSelect } from "./CategoryMultiSelect";

import styles from "./ScenarioCatalog.module.css";

type ScenarioFiltersProps = {
  filter: ScenarioFilterState;
  incidentGroups: string[];
  onChange: (filter: ScenarioFilterState) => void;
  onReset: () => void;
};

/** Фильтры списка сценариев (spec/04-pages/11 «Список»). */
export function ScenarioFilters({ filter, incidentGroups, onChange, onReset }: ScenarioFiltersProps) {
  return (
    <div className={styles.catalog__filters} role="search" aria-label="Фильтры сценариев">
      <CategoryMultiSelect
        label="Категория событий (группы ЕКП)"
        options={incidentGroups}
        selected={filter.categories}
        onChange={(categories) => onChange({ ...filter, categories })}
      />
      <Select
        label="Сложность"
        placeholder="1–5"
        value={filter.difficulty}
        onChange={(event) => onChange({ ...filter, difficulty: event.target.value })}
        options={DIFFICULTY_LEVELS.map((level) => ({ value: String(level), label: String(level) }))}
      />
      <Select
        label="Источник"
        placeholder="все"
        value={filter.source}
        onChange={(event) => onChange({ ...filter, source: event.target.value })}
        options={SCENARIO_SOURCES.map((source) => ({ value: source, label: SOURCE_TITLES[source] }))}
      />
      <Select
        label="Статус валидации"
        placeholder="все"
        value={filter.status}
        onChange={(event) => onChange({ ...filter, status: event.target.value })}
        options={VALIDATION_STATUSES.map((status) => ({
          value: status,
          label: VALIDATION_STATUS_VIEW[status].title,
        }))}
      />
      <Button variant="secondary" size="sm" onClick={onReset}>
        сбросить
      </Button>
    </div>
  );
}
