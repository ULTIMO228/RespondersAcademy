import { Panel } from "@/shared/ui";

import type { QueueItem } from "../model/types";

import styles from "./IssueQueue.module.css";

type IssueQueueProps = {
  items: QueueItem[];
  /** Выдача приостановлена преподавателем — ожидающие карточки помечены (T3.2-11). */
  isPaused?: boolean;
};

/** Очередь выдачи по Session.cardFlow: какие карточки уже выданы, какие ожидают. */
export function IssueQueue({ items, isPaused = false }: IssueQueueProps) {
  const issuedCount = items.filter((item) => item.isIssued).length;
  const waitingMark = isPaused ? "на паузе" : "ожидает";
  return (
    <Panel
      title="Очередь выдачи"
      headerTone="dark"
      actions={
        <span className={styles.queue__summary}>
          выдано {issuedCount} · ожидает {items.length - issuedCount}
        </span>
      }
    >
      <table className={styles.queue}>
        <thead>
          <tr>
            <th scope="col">Время</th>
            <th scope="col">Происшествие</th>
            <th scope="col">Курсант</th>
            <th scope="col">Ур.</th>
            <th scope="col">Выдача</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.queue__empty}>
                Очередь пуста — карточки ещё не выдавались
              </td>
            </tr>
          ) : null}
          {items.map((item) => (
            <tr key={item.id} data-issued={item.isIssued}>
              <td className={styles.queue__time}>{item.time}</td>
              <td>
                <b>{item.cardNumber}</b> <span className={styles.queue__type}>{item.cardType}</span>
              </td>
              <td>{item.studentName}</td>
              <td>{item.level}</td>
              <td>
                <span
                  className={item.isIssued ? styles["queue__mark--issued"] : styles["queue__mark--waiting"]}
                >
                  {item.isIssued ? "выдана" : waitingMark}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
