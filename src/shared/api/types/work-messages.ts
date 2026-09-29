/*
 * Сообщения о ходе работ и голосовой доклад этапа ДДС — /api/v1 (спека 002; backend/app/api/v1/work_messages.py,
 * services/work_messages.py, ml/insights/call_responder.py). Текста сообщения в контракте нет: его формирует фронт по kind.
 */

export type WorkMessageKind = "departed" | "arrived" | "started" | "done";
export type WorkMessageStatus = "responseStarted" | "arrived" | "workInProgress" | "workDone";

export interface WorkMessage {
  id: string;
  kind: WorkMessageKind;
  /** Серверная метка наступления; клиентский курсор ленты — at последнего сообщения. */
  at: string;
  /** Статус, который диспетчер должен был выставить до этого сообщения. */
  expectedStatus: WorkMessageStatus;
}

export interface ReportCheck {
  id: string;
  label: string;
  expected: string;
  found: boolean;
}

/** Чек-лист доклада: пять пунктов (номер карточки, адрес, тип, пострадавшие, решение); score — доля выполненных, 0…1. */
export interface ReportCheckResult {
  version: string;
  text: string;
  checks: ReportCheck[];
  missing: string[];
  score: number;
}

export interface ReportTranscriptLine {
  speaker: string;
  text: string;
  at: string;
}

export interface ReportCall {
  id: string;
  fromUserId: string;
  toNumber: string;
  startedAt: string;
  endedAt: string;
  transcript: ReportTranscriptLine[];
  /** Есть, если распознан текст диспетчера. */
  report?: ReportCheckResult;
}

export interface ReportAudioResponse {
  attemptId: string;
  call: ReportCall;
  recording: { id: string; url: string };
}
