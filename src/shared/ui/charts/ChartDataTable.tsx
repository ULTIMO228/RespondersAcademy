import styles from "./Chart.module.css";

export type ChartTableColumn = {
  title: string;
  values: (number | string)[];
};

type ChartDataTableProps = {
  caption: string;
  labelTitle: string;
  labels: string[];
  columns: ChartTableColumn[];
  /** Видимый дубль под графиком (по умолчанию — только для скринридеров). */
  visible?: boolean;
};

/**
 * Текстовая альтернатива графика (ТЗ §17 «достоверность»): те же значения таблицей.
 * Скринридер читает данные, печать и ч/б вывод остаются информативными.
 */
export function ChartDataTable({
  caption,
  labelTitle,
  labels,
  columns,
  visible = false,
}: ChartDataTableProps) {
  return (
    <table className={visible ? styles.chart__table : "visually-hidden"}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{labelTitle}</th>
          {columns.map((column) => (
            <th key={column.title} scope="col">
              {column.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((label, index) => (
          <tr key={`${label}-${index}`}>
            <th scope="row">{label}</th>
            {columns.map((column) => (
              <td key={column.title}>{column.values[index] ?? "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
