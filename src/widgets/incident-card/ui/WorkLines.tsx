import { formatHourMinute, formatShortDate } from "@/shared/lib";

import { splitCalledTo } from "../lib/workLine";
import type { WorkLineData, WorkLinesControl } from "../model/types";
import { AddWorkLineForm } from "./AddWorkLineForm";

import styles from "./WorkLines.module.css";

type WorkLinesProps = {
  workLines: WorkLineData[];
  /** Службы списка оповещения — варианты поля «Служба» формы «Добавить отработку». */
  serviceNames: string[];
  readOnly?: boolean;
  /** Живой режим: добавленные отработки и сохранение через мок-слой (T2.3-16). */
  control?: WorkLinesControl;
  isLocked?: boolean;
};

const OPERATOR_PREFIX = "оп. ";
const COLUMN_LABELS = ["Опер.", "Дата и время", "Служба", "Куда звонили", "Телефон", "ФИО", "Суть сообщения"];
/** Строки отработки (p16_Image77): read-only рендер workLines + форма «Добавить отработку». */
export function WorkLines(props: WorkLinesProps) {
  const { workLines, serviceNames, readOnly = false, control, isLocked = false } = props;
  const lines = [...workLines, ...(control?.extra ?? [])];
  const canAdd = !readOnly && !isLocked && (control ? control.canAdd : true);
  return (
    <section className={styles.work} aria-label="Отработки">
      {lines.length > 0 ? (
        <table className={styles.work__table}>
          <thead>
            <tr>
              {COLUMN_LABELS.map((label) => (
                <th key={label} className={styles.work__head} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const { place, phone } = splitCalledTo(line.calledTo);
              return (
                <tr key={`${line.at}-${line.operator}-${index}`} className={styles.work__row}>
                  <td className={styles.work__operator}>{line.operator.replace(OPERATOR_PREFIX, "")}</td>
                  <td className={styles.work__operator}>
                    <span className={styles.work__date}>{formatShortDate(line.at)}</span>
                    <strong>{formatHourMinute(line.at)}</strong>
                  </td>
                  <td className={styles.work__cell}>
                    <strong>{line.service}</strong>
                  </td>
                  <td className={styles.work__cell}>{place}</td>
                  <td className={styles.work__cell}>{phone}</td>
                  <td className={styles.work__cell}>{line.person}</td>
                  <td className={styles.work__cell}>{line.message}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className={styles.work__empty}>Отработок нет</p>
      )}
      {canAdd ? <AddWorkLineForm serviceNames={serviceNames} control={control} /> : null}
    </section>
  );
}
