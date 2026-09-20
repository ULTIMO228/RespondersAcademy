import type { ChartBox } from "./chartScale";
import { getTicks, scaleY } from "./chartScale";

import styles from "./Chart.module.css";

type ChartAxesProps = {
  box: ChartBox;
  niceMax: number;
  unit?: string;
};

/** Ось Y с делениями от нуля и базовая линия X. */
export function ChartAxes({ box, niceMax, unit }: ChartAxesProps) {
  return (
    <g>
      {getTicks(niceMax).map((tick) => {
        const y = scaleY(tick, niceMax, box);
        return (
          <g key={tick}>
            <line
              className={styles.chart__grid}
              x1={box.padLeft}
              x2={box.width - box.padRight}
              y1={y}
              y2={y}
            />
            <text className={styles.chart__tick} x={box.padLeft - 6} y={y + 4} textAnchor="end">
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        );
      })}
      {unit ? (
        <text className={styles.chart__tick} x={box.padLeft - 6} y={box.padTop - 2} textAnchor="end">
          {unit}
        </text>
      ) : null}
    </g>
  );
}
