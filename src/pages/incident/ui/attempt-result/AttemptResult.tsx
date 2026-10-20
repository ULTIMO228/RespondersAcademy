"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EVALUATION_CRITERIA } from "@/entities/report";
import { listAssignments, startAssignment } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDuration } from "@/shared/lib";
import { AiBadge, Button, Panel } from "@/shared/ui";

import type { EvaluationState } from "../../model/useAttemptEvaluation";
import { EvaluationDetails } from "./EvaluationDetails";

import styles from "./AttemptResult.module.css";

type AttemptResultProps = {
  /** Текущая карточка: по ней ищется задание ДДС для «Следующей карточки», когда ленты занятия нет. */
  cardId?: string;
  cardNumber: number;
  evaluation: EvaluationState;
  reactionMs: number;
  processingMs: number;
  nextCardId: string | null;
  onShowCard: () => void;
};

/**
 * Экран итога попытки (T2.3-22): мок-оценка ИИ (баллы по критериям, разбор ошибок, комментарий с бейджем «ИИ»),
 * «Следующая карточка» (конвейер занятия) и «К списку». Оценка — только из мок-слоя, без расчётов в UI.
 */
export function AttemptResult(props: AttemptResultProps) {
  const { cardId, cardNumber, evaluation, reactionMs, processingMs, nextCardId, onShowCard } = props;
  return (
    <section className={styles.result} aria-label="Итог попытки">
      <Panel
        title={`Итог отработки: Происшествие ${cardNumber}`}
        headerTone="dark"
        actions={
          evaluation.status === "ready" ? <AiBadge title="Оценка сформирована ИИ-модулем (мок)" /> : null
        }
      >
        <p className={styles.result__facts}>
          Реакция: {formatDuration(reactionMs)} · Отработка: {formatDuration(processingMs)}
        </p>
        {evaluation.status === "loading" ? <p className={styles.result__note}>Оценка формируется…</p> : null}
        {evaluation.status === "pending" || evaluation.status === "error" ? (
          <p className={styles.result__note} role="status">
            Мок-оценка недоступна: {evaluation.message}
          </p>
        ) : null}
        {evaluation.status === "ready" ? (
          <>
            <dl className={styles.result__scores}>
              {EVALUATION_CRITERIA.map((criterion) => (
                <div key={criterion.key} className={styles.result__score}>
                  <dt>{criterion.title}</dt>
                  <dd>{evaluation.evaluation[criterion.key]}</dd>
                </div>
              ))}
            </dl>
            <EvaluationDetails evaluation={evaluation.evaluation} />
          </>
        ) : null}
        <div className={styles.result__actions}>
          {nextCardId ? (
            <Link href={ROUTES.armCard(nextCardId)} className={styles.result__link}>
              Следующая карточка
            </Link>
          ) : (
            <NextAssignmentTicket cardId={cardId} />
          )}
          <Link href={ROUTES.arm} className={styles.result__link}>
            К списку
          </Link>
          <Button variant="ghost" onClick={onShowCard}>
            Просмотр карточки
          </Button>
        </div>
      </Panel>
    </section>
  );
}

/**
 * «Следующая карточка» в задании ДДС: ленты занятия нет, поэтому следующий билет выдаёт сервер
 * (POST /assignments/{id}/start, как «Следующий билет» в разделе «Задания»). Отказ сервера — текстом рядом с кнопкой.
 */
function NextAssignmentTicket({ cardId }: { cardId?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isStarting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    setMessage(null);
    try {
      const assignments = await listAssignments();
      const candidates = assignments.filter(
        (item) =>
          item.trainingMode === "dds" && item.state === "active" && cardId && item.cardIds.includes(cardId),
      );
      if (candidates.length === 0) {
        setMessage("В очереди занятия нет следующей карточки");
        return;
      }
      // Карточка может входить в несколько заданий: берётся первое, где сервер ещё выдаёт билет (иначе — его отказ).
      let lastError: unknown = null;
      for (const assignment of candidates) {
        try {
          const started = await startAssignment(assignment.id);
          if (started.kind === "dds") router.push(ROUTES.armCard(started.attempt.cardId));
          else router.push(ROUTES.armOperator112ForAssignment(assignment.id));
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    } catch (error) {
      setMessage(
        error instanceof Error && error.message ? error.message : "Не удалось получить следующий билет",
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <Button onClick={() => void start()} disabled={!cardId || isStarting}>
        Следующая карточка
      </Button>
      {message ? (
        <p className={styles.result__note} role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
