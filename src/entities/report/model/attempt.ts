/* Представление попытки (CardEvent + Evaluation) для истории попыток и разбора оценки. */

export type MistakeCategory = "timing" | "filling" | "grammar" | "statusSequence" | "missedCall";

export type CriterionScore = {
  key: string;
  title: string;
  score: number;
};

export type MistakeSeverity = "critical" | "major" | "minor";

export type AttemptMistake = {
  category: MistakeCategory;
  severity: MistakeSeverity | null;
  severityTitle: string;
  message: string;
};

export type AttemptGrammarError = {
  fragment: string;
  wrong: string;
  expected: string;
};

/** Правка преподавателя (Evaluation.teacherOverride, Q&A в3 — приоритет преподавателя). */
export type TeacherOverride = {
  score: number;
  comment: string;
  at: string;
  by: string;
};

export type AttemptView = {
  id: string;
  /** «16.09.2026 10:02:14» */
  openedAt: string;
  cardNumber: string;
  cardType: string;
  cardHref: string;
  reaction: string;
  isReactionExceeded: boolean;
  processing: string;
  isProcessingExceeded: boolean;
  score: number | null;
  status?: "pending" | "preliminary" | "review_required" | "final";
  revision?: number;
  grammarErrorCount: number;
  criteria: CriterionScore[];
  mistakes: AttemptMistake[];
  grammarErrors: AttemptGrammarError[];
  aiComment: string;
  teacherOverride?: TeacherOverride;
};

/** Нормативы, с которыми сравниваются тайминги (Scenario.timeNorms → мс). */
export type ProgressNorms = {
  reactionMs: number;
  processingMs: number;
};

/** Сводка прогресса курсанта (T2.5-02). null — нет данных («—»). */
export type ProgressSummaryData = {
  /** ISO openedAt первой и последней попытки периода. */
  periodFrom: string | null;
  periodTo: string | null;
  integralScore: number | null;
  averageReactionMs: number | null;
  averageProcessingMs: number | null;
  cardCount: number;
  errorFreePercent: number | null;
  norms: ProgressNorms;
};

/** Пример ошибки в группе «Мои ошибки»; для грамматики — фрагмент, ошибка и эталон. */
export type MistakeExample = {
  key: string;
  cardNumber: string;
  severity: MistakeSeverity | null;
  message: string;
  grammar?: AttemptGrammarError;
};

export type MistakeGroup = {
  category: MistakeCategory;
  count: number;
  examples: MistakeExample[];
};
