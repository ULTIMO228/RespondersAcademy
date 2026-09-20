"use client";

import type { ReportJournalFilters } from "@/shared/api";
import { Button, Input, Select } from "@/shared/ui";

import type { JournalFilter } from "../model/types";

import styles from "./TeacherReportsPage.module.css";

type JournalFiltersProps = {
  filter: JournalFilter;
  /** Значения списков — из данных журнала преподавателя (без хардкода групп и курсантов). */
  options: ReportJournalFilters;
  onChange: (patch: Partial<JournalFilter>) => void;
  onReset: () => void;
};

function toOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }));
}

/** Фильтры журнала: период, группа, курсант, категория — уходят в query `GET /reports/journal`. */
export function JournalFilters({ filter, options, onChange, onReset }: JournalFiltersProps) {
  return (
    <div className={styles.reports__filters} role="search" aria-label="Фильтры отчётов">
      <Input
        label="Период с"
        type="date"
        value={filter.from}
        onChange={(event) => onChange({ from: event.target.value })}
      />
      <Input
        label="по"
        type="date"
        value={filter.to}
        onChange={(event) => onChange({ to: event.target.value })}
      />
      <Select
        label="Группа"
        placeholder="все"
        value={filter.group}
        onChange={(event) => onChange({ group: event.target.value })}
        options={toOptions(options.groups)}
      />
      <Select
        label="Курсант"
        placeholder="все"
        value={filter.studentId}
        onChange={(event) => onChange({ studentId: event.target.value })}
        options={options.students.map((student) => ({ value: student.id, label: student.fullName }))}
      />
      <Select
        label="Категория"
        placeholder="все"
        value={filter.category}
        onChange={(event) => onChange({ category: event.target.value })}
        options={toOptions(options.categories)}
      />
      <Button variant="secondary" size="sm" onClick={onReset}>
        сбросить
      </Button>
    </div>
  );
}
