/*
 * Занятие (групповой канон ТЗ §10) и события карточек — spec/000-фронт/05-data-models.md §7 (mocks/sessions.json).
 * Отдельного типа per-student Session нет: это проекция Session (cardEvents/cardFlow по studentId).
 */
import type { DdsStatus } from "./reference";

export type SessionState = "draft" | "configured" | "running" | "finished" | "reported";

/** Показ / делай как я / самостоятельная (Q&A в9). */
export type ScenarioMode = "demo" | "follow" | "practice";

export type CardSource = "generated" | "studentCreated" | "mixed";

export interface CardFlowItem {
  cardId: string;
  studentId: string;
  /** Когда карточка «падает» в очередь курсанта. */
  issuedAt: string;
  /**
   * TODO(владелец спек, расхождение №1 в 12-tasks.md): в спеке §7 — ScenarioLevel ('beginner' | 'advanced'),
   * в mocks/sessions.json — число (прежний difficulty 1..5). Тип принят по факту мока.
   */
  level: number;
}

export interface CardStatusMark {
  ddsStatus: DdsStatus;
  at: string;
  /** Обязателен для notAccepted / workRefused. */
  comment?: string;
  dutyNumber?: string;
}

export type TranscriptSpeaker = "dispatcher" | "ai";

export interface TranscriptLine {
  speaker: TranscriptSpeaker;
  text: string;
  at: string;
}

export interface PhoneCall {
  /** По спеке обязателен; в mocks/sessions.json отсутствует — опционален по факту мока. */
  id?: string;
  /** По спеке обязателен; в mocks/sessions.json отсутствует — опционален по факту мока. */
  fromUserId?: string;
  /** Внутренний номер точки C (учебные 101–104, 301–303). */
  toNumber: string;
  startedAt: string;
  endedAt?: string;
  transcript: TranscriptLine[];
}

export type GrammarErrorType = "spelling" | "syntax";
export type ErrorSeverity = "critical" | "major" | "minor";

export interface GrammarError {
  field: string;
  fragment: string;
  wrong: string;
  expected: string;
  type: GrammarErrorType;
  /** US3: сценарий, к тексту которого относится замечание (только при проверке с привязкой). */
  scenarioId?: string;
  /** US3: текущая версия сценария на момент проверки (у сценария без AI-версий отсутствует). */
  scenarioVersion?: number;
}

export interface EvaluationError {
  type: string;
  severity: ErrorSeverity;
  message: string;
}

export interface TeacherOverride {
  score: number;
  comment: string;
  at: string;
  by: string;
}

/** Оценка попытки. aiComment — ИИ-происхождение (мок), UI обязан показать бейдж «ИИ». */
export interface Evaluation {
  revision?: number;
  status?: "pending" | "preliminary" | "review_required" | "final";
  timeScore: number;
  correctnessScore: number;
  grammarScore: number;
  semanticScore: number;
  totalScore: number;
  grammarErrors: GrammarError[];
  errors: EvaluationError[];
  aiComment: string;
  /** Приоритет преподавателя над оценкой ИИ. */
  teacherOverride?: TeacherOverride;
}

/** Отработка одной карточки одним курсантом (попытка). */
export interface CardEvent {
  /** "att-01" — id попытки (по факту мока; используется в GET /attempts/[id]/evaluation). */
  id: string;
  cardId: string;
  studentId: string;
  openedAt: string;
  primaryReactionMs: number;
  statuses: CardStatusMark[];
  servicesCalled: string[];
  completedAt: string;
  fullProcessingMs: number;
  enteredText: Record<string, string>;
  calls: PhoneCall[];
  evaluation?: Evaluation;
}

export interface Session {
  id: string;
  teacherId: string;
  studentIds: string[];
  scenarioIds: string[];
  mode: ScenarioMode;
  cardSource: CardSource;
  cardFlow: CardFlowItem[];
  state: SessionState;
  startedAt: string;
  /** У идущего занятия в моке — null (тип принят по факту мока). */
  finishedAt?: string | null;
  cardEvents: CardEvent[];
}

/**
 * Событие ленты занятия GET /api/mock/sessions/[id]/feed — дискриминированный union по kind.
 * Реальное время эмулируется клиентскими тиками по startedAt (handler соединений не держит).
 */
interface SessionFeedEventBase {
  at: string;
  studentId: string;
  cardId: string;
}

export type SessionFeedEvent =
  | (SessionFeedEventBase & { kind: "cardIssued"; level: number })
  | (SessionFeedEventBase & { kind: "cardOpened"; attemptId: string })
  | (SessionFeedEventBase & { kind: "statusChanged"; attemptId: string; mark: CardStatusMark })
  | (SessionFeedEventBase & { kind: "cardCompleted"; attemptId: string; fullProcessingMs: number })
  /* Мок-оценка ИИ-модуля по Evaluation попытки (T3.3-01): UI обязан показать бейдж «ИИ» (isAi). */
  | (SessionFeedEventBase & {
      kind: "aiEvaluation";
      attemptId: string;
      isAi: true;
      revision?: number;
      status?: "pending" | "preliminary" | "review_required" | "final";
      totalScore?: number;
      errorCount: number;
      aiComment: string;
    });

export type SessionFeedEventKind = SessionFeedEvent["kind"];
