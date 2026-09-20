import { ChartAxes } from "./ChartAxes";
import type { ChartBox } from "./chartScale";
import { DEFAULT_BOX, getNiceMax, scaleY } from "./chartScale";
import { NormLine } from "./NormLine";

import styles from "./Chart.module.css";

export type LineSeries = {
  name: string;
  values: number[];
  tone?: "blue" | "orange" | "gray";
};

type LineChartProps = {
  title: string;
  labels: string[];
  series: LineSeries[];
  unit?: string;
  norms?: { value: number; label: string }[];
  box?: ChartBox;
};

/** Линейный график inline-SVG: точки + полилиния, линии нормативов, ось Y от нуля. */
export function LineChart({ title, labels, series, unit, norms = [], box = DEFAULT_BOX }: LineChartProps) {
  const allValues = series.flatMap((line) => line.values).concat(norms.map((norm) => norm.value));
  const niceMax = getNiceMax(Math.max(...allValues, 0));
  const plotWidth = box.width - box.padLeft - box.padRight;
  const step = labels.length > 1 ? plotWidth / (labels.length - 1) : 0;
  const getX = (index: number) => box.padLeft + (labels.length > 1 ? step * index : plotWidth / 2);
  const baseY = scaleY(0, niceMax, box);
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chart__title}>{title}</figcaption>
      <svg
        viewBox={`0 0 ${box.width} ${box.height}`}
        role="img"
        aria-label={title}
        className={styles.chart__svg}
      >
        <ChartAxes box={box} niceMax={niceMax} unit={unit} />
        {norms.map((norm) => (
          <NormLine key={norm.label} box={box} niceMax={niceMax} value={norm.value} label={norm.label} />
        ))}
        {series.map((line) => (
          <g
            key={line.name}
            className={styles[`chart__series--${line.tone ?? "blue"}`]}
            data-series={line.name}
          >
            <polyline
              className={styles.chart__line}
              points={line.values
                .map((value, index) => `${getX(index)},${scaleY(value, niceMax, box)}`)
                .join(" ")}
            />
            {line.values.map((value, index) => (
              <circle
                key={index}
                className={styles.chart__point}
                data-point={index}
                cx={getX(index)}
                cy={scaleY(value, niceMax, box)}
                r={3.5}
              >
                <title>{`${labels[index]}: ${value}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {labels.map((label, index) => (
          <text
            key={label + index}
            className={styles.chart__label}
            x={getX(index)}
            y={baseY + 14}
            textAnchor="middle"
          >
            {label}
          </text>
        ))}
      </svg>
      {series.length > 1 ? (
        <ul className={styles.chart__legend}>
          {series.map((line) => (
            <li key={line.name} className={styles[`chart__legendItem--${line.tone ?? "blue"}`]}>
              {line.name}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
