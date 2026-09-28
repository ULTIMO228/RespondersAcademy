/*
 * Канонический учёт обнаруженных ошибок (spec/001-ai/ — US4, T027–T032).
 * Единый реестр ErrorRecord, агрегаты сессии и история ошибок обучаемого.
 */

export type ErrorRecordDetector = "rule" | "ml" | "llm_confirmed" | "teacher";

export type ErrorRecordCategory =
  "card_completion" | "services" | "route" | "grammar" | "semantic" | "status_flow" | "manual";

export interface ErrorRecord {
  id: string;
  attemptId: string;
  ruleId: string;
  fieldPath?: string;
  severity: "critical" | "major" | "minor";
  message: string;
  observed?: unknown;
  expected?: unknown;
  sourceRef: string;
  detector: ErrorRecordDetector;
  category: ErrorRecordCategory;
  eventId?: string;
  fixed: boolean;
  etalonVersion: string;
  assessorVersion?: string;
  teacherId?: string;
  createdAt: string;
}

export interface PaginatedErrorRecordsResponse {
  items: ErrorRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionErrorSummaryResponse {
  sessionId: string;
  totalErrors: number;
  critical: number;
  major: number;
  minor: number;
  byCategory: Record<string, number>;
  byRule: Record<string, number>;
  byDetector: Record<string, number>;
  byStudent: Record<string, number>;
}

export interface StudentAttemptErrorsItem {
  attemptId: string;
  cardId: string;
  mode: string;
  totalErrors: number;
  errors: ErrorRecord[];
}

export interface StudentErrorsResponse {
  studentId: string;
  sessionId?: string;
  totalErrors: number;
  critical: number;
  major: number;
  minor: number;
  attempts: StudentAttemptErrorsItem[];
}

export interface TopMistakeItem {
  ruleId: string;
  category: string;
  count: number;
  message: string;
}

export interface SessionAiReport {
  id: string;
  sessionId: string;
  generatedAt: string;
  totalAttempts: number;
  evaluatedAttempts: number;
  averageScore: number;
  errorSummary: SessionErrorSummaryResponse;
  topMistakes: TopMistakeItem[];
}
