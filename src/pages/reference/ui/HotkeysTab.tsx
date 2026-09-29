import { Card, DataTable, EmptyState, Tag } from "@/shared/ui/platform";

import { HOTKEY_ACTIVITY_TITLES, HOTKEY_SECTIONS } from "../config/hotkeys";
import { HOTKEYS_ANCHOR } from "../config/materials";
import { filterHotkeys } from "../lib/search";
import styles from "./Reference.module.css";

/**
 * «Горячие клавиши АРМ-112» — 5 таблиц п. 3.17 с пометками активности в тренажёре (общие и режим просмотра активны;
 * режим создания и окно связи — справочно; T2.3-19). Содержимое перенесено из прежней страницы справки.
 */
export function HotkeysTab({ query }: { query: string }) {
  const sections = filterHotkeys(HOTKEY_SECTIONS, query);
  if (sections.length === 0) {
    return (
      <Card>
        <EmptyState title="Комбинации не найдены" text="Измените запрос." />
      </Card>
    );
  }
  return (
    <div id={HOTKEYS_ANCHOR}>
      <Card title="Горячие клавиши АРМ-112">
        <p className={styles.hotkeys__intro}>
          В ДДС-режиме тренажёра действуют общие комбинации и комбинации режима просмотра. Комбинации режима
          создания показываются только в подсказках по зажатому Alt.
        </p>
        {sections.map((section) => (
          <section
            key={section.id}
            className={styles.hotkeys__section}
            aria-labelledby={`hotkeys-${section.id}`}
            data-activity={section.activity}
          >
            <h3 id={`hotkeys-${section.id}`} className={styles.hotkeys__title}>
              {section.title}:
            </h3>
            <p className={styles.hotkeys__activity}>
              <Tag tone={section.activity === "active" ? "success" : "neutral"}>
                {HOTKEY_ACTIVITY_TITLES[section.activity]}
              </Tag>
            </p>
            <DataTable
              caption={section.title}
              rows={section.rows}
              getRowKey={(row) => row.keys + row.action}
              columns={[
                {
                  key: "keys",
                  title: "Комбинация",
                  render: (row) => <kbd className={styles.kbd}>{row.keys}</kbd>,
                },
                {
                  key: "action",
                  title: "Действие",
                  render: (row) => (
                    <>
                      {row.action}
                      {row.note ? <span className={styles.muted}> ({row.note})</span> : null}
                    </>
                  ),
                },
              ]}
            />
          </section>
        ))}
      </Card>
    </div>
  );
}
