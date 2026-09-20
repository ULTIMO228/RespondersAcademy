import type { MistakeSeverity } from "@/entities/report";

export type SummaryRow = {
  id: string;
  studentId: string;
  fullName: string;
  armNumber: number;
  cardCount: number;
  reactionSec: number | null;
  reactionDeviation: string;
  isReactionExceeded: boolean;
  processingSec: number | null;
  processingDeviation: string;
  isProcessingExceeded: boolean;
  grammarCount: number;
  score: number;
};

export type StageView = {
  id: string;
  title: string;
  offset: string;
  normText?: string;
  deviation?: string;
  isExceeded: boolean;
};

export type IssueView = {
  id: string;
  severity: MistakeSeverity;
  kind: "mistake" | "grammar";
  message: string;
  field?: string;
  wrongFragment?: string;
  correctFragment?: string;
  grammarType?: string;
};

export type TranscriptView = {
  id: string;
  speakerTitle: string;
  text: string;
  at: string;
};

/** Вызовы попытки (CardEvent.calls): номер точки C, длительность, транскрипт реплик. */
export type CallView = {
  id: string;
  toNumber: string;
  duration: string;
  transcript: TranscriptView[];
};

export type ScoreView = { key: string; title: string; value: number; weightPercent: number };

export type TeacherOverrideView = { score: number; comment: string; at: string; by: string };

export type AttemptView = {
  id: string;
  studentId: string;
  studentName: string;
  cardNumber: string;
  cardType: string;
  stages: StageView[];
  issues: IssueView[];
  calls: CallView[];
  scores: ScoreView[];
  /** Балл мок-оценки ИИ. */
  aiTotal: number;
  /** Балл, пересчитанный по текущим весам критериев (T3.4-08). */
  weightedTotal: number;
  /** Итог с приоритетом преподавателя (Q&A в3). */
  finalTotal: number;
  aiComment: string;
  teacherOverride?: TeacherOverrideView;
};

/** Курсант занятия для обратной связи (одна запись на отчёт). */
export type FeedbackTarget = {
  reportId: string;
  studentId: string;
  fullName: string;
  aiComment: string;
  recommendations: string[];
  sentText: string | null;
  sentAt: string | null;
  sentBy: string | null;
};
