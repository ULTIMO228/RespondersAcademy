"use client";

import Link from "next/link";

import { EVALUATION_CRITERIA } from "@/entities/report";
import { ROUTES } from "@/shared/config";
import { formatDuration } from "@/shared/lib";
import { AiBadge, Button, Panel } from "@/shared/ui";

import type { EvaluationState } from "../../model/useAttemptEvaluation";
import { EvaluationDetails } from "./EvaluationDetails";

import styles from "./AttemptResult.module.css";

type AttemptResultProps = {
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
  const { cardNumber, evaluation, reactionMs, processingMs, nextCardId, onShowCard } = props;
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
            <Button disabled title="В очереди занятия нет следующей карточки">
              Следующая карточка
            </Button>
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
