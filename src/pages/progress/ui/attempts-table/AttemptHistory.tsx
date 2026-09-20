import { AttemptRow } from "@/entities/report";
import type { AttemptView } from "@/entities/report";
import { Panel } from "@/shared/ui";

import styles from "../ProgressPage.module.css";

type AttemptHistoryProps = {
  attempts: AttemptView[];
  /** Попытки без готовой оценки (ИИ ещё не оценил) — в таблицу не попадают. */
  pendingCount?: number;
};

const HISTORY_COLUMNS = [
  { key: "toggle", title: "", isNumeric: false },
  { key: "date", title: "Дата", isNumeric: false },
  { key: "card", title: "Карточка (№, тип)", isNumeric: false },
  { key: "reaction", title: "Реакция", isNumeric: false },
  { key: "processing", title: "Время отработки", isNumeric: false },
  { key: "score", title: "Балл", isNumeric: true },
  { key: "grammar", title: "Грамм. ошибок", isNumeric: true },
] as const;

/** Таблица «История попыток» с раскрытием разбора оценки по строке; только просмотр (ТЗ §8). */
export function AttemptHistory({ attempts, pendingCount = 0 }: AttemptHistoryProps) {
  return (
    <Panel title="История попыток" headerTone="dark">
      <table className={styles.history}>
        <caption className="visually-hidden">История попыток</caption>
        <thead>
          <tr>
            {HISTORY_COLUMNS.map((column) => (
              <th key={column.key} scope="col" className={column.isNumeric ? styles.history__num : undefined}>
                {column.key === "toggle" ? <span className="visually-hidden">Разбор</span> : column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {attempts.length === 0 ? (
            <tr>
              <td className={styles.history__empty} colSpan={HISTORY_COLUMNS.length}>
                Попыток пока нет
              </td>
            </tr>
          ) : (
            attempts.map((attempt) => (
              <AttemptRow key={attempt.id} attempt={attempt} columnCount={HISTORY_COLUMNS.length} />
            ))
          )}
        </tbody>
      </table>
      {pendingCount > 0 ? (
        <p className={styles.progress__muted}>Оценка ещё формируется: попыток — {pendingCount}</p>
      ) : null}
    </Panel>
  );
}
