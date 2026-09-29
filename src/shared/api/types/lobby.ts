/*
 * Лобби обучающегося — контракт /api/v1 (спека 002; backend/app/schemas/v1/lobby.py, services/analytics.py,
 * services/recommendation_service.py): история, аналитика, рекомендации.
 */
import type { AssignmentFormat } from "./assignments";

export type LobbyMode = "dds" | "operator112";

export interface HistoryItem {
  attemptId: string;
  mode: LobbyMode;
  format: AssignmentFormat;
  cardId: string;
  title: string;
  score: number;
  passed?: boolean;
  at: string;
  reportUrl?: string;
}

export type HistoryQuery = {
  mode?: LobbyMode;
  format?: AssignmentFormat;
  page?: number;
  perPage?: number;
};

export interface Stats {
  count: number;
  averageScore: number;
  averageReactionMs: number;
  averageProcessingMs: number;
  replays: number;
  hintsShown: number;
}

export interface AnalyticsTopError {
  type: string;
  count: number;
}

export interface AnalyticsDynamics {
  labels: string[];
  values: number[];
}

export interface Analytics {
  byMode: Record<LobbyMode, Stats>;
  reactionMs: number;
  topErrors: AnalyticsTopError[];
  dynamics: AnalyticsDynamics;
  byGroup: Record<string, Stats>;
  byFormat: Record<AssignmentFormat, Stats>;
}

/** category — повторить группу, article — статья справочника, card — билет, mode — режим (backend: recommendation_service.generate). */
export type RecommendationKind = "category" | "article" | "card" | "mode";

export interface RecommendationReason {
  errorType: string;
  count: number;
  ruleId: string;
}

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  targetId: string;
  title: string;
  reason: RecommendationReason;
  createdAt: string;
  /** Есть — рекомендация принята (теряет приоритет выдачи). */
  acceptedAt?: string;
}

/** GET /teacher/students/{id}/profile (recommendation_service.profile): типичные ошибки — до трёх на режим. */
export interface TypicalError {
  type: string;
  count: number;
}

export interface StudentProfile {
  ratings: Record<LobbyMode, number>;
  strongerMode: LobbyMode | null;
  typicalErrors: Record<LobbyMode, TypicalError[]>;
  recommendations: Recommendation[];
}

export interface GroupInsight {
  share: number;
  errorType: string;
  text: string;
}

/** GET /teacher/groups/{id}/insights: suggestedGroup — группа ЕКП с наибольшим числом ошибок либо null. */
export interface GroupInsights {
  insights: GroupInsight[];
  suggestedGroup: string | null;
}
