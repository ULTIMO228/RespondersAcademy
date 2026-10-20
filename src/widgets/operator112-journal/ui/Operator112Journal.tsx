import type { Journal112Row } from "@/shared/api";

import { Journal112Header } from "./Journal112Header";
import { Journal112Table } from "./Journal112Table";
import styles from "./Operator112Journal.module.css";

export type Operator112JournalProps = {
  rows: Journal112Row[];
  operatorName: string;
  nowMs: number;
  onOpenRow: (row: Journal112Row) => void;
  onCreateCard: () => void;
  onLogout?: () => void;
  state: "loading" | "error" | "ready";
  errorMessage?: string;
};

/** Журнал «Поиск происшествий» ученика-112: шапка + таблица с состояниями loading/error/ready. */
export function Operator112Journal({ state, errorMessage, rows, operatorName, nowMs, onOpenRow, onCreateCard, onLogout }: Operator112JournalProps) {
  return (
    <div className={styles.page}>
      <Journal112Header operatorName={operatorName} nowMs={nowMs} onCreateCard={onCreateCard} onLogout={onLogout} />
      {state === "loading" ? <p className={styles.note} role="status">Загрузка журнала…</p> : null}
      {state === "error" ? <p className={styles.note} role="alert">{errorMessage ?? "Не удалось загрузить журнал"}</p> : null}
      {state === "ready" ? <Journal112Table rows={rows} onOpenRow={onOpenRow} /> : null}
    </div>
  );
}
