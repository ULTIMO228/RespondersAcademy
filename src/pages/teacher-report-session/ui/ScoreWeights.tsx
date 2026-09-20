"use client";

import { SCORE_AXES, WEIGHTS_TOTAL_PERCENT } from "@/entities/report";
import type { ScoreAxis, ScoreWeights as ScoreWeightsMap } from "@/entities/report";
import { Button, Input, Panel } from "@/shared/ui";

import styles from "./ReportSession.module.css";

type ScoreWeightsProps = {
  weights: ScoreWeightsMap;
  sum: number;
  isValid: boolean;
  onChange: (axis: ScoreAxis, value: number) => void;
  onReset: () => void;
};

/**
 * Веса критериев интегрального балла (T3.4-08; ТЗ §17 «настраиваемые параметры»): правка пересчитывает
 * балл попыток без перезагрузки, сумма весов валидируется (100 %), значения хранятся в конфиге браузера.
 */
export function ScoreWeights({ weights, sum, isValid, onChange, onReset }: ScoreWeightsProps) {
  return (
    <Panel title="Веса критериев оценки" headerTone="dark">
      <div className={styles.report__weights}>
        {SCORE_AXES.map((axis) => (
          <Input
            key={axis.key}
            label={`${axis.title}, %`}
            type="number"
            min={0}
            max={WEIGHTS_TOTAL_PERCENT}
            value={weights[axis.key]}
            data-weight={axis.key}
            onChange={(event) => onChange(axis.key, Number(event.target.value))}
          />
        ))}
        <p className={isValid ? styles.report__weightsSum : styles["report__weightsSum--bad"]} role="status">
          Сумма весов: {sum} % {isValid ? "" : `— должна быть ${WEIGHTS_TOTAL_PERCENT} %`}
        </p>
        <Button variant="secondary" size="sm" onClick={onReset}>
          по умолчанию
        </Button>
      </div>
      <p className={styles.report__muted}>
        Балл попытки = сумма оценок по критериям с этими весами. Пока сумма не равна {WEIGHTS_TOTAL_PERCENT}{" "}
        %, в детализации остаётся последний корректный пересчёт.
      </p>
    </Panel>
  );
}
