/* Зависимости «Аналитики»: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import { acceptRecommendation, getAnalytics, listRecommendations } from "@/shared/api";
import type { Analytics, Recommendation } from "@/shared/api";

const RECOMMENDATION_LIMIT = 10;

export type StudentAnalyticsApi = {
  analytics: (signal?: AbortSignal) => Promise<Analytics>;
  recommendations: (signal?: AbortSignal) => Promise<Recommendation[]>;
  accept: (recommendationId: string) => Promise<Recommendation>;
};

export const studentAnalyticsApi: StudentAnalyticsApi = {
  analytics: (signal) => getAnalytics(signal),
  recommendations: (signal) => listRecommendations(RECOMMENDATION_LIMIT, signal),
  accept: (recommendationId) => acceptRecommendation(recommendationId),
};
