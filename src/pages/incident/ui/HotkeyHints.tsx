import { HOTKEY_GROUPS } from "../config/hotkeys";

import styles from "./IncidentPage.module.css";

/** Подсказки по комбинациям клавиш при зажатом Alt (spec п. 15). */
export function HotkeyHints({
  isVisible,
  isDdsLearner = false,
}: {
  isVisible: boolean;
  isDdsLearner?: boolean;
}) {
  if (!isVisible) return null;
  const groups = isDdsLearner
    ? HOTKEY_GROUPS.filter((group) => group.isActive).map((group) =>
        group.title === "Режим просмотра"
          ? { ...group, rows: group.rows.filter((row) => row.keys === "Shift+F1") }
          : group,
      )
    : HOTKEY_GROUPS;
  return (
    <div className={styles.page__hotkeys} role="dialog" aria-label="Горячие клавиши">
      {groups.map((group) => (
        <section key={group.title} className={styles["page__hotkey-group"]} data-active={group.isActive}>
          <h2 className={styles["page__hotkey-title"]}>
            {group.title}
            {group.isActive ? "" : " — справочно"}
          </h2>
          <dl className={styles["page__hotkey-list"]}>
            {group.rows.map((row) => (
              <div key={`${group.title}-${row.keys}`} className={styles["page__hotkey-row"]}>
                <dt>{row.keys}</dt>
                <dd>{row.action}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
