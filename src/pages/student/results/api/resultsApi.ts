/* Зависимости «Результатов»: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import { fromDdsEvaluation, fromOperatorEvaluation } from "@/widgets/attempt-review";
import type { ReviewModel } from "@/widgets/attempt-review";
import { getAttemptEvaluation, getHistory, getOperatorEvaluation } from "@/shared/api";
import type { HistoryItem, HistoryQuery, LobbyMode, PageResponse } from "@/shared/api";

export type StudentResultsApi = {
  history: (query: HistoryQuery, signal?: AbortSignal) => Promise<PageResponse<HistoryItem>>;
  /** Попытка из истории (заголовок и дата разбора); null — в первых записях истории её нет. */
  findAttempt: (attemptId: string, signal?: AbortSignal) => Promise<HistoryItem | null>;
  review: (mode: LobbyMode, attemptId: string, signal?: AbortSignal) => Promise<ReviewModel>;
};

const LOOKUP_PER_PAGE = 100;

export const studentResultsApi: StudentResultsApi = {
  history: (query, signal) => getHistory(query, signal),
  findAttempt: async (attemptId, signal) => {
    const page = await getHistory({ page: 1, perPage: LOOKUP_PER_PAGE }, signal);
    return page.items.find((item) => item.attemptId === attemptId) ?? null;
  },
  review: async (mode, attemptId, signal) =>
    mode === "operator112"
      ? fromOperatorEvaluation(await getOperatorEvaluation(attemptId, signal))
      : fromDdsEvaluation(await getAttemptEvaluation(attemptId, signal)),
};
