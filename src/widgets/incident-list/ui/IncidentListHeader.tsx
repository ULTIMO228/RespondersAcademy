import type { ChangeEvent } from "react";

import { ArmIcon, Select, Toggle } from "@/shared/ui";

import { SHOW_OPTIONS } from "../config/journalOptions";
import type { JournalFilter } from "../config/journalOptions";
import type { JournalSession } from "../model/types";
import styles from "./IncidentListHeader.module.css";

type IncidentListHeaderProps = {
  session: JournalSession | null;
  newCount: number;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  filter: JournalFilter;
  onFilterChange: (filter: JournalFilter) => void;
  isAutoUpdate: boolean;
  onAutoUpdateChange: (isEnabled: boolean) => void;
};

const COLLAPSE_ICON_WIDTH = 21;
const COLLAPSE_ICON_HEIGHT = 22;
const NOTIFICATION_ICON_WIDTH = 31;
const NOTIFICATION_ICON_HEIGHT = 29;

/** Заголовок «Список происшествий» и управление лентой (ДДС_image4, p12_Image66) + тренажёрные бейджи. */
export function IncidentListHeader(props: IncidentListHeaderProps) {
  const { session, newCount, isCollapsed, onToggleCollapsed, filter, onFilterChange } = props;

  function handleFilterChange(event: ChangeEvent<HTMLSelectElement>) {
    onFilterChange(event.target.value as JournalFilter);
  }

  return (
    <header className={styles["list-header"]}>
      <h2 className={styles["list-header__title"]} id="incident-list-title">
        Список происшествий
        <button
          type="button"
          className={styles["list-header__collapse"]}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Развернуть список" : "Свернуть список"}
          onClick={onToggleCollapsed}
        >
          <ArmIcon
            name="section-collapse"
            width={COLLAPSE_ICON_WIDTH}
            height={COLLAPSE_ICON_HEIGHT}
            className={isCollapsed ? styles["list-header__chevron--collapsed"] : undefined}
          />
        </button>
      </h2>
      <div className={styles["list-header__controls"]}>
        {session ? (
          <span className={styles["list-header__session"]} title="Активное занятие">
            занятие: {session.title}
            <span className={styles["list-header__session-time"]}>осталось {session.remaining}</span>
          </span>
        ) : null}
        <span className={styles["list-header__new"]} title="Новые неоткрытые карточки">
          новые карточки
          <span className={styles["list-header__new-count"]}>{newCount}</span>
        </span>
        <button type="button" className={styles["list-header__notification"]}>
          <ArmIcon name="notification" width={NOTIFICATION_ICON_WIDTH} height={NOTIFICATION_ICON_HEIGHT} />
          уведомления
        </button>
        <span className={styles["list-header__toggle"]}>
          <Toggle
            label="Автообновление"
            tone="dark"
            checked={props.isAutoUpdate}
            onChange={props.onAutoUpdateChange}
          />
        </span>
        <Select
          aria-label="выберите что показать"
          tone="dark"
          className={styles["list-header__select"]}
          placeholder="выберите что показать"
          options={SHOW_OPTIONS}
          value={filter}
          onChange={handleFilterChange}
        />
      </div>
    </header>
  );
}
