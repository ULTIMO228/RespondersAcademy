import Link from "next/link";

import { ROUTES } from "@/shared/config";

import { PanelIcon } from "./PanelIcon";

import styles from "./ServicePanel.module.css";

type PanelControlsProps = {
  isExpanded: boolean;
  onExpandToggle: () => void;
  chatUnreadCount: number;
  readOnly: boolean;
};

/** Шеврон второго ряда служб, чат с бейджем-счётчиком и закрытие карточки (ДДС_image6). */
export function PanelControls({ isExpanded, onExpandToggle, chatUnreadCount, readOnly }: PanelControlsProps) {
  const chevronLabel = isExpanded ? "Свернуть доп. службы" : "Развернуть доп. службы";
  return (
    <>
      <button
        type="button"
        className={styles.panel__chevron}
        aria-expanded={isExpanded}
        aria-label={chevronLabel}
        title={chevronLabel}
        onClick={onExpandToggle}
      >
        <PanelIcon name={isExpanded ? "collapse" : "expand"} size={22} />
      </button>
      {readOnly ? null : (
        <div className={styles.panel__right}>
          <button
            type="button"
            className={styles.panel__button}
            aria-label={`Чат, непрочитанных: ${chatUnreadCount}`}
            title="Чат (волна 2)"
          >
            <PanelIcon name="chat" size={24} />
            {chatUnreadCount > 0 ? <span className={styles.panel__badge}>{chatUnreadCount}</span> : null}
          </button>
          <Link
            href={ROUTES.arm}
            className={styles.panel__button}
            aria-label="Закрыть карточку"
            title="Закрыть карточку (Esc)"
          >
            <PanelIcon name="close" size={24} />
          </Link>
        </div>
      )}
    </>
  );
}
