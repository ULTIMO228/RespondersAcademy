import { useState } from "react";
import type { ReactNode } from "react";

import { Chip } from "@/shared/ui";

import type { ChoiceOption } from "../model/types";
import styles from "./AdvancedSearch.module.css";

type MultiChipFieldProps = {
  label: string;
  options: ChoiceOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Сколько чипов видно в свёрнутом виде (длинные справочники — «ещё N»). */
  collapsedLimit?: number;
  className?: string;
  /** Пометка об ограничении мок-данных под полем. */
  note?: ReactNode;
};

/** Множественный выбор чипами (памятка стр. 35–40): можно отметить несколько значений (OR внутри поля). */
export function MultiChipField(props: MultiChipFieldProps) {
  const { label, options, selected, onChange, collapsedLimit, className, note } = props;
  const [isAllShown, setIsAllShown] = useState(false);
  const limit = collapsedLimit && !isAllShown ? collapsedLimit : options.length;
  const hiddenCount = options.length - limit;

  function handleToggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  return (
    <fieldset className={[styles["advanced-search__field"], className].filter(Boolean).join(" ")}>
      <legend className={styles["advanced-search__label"]}>{label}</legend>
      <div className={styles["advanced-search__chips"]}>
        {options.slice(0, limit).map((option) => (
          <Chip
            key={option.value}
            selected={selected.includes(option.value)}
            className={styles["advanced-search__chip"]}
            onClick={() => handleToggle(option.value)}
          >
            {option.label}
          </Chip>
        ))}
        {hiddenCount > 0 ? (
          <button
            type="button"
            className={styles["advanced-search__more"]}
            onClick={() => setIsAllShown(true)}
          >
            ещё {hiddenCount}
          </button>
        ) : null}
      </div>
      {note ? <p className={styles["advanced-search__note"]}>{note}</p> : null}
    </fieldset>
  );
}
