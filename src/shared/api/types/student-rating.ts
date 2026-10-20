/* Рейтинг обучающихся для преподавателя — /api/v1/teacher/rating и /teacher/students/{id}/stats (спека 006; backend/app/schemas/student_rating.py). */

export type RatingMode = "operator112" | "dds" | "all";
export type RatingPeriod = "2w" | "1m" | "all";

/** Нормативы Q&A: реакция 30 с, отработка 3 мин (в мс). */
export interface RatingNorms {
  reactionMs: number;
  processingMs: number;
}

export interface RatingGroup {
  groupId: string;
  studentCount: number;
}

/** Показатели по завершённым попыткам; null — попыток нет. */
export interface StudentStatsSummary {
  attempts: number;
  averageScore: number | null;
  averageReactionMs: number | null;
  averageProcessingMs: number | null;
  /** Доля попыток, где выполнены оба норматива, 0…1. */
  withinNormsShare: number | null;
}

export interface StudentRatingRow extends StudentStatsSummary {
  studentId: string;
  fullName: string;
  groupId: string;
  /** Рейтинг режима за всё время (как в профиле). */
  ratingOperator112: number;
  ratingDds: number;
  /** attempts ≥ minAttempts — только таким присваивается место. */
  enoughData: boolean;
}

export interface StudentRatingResponse {
  groups: RatingGroup[];
  groupId: string | null;
  period: RatingPeriod;
  mode: RatingMode;
  norms: RatingNorms;
  minAttempts: number;
  rows: StudentRatingRow[];
}

export interface StudentStatsPoint {
  attemptId: string;
  at: string;
  mode: "operator112" | "dds";
  score: number;
  reactionMs: number;
  processingMs: number;
}

export interface StudentStatsAttempt extends StudentStatsPoint {
  /** Занятие попытки — ссылка на отчёт преподавателя; null, если занятия нет. */
  sessionId: string | null;
  format: string;
  title: string;
  passed: boolean | null;
}

export interface StudentStatsByMode {
  operator112: StudentStatsSummary;
  dds: StudentStatsSummary;
}

export interface StudentStats {
  studentId: string;
  fullName: string;
  groupId: string;
  period: RatingPeriod;
  mode: RatingMode;
  norms: RatingNorms;
  summary: StudentStatsSummary;
  byMode: StudentStatsByMode;
  /** По возрастанию времени. */
  dynamics: StudentStatsPoint[];
  /** По убыванию времени. */
  attempts: StudentStatsAttempt[];
}
