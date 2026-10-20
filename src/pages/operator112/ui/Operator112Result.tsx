import Link from "next/link";
import { useState } from "react";

import { SPECIALIZATION_TITLES } from "@/entities/user";
import type { AssignmentDetail, OperatorEvaluation } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { Button, Modal } from "@/shared/ui";

import type { Expired, Result } from "../model/useOperator112";
import { Operator112Evaluation } from "./Operator112Evaluation";

import styles from "./Operator112.module.css";

type Operator112ResultProps = {
  assignment: AssignmentDetail;
  result: Result | null;
  expired: Expired | null;
  nextProblem: string | null;
  onNext: () => void;
  onCardStatus: (type: "processed" | "close") => void;
};

/**
 * Итог попытки: разбор (после передачи) или итог сервера при закрытии по лимиту экзамена. Кнопки «Завершить задание» нет:
 * обучающийся задание не завершает (сервер отвечает 403) — «Следующий билет» просит у сервера очередной билет.
 */
export function Operator112Result({
  assignment,
  result,
  expired,
  nextProblem,
  onNext,
  onCardStatus,
}: Operator112ResultProps) {
  const evaluation: OperatorEvaluation | null = result?.evaluation ?? null;
  const [isConfirmingZone, setConfirmingZone] = useState(false);
  const isChain = Boolean(result?.chainReview);
  return (
    <div className={styles.result}>
      {expired ? (
        <section className={styles.problem} role="status" data-kind="expired">
          <h1 className={styles.problem__title}>Время на билет истекло</h1>
          <p>
            Карточка не передана вовремя: попытка закрыта сервером, оценка {expired.score ?? 0}
            {expired.passed === false ? ", экзамен по билету не сдан" : ""}.
          </p>
        </section>
      ) : null}
      {result?.chainReview ? (
        <section className={styles.problem} role="status" data-kind="chain">
          <h2 className={styles.problem__title}>Карточка сохранена</h2>
          <p>
            Этап ДДС ожидает проверки и подтверждения преподавателем. Когда он подтвердит вход, нажмите
            «Начать этап ДДС».
          </p>
        </section>
      ) : null}
      {evaluation ? (
        <Operator112Evaluation
          evaluation={evaluation}
          format={assignment.format}
          passThreshold={assignment.params.passThreshold}
        />
      ) : null}
      {nextProblem ? (
        <p className={styles.work__error} role="alert">
          {nextProblem}
        </p>
      ) : null}
      {result?.cardStatus === "registered" ? (
        <Button variant="secondary" onClick={() => onCardStatus("processed")}>
          Отработана
        </Button>
      ) : null}
      {result?.cardStatus === "completed" || result?.cardStatus === "processed" ? (
        <Button variant="secondary" onClick={() => onCardStatus("close")}>
          Закрыть карточку
        </Button>
      ) : null}
      <div className={styles.result__actions}>
        <Button variant="primary" onClick={isChain ? () => setConfirmingZone(true) : onNext}>
          {isChain ? "Начать этап ДДС" : "Следующий билет"}
        </Button>
        <Link href={ROUTES.studentAssignments} className={styles.problem__link}>
          К заданиям
        </Link>
      </div>
      {isConfirmingZone ? (
        /* Передача 112 → ДДС — явная смена зоны и роли (FR-014): без подтверждения этап ДДС не открывается. */
        <Modal
          title="Смена рабочей зоны"
          onClose={() => setConfirmingZone(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmingZone(false)}>
                Остаться на разборе
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmingZone(false);
                  onNext();
                }}
              >
                Перейти: {SPECIALIZATION_TITLES.dds}
              </Button>
            </>
          }
        >
          <p>
            Этап «{SPECIALIZATION_TITLES.operator112}» завершён, карточка сохранена. Дальше вы работаете в
            роли «{SPECIALIZATION_TITLES.dds}»: журнал и карточка ДДС, поля 112 только для просмотра.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
