import type { ReactNode } from "react";

import { PfIcon } from "./PfIcon";
import styles from "./data.module.css";

export type DataColumn<TRow> = {
  key: string;
  title: ReactNode;
  render: (row: TRow) => ReactNode;
  /** Числовой столбец: выравнивание вправо и tabular-nums. */
  numeric?: boolean;
};

type DataTableProps<TRow> = {
  columns: DataColumn<TRow>[];
  rows: TRow[];
  getRowKey: (row: TRow) => string;
  /** Подпись таблицы для скринридера. */
  caption: string;
  emptyText?: string;
};

/** Спокойная таблица платформы: зебра, шапка на подложке, числа с tabular-nums. */
export function DataTable<TRow>({
  columns,
  rows,
  getRowKey,
  caption,
  emptyText = "Нет данных",
}: DataTableProps<TRow>) {
  return (
    <table className={styles.table}>
      <caption className={styles.table__caption}>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={[styles.table__head, column.numeric ? styles["table__cell--num"] : ""]
                .filter(Boolean)
                .join(" ")}
            >
              {column.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className={styles.table__empty} colSpan={columns.length}>
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={getRowKey(row)} className={styles.table__row}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={[styles.table__cell, column.numeric ? styles["table__cell--num"] : ""]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

type PaginationProps = {
  page: number;
  perPage: number;
  total: number;
  onChange: (page: number) => void;
};

function pageWindow(page: number, pages: number): number[] {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const end = Math.min(pages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

/** Постраничный переход: диапазон записей и окно из пяти страниц. */
export function Pagination({ page, perPage, total, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return (
    <nav className={styles.pager} aria-label="Страницы">
      <span>
        Записи {from}–{to} из {total}
      </span>
      <div className={styles.pager__pages}>
        <button
          type="button"
          className={styles.pager__page}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Предыдущая страница"
        >
          <PfIcon name="chevronLeft" size={16} />
        </button>
        {pageWindow(page, pages).map((value) => (
          <button
            key={value}
            type="button"
            className={styles.pager__page}
            aria-current={value === page ? "page" : undefined}
            onClick={() => value !== page && onChange(value)}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          className={styles.pager__page}
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Следующая страница"
        >
          <PfIcon name="chevronRight" size={16} />
        </button>
      </div>
    </nav>
  );
}
