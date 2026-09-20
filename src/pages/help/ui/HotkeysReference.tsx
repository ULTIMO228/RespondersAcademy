import { Panel } from "@/shared/ui";

import { HOTKEY_ACTIVITY_TITLES, HOTKEY_SECTIONS } from "../config/hotkeys";
import { HOTKEYS_ANCHOR } from "../config/materials";

import styles from "./HelpPage.module.css";

/**
 * Встроенная страница справки «Горячие клавиши АРМ-112» — 5 таблиц п. 3.17 с пометками активности
 * в тренажёре (общие + режим просмотра — активны, режим создания и окно связи — справочно; T2.3-19).
 */
export function HotkeysReference() {
  return (
    <Panel id={HOTKEYS_ANCHOR} title="Горячие клавиши АРМ-112" headerTone="dark" className={styles.hotkeys}>
      <p className={styles.hotkeys__intro}>
        В ДДС-режиме тренажёра действуют общие комбинации и комбинации режима просмотра. Комбинации режима
        создания показываются только в подсказках по зажатому Alt.
      </p>
      {HOTKEY_SECTIONS.map((section) => (
        <section
          key={section.id}
          className={styles.hotkeys__section}
          aria-labelledby={`hotkeys-${section.id}`}
          data-activity={section.activity}
        >
          <h3 id={`hotkeys-${section.id}`} className={styles.hotkeys__title}>
            {section.title}:
          </h3>
          <p
            className={[styles.hotkeys__activity, styles[`hotkeys__activity--${section.activity}`]].join(" ")}
          >
            {HOTKEY_ACTIVITY_TITLES[section.activity]}
          </p>
          <table className={styles.hotkeys__table}>
            <thead>
              <tr>
                <th scope="col">Комбинация</th>
                <th scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.keys + row.action}>
                  <td className={styles.hotkeys__keys}>
                    <kbd>{row.keys}</kbd>
                  </td>
                  <td>
                    {row.action}
                    {row.note ? <span className={styles.hotkeys__note}> ({row.note})</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </Panel>
  );
}
