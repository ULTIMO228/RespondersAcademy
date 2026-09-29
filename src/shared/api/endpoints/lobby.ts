/* Лобби обучающегося — /api/v1/me/*, рекомендации (спека 002, contracts/v1-integration.md §4). */
import { v1ApiClient } from "../v1-client";
import type {
  Analytics,
  HistoryItem,
  GroupInsights,
  HistoryQuery,
  PageResponse,
  PublicUser,
  Recommendation,
  StudentProfile,
} from "../types";

const recommendationPath = (recommendationId: string) =>
  `/me/recommendations/${encodeURIComponent(recommendationId)}`;

export function getMe(signal?: AbortSignal): Promise<PublicUser> {
  return v1ApiClient.get<PublicUser>("/me", undefined, signal);
}

/** GET /me/history: только собственная история, фильтры режим/формат, страницы. */
export function getHistory(query?: HistoryQuery, signal?: AbortSignal): Promise<PageResponse<HistoryItem>> {
  return v1ApiClient.get<PageResponse<HistoryItem>>("/me/history", query, signal);
}

export function getAnalytics(signal?: AbortSignal): Promise<Analytics> {
  return v1ApiClient.get<Analytics>("/me/analytics", undefined, signal);
}

/** GET /me/recommendations: только роль student (403 иначе); без истории — пустой список. */
export function listRecommendations(limit?: number, signal?: AbortSignal): Promise<Recommendation[]> {
  return v1ApiClient.get<Recommendation[]>("/me/recommendations", { limit }, signal);
}

/** POST /me/recommendations/{id}/accept: идемпотентно; принятая теряет приоритет выдачи. */
export function acceptRecommendation(recommendationId: string): Promise<Recommendation> {
  return v1ApiClient.post<Recommendation>(`${recommendationPath(recommendationId)}/accept`);
}

/** GET /teacher/students/{id}/profile: teacher/admin; рейтинги и до трёх типичных ошибок на режим. */
export function getStudentProfile(studentId: string, signal?: AbortSignal): Promise<StudentProfile> {
  return v1ApiClient.get<StudentProfile>(
    `/teacher/students/${encodeURIComponent(studentId)}/profile`,
    undefined,
    signal,
  );
}

/** GET /teacher/groups/{id}/insights: teacher/admin; assignmentId — чужое задание преподавателя даёт 403. */
export function getGroupInsights(
  groupId: string,
  assignmentId?: string,
  signal?: AbortSignal,
): Promise<GroupInsights> {
  return v1ApiClient.get<GroupInsights>(
    `/teacher/groups/${encodeURIComponent(groupId)}/insights`,
    { assignmentId },
    signal,
  );
}
