import type { ErrorMapGroup } from "@/shared/api";
import { SegmentedControl, SelectField } from "@/shared/ui/platform";

import { ERROR_MAP_MODE_OPTIONS, ERROR_MAP_PERIOD_OPTIONS, type ErrorMapFilters } from "../model/query";
import styles from "./ErrorMap.module.css";

export interface FiltersProps {
  groups: ErrorMapGroup[];
  value: ErrorMapFilters;
  onChange: (next: ErrorMapFilters) => void;
  /** false — страница обучающегося: группа не выбирается (её имя и ссылку показывает страница), остаются период и режим. */
  showGroup?: boolean;
}

/** Три фильтра: группа, период, режим (на карте обучающегося группа скрыта). Состояние — снаружи (query-параметры URL читает страница). */
export function Filters({ groups, value, onChange, showGroup = true }: FiltersProps) {
  return (
    <div className={styles.filters}>
      {showGroup ? (
        <SelectField
          label="Группа"
          value={value.groupId}
          onChange={(event) => onChange({ ...value, groupId: event.target.value })}
        >
          {value.groupId === "" ? <option value="">Выберите группу</option> : null}
          {groups.map((group) => (
            <option key={group.groupId} value={group.groupId}>
              {group.title}
            </option>
          ))}
        </SelectField>
      ) : null}
      <div className={styles.filters__group}>
        <span className={styles.filters__label}>Период</span>
        <SegmentedControl
          label="Период"
          options={ERROR_MAP_PERIOD_OPTIONS}
          value={value.period}
          onChange={(period) => onChange({ ...value, period })}
        />
      </div>
      <div className={styles.filters__group}>
        <span className={styles.filters__label}>Режим</span>
        <SegmentedControl
          label="Режим"
          options={ERROR_MAP_MODE_OPTIONS}
          value={value.mode}
          onChange={(mode) => onChange({ ...value, mode })}
        />
      </div>
    </div>
  );
}
