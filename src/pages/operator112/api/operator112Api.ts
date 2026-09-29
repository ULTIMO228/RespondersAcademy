/*
 * Зависимости страницы режима 112 — доменные функции shared/api за одним интерфейсом: в тестах подменяются целиком
 * (компоненты и хуки не знают про fetch и URL).
 */
import {
  answerAttempt,
  getAssignment,
  getClassifier,
  getOperatorEvaluation,
  sendAttemptEvent,
  startAssignment,
  submitAttempt,
} from "@/shared/api";
import type {
  AssignmentDetail,
  CardDraft,
  ClassifierEntry,
  OperatorAttempt,
  OperatorEvaluation,
  OperatorEvent,
  OperatorEventRequest,
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
};

export const operator112Api: Operator112Api = {
  getAssignment: (assignmentId) => getAssignment(assignmentId),
  startAssignment: (assignmentId) => startAssignment(assignmentId),
  getClassifier: () => getClassifier(),
  answerAttempt,
  sendEvent: sendAttemptEvent,
  submitAttempt,
  getEvaluation: (attemptId) => getOperatorEvaluation(attemptId),
};
