"use client";

import { useState } from "react";

import { LINK_STATE_TITLES, MODE_TITLES, averageScore, formatLimit } from "@/entities/assignment";
import type { AssignmentView } from "@/entities/assignment";
import { Alert, PlatformButton, Tag } from "@/shared/ui/platform";

import styles from "./StudentAssignments.module.css";

type AssignmentCardProps = {
  view: AssignmentView;
  /** Возвращает сообщение об отказе (например, 409 сервера) либо null, если переход выполнен. */
  onStart: (view: AssignmentView) => Promise<string | null>;
};

const STATUS_TITLES = {
  available: "Не начато",
  inProgress: "В работе",
  done: "Выполнено",
  finished: "Завершено",
} as const;

const STATUS_TONES = {
  available: "neutral",
  inProgress: "warning",
  done: "success",
  finished: "neutral",
} as const;

function actionTitle(view: AssignmentView): string {
  if (view.status === "inProgress") return "Продолжить";
  if (view.closed > 0) return "Следующий билет";
  return view.assignment.format === "exam" ? "Начать экзамен" : "Начать";
}

/** Карточка задания: условия, статус по прогрессу, итог, запуск/продолжение. Кнопки «Завершить» нет — задание завершает преподаватель. */
export function AssignmentCard({ view, onStart }: AssignmentCardProps) {
  const { assignment, progress } = view;
  const [message, setMessage] = useState<string | null>(null);
  const [isStarting, setStarting] = useState(false);
  const isExam = assignment.format === "exam";
  const params = assignment.params;
  const average = averageScore(progress);
  const canStart = view.status === "available" || view.status === "inProgress";

  const start = async () => {
    setStarting(true);
    setMessage(await onStart(view));
    setStarting(false);
  };

  return (
    <article className={styles.card} data-status={view.status} aria-label={assignment.title || assignment.id}>
      <header className={styles.card__head}>
        <div>
          <h2 className={styles.card__title}>{assignment.title || `Задание ${assignment.id}`}</h2>
          <p className={styles.card__mode}>{MODE_TITLES[assignment.trainingMode]}</p>
        </div>
        <div className={styles.card__chips}>
          <Tag tone={isExam ? "warning" : "info"}>{isExam ? "Экзамен" : "Тренировка"}</Tag>
          <Tag tone={STATUS_TONES[view.status]}>{STATUS_TITLES[view.status]}</Tag>
        </div>
      </header>

      <dl className={styles.card__terms}>
        <div>
          <dt>Билеты</dt>
          <dd>{view.total !== null ? view.total : "—"}</dd>
        </div>
        {isExam && typeof params.passThreshold === "number" ? (
          <div>
            <dt>Порог сдачи</dt>
            <dd>{params.passThreshold}</dd>
          </div>
        ) : null}
        {typeof params.timeLimitSec === "number" ? (
          <div>
            <dt>Лимит на билет</dt>
            <dd>{formatLimit(params.timeLimitSec)}</dd>
          </div>
        ) : null}
        {assignment.dueAt ? (
          <div>
            <dt>Срок</dt>
            <dd>{assignment.dueAt.slice(0, 10)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Подсказки</dt>
          <dd>{isExam || !params.hints?.enabled ? "нет" : "есть"}</dd>
        </div>
      </dl>

      {isExam ? (
        <p className={styles.card__note}>
          Билет выдаётся один раз, запись заявителя прослушивается один раз; лимит времени действует на каждый
          билет от поступления вызова.
        </p>
      ) : null}

      {progress === null ? (
        <p className={styles.card__note}>Прогресс по заданию не загрузился — обновите страницу.</p>
      ) : progress.length > 0 ? (
        <>
          <p className={styles.card__summary}>
            Выполнено {view.closed}
            {view.total !== null ? ` из ${view.total}` : ""}
            {average !== null ? ` · средний балл ${average}` : ""}
          </p>
          <ul className={styles.card__progress} aria-label="Билеты задания">
            {progress.map((item) => (
              <li key={item.attemptId} data-state={item.state}>
                <span>{item.cardId}</span>
                <span>{LINK_STATE_TITLES[item.state]}</span>
                {typeof item.score === "number" ? <strong>{item.score}</strong> : null}
                {item.state === "notCompleted" ? <span>оценка 0, истёк лимит времени</span> : null}
                {isExam && typeof item.passed === "boolean" ? (
                  <span data-passed={item.passed}>{item.passed ? "сдан" : "не сдан"}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {view.awaitsTeacher ? (
        <Alert tone="warning">Этап ДДС ожидает проверки и подтверждения преподавателем.</Alert>
      ) : null}
      {message ? (
        <Alert tone="danger" role="alert">
          {message}
        </Alert>
      ) : null}

      <footer className={styles.card__actions}>
        {canStart ? (
          <PlatformButton variant="primary" onClick={() => void start()} disabled={isStarting}>
            {isStarting ? "Запуск…" : actionTitle(view)}
          </PlatformButton>
        ) : null}
      </footer>
    </article>
  );
}
