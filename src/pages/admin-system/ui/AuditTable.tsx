import { ArmIcon } from "@/shared/ui";

import type { AuditRow } from "../model/types";

import styles from "./AuditTable.module.css";

type AuditTableProps = {
  rows: AuditRow[];
};

const NO_VALUE = "-";

function TimeCell({ time }: { time: string }) {
  const [hours, minutes, seconds] = time.split(":");
  return (
    <>
      {hours}:{minutes}
      <sup className={styles.audit__seconds}>{seconds}</sup>
    </>
  );
}

/** Тёмная таблица журнала аудита — колонки экрана «аудит» ПОВ-112 + роль. */
export function AuditTable({ rows }: AuditTableProps) {
  return (
    <table className={styles.audit}>
      <caption className="visually-hidden">Журнал аудита</caption>
      <thead>
        <tr>
          <th scope="col">Карточка</th>
          <th scope="col">Опер.</th>
          <th scope="col">ФИО оператора</th>
          <th scope="col">Роль</th>
          <th scope="col">
            Дата <ArmIcon name="sort-down" size={14} />
          </th>
          <th scope="col">Время</th>
          <th scope="col">Событие</th>
          <th scope="col">Описание</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className={styles.audit__center}>{row.cardId ?? NO_VALUE}</td>
            <td className={styles.audit__center}>{row.operatorArm ?? "-"}</td>
            <td>{row.fullName}</td>
            <td>{row.roleTitle}</td>
            <td>{row.date}</td>
            <td>
              <TimeCell time={row.time} />
            </td>
            <td>{row.event}</td>
            <td className={styles.audit__details}>{row.details}</td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={8} className={styles.audit__center}>
              События не найдены
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
