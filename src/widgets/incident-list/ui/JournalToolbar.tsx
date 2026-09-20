import type { ReactNode } from "react";

import { ArmIcon } from "@/shared/ui";

import { ADVANCED_SEARCH_ID } from "../config/journalOptions";
import styles from "./JournalToolbar.module.css";

type JournalToolbarProps = {
  isAdvancedOpen: boolean;
  onToggleAdvanced: () => void;
  /** Лупа «Найти» — применить поля расширенного поиска. */
  onSearch: () => void;
  onReset: () => void;
  /** Тёмный блок даты/часов справа. */
  aside: ReactNode;
  /** Разворачиваемая форма «расширенный по параметрам». */
  children?: ReactNode;
};

const SEARCH_ICON_WIDTH = 48;
const SEARCH_ICON_HEIGHT = 44;
const CHEVRON_SIZE = 17;

/** Верхняя панель «Поиск происшествий» (светлая #ebecec) + тёмный блок справа (ДДС_image2–5). */
export function JournalToolbar({
  isAdvancedOpen,
  onToggleAdvanced,
  onSearch,
  onReset,
  aside,
  children,
}: JournalToolbarProps) {
  return (
    <section className={styles.toolbar} aria-label="Поиск происшествий">
      <div className={styles.toolbar__search}>
        <div className={styles["toolbar__title-row"]}>
          <h1 className={styles.toolbar__title}>Поиск происшествий</h1>
          <button
            type="button"
            className={styles["toolbar__search-button"]}
            aria-label="Найти"
            title="Найти (Enter)"
            onClick={onSearch}
          >
            <ArmIcon name="search" width={SEARCH_ICON_WIDTH} height={SEARCH_ICON_HEIGHT} />
          </button>
        </div>
        <div className={styles.toolbar__actions}>
          <button
            type="button"
            className={styles.toolbar__advanced}
            aria-expanded={isAdvancedOpen}
            aria-controls={ADVANCED_SEARCH_ID}
            onClick={onToggleAdvanced}
          >
            расширенный по параметрам
            <ArmIcon
              name="advanced-chevron"
              size={CHEVRON_SIZE}
              className={isAdvancedOpen ? styles["toolbar__chevron--open"] : undefined}
            />
          </button>
          <button
            type="button"
            className={styles.toolbar__reset}
            title="Сбросить фильтры и выдачу"
            onClick={onReset}
          >
            сбросить
          </button>
        </div>
        {children}
      </div>
      {aside}
    </section>
  );
}
