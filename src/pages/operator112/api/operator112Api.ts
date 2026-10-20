/*
 * Зависимости страницы режима 112 — доменные функции shared/api за одним интерфейсом: в тестах подменяются целиком
 * (компоненты и хуки не знают про fetch и URL).
 */
import {
  answerAttempt,
  getAssignment,
  getClassifier,
  getNotificationList,
  getPracticeNotificationList,
  getOperatorEvaluation,
  getReference,
  journal,
  matches,
  sendAttemptEvent,
  startAssignment,
  submitAttempt,
} from "@/shared/api";
import type {
  AssignmentDetail,
  CardDraft,
  ClassifierEntry,
  Journal112Row,
  Journal112Response,
  NotificationListPreview,
  NotificationListResponse,
  PracticeNotificationQuery,
  OperatorAttempt,
  OperatorEvaluation,
  OperatorEvent,
  OperatorEventRequest,
  ServiceRef,
  StartAssignmentResult,
  SubmitAttemptResult,
} from "@/shared/api";

export type Operator112Api = {
  getAssignment: (assignmentId: string) => Promise<AssignmentDetail>;
  startAssignment: (assignmentId: string) => Promise<StartAssignmentResult>;
  getClassifier: () => Promise<ClassifierEntry[]>;
  answerAttempt: (attemptId: string) => Promise<OperatorAttempt>;
  sendEvent: (attemptId: string, event: OperatorEventRequest) => Promise<OperatorEvent>;
  submitAttempt: (attemptId: string, draft: CardDraft) => Promise<SubmitAttemptResult>;
  getEvaluation: (attemptId: string) => Promise<OperatorEvaluation>;
  /** Журнал «Поиск происшествий» ученика-112 по заданию (спека 009, US1). */
  journal: (assignmentId: string) => Promise<Journal112Response>;
  /** Карточки журнала, совпавшие с вызовом по АОН или адресу (US5). */
  matches: (attemptId: string) => Promise<{ matches: Journal112Row[] }>;
  /** Список оповещения служб по событиям попытки: считает сервер (US4). */
  getNotificationList: (
    attemptId: string,
    preview?: NotificationListPreview,
  ) => Promise<NotificationListResponse>;
  /** Карточка-тренировка без попытки (FR-008): тот же расчёт ЕКП на сервере, состояние — из запроса. */
  getPracticeNotificationList?: (query: PracticeNotificationQuery) => Promise<NotificationListResponse>;
  /** Все службы справочника: окно «Добавьте службы» показывает их целиком, как в АРМ (КАРТОЧКА_3). */
  getServices?: () => Promise<ServiceRef[]>;
};

export const operator112Api: Operator112Api = {
  getAssignment: (assignmentId) => getAssignment(assignmentId),
  startAssignment: (assignmentId) => startAssignment(assignmentId),
  getClassifier: () => getClassifier(),
  answerAttempt,
  sendEvent: sendAttemptEvent,
  submitAttempt,
  getEvaluation: (attemptId) => getOperatorEvaluation(attemptId),
  journal: (assignmentId) => journal(assignmentId),
  matches: (attemptId) => matches(attemptId),
  getNotificationList: (attemptId, preview) => getNotificationList(attemptId, preview),
  getPracticeNotificationList: (query) => getPracticeNotificationList(query),
  getServices: async () => (await getReference()).services,
};
