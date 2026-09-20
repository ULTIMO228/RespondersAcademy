import type { ChartBox } from "./chartScale";
import { scaleY } from "./chartScale";

import styles from "./Chart.module.css";

type NormLineProps = {
  box: ChartBox;
  niceMax: number;
  value: number;
  label: string;
};

/** Линия норматива (30 с / 180 с / 20 сессий / 2 с) с подписью. */
export function NormLine({ box, niceMax, value, label }: NormLineProps) {
  const y = scaleY(value, niceMax, box);
  return (
    <g data-norm={value}>
      <line className={styles.chart__norm} x1={box.padLeft} x2={box.width - box.padRight} y1={y} y2={y} />
      <text className={styles.chart__normLabel} x={box.width - box.padRight} y={y - 4} textAnchor="end">
        {label}
      </text>
    </g>
  );
}
