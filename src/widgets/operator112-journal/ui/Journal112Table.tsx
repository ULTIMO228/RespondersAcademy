import { ArmIcon, Glyph, Toggle } from "@/shared/ui";
import type { Journal112Row } from "@/shared/api";

import { splitCreatedAt } from "./format";
import styles from "./Journal112Table.module.css";

const COLUMNS = [
  "Связи",
  "ЧС",
  "Опер.",
  "АРМ",
  "Номер",
  "Дата",
  "Время",
  "Что случилось",
  "Постр.",
  "Статус",
  "Адрес",
  "Проверена",
];

type Props = {
  rows: Journal112Row[];
  onOpenRow: (row: Journal112Row) => void;
};

/** Таблица «Список происшествий» журнала 112 (FR-005…FR-007). */
export function Journal112Table({ rows, onOpenRow }: Props) {
  const total = rows.length;
  return (
    <section className={styles.wrap}>
      <div className={styles.bar}>
        <h2 className={styles.heading}>
          Список происшествий <ArmIcon name="section-collapse" size={14} />
        </h2>
        <span className={styles.notify}>
          <ArmIcon name="notification" size={16} /> уведомление
        </span>
        <Toggle label="автообновление" checked tone="dark" disabled />
        <Toggle label="обращения в очереди" checked={false} tone="dark" disabled />
        <span className={styles.show} aria-disabled="true">
          выберите что показывать
        </span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col">
                {c}
                {c === "Дата" ? <ArmIcon name="sort-down" size={14} label="по убыванию" /> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { date, time } = splitCreatedAt(row.createdAt);
            const open = () => onOpenRow(row);
            return (
              <RowFragment key={row.cardId}>
                <tr
                  className={`${styles.row} ${row.queued ? styles.queued : ""}`}
                  data-queued={row.queued ? "true" : undefined}
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") open();
                  }}
                >
                  <td className={styles.links} data-linked={row.linked ? "true" : undefined}>
                    {row.linked ? (
                      <span className={styles.links__chain} role="img" aria-label="связь">
                        <Glyph name="link" size={14} />
                      </span>
                    ) : null}
                    <ArmIcon name="row-reminder" size={14} />
                  </td>
                  <td>{row.chs ? <ArmIcon name="row-important" size={14} label="ЧС" /> : null}</td>
                  <td>{row.operator}</td>
                  <td>{row.arm}</td>
                  <td>{row.number}</td>
                  <td>{date}</td>
                  <td className={styles.time}>{time}</td>
                  <td className={styles.what}>{row.whatHappened}</td>
                  <td>{row.injured}</td>
                  <td className={styles.status}>{row.status}</td>
                  <td className={styles.addr}>{row.address}</td>
                  <td>
                    {row.checked ? <ArmIcon name="service-status" size={20} label="проверена" /> : null}
                  </td>
                </tr>
                {row.description ? (
                  <tr className={styles.desc}>
                    <td colSpan={COLUMNS.length}>Описание: {row.description}</td>
                  </tr>
                ) : null}
              </RowFragment>
            );
          })}
        </tbody>
      </table>
      <div className={styles.footer}>
        <span className={styles.group} aria-disabled="true">
          выберите группу
        </span>
        <span className={styles.pager}>
          Страница: 1 · Записей на странице: 10 · {total === 0 ? "0" : `1–${total}`} из {total}
          <ArmIcon name="pagination-prev" size={14} />
          <ArmIcon name="pagination-next" size={14} />
        </span>
      </div>
    </section>
  );
}

function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
