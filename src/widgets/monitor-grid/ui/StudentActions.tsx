import { AiBadge, Panel } from "@/shared/ui";

import type { ActionCheckRow, ActionDeviation } from "../model/types";

import styles from "./StudentActions.module.css";

type StudentActionsProps = {
  rows: ActionCheckRow[];
  caption: string;
};

const DEVIATION_TITLES: Record<ActionDeviation, string> = {
  ok: "по эталону",
  order: "нарушен порядок",
  extra: "нет в эталоне",
  pending: "ожидается",
  missing: "пропущено",
};

const DEVIATIONS: ActionDeviation[] = ["order", "extra", "missing"];

/** «Действия курсанта»: последовательность с таймингами и подсветкой отклонений от Etalon.expectedActions. */
export function StudentActions({ rows, caption }: StudentActionsProps) {
  const deviationCount = rows.filter((row) => DEVIATIONS.includes(row.deviation)).length;
  return (
    <Panel
      title="Действия курсанта"
      headerTone="dark"
      actions={
        <span className={styles.actions__summary}>
          <AiBadge title="Сверка с эталоном выполнена ИИ-модулем (мок)" /> отклонений: {deviationCount}
        </span>
      }
    >
      <p className={styles.actions__caption}>{caption}</p>
      <ol className={styles.actions__list}>
        {rows.map((row) => (
          <li
            key={row.id}
            className={[styles.actions__row, styles[`actions__row--${row.deviation}`]].join(" ")}
            data-deviation={row.deviation}
          >
            <span className={styles.actions__offset}>{row.offset ?? "—"}</span>
            <span className={styles.actions__label}>{row.label}</span>
            <span className={styles.actions__mark}>{DEVIATION_TITLES[row.deviation]}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
