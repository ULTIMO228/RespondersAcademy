import type { ReactNode } from "react";

import type { Journal112Row } from "@/shared/api";
import { ArmIcon, Glyph } from "@/shared/ui";

import { splitCreatedAt } from "../model/format";

import styles from "./CardsTable.module.css";

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

export type CardsTableRow = {
  row: Journal112Row;
  /** Главная карточка связи: строка выделена синим. */
  primary?: boolean;
  /** Кнопки справа от строки («привязать», «отвязать», «сделать главной»). */
  actions?: ReactNode;
};

type CardsTableProps = {
  rows: readonly CardsTableRow[];
  label: string;
};

/** Таблица карточек в колонках журнала 112 с подстрокой «Описание:» (ИНСТРУКЦИЯ_image62, 64–68). */
export function CardsTable({ rows, label }: CardsTableProps) {
  return (
    <table className={styles.table} aria-label={label}>
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
          <th scope="col" aria-label="Действия" />
        </tr>
      </thead>
      <tbody>
        {rows.map(({ row, primary = false, actions }) => {
          const { date, time } = splitCreatedAt(row.createdAt);
          return (
            <FragmentRow key={row.cardId}>
              <tr className={styles.row} data-primary={primary} data-card-id={row.cardId}>
                <td className={styles.cells}>
                  <span className={styles.cell} aria-hidden="true">
                    <Glyph name="chevronDown" size={16} />
                  </span>
                  <span
                    className={`${styles.cell} ${row.linked || primary ? styles.linked : ""}`}
                    role="img"
                    aria-label={primary ? "главная карточка" : "связь"}
                  >
                    {row.linked || primary ? (
                      <Glyph name="link" size={14} />
                    ) : (
                      <ArmIcon name="row-bookmark" size={14} />
                    )}
                  </span>
                </td>
                <td className={styles.cells}>
                  <span className={styles.cell} data-on={row.chs ? "true" : undefined}>
                    <ArmIcon name="row-important" size={14} label={row.chs ? "ЧС" : undefined} />
                  </span>
                  <span className={styles.cell} aria-hidden="true">
                    <ArmIcon name="row-reminder" size={14} />
                  </span>
                </td>
                <td className={styles.operator}>{row.operator}</td>
                <td>{row.arm}</td>
                <td>{row.number}</td>
                <td>{date}</td>
                <td className={styles.time}>{time}</td>
                <td className={styles.what}>{row.whatHappened}</td>
                <td>{row.injured}</td>
                <td>{row.status}</td>
                <td className={styles.address}>{row.address}</td>
                <td className={styles.checked} data-on={row.checked ? "true" : undefined}>
                  <span role="img" aria-label={row.checked ? "проверена" : "не проверена"}>
                    <Glyph name="checkCircle" size={22} />
                  </span>
                </td>
                <td className={styles.actions}>{actions}</td>
              </tr>
              <tr className={styles.desc}>
                <td colSpan={COLUMNS.length + 1}>Описание: {row.description}</td>
              </tr>
            </FragmentRow>
          );
        })}
      </tbody>
    </table>
  );
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
