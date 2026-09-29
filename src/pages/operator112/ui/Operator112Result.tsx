import Link from "next/link";

import type { AssignmentDetail, OperatorEvaluation } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { Button } from "@/shared/ui";

import type { Expired, Result } from "../model/useOperator112";
import { Operator112Evaluation } from "./Operator112Evaluation";

import styles from "./Operator112.module.css";

type Operator112ResultProps = {
  assignment: AssignmentDetail;
  result: Result | null;
  expired: Expired | null;
  nextProblem: string | null;
  onNext: () => void;
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
}: Operator112ResultProps) {
  const evaluation: OperatorEvaluation | null = result?.evaluation ?? null;
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
      <div className={styles.result__actions}>
        <Button variant="primary" onClick={onNext}>
          {result?.chainReview ? "Начать этап ДДС" : "Следующий билет"}
        </Button>
        <Link href={ROUTES.studentAssignments} className={styles.problem__link}>
          К заданиям
        </Link>
      </div>
    </div>
  );
}
