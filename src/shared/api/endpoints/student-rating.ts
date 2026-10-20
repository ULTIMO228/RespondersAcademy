/* Рейтинг обучающихся — /api/v1/teacher/rating, /api/v1/teacher/students/{id}/stats (спека 006). Только с бэкендом. */
import { v1ApiClient } from "../v1-client";
import type { RatingMode, RatingPeriod, StudentRatingResponse, StudentStats } from "../types";

export type StudentRatingQuery = { groupId?: string; mode?: RatingMode; period?: RatingPeriod };
export type StudentStatsQuery = { mode?: RatingMode; period?: RatingPeriod };

/** Без groupId сервер берёт первую доступную группу; у преподавателя без закреплений — groups: []. */
export function getStudentRating(
  query?: StudentRatingQuery,
  signal?: AbortSignal,
): Promise<StudentRatingResponse> {
  return v1ApiClient.get<StudentRatingResponse>("/teacher/rating", query, signal);
}

export function getStudentStats(
  studentId: string,
  query?: StudentStatsQuery,
  signal?: AbortSignal,
): Promise<StudentStats> {
  return v1ApiClient.get<StudentStats>(
    `/teacher/students/${encodeURIComponent(studentId)}/stats`,
    query,
    signal,
  );
}
