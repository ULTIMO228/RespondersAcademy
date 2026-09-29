/*
 * Пользователь, от имени которого пришёл запрос к мок-API (T2.5-01; ТЗ §8 «Обучающийся — только свои результаты»).
 * Источник истины — мок-сессия (HttpOnly-cookie arm112_session), а не query-параметр клиента. Проверка подписанного токена — в
 * auth-tokens.ts; резолвер передаёт серверная сборка app/api/mock/_server.
 */
import type { UserRole } from "../types";
import { forbidden, unauthorized } from "./respond";

export type MockViewer = { userId: string; role: UserRole };

/** Резолвер пользователя запроса: нет/битая/истёкшая сессия → null. */
export type ViewerResolver = (request: Request) => MockViewer | null;

export const OWN_DATA_ONLY_MESSAGE = "Обучающемуся доступны только собственные результаты";
export const SESSION_REQUIRED_MESSAGE = "Войдите в систему, чтобы просмотреть результаты";

export function isStudentViewer(viewer: MockViewer | null): viewer is MockViewer {
  return viewer?.role === "student";
}

/**
 * Итоговый studentId выборки. Обучающийся: всегда свой id (чужой в query → 403). Преподаватель/администратор:
 * id из query. Аноним с studentId → 401. undefined — фильтра по курсанту нет (выборка не «по курсанту»).
 */
export function resolveStudentScope(
  viewer: MockViewer | null,
  requestedStudentId: string | undefined,
): string | undefined {
  if (isStudentViewer(viewer)) {
    if (requestedStudentId !== undefined && requestedStudentId !== viewer.userId) {
      throw forbidden(OWN_DATA_ONLY_MESSAGE);
    }
    return viewer.userId;
  }
  if (requestedStudentId !== undefined && !viewer) throw unauthorized(SESSION_REQUIRED_MESSAGE);
  return requestedStudentId;
}

/** Попытка чужого курсанта недоступна обучающемуся (403). */
export function assertOwnAttempt(viewer: MockViewer | null, attemptStudentId: string): void {
  if (isStudentViewer(viewer) && viewer.userId !== attemptStudentId) throw forbidden(OWN_DATA_ONLY_MESSAGE);
}
