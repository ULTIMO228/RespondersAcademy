"use client";

import Link from "next/link";
import { useState } from "react";

import { ArmIcon, TimerBadge } from "@/shared/ui";

import type { AttemptView } from "../model/attempt";
import { AttemptBreakdown } from "./AttemptBreakdown";

import styles from "./AttemptRow.module.css";

type AttemptRowProps = {
  attempt: AttemptView;
  /** Число колонок таблицы — для строки разбора на всю ширину. */
  columnCount: number;
};

/** Строка «Истории попыток» с раскрытием разбора Evaluation (как раскрытие строки списка ПОВ-112). */
export function AttemptRow({ attempt, columnCount }: AttemptRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const breakdownId = `attempt-${attempt.id}-breakdown`;
  return (
    <>
      <tr className={[styles.row, isExpanded ? styles["row--expanded"] : ""].join(" ")}>
        <td className={styles.row__toggle}>
          <button
            type="button"
            className={styles.row__button}
            onClick={() => setIsExpanded((current) => !current)}
            aria-expanded={isExpanded}
            aria-controls={breakdownId}
            aria-label={`Разбор попытки: карточка ${attempt.cardNumber}`}
            title="Разбор оценки"
          >
            <ArmIcon name="row-expand" width={24} height={23} className={styles.row__chevron} />
          </button>
        </td>
        <td className={styles.row__mono}>{attempt.openedAt}</td>
        <td>
          <Link className={styles.row__card} href={attempt.cardHref}>
            {attempt.cardNumber}
          </Link>
          <span className={styles.row__type}>{attempt.cardType}</span>
        </td>
        <td>
          <TimerBadge value={attempt.reaction} exceeded={attempt.isReactionExceeded} caption="реакция" />
        </td>
        <td>
          <TimerBadge
            value={attempt.processing}
            exceeded={attempt.isProcessingExceeded}
            caption="отработка"
          />
        </td>
        <td className={styles.row__score}>
          {attempt.status === "review_required" ? (
            <span
              className={styles.row__status}
              data-status="review_required"
              title="Требуется проверка преподавателем"
            >
              На проверке
            </span>
          ) : attempt.status === "pending" || attempt.score === null || attempt.score === undefined ? (
            <span className={styles.row__status} data-status="pending" title="Оценка формируется">
              Ожидание
            </span>
          ) : (
            <span className={styles.row__scoreValue}>
              {attempt.score}
              {attempt.status === "preliminary" ? (
                <span className={styles.row__statusLabel} title="Предварительная оценка ИИ">
                  {" "}
                  (Предварительно)
                </span>
              ) : null}
              {attempt.status === "final" ? (
                <span className={styles.row__statusLabelFinal} title="Итоговая оценка">
                  {" "}
                  (Итоговая)
                </span>
              ) : null}
            </span>
          )}
        </td>
        <td className={styles.row__count}>{attempt.grammarErrorCount}</td>
      </tr>
      {isExpanded ? (
        <tr className={styles.row__details} id={breakdownId}>
          <td colSpan={columnCount}>
            <AttemptBreakdown attempt={attempt} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
