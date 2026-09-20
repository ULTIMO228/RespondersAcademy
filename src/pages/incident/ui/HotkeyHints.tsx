import { HOTKEY_GROUPS } from "../config/hotkeys";

import styles from "./IncidentPage.module.css";

/** Подсказки по комбинациям клавиш при зажатом Alt (spec п. 15): неактивные группы — справочно. */
export function HotkeyHints({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) return null;
  return (
    <div className={styles.page__hotkeys} role="dialog" aria-label="Горячие клавиши">
      {HOTKEY_GROUPS.map((group) => (
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
