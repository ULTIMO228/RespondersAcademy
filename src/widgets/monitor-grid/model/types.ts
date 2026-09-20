import type { StudentLiveState } from "@/entities/session";

/** Действие курсанта для сверки с эталоном: «openCard:c-095», «status:accepted», «call:102». */
export type SnapshotAction = {
  action: string;
  at: string;
};

/** Публичные поля курсанта занятия: директорию отдаёт серверный компонент страницы (учётки — на сервере). */
export type MonitorStudent = {
  id: string;
  fullName: string;
  armNumber: number;
  group?: string;
};

/** Подпись карточки «№ + тип» (загружается по GET /cards/[id]); ключ — cardId занятия. */
export type CardCaptionMap = Record<string, { number: string; type: string }>;

export type StudentTileModel = {
  studentId: string;
  shortName: string;
  armNumber: number;
  cardNumber: string;
  cardType: string;
  state: StudentLiveState;
  reaction: string;
  isReactionExceeded: boolean;
  processing: string;
  isProcessingExceeded: boolean;
  statusTitle: string;
  errorCount: number;
  /** Счётчик ошибок пришёл из мок-оценки ИИ — рядом с ним бейдж «ИИ». */
  isAiEvaluated: boolean;
};

export type FeedItem = {
  id: string;
  time: string;
  studentId: string;
  text: string;
  isAi: boolean;
  isAlert: boolean;
  kind: string;
};

export type QueueItem = {
  id: string;
  time: string;
  cardNumber: string;
  cardType: string;
  studentName: string;
  level: number;
  isIssued: boolean;
};

export type ActionDeviation = "ok" | "order" | "extra" | "pending" | "missing";

export type ActionCheckRow = {
  id: string;
  action: string;
  label: string;
  offset: string | null;
  deviation: ActionDeviation;
};

export type SessionHeaderModel = {
  sessionId: string;
  title: string;
  stateTitle: string;
  startedAt: string;
  /** Живое время от старта, пересчитывается локально («1:23:45»). */
  elapsed: string;
  modeTitle: string;
  teacherName: string;
  studentCount: number;
  isFinished: boolean;
};
