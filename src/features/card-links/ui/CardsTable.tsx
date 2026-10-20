import type { ReactNode } from "react";

import type { Journal112Row } from "@/shared/api";
import { ArmIcon } from "@/shared/ui";

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
                <td>
                  <ArmIcon name="row-bookmark" size={14} label={primary ? "главная карточка" : "связь"} />
                </td>
                <td>{row.chs ? <ArmIcon name="row-important" size={14} label="ЧС" /> : null}</td>
                <td className={styles.operator}>{row.operator}</td>
                <td>{row.arm}</td>
                <td>{row.number}</td>
                <td>{date}</td>
                <td className={styles.time}>{time}</td>
                <td className={styles.what}>{row.whatHappened}</td>
                <td>{row.injured}</td>
                <td>{row.status}</td>
                <td className={styles.address}>{row.address}</td>
                <td>{row.checked ? <ArmIcon name="service-status" size={20} label="проверена" /> : null}</td>
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
