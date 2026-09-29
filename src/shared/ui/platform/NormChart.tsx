import styles from "./NormChart.module.css";

export type NormChartProps = {
  title: string;
  /** Подписи по оси X (номера попыток или даты). */
  labels: string[];
  values: number[];
  /** Линия | столбцы: динамика баллов — линия, реакция и отработка — столбцы. */
  kind?: "line" | "bar";
  /** Название ряда в легенде и в таблице-дублёре. */
  seriesName: string;
  unit?: string;
  /** Норматив/порог: пунктирная красная линия с подписью. */
  norm?: { value: number; label: string };
  tone?: "score" | "reaction";
  /** Таблица-дублёр раскрыта сразу (для печати и скринридеров она всегда в разметке). */
  tableOpen?: boolean;
};

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { left: 44, right: 16, top: 16, bottom: 30 };
const GRID_STEPS = 4;

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude / 2) * 2 * magnitude;
}

/**
 * График платформы: линия или столбцы + линия норматива, у каждого — текстовая таблица-дублёр (ТЗ §17, WCAG 1.1.1).
 * Цвета серий берутся из --pf-chart-*; норматив всегда красный пунктир с подписью (цвет не единственный носитель).
 */
export function NormChart({
  title,
  labels,
  values,
  kind = "line",
  seriesName,
  unit,
  norm,
  tone = "score",
  tableOpen = false,
}: NormChartProps) {
  const max = niceMax(Math.max(...values, norm?.value ?? 0));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const slot = values.length > 0 ? plotW / values.length : plotW;
  const x = (index: number) => PAD.left + slot * index + slot / 2;
  const gridValues = Array.from({ length: GRID_STEPS + 1 }, (_, index) => (max / GRID_STEPS) * index);
  const swatch = tone === "reaction" ? styles["chart__swatch--reaction"] : "";
  return (
    <figure className={styles.chart}>
      <ul className={styles.chart__legend}>
        <li>
          <span className={[styles.chart__swatch, swatch].filter(Boolean).join(" ")} />
          {seriesName}
          {unit ? `, ${unit}` : ""}
        </li>
        {norm ? (
          <li>
            <span className={[styles.chart__swatch, styles["chart__swatch--norm"]].join(" ")} />
            {norm.label}
          </li>
        ) : null}
      </ul>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={styles.chart__svg} role="img" aria-label={title}>
        {gridValues.map((value) => (
          <g key={value}>
            <line
              className={styles.chart__grid}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
            />
            <text className={styles.chart__text} x={PAD.left - 8} y={y(value) + 4} textAnchor="end">
              {Math.round(value)}
            </text>
          </g>
        ))}
        {norm ? (
          <g data-norm={norm.value}>
            <line
              className={styles.chart__norm}
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(norm.value)}
              y2={y(norm.value)}
            />
            <text
              className={styles.chart__normLabel}
              x={WIDTH - PAD.right}
              y={y(norm.value) - 6}
              textAnchor="end"
            >
              {norm.label}
            </text>
          </g>
        ) : null}
        {kind === "line" ? (
          <>
            <polyline
              className={styles.chart__line}
              points={values.map((value, index) => `${x(index)},${y(value)}`).join(" ")}
            />
            {values.map((value, index) => (
              <circle key={index} className={styles.chart__point} cx={x(index)} cy={y(value)} r={4.5}>
                <title>{`${labels[index]}: ${value}`}</title>
              </circle>
            ))}
          </>
        ) : (
          values.map((value, index) => (
            <rect
              key={index}
              className={[styles.chart__bar, tone === "reaction" ? styles["chart__bar--reaction"] : ""]
                .filter(Boolean)
                .join(" ")}
              x={x(index) - Math.min(18, slot / 3)}
              y={y(value)}
              width={Math.min(36, (slot * 2) / 3)}
              height={y(0) - y(value)}
              rx={3}
            >
              <title>{`${labels[index]}: ${value}`}</title>
            </rect>
          ))
        )}
        {labels.map((label, index) => (
          <text
            key={`${label}-${index}`}
            className={styles.chart__text}
            x={x(index)}
            y={HEIGHT - 8}
            textAnchor="middle"
          >
            {label}
          </text>
        ))}
      </svg>
      <details className={styles.chart__details} open={tableOpen}>
        <summary className={styles.chart__summary}>Данные графика (таблица)</summary>
        <table className={styles.chart__table}>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Попытка</th>
              {labels.map((label, index) => (
                <th key={`${label}-${index}`} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{seriesName}</th>
              {values.map((value, index) => (
                <td key={index}>{value}</td>
              ))}
            </tr>
            {norm ? (
              <tr>
                <th scope="row">{norm.label}</th>
                {values.map((_, index) => (
                  <td key={index}>{norm.value}</td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
