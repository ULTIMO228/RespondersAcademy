import Link from "next/link";

import { ERROR_MAP_COMPARISON_LABELS, ERROR_MAP_LEVEL_META } from "@/entities/error-map";
import type { ErrorMapJournalRow, ErrorMapStage, ErrorMapStageLevel } from "@/shared/api";

import { countText } from "../model/levelText";
import styles from "./ErrorMap.module.css";

export interface JournalProps {
  stages: ErrorMapStage[];
  rows: ErrorMapJournalRow[];
  /** Адрес разбора «этап → обучающийся»: ячейка — обычная ссылка (работает без скриптов и открывается в новой вкладке). */
  cellHref: (studentId: string, stageId: string) => string;
  /** Подпись таблицы для скринридера и печати. */
  caption: string;
}

function cellLabel(studentName: string, stage: ErrorMapStage, level: ErrorMapStageLevel): string {
  const meta = ERROR_MAP_LEVEL_META[level.level];
  const comparison = level.comparison ? `, ${ERROR_MAP_COMPARISON_LABELS[level.comparison]}` : "";
  return `${studentName}, ${stage.title}: ${meta.label}, ${countText(level)}${comparison}`;
}

/**
 * Журнал группы «обучающиеся × этапы». В ячейке слово уровня и значок; цвет только усиливает их (SC-006), поэтому
 * таблица читается в чёрно-белой печати. Строки — обучающиеся (`th scope="row"`), столбцы — этапы (`th scope="col"`);
 * ячейка — ссылка высотой не меньше 44 px, её доступное имя называет обучающегося, этап, уровень и сравнение.
 */
export function Journal({ stages, rows, cellHref, caption }: JournalProps) {
  return (
    <div className={styles.journal__scroll} role="region" aria-label={caption} tabIndex={0}>
      <table className={styles.journal}>
        <caption className={styles.journal__caption}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.journal__head}>
              Обучающийся
            </th>
            {stages.map((stage) => (
              <th key={stage.id} scope="col" className={styles.journal__head}>
                {stage.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const levels = new Map(row.levels.map((level) => [level.stageId, level]));
            return (
              <tr key={row.studentId}>
                <th scope="row" className={styles.journal__student}>
                  {row.name}
                  <span className={styles.journal__attempts}>попыток: {row.attempts}</span>
                </th>
                {stages.map((stage) => {
                  const level = levels.get(stage.id);
                  if (!level) return <td key={stage.id} className={styles.journal__cell} />;
                  const meta = ERROR_MAP_LEVEL_META[level.level];
                  return (
                    <td key={stage.id} className={styles.journal__cell}>
                      <Link
                        href={cellHref(row.studentId, stage.id)}
                        className={[styles.journal__link, styles[`journal__link--${level.level}`]].join(" ")}
                        aria-label={cellLabel(row.name, stage, level)}
                      >
                        <span className={styles.journal__level}>
                          <span aria-hidden="true">{meta.icon}</span> {meta.label}
                        </span>
                        <span className={styles.journal__count}>{countText(level)}</span>
                      </Link>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
