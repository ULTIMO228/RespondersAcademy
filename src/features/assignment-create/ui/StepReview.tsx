import { MODE_TITLES, formatLimit } from "@/entities/assignment";
import { Alert, Card, Tag } from "@/shared/ui/platform";

import type { WizardDraft } from "../model/types";

import styles from "./AssignmentWizard.module.css";

type StepReviewProps = {
  draft: WizardDraft;
  /** Имена выбранных обучающихся — для подтверждающего шага. */
  studentNames: string[];
  /** Сообщение сервера, если создание отклонено (400/403/409): введённое сохраняется. */
  serverError: string | null;
};

export function StepReview({ draft, studentNames, serverError }: StepReviewProps) {
  const isExam = draft.format === "exam";
  return (
    <div className={styles.step}>
      {serverError ? (
        <Alert tone="danger" role="alert">
          {serverError}
        </Alert>
      ) : null}
      <Card title="Проверьте задание перед созданием">
        <dl className={styles.review}>
          <div>
            <dt>Название</dt>
            <dd>{draft.title.trim() || "Без названия"}</dd>
          </div>
          <div>
            <dt>Режим</dt>
            <dd>{MODE_TITLES[draft.trainingMode]}</dd>
          </div>
          <div>
            <dt>Формат</dt>
            <dd>
              <Tag tone={isExam ? "warning" : "info"}>{isExam ? "Экзамен" : "Тренировка"}</Tag>
            </dd>
          </div>
          <div>
            <dt>Обучающиеся ({studentNames.length})</dt>
            <dd>{studentNames.join(", ")}</dd>
          </div>
          <div>
            <dt>Билеты</dt>
            <dd>
              {draft.ticketSource === "rule"
                ? `Случайный набор: ${draft.ruleCount} шт.`
                : `${draft.cardIds.length} шт.: ${draft.cardIds.join(", ")}`}
            </dd>
          </div>
          <div>
            <dt>Нормативы</dt>
            <dd>
              реакция {draft.answerSec} сек · отработка {draft.submitSec} сек
            </dd>
          </div>
          {isExam ? (
            <div>
              <dt>Порог сдачи</dt>
              <dd>{draft.passThreshold}</dd>
            </div>
          ) : (
            <div>
              <dt>Подсказки</dt>
              <dd>{draft.hintsEnabled ? `включены, пауза ${draft.hintIdleSec} сек` : "выключены"}</dd>
            </div>
          )}
          <div>
            <dt>Лимит на билет</dt>
            <dd>{draft.timeLimitSec.trim() ? formatLimit(Number(draft.timeLimitSec)) : "не задан"}</dd>
          </div>
          <div>
            <dt>Срок</dt>
            <dd>{draft.dueDate || "не задан"}</dd>
          </div>
          <div>
            <dt>Сообщения служб</dt>
            <dd>
              {draft.workMessagesEnabled
                ? `включены: ${draft.workMessageIntervals.join(", ")} сек`
                : "выключены"}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
