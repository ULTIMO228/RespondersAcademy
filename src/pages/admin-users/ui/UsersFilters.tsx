"use client";

import { Button, Input, Select } from "@/shared/ui";
import type { SelectOption } from "@/shared/ui";

import { STATE_OPTIONS } from "../config/usersTable";
import type { UsersFilters as UsersFiltersState } from "../model/filters";
import type { RoleOption } from "../model/types";

import styles from "./UsersTable.module.css";

type UsersFiltersProps = {
  filters: UsersFiltersState;
  roleOptions: RoleOption[];
  groups: string[];
  /** «Показано N из M» — счётчик реестра. */
  shownCount: number;
  totalCount: number;
  onChange: (patch: Partial<UsersFiltersState>) => void;
  onCreate: () => void;
};

/**
 * Панель фильтров реестра (T4.1-06): роль (3 фиксированных значения), состояние, группа и поиск
 * по ФИО/логину с дебаунсом. Значения фильтров уходят в query адресной строки — ссылка шарится.
 */
export function UsersFilters({
  filters,
  roleOptions,
  groups,
  shownCount,
  totalCount,
  onChange,
  onCreate,
}: UsersFiltersProps) {
  const groupOptions: SelectOption[] = groups.map((group) => ({ value: group, label: group }));

  return (
    <div className={styles.registry__toolbar}>
      <Input
        label="Поиск по ФИО / логину"
        placeholder="введите"
        className={styles.registry__search}
        value={filters.query}
        onChange={(event) => onChange({ query: event.target.value })}
      />
      <Select
        label="Роль"
        options={roleOptions}
        placeholder="все роли"
        value={filters.role}
        onChange={(event) => onChange({ role: event.target.value })}
      />
      <Select
        label="Состояние"
        options={STATE_OPTIONS}
        placeholder="все"
        value={filters.state}
        onChange={(event) => onChange({ state: event.target.value })}
      />
      <Select
        label="Группа"
        options={groupOptions}
        placeholder="все группы"
        value={filters.group}
        onChange={(event) => onChange({ group: event.target.value })}
      />
      <span className={styles.registry__count}>
        Показано {shownCount} из {totalCount}
      </span>
      <Button variant="primary" size="lg" onClick={onCreate}>
        Создать учётную запись
      </Button>
    </div>
  );
}
