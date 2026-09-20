import { ERROR_COLUMNS } from "../config/charts";
import { getHeatLevel, hasAnyError } from "../lib/buildChartData";
import type { HeatRow } from "../lib/buildChartData";

import styles from "./ReportCharts.module.css";

type ErrorHeatmapProps = {
  rows: HeatRow[];
  criteria?: { labels: string[]; values: number[] };
};

/** «Тепловая карта ошибок» — таблица курсант × тип ошибки; значения подписаны числом (не только цветом). */
export function ErrorHeatmap({ rows, criteria }: ErrorHeatmapProps) {
  if (!hasAnyError(rows)) {
    return (
      <p className={styles.charts__empty} role="status">
        Ошибок по полям карточки и типам не зафиксировано — тепловая карта пуста.
      </p>
    );
  }
  return (
    <div className={styles.charts__heatmap}>
      <table className={styles.charts__heatTable} aria-label="Тепловая карта ошибок по типам">
        <thead>
          <tr>
            <th scope="col">Курсант</th>
            {ERROR_COLUMNS.map((column) => (
              <th key={column.key} scope="col">
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              {row.cells.map((cell) => (
                <td
                  key={cell.key}
                  className={styles[`charts__heat--${cell.level}`]}
                  data-heat-cell={cell.value}
                >
                  {cell.value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {criteria ? (
        <table className={styles.charts__heatTable} aria-label="Ошибки группы по критериям оценки">
          <thead>
            <tr>
              <th scope="col">Группа</th>
              {criteria.labels.map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Ошибок по критериям</th>
              {criteria.values.map((value, index) => (
                <td key={criteria.labels[index]} className={styles[`charts__heat--${getHeatLevel(value)}`]}>
                  {value}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ) : null}
      <p className={styles.charts__legend}>
        Шкала: <span className={styles["charts__heat--0"]}>0</span>
        <span className={styles["charts__heat--1"]}>1</span>
        <span className={styles["charts__heat--2"]}>2</span>
        <span className={styles["charts__heat--3"]}>3+</span>
      </p>
    </div>
  );
}
