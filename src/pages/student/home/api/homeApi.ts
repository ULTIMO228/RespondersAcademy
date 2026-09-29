/* Зависимости главной обучающегося: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import { toView } from "@/entities/assignment";
import type { AssignmentView } from "@/entities/assignment";
import { getAnalytics, getAssignment, getHistory, listAssignments, listRecommendations } from "@/shared/api";
import type { Analytics, HistoryItem, Recommendation } from "@/shared/api";

export type StudentHomeApi = {
  /** Активные задания с прогрессом; ошибка чтения детали одного задания не роняет список. */
  assignments: (signal?: AbortSignal) => Promise<AssignmentView[]>;
  analytics: (signal?: AbortSignal) => Promise<Analytics>;
  recommendations: (limit: number, signal?: AbortSignal) => Promise<Recommendation[]>;
  history: (perPage: number, signal?: AbortSignal) => Promise<{ items: HistoryItem[]; total: number }>;
};

export const studentHomeApi: StudentHomeApi = {
  assignments: async () => {
    const assignments = await listAssignments({ state: "active" });
    const details = await Promise.allSettled(assignments.map((item) => getAssignment(item.id)));
    return assignments.map((assignment, index) => {
      const detail = details[index];
      return toView(assignment, detail.status === "fulfilled" ? detail.value : null);
    });
  },
  analytics: (signal) => getAnalytics(signal),
  recommendations: (limit, signal) => listRecommendations(limit, signal),
  history: async (perPage, signal) => {
    const page = await getHistory({ page: 1, perPage }, signal);
    return { items: page.items, total: page.total };
  },
};
