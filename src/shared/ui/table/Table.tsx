import type { ReactNode } from "react";

import styles from "./Table.module.css";

export type TableColumn<TRow> = {
  key: string;
  title: ReactNode;
  render: (row: TRow) => ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
};

type TableProps<TRow> = {
  columns: TableColumn<TRow>[];
  rows: TRow[];
  getRowKey: (row: TRow) => string;
  caption?: string;
  emptyText?: string;
  getRowClassName?: (row: TRow) => string | undefined;
};

/** Плотная таблица на всю ширину (светлая тема ПОВ-112): 13 px, строки ~30 px. */
export function Table<TRow>({
  columns,
  rows,
  getRowKey,
  caption,
  emptyText = "Нет данных",
  getRowClassName,
}: TableProps<TRow>) {
  return (
    <table className={styles.table}>
      {caption ? <caption className="visually-hidden">{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" style={{ width: column.width, textAlign: column.align }}>
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
            <tr key={getRowKey(row)} className={getRowClassName?.(row)}>
              {columns.map((column) => (
                <td key={column.key} style={{ textAlign: column.align }}>
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
