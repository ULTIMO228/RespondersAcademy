import { ChartAxes } from "./ChartAxes";
import type { ChartBox } from "./chartScale";
import { DEFAULT_BOX, getNiceMax, scaleY } from "./chartScale";
import { NormLine } from "./NormLine";

import styles from "./Chart.module.css";

type BarChartProps = {
  title: string;
  labels: string[];
  values: number[];
  unit?: string;
  norm?: { value: number; label: string };
  box?: ChartBox;
};

const BAR_GAP_RATIO = 0.35;

/** Столбчатая диаграмма inline-SVG без библиотек (spec/11 §1). */
export function BarChart({ title, labels, values, unit, norm, box = DEFAULT_BOX }: BarChartProps) {
  const niceMax = getNiceMax(Math.max(...values, norm?.value ?? 0));
  const plotWidth = box.width - box.padLeft - box.padRight;
  const slot = plotWidth / Math.max(values.length, 1);
  const barWidth = slot * (1 - BAR_GAP_RATIO);
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
        {values.map((value, index) => {
          const x = box.padLeft + slot * index + (slot - barWidth) / 2;
          const y = scaleY(value, niceMax, box);
          return (
            <g key={labels[index] ?? index} data-bar={index}>
              <rect className={styles.chart__bar} x={x} y={y} width={barWidth} height={baseY - y}>
                <title>{`${labels[index]}: ${value}`}</title>
              </rect>
              <text className={styles.chart__value} x={x + barWidth / 2} y={y - 3} textAnchor="middle">
                {value}
              </text>
              <text className={styles.chart__label} x={x + barWidth / 2} y={baseY + 14} textAnchor="middle">
                {labels[index]}
              </text>
            </g>
          );
        })}
        {norm ? <NormLine box={box} niceMax={niceMax} value={norm.value} label={norm.label} /> : null}
      </svg>
    </figure>
  );
}
